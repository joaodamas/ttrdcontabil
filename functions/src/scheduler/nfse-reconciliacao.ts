/**
 * Rotina a cada 15 min: rascunhos de NFS-e que não terminaram.
 *
 *  - 'processando' com trava vencida (a function morreu no meio do envio);
 *  - 'erro_integracao' sem confirmação (timeout da Sefin, consulta que falhou).
 *
 * Para cada um, consulta a DPS na Sefin (reconciliacao.ts → reconciliarRascunho)
 * e registra a nota se ela existir — antes isto era só um "volta o status" no
 * alerta diário (1x/dia), e o rascunho ficava até 24 h preso ou era reenviado
 * sem saber se a nota já tinha saído.
 */
import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { credentialSecrets } from '../nfse/secrets'
import { CODIGOS_A_CONFIRMAR, COLECAO_RASCUNHOS, reconciliarRascunho } from '../nfse/reconciliacao'
import { textoSeguroParaLog } from '../audit'
import { logErro } from '../log'

const db = () => getFirestore()

const POR_RODADA = 25
const TIMEOUT_S = 300
/** Não começa outro rascunho se sobrar menos que uma consulta completa (+ folga). */
const RESERVA_MS = 60_000

export async function executarReconciliacaoNfse(agoraMs = Date.now()) {
  const inicio = Date.now()
  const [processando, aConfirmar] = await Promise.all([
    db().collection(COLECAO_RASCUNHOS).where('status', '==', 'processando').limit(POR_RODADA).get(),
    db().collection(COLECAO_RASCUNHOS)
      .where('status', '==', 'erro_integracao')
      .where('codigoErroUltimaTentativa', 'in', [...CODIGOS_A_CONFIRMAR])
      .limit(POR_RODADA)
      .get(),
  ])
  const ids = Array.from(new Set([...processando.docs, ...aConfirmar.docs].map((d) => d.id))).slice(0, POR_RODADA)

  const contagem = { emitida: 0, nao_emitida: 0, indefinido: 0, ignorado: 0 }
  for (const id of ids) {
    if (Date.now() - inicio > TIMEOUT_S * 1000 - RESERVA_MS) break
    // A elegibilidade (trava vencida, código a confirmar, limite de tentativas)
    // é conferida dentro da transação de reconciliarRascunho.
    const desfecho = await reconciliarRascunho(id, agoraMs).catch((err) => {
      // Erro do fluxo fiscal pode trazer dado sensível: vai mascarado, não cru.
      logErro('[nfse-reconciliacao][falha-rascunho]', { rascunhoId: id, erro: textoSeguroParaLog(err) })
      return 'indefinido' as const
    })
    contagem[desfecho]++
  }
  if (ids.length > 0) console.log('[nfse-reconciliacao]', { candidatos: ids.length, ...contagem })
  return contagem
}

export const reconciliarNfsePendentes = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: TIMEOUT_S,
    secrets: credentialSecrets,
  },
  async () => {
    await executarReconciliacaoNfse()
  },
)
