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

    const accessToken = await getAccessToken()

    const res = await axios.post<{ name: string }>(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}:exportDocuments`,
      { outputUriPrefix },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    // exportDocuments returns a long-running operation; log its name for tracing
    console.log(`[backup] Exportação iniciada — operation: ${res.data.name}, destino: ${outputUriPrefix}`)
  }
)

// ─── Daily operation poll (optional) ─────────────────────────────────────────
// Not strictly necessary — the export runs async and we only need to know
// it started.  If you want failure alerts, add a separate poller here.
