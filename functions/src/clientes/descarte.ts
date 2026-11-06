/**
 * Descarte (LGPD) quando um cliente é EXCLUÍDO de fato (`clientes/{id}`
 * apagado — só admin, ver firestore.rules). Inativar/soft-delete não dispara
 * nada: o cliente continua existindo.
 *
 * Apaga o que só existia para operar o cliente e não tem guarda legal:
 *   - clientes_credenciais/{id}           senhas de portal
 *   - clientes_fiscal (clienteId == id)   configuração fiscal + credenciais cifradas
 *   - Storage certificados/{id}.pfx.b64   o certificado A1 (e certificados/{id}/**)
 *   - tomadores (clienteId == id)         carteira de clientes DO cliente
 * e encerra os contratos recorrentes (nfse_recorrentes.ativo = false) para o
 * cron não tentar faturar em nome de quem saiu.
 *
 * PRESERVA de propósito: nfse_emitidas, nfse_eventos, nfse_erros e os XML/PDF
 * em Storage nfse/{id}/ — documento fiscal emitido tem guarda obrigatória
 * (CTN art. 195, parágrafo único; prazo decadencial de 5 anos). Também ficam
 * lançamentos, competências e logs (obrigação contábil e prova).
 * Ver docs/LGPD-TRATAMENTO.md.
 */
import * as admin from 'firebase-admin'
import { getStorage } from 'firebase-admin/storage'
import { onDocumentDeletedWithAuthContext } from 'firebase-functions/v2/firestore'

import { montarAuditLog, SYSTEM_ACTOR } from '../audit'
import { resolverCaminhoCertificado } from '../nfse/certificado'
import { atorDoEvento } from '../auditoria/regras'
import { DEFAULT_TENANT_ID } from '../tenant'

const db = () => admin.firestore()
const LOTE = 400

async function apagarConsulta(q: FirebaseFirestore.Query): Promise<number> {
  let total = 0
  for (;;) {
    const snap = await q.limit(LOTE).get()
    if (snap.empty) return total
    const batch = db().batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    total += snap.size
    if (snap.size < LOTE) return total
  }
}

async function encerrarRecorrentes(clienteId: string): Promise<number> {
  const snap = await db().collection('nfse_recorrentes').where('clienteId', '==', clienteId).get()
  const ativos = snap.docs.filter((d) => d.get('ativo') !== false)
  for (let i = 0; i < ativos.length; i += LOTE) {
    const batch = db().batch()
    ativos.slice(i, i + LOTE).forEach((d) =>
      batch.update(d.ref, { ativo: false, encerradoPor: 'descarte_cliente', atualizadoEm: admin.firestore.FieldValue.serverTimestamp() }),
    )
    await batch.commit()
  }
  return ativos.length
}

/**
 * Arquivos de certificado do cliente no Storage: o caminho que o
 * uploadCertificado grava (certificados/{id}.pfx.b64, derivado só do id) e,
 * por garantia, uma pasta certificados/{id}/. Id inseguro → nada.
 */
export function caminhosCertificado(clienteId: string): { arquivo: string; prefixo: string } | null {
  try {
    return { arquivo: resolverCaminhoCertificado(clienteId), prefixo: `certificados/${clienteId}/` }
  } catch {
    return null
  }
}

export const descartarDadosClienteExcluido = onDocumentDeletedWithAuthContext(
  { document: 'clientes/{clienteId}', region: 'southamerica-east1', timeoutSeconds: 300 },
  async (event) => {
    const clienteId = event.params.clienteId
    const dados = event.data?.data() ?? {}
    const tenantId = typeof dados.tenantId === 'string' && dados.tenantId ? dados.tenantId : DEFAULT_TENANT_ID

    const resultado: Record<string, unknown> = {}
    const falhas: string[] = []
    const etapa = async (nome: string, fn: () => Promise<unknown>) => {
      try {
        resultado[nome] = await fn()
      } catch (err) {
        falhas.push(nome)
        console.error(`[descarte] ${nome} falhou`, { clienteId, err })
      }
    }

    await etapa('credenciais', async () => {
      const ref = db().collection('clientes_credenciais').doc(clienteId)
      const snap = await ref.get()
      if (snap.exists) await ref.delete()
      return snap.exists ? 1 : 0
    })
    await etapa('clientesFiscal', () => apagarConsulta(db().collection('clientes_fiscal').where('clienteId', '==', clienteId)))
    await etapa('tomadores', () => apagarConsulta(db().collection('tomadores').where('clienteId', '==', clienteId)))
    await etapa('recorrentesEncerrados', () => encerrarRecorrentes(clienteId))
    await etapa('certificados', async () => {
      const caminhos = caminhosCertificado(clienteId)
      if (!caminhos) return 0
      const bucket = getStorage().bucket()
      const [naPasta] = await bucket.getFiles({ prefix: caminhos.prefixo })
      const [existe] = await bucket.file(caminhos.arquivo).exists()
      const arquivos = [...naPasta, ...(existe ? [bucket.file(caminhos.arquivo)] : [])]
      await Promise.all(arquivos.map((f) => f.delete({ ignoreNotFound: true })))
      return arquivos.length
    })

    const quem = atorDoEvento(event.authType, event.authId)
    const ator = quem.tipo === 'usuario'
      ? { id: quem.id, nome: quem.id, email: null }
      : { ...SYSTEM_ACTOR, id: quem.id }

    await db().collection('logs_auditoria').add(
      montarAuditLog({
        tenantId,
        actor: ator,
        entidade: 'clientes',
        entidadeId: clienteId,
        acao: 'descarte_lgpd',
        dadosAntes: null,
        dadosDepois: {
          removidos: resultado,
          falhas,
          preservados: ['nfse_emitidas', 'nfse_eventos', 'nfse_erros', 'storage nfse/', 'lancamentos', 'competencias', 'logs_auditoria'],
        },
        origem: 'trigger',
      }),
    )
    // Falha parcial fica no log e no console; o trigger não tem retry
    // configurado — repetir o descarte é rodar de novo o mesmo passo à mão.
  },
)
