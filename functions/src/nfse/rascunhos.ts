import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'
import { requireEnvironmentTenant, DEFAULT_TENANT_ID } from '../tenant'
import { SYSTEM_ACTOR } from '../audit'
import { processarEmissao } from './emitir'
import { credentialSecrets } from './secrets'
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

function clampDay(ano: number, mes: number, dia: number) {
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return Math.min(Math.max(1, dia), ultimoDia)
}

function competenciaLabel(mes: number, ano: number) {
  return `${String(mes).padStart(2, '0')}/${ano}`
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

type Actor = { uid: string; nome: string; tenantId: string }

/**
 * Como o `diaEmissaoNFSe` de cada cliente restringe a varredura:
 *  - 'somente_hoje': só quem faz aniversário HOJE. É o modo do cron diário —
 *    sem ele, a varredura pega o mês inteiro e emite de verdade, no dia 1º, a
 *    nota do cliente que só deveria ser emitido no dia 25. Vale pra CRIAR item
 *    novo; rascunho pendente de um dia anterior é retomado em qualquer modo.
 *  - 'ate_hoje': no mês corrente, ignora quem ainda não chegou no dia. É o que
 *    o botão "Preparar mês" sempre fez.
 *  - 'todos': o mês inteiro, sem olhar o dia — quando a tela pede
 *    explicitamente `gerarAteHoje: false` (mês fechado, correção manual).
 */
type FiltroDia = 'somente_hoje' | 'ate_hoje' | 'todos'

/**
 * Status de rascunho que ainda representam TRABALHO PENDENTE. Existir não é
 * dedup suficiente: o cron que cria 40 rascunhos, emite 12 e morre no 13º por
 * timeout precisa terminar o serviço na rodada seguinte, e não olhar os 40
 * documentos e concluir "nada pendente" — os 27 restantes nunca mais sairiam.
 * Fora da lista de propósito: 'emitida' e 'processando' (nota já saiu ou está
 * sob o lock da transação em emitir.ts) e os estados de revisão humana
 * ('rascunho', 'pronto_para_emitir', ...), que são do operador — recriar
 * apagaria o que ele editou na tela.
 */
const STATUS_REPROCESSAVEIS = new Set(['aguardando_emissao', 'erro_integracao'])

/**
 * Teto de tentativas automáticas por rascunho. Erro transitório (rede, 429,
 * prefeitura fora do ar) se resolve em poucas rodadas; erro permanente
 * (certificado errado, município mal configurado, payload inválido) não se
 * resolve nunca — e sem teto o cron reemitiria todo dia, para sempre, gerando
 * um `nfse_erros` por dia e escondendo o problema real no volume.
 * Estourado o teto, o rascunho sai da fila automática e espera um humano: ele
 * continua visível na tela Fiscal em 'erro_integracao'.
 */
const MAX_TENTATIVAS_AUTOMATICAS = 3

function podeReprocessar(status: string | undefined, tentativas: number): boolean {
  return status !== undefined
    && STATUS_REPROCESSAVEIS.has(status)
    && tentativas < MAX_TENTATIVAS_AUTOMATICAS
}

type ItemPendente = {
  ref: FirebaseFirestore.DocumentReference
  clienteId: string
  clienteNome: string
  emissaoAutomatica: boolean
  competenciaId: string
  // Documento já existe num status reprocessável: pode ser reemitido, mas NÃO
  // pode ser recriado (ver processarItens).
  reprocessar: boolean
  dados: Record<string, unknown>
}

/**
 * Levanta, para uma competência, todos os pares cliente+serviço elegíveis
 * pra gerar rascunho (ou emitir direto, se `emissaoAutomatica` estiver
 * ligado na config fiscal do cliente) — e cujo trabalho ainda não foi feito:
 * a dedup usa o ID determinístico do rascunho MAIS o status do documento
 * (ver STATUS_REPROCESSAVEIS).
 *
 * Compartilhado entre o botão manual "Gerar rascunhos" e o cron diário —
 * o comportamento por cliente (rascunho vs. emissão automática) é o mesmo
 * nos dois casos; o que muda é quando cada um roda e o `filtroDia`.
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

  const motivos: string[] = []
  if (clientesAtivos.length === 0) {
    return { itens: [] as ItemPendente[], ignorados: 0, motivos: ['Nenhum cliente ativo encontrado.'] }
  }

  const fiscalSnap = await db()
    .collection('clientes_fiscal')
    .where('tenantId', '==', tenantId)
    .get()
    .catch(() => null)
  const fiscalByCliente = new Map<string, FirebaseFirestore.DocumentData>()
  fiscalSnap?.docs.forEach((doc) => fiscalByCliente.set(doc.data().clienteId as string, doc.data()))

  const servicosSnap = await db()
    .collection('clientes_servicos')
    .where('tenantId', '==', tenantId)
    .where('status', '==', 'ativo')
    .get()
  const servicosByCliente = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>()
  servicosSnap.docs.forEach((doc) => {
    const clienteIdDoServico = doc.data().clienteId as string | undefined
    if (!clienteIdDoServico) return
    if (!servicosByCliente.has(clienteIdDoServico)) servicosByCliente.set(clienteIdDoServico, [])
    servicosByCliente.get(clienteIdDoServico)!.push(doc)
  })

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
  // Quem tem trabalho pela metade nesta competência. Serve pra deixar o cliente
  // passar pelo filtro de dia: o rascunho que o cron de ontem criou e não
  // conseguiu emitir precisa ser retomado hoje, mesmo que o aniversário dele
  // tenha sido ontem. Isso NÃO libera criar item novo fora do dia — a checagem
  // por item, mais abaixo, continua exigindo `diaBate` pra quem ainda não existe.
  const clientesComPendencia = new Set<string>()
  existentesSnap.docs.forEach((doc) => {
    const data = doc.data()
    const clienteIdDoRascunho = data.clienteId as string | undefined
    const jaTentou = (data.tentativas as number | undefined) ?? 0
    if (clienteIdDoRascunho && podeReprocessar(data.status as string, jaTentou)) {
      clientesComPendencia.add(clienteIdDoRascunho)
    }
  })

  const itens: ItemPendente[] = []
  let ignorados = 0
  const comp = competenciaLabel(mes, ano)

  for (const clienteDoc of clientesAtivos) {
    const cliente = clienteDoc.data() ?? {}
    const clienteIdAtual = clienteDoc.id
    const clienteNome = (cliente.razaoSocial as string | undefined) ?? (cliente.nomeFantasia as string | undefined) ?? clienteIdAtual
    const diaEmissao = Number(cliente.diaEmissaoNFSe)

    if (!Number.isInteger(diaEmissao) || diaEmissao < 1 || diaEmissao > 31) {
      ignorados++
      motivos.push(`${clienteNome}: sem dia de emissão NFS-e.`)
      continue
    }
    // Dia contratado normalizado pro tamanho do mês (31 num mês de 30 = dia 30),
    // senão esse cliente nunca "faz aniversário" em abril, junho, setembro,
    // novembro e fevereiro — e a nota dele simplesmente não sai. Mesmo clamp que
    // já era usado na dataEmissaoPrevista.
    const diaEfetivo = clampDay(ano, mes, diaEmissao)
    const mesCorrente = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1

    const diaBate =
      filtroDia === 'somente_hoje' ? mesCorrente && diaEfetivo === hoje.getDate()
        : filtroDia === 'ate_hoje' ? !(mesCorrente && diaEfetivo > hoje.getDate())
          : true

    // Só pula o cliente inteiro se, além de não ser o dia dele, não houver
    // rascunho pendente pra retomar. A ordem importa: esse corte vem antes das
    // checagens de configuração fiscal justamente pra não encher `motivos` com
    // os outros 118 clientes todo dia.
    if (!diaBate && !clientesComPendencia.has(clienteIdAtual)) {
      ignorados++
      continue
    }

    const fiscal = fiscalByCliente.get(clienteIdAtual)
    if (!fiscal) {
      ignorados++
      motivos.push(`${clienteNome}: sem configuração fiscal.`)
      continue
    }

    const servicos = servicosByCliente.get(clienteIdAtual) ?? []
    if (servicos.length === 0) {
      ignorados++
      motivos.push(`${clienteNome}: sem serviço contratado ativo.`)
      continue
    }

    const codigoServico = fiscal.codigoServicoPadrao ?? fiscal.itemListaServico
    if (!hasText(codigoServico) || !hasText(fiscal.itemListaServico) || !Number.isFinite(Number(fiscal.aliquotaPadrao))) {
      ignorados++
      motivos.push(`${clienteNome}: configuração fiscal sem código/item/alíquota padrão.`)
      continue
    }

    const emissaoAutomatica = fiscal.emissaoAutomatica === true

    for (const servicoDoc of servicos) {
      const servico = servicoDoc.data()
      const valor = Number(servico.valor ?? servico.valorPadrao ?? 0)
      if (!Number.isFinite(valor) || valor <= 0) {
        ignorados++
        motivos.push(`${clienteNome}: serviço ${servicoDoc.id} sem valor positivo.`)
        continue
      }

      const ref = db().collection('nfse_rascunhos').doc(`${tenantId}_${ano}_${String(mes).padStart(2, '0')}_${clienteIdAtual}_${servicoDoc.id}`)
      const registroExistente = existentes.get(ref.id)
      const statusAtual = registroExistente?.status
      if (statusAtual === undefined) {
        // Item novo: respeita o dia contratado. É aqui que o cron diário deixa
        // de criar (e emitir) a nota de quem só é faturado dia 25.
        if (!diaBate) {
          ignorados++
          continue
        }
      } else if (!(emissaoAutomatica && podeReprocessar(statusAtual, registroExistente?.tentativas ?? 0))) {
        // Documento já existe: só é trabalho pendente se o STATUS disser que é —
        // e só o cliente com emissão automática volta pra fila sozinho, porque
        // nos demais quem emite é um humano na tela.
        ignorados++
        continue
      }

      // Mesma chave determinística que criarCompetenciasMensais usa para o
      // documento em `competencias` (scheduler/competencias.ts) — é o que permite
      // conciliar a nota emitida com a competência. Sem propagar isso, toda nota
      // automática gravava competenciaId: null em nfse_emitidas.
      const competenciaId = `${clienteIdAtual}_${servicoDoc.id}_${ano}_${String(mes).padStart(2, '0')}`

      const dataEmissaoPrevista = new Date(ano, mes - 1, diaEfetivo, 12, 0, 0)
      itens.push({
        ref,
        clienteId: clienteIdAtual,
        clienteNome,
        emissaoAutomatica,
        competenciaId,
        reprocessar: statusAtual !== undefined,
        dados: {
          tenantId,
          clienteId: clienteIdAtual,
          clienteNome,
          competencia: comp,
          competenciaMes: mes,
          competenciaAno: ano,
          competenciaId,
          clienteServicoId: servicoDoc.id,
          titulo: `NFS-e ${comp} - ${clienteNome}`,
          dataEmissaoPrevista: Timestamp.fromDate(dataEmissaoPrevista),
          dados: {
            tomadorNome: clienteNome,
            tomadorCpfCnpj: onlyDigits(cliente.cpfCnpj),
            tomadorEmail: cliente.email ?? null,
            descricaoServico: fiscal.descricaoServicoPadrao ?? servico.descricaoServico ?? servico.servicoNome ?? servico.nomeServico ?? 'Serviços prestados',
            codigoServico,
            itemListaServico: fiscal.itemListaServico,
            cnae: fiscal.cnae ?? null,
            valorServico: valor,
            aliquota: Number(fiscal.aliquotaPadrao),
            issRetido: Boolean(fiscal.issRetidoPadrao ?? false),
          },
        },
      })
    }
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
    const input: EmitirNfseInput = {
      clienteId: item.clienteId,
      rascunhoId: item.ref.id,
      competenciaId: item.competenciaId,
      tomador: {
        razaoSocial: dados.tomadorNome as string,
        cpfCnpj: dados.tomadorCpfCnpj as string,
        email: (dados.tomadorEmail as string | null) ?? undefined,
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
    try {
      const resultado = await processarEmissao(input, actor.uid)
      if (resultado.sucesso) emitidos++
      else {
        falhasEmissao++
        motivosEmissao.push(`${item.clienteNome}: ${resultado.erro ?? 'emissão automática recusada.'}`)
      }
    } catch (err) {
      falhasEmissao++
      motivosEmissao.push(`${item.clienteNome}: ${err instanceof Error ? err.message : String(err)}`)
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
 * intervenção humana. Roda todo dia (não só dia 1) porque cada cliente tem
 * seu próprio `diaEmissaoNFSe` — o filtro de dia fica dentro de
 * listarPendentes, no modo `filtroDia: 'somente_hoje'`: só entra quem faz
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

    if (itens.length === 0) {
      console.log('[nfse-recorrente] nada pendente hoje', { mes, ano, ignorados })
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
