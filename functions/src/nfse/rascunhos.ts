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

type ItemPendente = {
  ref: FirebaseFirestore.DocumentReference
  clienteId: string
  clienteNome: string
  emissaoAutomatica: boolean
  dados: Record<string, unknown>
}

/**
 * Levanta, para uma competência, todos os pares cliente+serviço elegíveis
 * pra gerar rascunho (ou emitir direto, se `emissaoAutomatica` estiver
 * ligado na config fiscal do cliente) — e que ainda não têm registro pra
 * essa competência (dedup pelo mesmo ID determinístico usado nos rascunhos).
 *
 * Compartilhado entre o botão manual "Gerar rascunhos" e o cron diário —
 * o comportamento por cliente (rascunho vs. emissão automática) é o mesmo
 * nos dois casos; o que muda é só quando cada um roda.
 */
async function listarPendentes(params: {
  tenantId: string
  mes: number
  ano: number
  clienteId?: string
  gerarAteHoje: boolean
}) {
  const { tenantId, mes, ano, clienteId, gerarAteHoje } = params
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

  const existentesSnap = await db()
    .collection('nfse_rascunhos')
    .where('tenantId', '==', tenantId)
    .where('competenciaMes', '==', mes)
    .where('competenciaAno', '==', ano)
    .get()
    .catch(() => null)
  const existentes = new Set((existentesSnap?.docs ?? []).map((doc) => doc.id))

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
    if (gerarAteHoje && ano === hoje.getFullYear() && mes === hoje.getMonth() + 1 && diaEmissao > hoje.getDate()) {
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

    for (const servicoDoc of servicos) {
      const servico = servicoDoc.data()
      const valor = Number(servico.valor ?? servico.valorPadrao ?? 0)
      if (!Number.isFinite(valor) || valor <= 0) {
        ignorados++
        motivos.push(`${clienteNome}: serviço ${servicoDoc.id} sem valor positivo.`)
        continue
      }

      const ref = db().collection('nfse_rascunhos').doc(`${tenantId}_${ano}_${String(mes).padStart(2, '0')}_${clienteIdAtual}_${servicoDoc.id}`)
      if (existentes.has(ref.id)) {
        ignorados++
        continue
      }

      const dataEmissaoPrevista = new Date(ano, mes - 1, clampDay(ano, mes, diaEmissao), 12, 0, 0)
      itens.push({
        ref,
        clienteId: clienteIdAtual,
        clienteNome,
        emissaoAutomatica: fiscal.emissaoAutomatica === true,
        dados: {
          tenantId,
          clienteId: clienteIdAtual,
          clienteNome,
          competencia: comp,
          competenciaMes: mes,
          competenciaAno: ano,
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
 * batch) e, pros clientes com emissão automática ligada, emite de verdade
 * logo em seguida — reaproveitando processarEmissao(input, rascunhoId), que
 * já tem a transação de alocação/reuso de RPS e a gravação em
 * nfse_emitidas/nfse_erros. Emissão é sequencial (não em paralelo) pra não
 * estourar limite de taxa dos conectores/Spedy.
 */
async function processarItens(itens: ItemPendente[], actor: Actor) {
  let criados = 0
  let ops = 0
  let batch = db().batch()

  for (const item of itens) {
    batch.set(item.ref, {
      ...item.dados,
      status: item.emissaoAutomatica ? 'processando' : 'rascunho',
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

  for (const item of itens.filter((i) => i.emissaoAutomatica)) {
    const dados = item.dados.dados as Record<string, unknown>
    const input: EmitirNfseInput = {
      clienteId: item.clienteId,
      rascunhoId: item.ref.id,
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

  return { criados, emitidos, falhasEmissao, motivosEmissao }
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
      gerarAteHoje,
    })

    const { criados, emitidos, falhasEmissao, motivosEmissao } = await processarItens(itens, actor)

    await db().collection('logs_auditoria').add({
      tenantId: actor.tenantId,
      atorId: actor.uid,
      atorNome: actor.nome,
      acao: 'gerar_rascunhos_nfse_mensais',
      entidade: 'nfse_rascunhos',
      data: Timestamp.now(),
      detalhes: { mes, ano, criados, emitidos, falhasEmissao, ignorados, motivos: [...motivos, ...motivosEmissao].slice(0, 50) },
      origem: 'cloud_function',
    })

    return {
      criados,
      emitidos,
      falhasEmissao,
      ignorados,
      pendentesRevisao: criados - emitidos - falhasEmissao,
      motivos: [...motivos, ...motivosEmissao].slice(0, 20),
    }
  }
)

/**
 * Cron diário: gera rascunhos recorrentes e, pros clientes com
 * `emissaoAutomatica: true` na config fiscal, emite de verdade sem
 * intervenção humana. Roda todo dia (não só dia 1) porque cada cliente tem
 * seu próprio `diaEmissaoNFSe` — o filtro de dia fica dentro de
 * listarPendentes (gerarAteHoje: false = só quem faz aniversário hoje).
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
      gerarAteHoje: false,
    })

    if (itens.length === 0) {
      console.log('[nfse-recorrente] nada pendente hoje', { mes, ano, ignorados })
      return
    }

    const { criados, emitidos, falhasEmissao, motivosEmissao } = await processarItens(itens, {
      uid: SYSTEM_ACTOR.id,
      nome: SYSTEM_ACTOR.nome,
      tenantId,
    })

    console.log('[nfse-recorrente] processado', { mes, ano, criados, emitidos, falhasEmissao, ignorados })

    await db().collection('logs_auditoria').add({
      tenantId,
      atorId: SYSTEM_ACTOR.id,
      atorNome: SYSTEM_ACTOR.nome,
      acao: 'nfse_recorrente_diaria',
      entidade: 'nfse_rascunhos',
      data: Timestamp.now(),
      detalhes: { mes, ano, criados, emitidos, falhasEmissao, ignorados, motivos: [...motivos, ...motivosEmissao].slice(0, 50) },
      origem: 'cloud_function',
    })
  }
)
