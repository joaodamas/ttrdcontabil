/**
 * Revoga os links permanentes do DANFSe gerados antes de 2026-11-06.
 *
 * Até então o servidor gravava o PDF em nfse/{clienteId}/{chave}.pdf com um
 * token de download do Storage (`firebaseStorageDownloadTokens`) e guardava o
 * link em nfse_emitidas.pdfUrl. Esse link ignora storage.rules e vale para
 * sempre na mão de quem o copiou. Agora o PDF é pedido ao callable
 * obterUrlDanfse (URL assinada de 5 min).
 *
 * Este script, para cada nota com pdfUrl de token do Storage:
 *   1. apaga o metadado firebaseStorageDownloadTokens do arquivo (o link para
 *      de funcionar na hora);
 *   2. remove o campo pdfUrl da nota (pdfPath fica).
 * Links de PROVEDOR (prefeitura, fora do Storage) não são tocados.
 *
 *   node scripts/revogar-tokens-danfse.mjs            # DRY-RUN (padrão)
 *   node scripts/revogar-tokens-danfse.mjs --aplicar
 *
 * Rode DEPOIS do deploy do hosting novo (o front antigo abria pdfUrl direto).
 * Credencial: FIREBASE_SERVICE_ACCOUNT_KEY ou ADC. Projeto/bucket:
 * FIREBASE_PROJECT_ID (padrão ttrdcontabil-jpproject) / FIREBASE_STORAGE_BUCKET
 * (padrão <projeto>.firebasestorage.app).
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${PROJECT_ID}.firebasestorage.app`
const APLICAR = process.argv.includes('--aplicar')
const PAGINA = 300

const ehLinkComToken = (url) =>
  typeof url === 'string' && url.includes('firebasestorage.googleapis.com') && /[?&]token=/.test(url)

function caminhoDoLink(url) {
  const m = /\/o\/([^?]+)/.exec(url)
  return m ? decodeURIComponent(m[1]) : null
}

function initAdmin() {
  if (getApps().length > 0) return
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  initializeApp({
    credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: BUCKET,
  })
}

async function main() {
  initAdmin()
  const db = getFirestore()
  const bucket = getStorage().bucket()
  console.log(`Projeto ${PROJECT_ID}, bucket ${BUCKET} — ${APLICAR ? 'APLICANDO' : 'DRY-RUN (nada é gravado)'}`)

  let lidas = 0
  let comToken = 0
  let arquivosSemToken = 0
  let ultimo = null
  for (;;) {
    let q = db.collection('nfse_emitidas').orderBy(FieldPath.documentId()).limit(PAGINA)
    if (ultimo) q = q.startAfter(ultimo)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) {
      lidas++
      const url = d.get('pdfUrl')
      if (!ehLinkComToken(url)) continue
      comToken++
      const caminho = d.get('pdfPath') || caminhoDoLink(url)
      console.log(`  ${d.id}: ${caminho ?? '(caminho não identificado)'}`)
      if (!APLICAR) continue
      if (caminho) {
        const arquivo = bucket.file(caminho)
        const [existe] = await arquivo.exists()
        if (existe) {
          // null apaga a chave do metadado customizado.
          await arquivo.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } })
          arquivosSemToken++
        }
      }
      await d.ref.update({ pdfUrl: FieldValue.delete(), pdfTokenRevogadoEm: FieldValue.serverTimestamp() })
    }
    ultimo = snap.docs.at(-1)
  }
  console.log(`\nNotas lidas: ${lidas} · com link permanente: ${comToken}${APLICAR ? ` · tokens apagados: ${arquivosSemToken}` : ''}`)
  if (!APLICAR && comToken > 0) console.log('Rode de novo com --aplicar para revogar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
