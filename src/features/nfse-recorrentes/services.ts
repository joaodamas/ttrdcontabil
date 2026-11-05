import { deleteField, limit, Timestamp, where } from 'firebase/firestore'
import { createDocument, listDocuments, updateDocument } from '@/lib/firestore-client'
import type { NfseRecorrenteDoc } from '@/types/firestore'
import type { PrestadorResumo } from '@/features/tomadores/types'
import { somenteDigitos } from '@/features/tomadores/validacao'
import type { NfseRecorrenteInput, NfseRecorrenteRecord } from './types'

export const COLECAO_RECORRENTES = 'nfse_recorrentes'

// Teto de leitura por cliente. Uma carteira de serviço tem dezenas de contratos,
// não milhares — o teto existe para não varrer sem limite, e `truncado` avisa na
// tela em vez de mostrar uma lista incompleta como se fosse completa.
export const TETO_CONTRATOS = 500

export interface ContratosDoCliente {
  contratos: NfseRecorrenteRecord[]
  truncado: boolean
}

/**
 * Só filtros de igualdade, ordenação no cliente.
 *
 * `listDocuments` injeta `tenantId` na query, e (tenantId + clienteId) por
 * igualdade é resolvido sem índice composto. Pedir `orderBy` aqui exigiria o
 * índice composto e derrubaria a tela com `failed-precondition` enquanto ele não
 * subisse — mesmo caminho que getClientes/getCompetencias já seguem.
 */
export async function fetchContratosRecorrentes(clienteId: string): Promise<ContratosDoCliente> {
  const rows = await listDocuments<NfseRecorrenteDoc>(COLECAO_RECORRENTES, [
    where('clienteId', '==', clienteId),
    limit(TETO_CONTRATOS),
  ])

  const contratos = rows.sort((a, b) =>
    String(a.tomadorNome ?? '').localeCompare(String(b.tomadorNome ?? ''), 'pt-BR')
  )

  return { contratos, truncado: rows.length >= TETO_CONTRATOS }
}

/** Contratos de um tomador específico — usado antes de inativá-lo. */
export async function fetchContratosDoTomador(tomadorId: string): Promise<NfseRecorrenteRecord[]> {
  return listDocuments<NfseRecorrenteDoc>(COLECAO_RECORRENTES, [
    where('tomadorId', '==', tomadorId),
    limit(TETO_CONTRATOS),
  ])
}

type TomadorDenormalizado = { id: string; razaoSocial: string; cpfCnpj: string }

/**
 * Campos opcionais em branco viram `deleteField()` no update, nunca `undefined`:
 * o `stripUndefined` de updateDocument descarta a chave, e a alíquota que o
 * contador acabou de apagar continuaria valendo no documento — sem erro nenhum
 * na tela.
 */
function montarPayload(
  valores: NfseRecorrenteInput,
  tomador: TomadorDenormalizado,
  modo: 'create' | 'update',
): Record<string, unknown> {
  const vazio = modo === 'create' ? undefined : deleteField()
  const texto = (v?: string | null) => {
    const t = (v ?? '').trim()
    return t === '' ? vazio : t
  }

  return {
    tomadorId: tomador.id,
    // Denormalizados para o gerador montar o rascunho sem um join por contrato.
    tomadorNome: tomador.razaoSocial,
    tomadorCpfCnpj: somenteDigitos(tomador.cpfCnpj),
    descricao: valores.descricao.trim(),
    valor: valores.valor,
    diaEmissao: valores.diaEmissao,
    itemListaServico: texto(valores.itemListaServico),
    codigoServico: texto(valores.codigoServico),
    aliquota: valores.aliquota == null ? vazio : valores.aliquota,
    issRetido: valores.issRetido,
    dataInicio: Timestamp.fromDate(valores.dataInicio),
    dataFim: valores.dataFim ? Timestamp.fromDate(valores.dataFim) : vazio,
    ativo: valores.ativo,
  }
}

export async function criarContratoRecorrente(params: {
  prestador: PrestadorResumo
  tomador: TomadorDenormalizado
  valores: NfseRecorrenteInput
}): Promise<string> {
  return createDocument(COLECAO_RECORRENTES, {
    // PRESTADOR: quem emite. As regras exigem que o tomador seja da carteira
    // DESTE clienteId (tomadorDaCarteiraDoPrestador), então trocar este campo
    // por qualquer outro id faz o write ser negado — e é bom que seja.
    clienteId: params.prestador.id,
    ...montarPayload(params.valores, params.tomador, 'create'),
  })
}

export async function atualizarContratoRecorrente(params: {
  id: string
  tomador: TomadorDenormalizado
  valores: NfseRecorrenteInput
}): Promise<void> {
  await updateDocument(COLECAO_RECORRENTES, params.id, montarPayload(params.valores, params.tomador, 'update'))
}

/**
 * Encerrar contrato é `ativo: false`, não apagar: o histórico do que foi
 * faturado precisa continuar explicável (e a regra de delete exige admin).
 */
export async function definirContratoAtivo(id: string, ativo: boolean): Promise<void> {
  await updateDocument(COLECAO_RECORRENTES, id, { ativo })
}

/**
 * Regrava os campos denormalizados nos contratos quando o tomador muda de razão
 * social ou documento.
 *
 * Nota já EMITIDA guarda a versão da época e isso é correto — o que não pode é o
 * contrato seguir faturando com o nome antigo. Como a tela de tomadores é a
 * única que edita o cadastro, ela é quem tem de propagar.
 */
export async function sincronizarContratosDoTomador(tomador: TomadorDenormalizado): Promise<number> {
  const contratos = await fetchContratosDoTomador(tomador.id)
  const cpfCnpj = somenteDigitos(tomador.cpfCnpj)

  const desatualizados = contratos.filter(
    (c) => c.tomadorNome !== tomador.razaoSocial || c.tomadorCpfCnpj !== cpfCnpj
  )

  await Promise.all(
    desatualizados.map((c) =>
      updateDocument(COLECAO_RECORRENTES, c.id, {
        tomadorNome: tomador.razaoSocial,
        tomadorCpfCnpj: cpfCnpj,
      })
    )
  )

  return desatualizados.length
}
