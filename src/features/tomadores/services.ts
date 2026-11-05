import { deleteField, limit, serverTimestamp, where } from 'firebase/firestore'
import { createDocument, getDocument, listDocuments, updateDocument } from '@/lib/firestore-client'
import type { TomadorDoc } from '@/types/firestore'
import { sincronizarContratosDoTomador } from '@/features/nfse-recorrentes/services'
import type { PrestadorResumo, TomadorInput, TomadorRecord } from './types'
import { chaveCarteira } from './importacao'
import { somenteDigitos } from './validacao'

export const COLECAO_TOMADORES = 'tomadores'

// Teto de leitura. Uma carteira de serviço tem dezenas de tomadores; o teto
// existe para não varrer sem limite se alguém importar uma base grande, e
// `truncado` avisa na tela em vez de mostrar lista parcial como se fosse total.
export const TETO_TOMADORES = 1000
/** Teto da varredura global (importação), que cruza a carteira de todos os clientes. */
export const TETO_TOMADORES_GLOBAL = 5000

export interface CarteiraDoCliente {
  tomadores: TomadorRecord[]
  truncado: boolean
}

/**
 * Só filtros de igualdade, ordenação no cliente — mesmo motivo de
 * fetchContratosRecorrentes: (tenantId + clienteId) por igualdade não precisa de
 * índice composto, e um `orderBy` aqui quebraria a tela com `failed-precondition`
 * até o índice subir.
 */
export async function fetchTomadores(clienteId: string): Promise<CarteiraDoCliente> {
  const rows = await listDocuments<TomadorDoc>(COLECAO_TOMADORES, [
    where('clienteId', '==', clienteId),
    limit(TETO_TOMADORES),
  ])

  const tomadores = rows.sort((a, b) =>
    String(a.razaoSocial ?? '').localeCompare(String(b.razaoSocial ?? ''), 'pt-BR')
  )

  return { tomadores, truncado: rows.length >= TETO_TOMADORES }
}

/** O prestador da carteira: o cliente do escritório em nome de quem a nota sai. */
export async function fetchPrestador(clienteId: string): Promise<PrestadorResumo> {
  const cliente = await getDocument<Record<string, unknown>>('clientes', clienteId)
  if (!cliente) throw new Error('Cliente não encontrado.')

  return {
    id: cliente.id,
    razaoSocial: String(cliente.razaoSocial ?? cliente.nomeFantasia ?? '—'),
    // Dígitos: é assim que a comparação com o tomador é feita e como o
    // Firestore guarda o documento do tomador.
    cpfCnpj: somenteDigitos(cliente.cpfCnpj as string | undefined),
  }
}

/** Todos os clientes que podem ser prestadores, indexados pelo documento (importação). */
export async function fetchPrestadoresPorDocumento(): Promise<Map<string, PrestadorResumo>> {
  const clientes = await listDocuments<Record<string, unknown>>('clientes', [limit(500)])
  const mapa = new Map<string, PrestadorResumo>()

  for (const cliente of clientes) {
    if (cliente.deletedAt) continue // cliente removido não recebe carteira nova
    const digits = somenteDigitos(cliente.cpfCnpj as string | undefined)
    if (!digits || mapa.has(digits)) continue
    mapa.set(digits, {
      id: cliente.id,
      razaoSocial: String(cliente.razaoSocial ?? cliente.nomeFantasia ?? '—'),
      cpfCnpj: digits,
    })
  }

  return mapa
}

/** `chaveCarteira()` → id do tomador. Base para recusar duplicata na importação. */
export async function fetchCarteiraExistente(): Promise<Map<string, string>> {
  const rows = await listDocuments<TomadorDoc>(COLECAO_TOMADORES, [limit(TETO_TOMADORES_GLOBAL)])
  const mapa = new Map<string, string>()
  for (const t of rows) {
    if (!t.clienteId || !t.cpfCnpj) continue
    mapa.set(chaveCarteira(t.clienteId, somenteDigitos(t.cpfCnpj)), t.id)
  }
  return mapa
}

function montarPayload(valores: TomadorInput, modo: 'create' | 'update'): Record<string, unknown> {
  // Campo opcional apagado precisa virar deleteField() no update: `undefined` é
  // descartado pelo stripUndefined e o valor antigo continuaria no documento,
  // sem erro nenhum na tela.
  const vazio = modo === 'create' ? undefined : deleteField()
  const texto = (v?: string | null) => {
    const t = (v ?? '').trim()
    return t === '' ? vazio : t
  }

  return {
    // Só dígitos: as regras recusam qualquer outro formato e todo conector faz
    // replace(/\D/g,'') antes de enviar à prefeitura.
    cpfCnpj: somenteDigitos(valores.cpfCnpj),
    razaoSocial: valores.razaoSocial.trim(),
    email: texto(valores.email),
    telefone: texto(valores.telefone),
    inscricaoMunicipal: texto(valores.inscricaoMunicipal),
    endereco: valores.endereco ?? vazio,
    ativo: valores.ativo,
  }
}

export async function criarTomador(params: {
  prestador: PrestadorResumo
  valores: TomadorInput
}): Promise<string> {
  return createDocument(COLECAO_TOMADORES, {
    // PRESTADOR: dono da carteira. A nota sai DELE para o tomador — inverter os
    // dois é o bug que este cadastro veio corrigir.
    clienteId: params.prestador.id,
    ...montarPayload(params.valores, 'create'),
  })
}

/**
 * Devolve quantos contratos recorrentes tiveram o nome/documento regravados.
 *
 * A propagação é responsabilidade desta tela: `nfse_recorrentes` guarda
 * `tomadorNome`/`tomadorCpfCnpj` denormalizados para o gerador não precisar de
 * um join por contrato, e sem isso o contrato seguiria faturando com o nome
 * antigo depois que o tomador mudasse de razão social.
 */
export async function atualizarTomador(params: {
  id: string
  valores: TomadorInput
  anterior: Pick<TomadorDoc, 'razaoSocial' | 'cpfCnpj'>
}): Promise<{ contratosSincronizados: number }> {
  const payload = montarPayload(params.valores, 'update')
  await updateDocument(COLECAO_TOMADORES, params.id, payload)

  const razaoSocial = String(payload.razaoSocial)
  const cpfCnpj = String(payload.cpfCnpj)
  const mudou = params.anterior.razaoSocial !== razaoSocial || params.anterior.cpfCnpj !== cpfCnpj
  if (!mudou) return { contratosSincronizados: 0 }

  const contratosSincronizados = await sincronizarContratosDoTomador({
    id: params.id,
    razaoSocial,
    cpfCnpj,
  })
  return { contratosSincronizados }
}

/**
 * Inativar tomador é `ativo: false` + `deletedAt` — NÃO use
 * `softDeleteDocument()` aqui: ele grava `status: 'inativo'`, campo que esta
 * coleção não tem, e deixaria `ativo: true` para o gerador continuar faturando.
 * Reativar limpa o `deletedAt` para o par não ficar contraditório.
 */
export async function definirTomadorAtivo(id: string, ativo: boolean): Promise<void> {
  await updateDocument(
    COLECAO_TOMADORES,
    id,
    ativo ? { ativo: true, deletedAt: deleteField() } : { ativo: false, deletedAt: serverTimestamp() }
  )
}
