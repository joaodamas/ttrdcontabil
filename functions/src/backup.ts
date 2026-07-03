/**
 * Scheduled Cloud Function — Firestore weekly export to Cloud Storage.
 *
 * Pre-requisites (run once, outside code):
 *   1. Create the backup bucket:
 *      gcloud storage buckets create gs://ttrdcontabil-jpproject-backups \
 *        --location=SOUTHAMERICA-EAST1 --uniform-bucket-level-access
 *
 *   2. Grant the Firestore service account write access to the bucket:
 *      gcloud storage buckets add-iam-policy-binding \
 *        gs://ttrdcontabil-jpproject-backups \
 *        --member="serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-firestore.iam.gserviceaccount.com" \
 *        --role="roles/storage.objectAdmin"
 *
 *   3. Enable PITR (Point-in-Time Recovery) on the Firestore database:
 *      gcloud firestore databases update --database="(default)" \
 *        --enable-pitr --project=ttrdcontabil-jpproject
 *
 * PITR gives 7-day recovery window (no code needed).
 * This function adds a longer-term weekly snapshot to GCS.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import axios from 'axios'
import { SYSTEM_ACTOR, writeAuditLog } from './audit'
import { DEFAULT_TENANT_ID } from './tenant'
import { sendEmail } from './email/mailer'

const PROJECT_ID  = 'ttrdcontabil-jpproject'
const BACKUP_BUCKET = `gs://${PROJECT_ID}-backups`
const DATABASE    = '(default)'

async function getAccessToken(): Promise<string> {
  // Inside Cloud Functions the metadata server is always available
  const { data } = await axios.get<{ access_token: string }>(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  )
  return data.access_token
}

// ─── Weekly Firestore export ──────────────────────────────────────────────────
// Runs every Sunday at 02:00 (Brasília time, UTC-3 → 05:00 UTC)

export const exportarFirestoreSemanal = onSchedule(
  {
    schedule:  '0 5 * * 0',          // every Sunday at 05:00 UTC = 02:00 BRT
    timeZone:  'America/Sao_Paulo',
    region:    'southamerica-east1',
  },
  async () => {
    const datePart        = new Date().toISOString().slice(0, 10)   // e.g. 2026-04-22
    const outputUriPrefix = `${BACKUP_BUCKET}/firestore/${datePart}`

    try {
      const accessToken = await getAccessToken()

      const res = await axios.post<{ name: string }>(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}:exportDocuments`,
        { outputUriPrefix },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      // exportDocuments returns a long-running operation; log its name for tracing
      console.log(`[backup] Exportação iniciada — operation: ${res.data.name}, destino: ${outputUriPrefix}`)
    } catch (error) {
      const mensagem = (error as Error)?.message ?? 'Erro desconhecido ao exportar Firestore.'
      const contexto = { outputUriPrefix, projectId: PROJECT_ID, database: DATABASE, erro: mensagem }

      console.error('[backup][falha]', JSON.stringify(contexto))

      await writeAuditLog({
        tenantId: DEFAULT_TENANT_ID,
        actor: SYSTEM_ACTOR,
        entidade: 'backup',
        entidadeId: datePart,
        acao: 'falha',
        dadosAntes: null,
        dadosDepois: { ...contexto, severidade: 'alta' },
        origem: 'scheduler',
      })

      try {
        await sendEmail({
          subject: `[TTRD] Falha no backup semanal do Firestore — ${datePart}`,
          html: `<div style="font-family:sans-serif;max-width:800px;margin:0 auto">
  <h2 style="color:#c00">Falha no backup semanal do Firestore</h2>
  <p><strong>Destino:</strong> ${outputUriPrefix}</p>
  <p><strong>Erro:</strong> ${mensagem}</p>
  <p style="font-size:12px;color:#888;margin-top:24px">TTRD Contábil — alerta automático. Não responda este email.</p>
</div>`,
        })
      } catch (emailError) {
        // Falha ao enviar o alerta não deve mascarar o erro original do backup.
        console.error('[backup][falha-email]', String((emailError as Error)?.message ?? emailError))
      }

      // Propaga o erro para que a execução da Cloud Function também apareça
      // como falha nos logs/monitoring nativos do GCP.
      throw error
    }
  }
)
