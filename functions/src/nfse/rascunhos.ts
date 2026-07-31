import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'
import { requireEnvironmentTenant, DEFAULT_TENANT_ID } from '../tenant'
import { SYSTEM_ACTOR } from '../audit'
import { processarEmissao } from './emitir'
import { credentialSecrets } from './secrets'
import {
  avaliarTomador,
  descreverMotivo,
  descreverProblemaTomador,
  resolverCamposFiscais,
  selecionarContrato,
  type CamposFiscais,
  type ContratoNfseRecorrente,
  type FiltroDia,
} from './selecao-recorrentes'
import type { EmitirNfseInput } from './types'

const db = () => admin.firestore()

type GerarRascunhosInput = {
  mes?: number
  ano?: number
  clienteId?: string
  // Contrato com a tela (fiscal/page.tsx sempre manda true): no mês corrente,
  // ignora quem ainda não chegou no dia de emissão. Aqui dentro vira
  // 'ate_hoje' | 'todos' — o cron usa um terceiro modo, 'somente_hoje'.
  gerarAteHoje?: boolean
}

async function assertCanGenerate(uid: string) {
  const userDoc = await db().collection('usuarios').doc(uid).get()
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  const user = userDoc.data() ?? {}
  if (user.ativo === false) throw new HttpsError('permission-denied', 'Usuário inativo.')
  const perfil = user.perfil as string | undefined
  if (!perfil || !['admin', 'fiscal'].includes(perfil)) {
    throw new HttpsError('permission-denied', 'Perfil sem permissão para gerar rascunhos NFS-e.')
  }
  return {
    uid,
    nome: (user.nome as string | undefined) ?? uid,
    perfil,
    tenantId: requireEnvironmentTenant(user.tenantId, 'Usuário'),
  }
}

function competenciaLabel(mes: number, ano: number) {
  return `${String(mes).padStart(2, '0')}/${ano}`
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

/** Firestore recusa `undefined`; campo de endereço em branco vira null. */
function textoOuNulo(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

type Actor = { uid: string; nome: string; tenantId: string }

type ItemPendente = {
  ref: FirebaseFirestore.DocumentReference
  clienteId: string
  clienteNome: string
  tomadorNome: string
  emissaoAutomatica: boolean
  competenciaId: string | null
  // Documento já existe num status reprocessável: pode ser reemitido, mas NÃO
  // pode ser recriado (ver processarItens).
  reprocessar: boolean
  dados: Record<string, unknown>
}

/** Recorte tipado do documento de `nfse_recorrentes`, sem confiar no que veio. */
function lerContrato(doc: FirebaseFirestore.QueryDocumentSnapshot): ContratoNfseRecorrente {
  const d = doc.data() as Record<string, unknown>
  return {
    id: doc.id,
    clienteId: d.clienteId as string | undefined,
    tomadorId: d.tomadorId as string | undefined,
    tomadorNome: d.tomadorNome,
    tomadorCpfCnpj: d.tomadorCpfCnpj,
    descricao: d.descricao,
    valor: d.valor,
    diaEmissao: d.diaEmissao,
    itemListaServico: d.itemListaServico,
    codigoServico: d.codigoServico,
    aliquota: d.aliquota,
    issRetido: d.issRetido,
    ativo: d.ativo,
    dataInicio: d.dataInicio as { toDate(): Date } | undefined,
    dataFim: d.dataFim as { toDate(): Date } | undefined,
  }
}

/**
 * Carrega o cadastro dos tomadores citados pelos contratos SELECIONADOS — e não
 * a carteira inteira do escritório. No cron diário isso é um punhado de
 * documentos; ler tudo seria pagar 119 carteiras para usar as de um dia.
 */
async function carregarTomadores(ids: (string | undefined)[]) {
  const unicos = Array.from(new Set(
    ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  ))
  const mapa = new Map<string, FirebaseFirestore.DocumentData>()
  for (let i = 0; i < unicos.length; i += 300) {
    const refs = unicos.slice(i, i + 300).map((id) => db().collection('tomadores').doc(id))
    const snaps = await db().getAll(...refs)
    snaps.forEach((snap) => {
      if (snap.exists) mapa.set(snap.id, snap.data() as FirebaseFirestore.DocumentData)
    })
  }
  return mapa
}

/**
 * Competência do mês para conciliar a nota emitida.
 *
 * `competencias` é uma por cliente+SERVIÇO DO ESCRITÓRIO (scheduler/
 * competencias.ts); o contrato de NFS-e não tem par 1:1 com ela — antes tinha,
 * porque o gerador lia a mesma `clientes_servicos`. Só vinculamos quando o
 * cliente tem UMA competência no mês: escolher uma entre várias penduraria a
 * nota na competência errada, e derivar um ID do contrato apontaria para um
 * documento que não existe. Nos dois casos a conciliação passaria a mentir em
 * silêncio; `null` a tela já sabe exibir.
 *
 * Falha de leitura não derruba a emissão: conciliação é acessório, nota fiscal
 * não é.
 */
async function mapearCompetenciaDoMes(tenantId: string, mes: number, ano: number) {
  const snap = await db()
    .collection('competencias')
    .where('tenantId', '==', tenantId)
    .where('mes', '==', mes)
    .where('ano', '==', ano)
    .get()
    .catch(() => null)

  const porCliente = new Map<string, string | null>()
  snap?.docs.forEach((doc) => {
    const cid = doc.data().clienteId as string | undefined
    if (!cid) return
    // Segunda ocorrência marca ambiguidade — e ambíguo vale null.
    porCliente.set(cid, porCliente.has(cid) ? null : doc.id)
  })
  return porCliente
}

/**
 * Levanta, para uma competência, todos os CONTRATOS de emissão elegíveis pra
 * gerar rascunho (ou emitir direto, se `emissaoAutomatica` estiver ligado na
 * config fiscal do PRESTADOR) — e cujo trabalho ainda não foi feito: a dedup
 * usa o ID determinístico do rascunho MAIS o status do documento (ver
 * STATUS_REPROCESSAVEIS, em selecao-recorrentes.ts).
 *
 * A NOTA SAI EM NOME DO CLIENTE: o prestador é o cliente do escritório e o
 * TOMADOR é o cliente DELE. Por isso a varredura é de `nfse_recorrentes` (um
 * contrato por par prestador+tomador) e NÃO de `clientes_servicos`, que é o
 * honorário que o escritório cobra e não conhece os clientes do cliente — ler
 * dali fazia a nota recorrente sair do cliente PARA ELE MESMO, documento que a
 * prefeitura rejeita e, quando aceita, nasce inválido.
 *
 * Compartilhado entre o botão manual "Gerar rascunhos" e o cron diário — o
 * comportamento por contrato é o mesmo nos dois casos; o que muda é quando cada
 * um roda e o `filtroDia`.
 */
async function listarPendentes(params: {
  tenantId: string
  mes: number
  ano: number
  clienteId?: string
  filtroDia: FiltroDia
}) {
  const { tenantId, mes, ano, clienteId, filtroDia } = params
  const hoje = new Date()

  // Motivo repetido é ruído: um cliente sem configuração fiscal tem 40
  // contratos, e antes da carteira isso era UMA linha por cliente. Sem a dedup,
  // as 40 cópias empurram para fora do corte (slice) o motivo do cliente
  // seguinte — que é justamente o que alguém precisava ler.
  const motivos: string[] = []
  const motivosVistos = new Set<string>()
  const registrarMotivo = (texto: string) => {
    if (motivosVistos.has(texto)) return
    motivosVistos.add(texto)
    motivos.push(texto)
  }

  let contratosQuery: FirebaseFirestore.Query = db()
    .collection('nfse_recorrentes')
    .where('tenantId', '==', tenantId)
    .where('ativo', '==', true)
  if (clienteId) contratosQuery = contratosQuery.where('clienteId', '==', clienteId)
  // Sem .catch, pelo mesmo motivo do `existentesSnap` abaixo: falha transitória
  // não pode virar "não há contrato".
  const contratosSnap = await contratosQuery.get()

  // Coleção vazia é o estado NORMAL enquanto a carteira não foi cadastrada —
  // não é erro, não gera nada e não pode derrubar o cron.
  if (contratosSnap.empty) {
    return {
      itens: [] as ItemPendente[],
      ignorados: 0,
      motivos: [clienteId
        ? 'Cliente sem contrato de emissão recorrente cadastrado (nfse_recorrentes).'
        : 'Nenhum contrato de emissão recorrente cadastrado (nfse_recorrentes).'],
    }
  }

  const clientesSnap = clienteId
    ? {
      docs: [await db().collection('clientes').doc(clienteId).get()]
        .filter((doc) => doc.exists && doc.data()?.tenantId === tenantId),
    }
    : await db()
      .collection('clientes')
      .where('status', '==', 'ativo')
      .where('tenantId', '==', tenantId)
      .get()

  // Defesa em profundidade: pula clientes com deletedAt setado mesmo que o
  // status ainda não tenha sido virado — evita gerar rascunho fiscal (e,
  // por consequência, RPS) para cliente excluído.
  const clientesAtivos = clientesSnap.docs.filter((doc) => !doc.data()?.deletedAt)

  if (clientesAtivos.length === 0) {
    return { itens: [] as ItemPendente[], ignorados: contratosSnap.size, motivos: ['Nenhum cliente ativo encontrado.'] }
  }
  const clientePorId = new Map<string, FirebaseFirestore.DocumentData>(
    clientesAtivos.map((doc) => [doc.id, doc.data() ?? {}]),
  )

  const fiscalSnap = await db()
    .collection('clientes_fiscal')
    .where('tenantId', '==', tenantId)
    .get()
    .catch(() => null)
  const fiscalByCliente = new Map<string, FirebaseFirestore.DocumentData>()
  fiscalSnap?.docs.forEach((doc) => fiscalByCliente.set(doc.data().clienteId as string, doc.data()))

  // Sem .catch aqui, de propósito: uma falha transitória do Firestore devolvia
  // lista vazia, e "não existe nada" faz o batch reescrever (merge: false) até
  // rascunho já emitido — apagando inclusive o RPS consumido na prefeitura.
  // Falha fechado: aborta a rodada e tenta de novo amanhã.
  const existentesSnap = await db()
    .collection('nfse_rascunhos')
    .where('tenantId', '==', tenantId)
    .where('competenciaMes', '==', mes)
    .where('competenciaAno', '==', ano)
    .get()
  // Guarda status E tentativas: sozinho, o status não distingue "falhou agora"
  // de "falha há duas semanas pelo mesmo motivo" — e é essa diferença que
  // decide se vale reemitir (ver MAX_TENTATIVAS_AUTOMATICAS).
  const existentes = new Map<string, { status: string; tentativas: number }>(
    existentesSnap.docs.map((doc) => [doc.id, {
      status: (doc.data().status as string | undefined) ?? '',
      tentativas: (doc.data().tentativas as number | undefined) ?? 0,
    }]),
  )
  const comp = competenciaLabel(mes, ano)
  let ignorados = 0

  // Um contrato = um par prestador+tomador. Cliente com 40 tomadores tem 40
  // contratos e, no dia certo, 40 rascunhos — por isso a varredura é por
  // CONTRATO, e o dia deixou de ser um corte por cliente.
  type Candidato = {
    ref: FirebaseFirestore.DocumentReference
    contrato: ContratoNfseRecorrente
    clienteId: string
    clienteNome: string
    tomadorNome: string
    emissaoAutomatica: boolean
    diaEfetivo: number
    reprocessar: boolean
    campos: CamposFiscais
  }
  const candidatos: Candidato[] = []

  for (const contratoDoc of contratosSnap.docs) {
    const contrato = lerContrato(contratoDoc)
    const clienteIdDoContrato = contrato.clienteId
    const cliente = clienteIdDoContrato ? clientePorId.get(clienteIdDoContrato) : undefined

    // Prestador inativo/excluído (ou fora do tenant): silencioso porque, numa
    // varredura geral, é o estado esperado de todo contrato de cliente
    // desligado que ninguém encerrou.
    if (!clienteIdDoContrato || !cliente) {
      ignorados++
      continue
    }

    const clienteNome = (cliente.razaoSocial as string | undefined)
      ?? (cliente.nomeFantasia as string | undefined)
      ?? clienteIdDoContrato
    const tomadorNome = String(contrato.tomadorNome ?? '').trim()
    // Sem nome de tomador o contrato ainda precisa ser identificável na hora de
    // corrigir — cai no id do documento.
    const etiqueta = `${clienteNome} → ${tomadorNome || `contrato ${contrato.id} (sem tomador)`}`

    const fiscal = fiscalByCliente.get(clienteIdDoContrato)
    if (!fiscal) {
      ignorados++
      // Mensagem sem o tomador de propósito: o problema é do CLIENTE e a
      // correção é uma só, mesmo que ele tenha 40 contratos.
      registrarMotivo(`${clienteNome}: prestador sem configuração fiscal.`)
      continue
    }
    const emissaoAutomatica = fiscal.emissaoAutomatica === true

    const ref = db()
      .collection('nfse_rascunhos')
      .doc(`${tenantId}_${ano}_${String(mes).padStart(2, '0')}_${clienteIdDoContrato}_${contratoDoc.id}`)

    const selecao = selecionarContrato({
      contrato,
      ano,
      mes,
      hoje,
      filtroDia,
      // O dia é do contrato; `clientes.diaEmissaoNFSe` virou só o padrão de
      // quem não preencheu.
      diaPadraoDoCliente: cliente.diaEmissaoNFSe,
      emissaoAutomatica,
      rascunhoExistente: existentes.get(ref.id),
    })
    if (!selecao.entra) {
      ignorados++
      if (!selecao.silencioso) registrarMotivo(`${etiqueta}: ${descreverMotivo(selecao.motivo)}`)
      continue
    }

    // Campo fiscal vazio no contrato herda de `clientes_fiscal`. A checagem que
    // antes recusava o CLIENTE inteiro agora é por contrato: com herança, um
    // cliente sem padrão ainda emite os contratos que trazem o próprio código.
    const fiscalResolvido = resolverCamposFiscais(contrato, fiscal)
    if (!fiscalResolvido.ok) {
      ignorados++
      // Também sem o tomador: a correção é no cliente ou no contrato, e citar os
      // 40 tomadores não ajuda ninguém a decidir onde mexer.
      registrarMotivo(`${clienteNome}: sem ${fiscalResolvido.faltando.join(', ')} — preencha na configuração fiscal do cliente ou no contrato.`)
      continue
    }

    candidatos.push({
      ref,
      contrato,
      clienteId: clienteIdDoContrato,
      clienteNome,
      tomadorNome,
      emissaoAutomatica,
      diaEfetivo: selecao.diaEfetivo,
      reprocessar: selecao.reprocessar,
      campos: fiscalResolvido.campos,
    })
  }

  // As duas leituras só acontecem quando há trabalho: na maioria dos dias o
  // filtro de dia já zerou a lista, e ler `competencias` do mês inteiro à toa é
  // custo puro.
  let tomadoresPorId = new Map<string, FirebaseFirestore.DocumentData>()
  let competenciaPorCliente = new Map<string, string | null>()
  if (candidatos.length > 0) {
    const [tomadores, competencias] = await Promise.all([
      carregarTomadores(candidatos.map((c) => c.contrato.tomadorId)),
      mapearCompetenciaDoMes(tenantId, mes, ano),
    ])
    tomadoresPorId = tomadores
    competenciaPorCliente = competencias
  }

  const itens: ItemPendente[] = []
  for (const candidato of candidatos) {
    const tomador = candidato.contrato.tomadorId
      ? tomadoresPorId.get(candidato.contrato.tomadorId)
      : undefined

    const veredicto = avaliarTomador(candidato.contrato, tomador)
    if (veredicto.problema) {
      registrarMotivo(`${candidato.clienteNome} → ${candidato.tomadorNome}: ${descreverProblemaTomador(veredicto.problema)}`)
    }
    if (veredicto.bloqueia) {
      ignorados++
      continue
    }

    const endereco = (tomador?.endereco ?? {}) as Record<string, unknown>
    const dataEmissaoPrevista = new Date(ano, mes - 1, candidato.diaEfetivo, 12, 0, 0)
    const competenciaId = competenciaPorCliente.get(candidato.clienteId) ?? null

    itens.push({
      ref: candidato.ref,
      clienteId: candidato.clienteId,
      clienteNome: candidato.clienteNome,
      tomadorNome: candidato.tomadorNome,
      emissaoAutomatica: candidato.emissaoAutomatica,
      competenciaId,
      reprocessar: candidato.reprocessar,
      dados: {
        tenantId,
        clienteId: candidato.clienteId,
        clienteNome: candidato.clienteNome,
        competencia: comp,
        competenciaMes: mes,
        competenciaAno: ano,
        competenciaId,
        // Substitui o antigo `clienteServicoId`: a origem do rascunho agora é o
        // contrato de emissão, não o honorário do escritório.
        nfseRecorrenteId: candidato.contrato.id,
        tomadorId: candidato.contrato.tomadorId ?? null,
        // O tomador entra no título porque os 40 rascunhos do mesmo prestador
        // ficariam indistinguíveis na tela Fiscal.
        titulo: `NFS-e ${comp} - ${candidato.clienteNome} → ${candidato.tomadorNome}`,
        dataEmissaoPrevista: Timestamp.fromDate(dataEmissaoPrevista),
        dados: {
          // Nome e documento vêm DENORMALIZADOS do contrato: é a versão vigente
          // quando ele foi cadastrado, e é ela que deve sair na nota.
          tomadorNome: candidato.tomadorNome,
          tomadorCpfCnpj: onlyDigits(candidato.contrato.tomadorCpfCnpj),
          tomadorEmail: textoOuNulo(tomador?.email),
          tomadorInscricaoMunicipal: textoOuNulo(tomador?.inscricaoMunicipal),
          // Endereço completo do cadastro, INCLUSIVE municipioIbge: Cajamar
          // manda esse código como <Cidade> do tomador e como
          // <MunicipioPrestacaoServico> (municipios/cajamar.ts), e sem ele a
          // nota volta rejeitada.
          tomadorEndereco: {
            cep: onlyDigits(endereco.cep) || null,
            logradouro: textoOuNulo(endereco.logradouro),
            numero: textoOuNulo(endereco.numero),
            complemento: textoOuNulo(endereco.complemento),
            bairro: textoOuNulo(endereco.bairro),
            municipio: textoOuNulo(endereco.municipio),
            municipioIbge: onlyDigits(endereco.municipioIbge) || null,
            uf: textoOuNulo(endereco.uf),
          },
          descricaoServico: candidato.campos.descricaoServico,
          codigoServico: candidato.campos.codigoServico,
          itemListaServico: candidato.campos.itemListaServico,
          cnae: candidato.campos.cnae,
          valorServico: Number(candidato.contrato.valor),
          aliquota: candidato.campos.aliquota,
          issRetido: candidato.campos.issRetido,
        },
      },
    })
  }

  return { itens, ignorados, motivos }
}

/**
 * Processa uma lista de itens pendentes: cria o rascunho no Firestore (em
 * batch — exceto os marcados como `reprocessar`, que já existem) e, pros
 * clientes com emissão automática ligada, emite de verdade logo em
 * seguida — reaproveitando processarEmissao(input, rascunhoId), que
 * já tem a transação de alocação/reuso de RPS e a gravação em
 * nfse_emitidas/nfse_erros. Emissão é sequencial (não em paralelo) pra não
 * estourar limite de taxa dos conectores/Spedy.
 */
/**
 * Interruptor geral da emissão automática, em `configuracoes/escritorio`.
 *
 * O switch `emissaoAutomatica` do cliente diz QUEM pode ser emitido sozinho;
 * este diz SE alguém pode. Existe porque desligar cliente a cliente, no meio de
 * um incidente, é lento demais — e o que está em jogo é nota fiscal real.
 *
 * Falha FECHADO de propósito: campo ausente, documento ausente ou erro de
 * leitura devolvem `false`. Não emitir por engano é reversível (o rascunho
 * continua na fila); emitir por engano exige cancelamento na prefeitura.
 */
async function emissaoAutomaticaLiberadaNoEscritorio(): Promise<boolean> {
  try {
    const snap = await db().collection('configuracoes').doc('escritorio').get()
    return snap.exists && snap.data()?.emissaoAutomaticaNfseHabilitada === true
  } catch {
    return false
  }
}

async function processarItens(itens: ItemPendente[], actor: Actor) {
  let criados = 0
  let reprocessados = 0
  let ops = 0
  let batch = db().batch()

  for (const item of itens) {
    // Item reprocessado já tem documento — e esse documento guarda o RPS que
    // uma tentativa anterior alocou (dados.numeroRps). Reescrever com
    // merge: false apagaria o número, e o retry pediria um RPS novo à
    // prefeitura, arriscando nota duplicada. Aqui a gente só reemite; quem mexe
    // no status é a transação de lock dentro de processarEmissao.
    if (item.reprocessar) {
      reprocessados++
      continue
    }
    batch.set(item.ref, {
      ...item.dados,
      // 'aguardando_emissao' e NÃO 'processando': quem marca 'processando' é a
      // transação de lock dentro de processarEmissao, que rejeita rascunho já
      // nesse estado (emitir.ts). Marcar aqui fazia o cron travar a si mesmo —
      // toda emissão automática morria com "já está em processamento", e o
      // rascunho ficava preso num status que nenhuma tela lista.
      status: item.emissaoAutomatica ? 'aguardando_emissao' : 'rascunho',
      origem: 'nfse_recorrente',
      requerRevisao: !item.emissaoAutomatica,
      criadoEm: Timestamp.now(),
      atualizadoEm: Timestamp.now(),
      criadoPor: actor.uid,
      criadoPorNome: actor.nome,
    }, { merge: false })
    criados++
    ops++
    if (ops >= 400) {
      await batch.commit()
      batch = db().batch()
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()

  let emitidos = 0
  let falhasEmissao = 0
  const motivosEmissao: string[] = []

  const automaticos = itens.filter((i) => i.emissaoAutomatica)

  // O interruptor é conferido DEPOIS de criar/atualizar os rascunhos e ANTES de
  // emitir: com ele desligado o trabalho da competência continua sendo
  // preparado e fica visível na tela Fiscal, esperando um humano clicar. Ligar
  // o interruptor depois não perde nada — os rascunhos já estão lá.
  if (automaticos.length > 0 && !(await emissaoAutomaticaLiberadaNoEscritorio())) {
    return {
      criados,
      reprocessados,
      emitidos: 0,
      falhasEmissao: 0,
      motivosEmissao: [
        `Emissão automática desligada em Configurações → Parâmetros: ${automaticos.length} nota(s) ficaram como rascunho para revisão manual.`,
      ],
      pendentesRevisao: itens.length,
    }
  }

  for (const item of automaticos) {
    const dados = item.dados.dados as Record<string, unknown>
    const endereco = (dados.tomadorEndereco ?? {}) as Record<string, string | null>
    const input: EmitirNfseInput = {
      clienteId: item.clienteId,
      rascunhoId: item.ref.id,
      // `competenciaId` é opcional na emissão; contrato sem competência única no
      // mês manda undefined em vez de um ID que não existe.
      competenciaId: item.competenciaId ?? undefined,
      tomador: {
        razaoSocial: dados.tomadorNome as string,
        cpfCnpj: dados.tomadorCpfCnpj as string,
        email: (dados.tomadorEmail as string | null) ?? undefined,
        // O endereço vai junto porque a prefeitura que exige o município do
        // tomador (IBGE) rejeita a nota sem ele — e o conector não tem de onde
        // buscar depois.
        endereco: {
          logradouro: endereco.logradouro ?? undefined,
          numero: endereco.numero ?? undefined,
          complemento: endereco.complemento ?? undefined,
          bairro: endereco.bairro ?? undefined,
          municipioIbge: endereco.municipioIbge ?? undefined,
          uf: endereco.uf ?? undefined,
          cep: endereco.cep ?? undefined,
        },
      },
      servico: {
        discriminacao: dados.descricaoServico as string,
        codigoServico: dados.codigoServico as string,
        itemListaServico: dados.itemListaServico as string,
        cnae: (dados.cnae as string | null) ?? undefined,
        valorServico: dados.valorServico as number,
        aliquota: dados.aliquota as number,
        issRetido: dados.issRetido as boolean,
      },
    }
    // O tomador entra na mensagem: com 40 contratos por prestador, "Cliente X:
    // erro" não diz qual nota falhou.
    const etiqueta = `${item.clienteNome} → ${item.tomadorNome}`
    try {
      const resultado = await processarEmissao(input, actor.uid)
      if (resultado.sucesso) emitidos++
      else {
        falhasEmissao++
        motivosEmissao.push(`${etiqueta}: ${resultado.erro ?? 'emissão automática recusada.'}`)
      }
    } catch (err) {
      falhasEmissao++
      motivosEmissao.push(`${etiqueta}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Rascunho parado esperando revisão humana = os não-automáticos criados
  // agora. Antes isso era `criados - emitidos - falhasEmissao`, conta que passa
  // a dar negativo assim que existe item reprocessado (emitido sem ser criado).
  const pendentesRevisao = itens.filter((i) => !i.emissaoAutomatica).length

  return { criados, reprocessados, emitidos, falhasEmissao, motivosEmissao, pendentesRevisao }
}

export const gerarRascunhosNfseMensais = onCall(
  {
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
    secrets: credentialSecrets,
  },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const actor = await assertCanGenerate(request.auth.uid)

    const input = (request.data ?? {}) as GerarRascunhosInput
    const hoje = new Date()
    const mes = Number(input.mes ?? hoje.getMonth() + 1)
    const ano = Number(input.ano ?? hoje.getFullYear())
    const gerarAteHoje = input.gerarAteHoje !== false

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new HttpsError('invalid-argument', 'Mês inválido.')
    }
    if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
      throw new HttpsError('invalid-argument', 'Ano inválido.')
    }

    const { itens, ignorados, motivos } = await listarPendentes({
      tenantId: actor.tenantId,
      mes,
      ano,
      clienteId: input.clienteId,
      // A geração manual continua varrendo o mês inteiro (recortado no dia de
      // hoje quando a tela pede). 'somente_hoje' é exclusivo do cron diário.
      filtroDia: gerarAteHoje ? 'ate_hoje' : 'todos',
    })

    const { criados, reprocessados, emitidos, falhasEmissao, motivosEmissao, pendentesRevisao } =
      await processarItens(itens, actor)

    await db().collection('logs_auditoria').add({
      tenantId: actor.tenantId,
      atorId: actor.uid,
      atorNome: actor.nome,
      acao: 'gerar_rascunhos_nfse_mensais',
      entidade: 'nfse_rascunhos',
      data: Timestamp.now(),
      detalhes: { mes, ano, criados, reprocessados, emitidos, falhasEmissao, ignorados, motivos: [...motivos, ...motivosEmissao].slice(0, 50) },
      origem: 'cloud_function',
    })

    return {
      criados,
      reprocessados,
      emitidos,
      falhasEmissao,
      ignorados,
      pendentesRevisao,
      motivos: [...motivos, ...motivosEmissao].slice(0, 20),
    }
  }
)

/**
 * Cron diário: gera rascunhos recorrentes e, pros clientes com
 * `emissaoAutomatica: true` na config fiscal, emite de verdade sem
 * intervenção humana. Roda todo dia (não só dia 1) porque cada CONTRATO de
 * `nfse_recorrentes` tem seu próprio `diaEmissao` — o filtro de dia fica dentro
 * de listarPendentes, no modo `filtroDia: 'somente_hoje'`: só entra quem faz
 * aniversário hoje. Qualquer outro modo aqui significa emitir nota real de
 * cliente antes da data contratada — no dia 1º, a base inteira de uma vez.
 *
 * ATENÇÃO: emissão automática é uma decisão explícita do dono do produto em
 * 2026-07-07 — reverte, pra quem tiver o flag ligado, a trava de revisão
 * humana que existia desde o Lote inicial (ver docs_dev/checklist-ajustes-
 * producao.md). Erros de emissão automática caem em nfse_erros e disparam o
 * alerta diário já existente (functions/src/scheduler/alertas.ts).
 */
export const processarNfseRecorrenteDiaria = onSchedule(
  {
    schedule: '30 6 * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
    secrets: credentialSecrets,
  },
  async () => {
    const hoje = new Date()
    const mes = hoje.getMonth() + 1
    const ano = hoje.getFullYear()
    const tenantId = DEFAULT_TENANT_ID

    const { itens, ignorados, motivos } = await listarPendentes({
      tenantId,
      mes,
      ano,
      filtroDia: 'somente_hoje',
    })

    // Sai sem escrever nada, mas com o motivo no log: carteira ainda não
    // cadastrada (`nfse_recorrentes` vazia) é indistinguível de "ninguém fatura
    // hoje" se a rodada só registrar o contador de ignorados.
    if (itens.length === 0) {
      console.log('[nfse-recorrente] nada pendente hoje', { mes, ano, ignorados, motivos: motivos.slice(0, 10) })
      return
    }

    const { criados, reprocessados, emitidos, falhasEmissao, motivosEmissao } = await processarItens(itens, {
      uid: SYSTEM_ACTOR.id,
      nome: SYSTEM_ACTOR.nome,
      tenantId,
    })

    console.log('[nfse-recorrente] processado', { mes, ano, criados, reprocessados, emitidos, falhasEmissao, ignorados })

    await db().collection('logs_auditoria').add({
      tenantId,
      atorId: SYSTEM_ACTOR.id,
      atorNome: SYSTEM_ACTOR.nome,
      acao: 'nfse_recorrente_diaria',
      entidade: 'nfse_rascunhos',
      data: Timestamp.now(),
      detalhes: { mes, ano, criados, reprocessados, emitidos, falhasEmissao, ignorados, motivos: [...motivos, ...motivosEmissao].slice(0, 50) },
      origem: 'cloud_function',
    })
  }
)
