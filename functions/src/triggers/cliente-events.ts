import * as admin from 'firebase-admin'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'

const db = () => admin.firestore()

type EventTipo = 'tarefa' | 'lancamento' | 'competencia' | 'nfse' | 'fiscal' | 'manual'

async function registrarEvento(params: {
  clienteId?: string
  tipo: EventTipo
  titulo: string
  descricao?: string
  origemColecao: string
  origemId: string
  metadata?: Record<string, unknown>
}) {
  if (!params.clienteId) return
  const md = params.metadata ?? {}
  const actorId = (md.actorId as string | undefined) ?? 'system'
  const actorNome = (md.actorNome as string | undefined) ?? 'Sistema'
  await db().collection('events').add({
    clienteId: params.clienteId,
    tipo: params.tipo,
    titulo: params.titulo,
    descricao: params.descricao ?? '',
    origemColecao: params.origemColecao,
    origemId: params.origemId,
    metadata: { ...md, actorId, actorNome },
    criadoEm: admin.firestore.Timestamp.now(),
  })
}

function actorFrom(data: FirebaseFirestore.DocumentData | undefined): { actorId?: string; actorNome?: string; actorAvatarUrl?: string } | undefined {
  if (!data) return undefined
  return {
    actorId: (data.atualizadoPorId as string | undefined)
      ?? (data.criadoPorId as string | undefined)
      ?? (data.responsavelId as string | undefined),
    actorNome: (data.atualizadoPorNome as string | undefined)
      ?? (data.criadoPorNome as string | undefined)
      ?? (data.responsavelNome as string | undefined),
    actorAvatarUrl: (data.atualizadoPorAvatarUrl as string | undefined)
      ?? (data.criadoPorAvatarUrl as string | undefined)
      ?? (data.responsavelAvatarUrl as string | undefined),
  }
}

export const eventoTarefaCriada = onDocumentCreated(
  { document: 'tarefas/{id}', region: 'southamerica-east1' },
  async (event) => {
    const d = event.data?.data()
    if (!d) return
    await registrarEvento({
      clienteId: d.clienteId as string | undefined,
      tipo: 'tarefa',
      titulo: `Tarefa criada: ${(d.titulo as string) ?? 'Sem título'}`,
      descricao: `Prioridade ${(d.prioridade as string) ?? 'normal'}`,
      origemColecao: 'tarefas',
      origemId: event.params.id,
      metadata: {
        severidade: (d.prioridade === 'urgente' || d.prioridade === 'alta') ? 'alta' : 'media',
        href: `/tarefas/${event.params.id}`,
        ...actorFrom(d),
      },
    })
  }
)

export const eventoTarefaAtualizada = onDocumentUpdated(
  { document: 'tarefas/{id}', region: 'southamerica-east1' },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return
    const statusAntes = before.status as string | undefined
    const statusDepois = after.status as string | undefined
    if (statusAntes === statusDepois) return
    await registrarEvento({
      clienteId: after.clienteId as string | undefined,
      tipo: 'tarefa',
      titulo: `Tarefa alterada: ${(after.titulo as string) ?? 'Sem título'}`,
      descricao: `Status: ${statusAntes ?? '—'} -> ${statusDepois ?? '—'}`,
      origemColecao: 'tarefas',
      origemId: event.params.id,
      metadata: {
        severidade: statusDepois === 'concluida' ? 'baixa' : 'media',
        href: `/tarefas/${event.params.id}`,
        ...actorFrom(after),
      },
    })
  }
)

export const eventoLancamentoCriado = onDocumentCreated(
  { document: 'lancamentos/{id}', region: 'southamerica-east1' },
  async (event) => {
    const d = event.data?.data()
    if (!d) return
    await registrarEvento({
      clienteId: d.clienteId as string | undefined,
      tipo: 'lancamento',
      titulo: `Lançamento criado: ${(d.descricao as string) ?? 'Sem descrição'}`,
      descricao: `Valor ${(d.valor as number) ?? 0} • Status ${(d.status as string) ?? 'pendente'}`,
      origemColecao: 'lancamentos',
      origemId: event.params.id,
      metadata: {
        severidade: d.status === 'atrasado' ? 'alta' : 'media',
        href: '/financeiro',
        ...actorFrom(d),
      },
    })
  }
)

export const eventoLancamentoAtualizado = onDocumentUpdated(
  { document: 'lancamentos/{id}', region: 'southamerica-east1' },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return
    const statusAntes = before.status as string | undefined
    const statusDepois = after.status as string | undefined
    if (statusAntes === statusDepois) return
    await registrarEvento({
      clienteId: after.clienteId as string | undefined,
      tipo: 'lancamento',
      titulo: `Lançamento atualizado: ${(after.descricao as string) ?? 'Sem descrição'}`,
      descricao: `Status: ${statusAntes ?? '—'} -> ${statusDepois ?? '—'}`,
      origemColecao: 'lancamentos',
      origemId: event.params.id,
      metadata: {
        severidade: statusDepois === 'atrasado' ? 'alta' : statusDepois === 'pago' ? 'baixa' : 'media',
        href: '/financeiro',
        ...actorFrom(after),
      },
    })
  }
)

export const eventoCompetenciaCriada = onDocumentCreated(
  { document: 'competencias/{id}', region: 'southamerica-east1' },
  async (event) => {
    const d = event.data?.data()
    if (!d) return
    await registrarEvento({
      clienteId: d.clienteId as string | undefined,
      tipo: 'competencia',
      titulo: `Competência criada: ${String(d.mes ?? '—')}/${String(d.ano ?? '—')}`,
      descricao: `Status ${(d.status as string) ?? 'aberta'}`,
      origemColecao: 'competencias',
      origemId: event.params.id,
      metadata: {
        severidade: d.status === 'aberta' ? 'alta' : 'media',
        href: `/competencias/${event.params.id}`,
        ...actorFrom(d),
      },
    })
  }
)

export const eventoNfseEmitidaCriada = onDocumentCreated(
  { document: 'nfse_emitidas/{id}', region: 'southamerica-east1' },
  async (event) => {
    const d = event.data?.data()
    if (!d) return
    await registrarEvento({
      clienteId: d.clienteId as string | undefined,
      tipo: 'nfse',
      titulo: `NFS-e emitida: ${(d.numeroNfse as string) ?? 'Sem número'}`,
      descricao: `Status ${(d.status as string) ?? 'emitida'}`,
      origemColecao: 'nfse_emitidas',
      origemId: event.params.id,
      metadata: {
        severidade: d.status === 'rejeitada' || d.status === 'erro_integracao' ? 'alta' : 'media',
        href: '/fiscal/historico',
        ...actorFrom(d),
      },
    })
  }
)

export const eventoFiscalAtualizado = onDocumentUpdated(
  { document: 'clientes_fiscal/{id}', region: 'southamerica-east1' },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return
    const ambAntes = before.ambienteEmissao as string | undefined
    const ambDepois = after.ambienteEmissao as string | undefined
    const munAntes = before.municipioIbge as string | undefined
    const munDepois = after.municipioIbge as string | undefined
    if (ambAntes === ambDepois && munAntes === munDepois) return
    await registrarEvento({
      clienteId: after.clienteId as string | undefined,
      tipo: 'fiscal',
      titulo: 'Configuração fiscal atualizada',
      descricao: `Ambiente ${ambAntes ?? '—'} -> ${ambDepois ?? '—'}`,
      origemColecao: 'clientes_fiscal',
      origemId: event.params.id,
      metadata: {
        severidade: 'media',
        href: '/fiscal',
        ...actorFrom(after),
      },
    })
  }
)
