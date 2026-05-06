import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { execFileSync } from 'node:child_process'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const TENANT_ID = process.env.TENANT_ID ?? process.env.NEXT_PUBLIC_APP_TENANT_ID ?? 'ttrd'
const WRITE = process.argv.includes('--write')

const COLLECTIONS = [
  'usuarios',
  'clientes',
  'servicos',
  'clientes_servicos',
  'competencias',
  'tarefas',
  'tarefas_comentarios',
  'lancamentos',
  'cobrancas',
  'fechamentos',
  'fechamento_revisoes',
  'clientes_fiscal',
  'clientes_fiscal_integracao',
  'fiscal_conectores',
  'nfse_rascunhos',
  'nfse_emitidas',
  'nfse_eventos',
  'nfse_erros',
  'nfse_fila_processamento',
  'dashboard_kpis',
  'ir_declaracoes',
  'ir_checklist',
  'documentos',
  'events',
  'logs_auditoria',
  'configuracoes',
]

function initAdmin() {
  if (getApps().length > 0) return

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (rawKey) {
    initializeApp({
      credential: cert(JSON.parse(rawKey)),
      projectId: PROJECT_ID,
    })
    return
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })
}

function needsTenant(data) {
  return typeof data.tenantId !== 'string' || data.tenantId.trim().length === 0
}

async function commitInChunks(db, refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch()
    for (const ref of refs.slice(i, i + 400)) {
      batch.update(ref, {
        tenantId: TENANT_ID,
        tenantBackfillEm: FieldValue.serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

async function main() {
  try {
    initAdmin()
    await runWithAdminSdk()
  } catch (err) {
    const message = err?.message ?? ''
    if (!message.includes('default credentials') && !message.includes('Could not load')) {
      throw err
    }
    console.warn('Admin SDK sem credencial local. Tentando fallback via gcloud + Firestore REST...')
    await runWithRest()
  }
}

async function runWithAdminSdk() {
  const db = getFirestore()

  let totalMissing = 0
  let totalDocs = 0

  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get()
    const missing = snap.docs.filter((item) => needsTenant(item.data()))
    totalDocs += snap.size
    totalMissing += missing.length
    console.log(`${name}: ${missing.length}/${snap.size} sem tenantId valido`)

    if (WRITE && missing.length > 0) {
      await commitInChunks(db, missing.map((item) => item.ref))
    }
  }

  console.log(WRITE
    ? `Backfill concluido. ${totalMissing}/${totalDocs} documento(s) ajustados para tenantId=${TENANT_ID}.`
    : `Dry-run concluido. ${totalMissing}/${totalDocs} documento(s) seriam ajustados. Use --write para gravar.`)
}

function getAccessToken() {
  if (process.platform === 'win32') {
    return execFileSync(
      'powershell',
      ['-NoProfile', '-Command', 'gcloud auth print-access-token'],
      { encoding: 'utf8' }
    ).trim()
  }
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
}

function decodeField(fields, key) {
  const value = fields?.[key]
  if (!value) return undefined
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return value.integerValue
  if ('booleanValue' in value) return value.booleanValue
  if ('timestampValue' in value) return value.timestampValue
  return undefined
}

function restNeedsTenant(document) {
  return typeof decodeField(document.fields, 'tenantId') !== 'string'
    || decodeField(document.fields, 'tenantId').trim().length === 0
}

async function restFetch(token, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Firestore REST ${res.status}: ${body}`)
  }
  return res.json()
}

async function listCollectionRest(token, collectionName) {
  const docs = []
  let pageToken = ''
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`)
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const data = await restFetch(token, url)
    docs.push(...(data.documents ?? []))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

async function batchUpdateTenantRest(token, documents) {
  for (let i = 0; i < documents.length; i += 400) {
    const writes = documents.slice(i, i + 400).map((document) => ({
      update: {
        name: document.name,
        fields: {
          tenantId: { stringValue: TENANT_ID },
          tenantBackfillEm: { timestampValue: new Date().toISOString() },
        },
      },
      updateMask: {
        fieldPaths: ['tenantId', 'tenantBackfillEm'],
      },
    }))
    await restFetch(
      token,
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:batchWrite`,
      { method: 'POST', body: JSON.stringify({ writes }) }
    )
  }
}

async function runWithRest() {
  const token = getAccessToken()
  let totalMissing = 0
  let totalDocs = 0

  for (const name of COLLECTIONS) {
    const docs = await listCollectionRest(token, name)
    const missing = docs.filter(restNeedsTenant)
    totalDocs += docs.length
    totalMissing += missing.length
    console.log(`${name}: ${missing.length}/${docs.length} sem tenantId valido`)

    if (WRITE && missing.length > 0) {
      await batchUpdateTenantRest(token, missing)
    }
  }

  console.log(WRITE
    ? `Backfill concluido. ${totalMissing}/${totalDocs} documento(s) ajustados para tenantId=${TENANT_ID}.`
    : `Dry-run concluido. ${totalMissing}/${totalDocs} documento(s) seriam ajustados. Use --write para gravar.`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
