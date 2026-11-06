/**
 * Cifra os certificados A1 (.pfx) que estão EM CLARO no Storage
 * (certificados/<clienteId>.pfx.b64). Desde 2026-11-06 o uploadCertificado
 * grava no envelope cifrado e a leitura (functions/src/nfse/certificado.ts →
 * pfxBase64DoArquivoStorage) aceita os dois formatos — este script pode rodar
 * depois do deploy das functions, sem pressa.
 *
 * Envelope (espelha functions/src/nfse/encrypt.ts → cifrarArquivo):
 *   "JPC1" (4 bytes) + iv (12) + authTag (16) + AES-256-GCM(pfx binário)
 *   metadado do objeto: cifrado = aes-256-gcm-v1
 * Legado aceito na entrada: binário DER (começa com 0x30) ou texto base64.
 *
 *   CREDENTIAL_KEY=$(gcloud secrets versions access latest --secret=CREDENTIAL_KEY --project ttrdcontabil-jpproject) \
 *     node scripts/cifrar-certificados.mjs            # DRY-RUN (padrão): só relata
 *   ... node scripts/cifrar-certificados.mjs --aplicar  # grava
 *
 * Credencial: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) ou Application Default
 * Credentials. Projeto: FIREBASE_PROJECT_ID (padrão ttrdcontabil-jpproject).
 * Bucket: FIREBASE_STORAGE_BUCKET (padrão <projeto>.firebasestorage.app).
 *
 * Garantias:
 * - A CREDENTIAL_KEY tem que ser a MESMA do secret das functions: o script
 *   confere ida e volta antes de gravar; chave ausente/errada aborta sem tocar
 *   em nada. (Com chave errada, a emissão deixaria de abrir o certificado.)
 * - Grava com ifGenerationMatch: um upload novo no meio do caminho não é
 *   sobrescrito (o arquivo é pulado e listado).
 * - Arquivo já cifrado é pulado (idempotente). Nunca imprime conteúdo nem senha.
 * - Nada é apagado: o objeto é reescrito no mesmo caminho. Com versionamento
 *   de objetos ligado no bucket, a versão em claro continua recuperável — e,
 *   por isso mesmo, deve ser apagada depois de conferir (ver docs/RESTAURACAO-BACKUP.md).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${PROJECT_ID}.firebasestorage.app`
const APLICAR = process.argv.includes('--aplicar')
const TENANT = process.env.APP_TENANT_ID ?? 'ttrd'
const MAGICO = Buffer.from('JPC1', 'ascii')
const VERSAO = 'aes-256-gcm-v1'

function chave() {
  const hex = process.env.CREDENTIAL_KEY ?? ''
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    console.error('CREDENTIAL_KEY ausente ou inválida (64 caracteres hex). Nada foi feito.')
    process.exit(1)
  }
  return Buffer.from(hex, 'hex')
}

const cifrado = (b) => b.length > MAGICO.length + 28 && b.subarray(0, 4).equals(MAGICO)

function cifrar(key, conteudo) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([c.update(conteudo), c.final()])
  return Buffer.concat([MAGICO, iv, c.getAuthTag(), enc])
}

function decifrar(key, env) {
  const d = createDecipheriv('aes-256-gcm', key, env.subarray(4, 16))
  d.setAuthTag(env.subarray(16, 32))
  return Buffer.concat([d.update(env.subarray(32)), d.final()])
}

/** Espelha pfxBase64FromStorageBuffer: texto base64 (legado) ou binário DER. */
function pfxBinarioDoLegado(buffer) {
  const normalizado = buffer.toString('utf8').trim().replace(/\s+/g, '')
  if (normalizado.length > 100 && normalizado.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(normalizado)) {
    return Buffer.from(normalizado, 'base64')
  }
  return buffer
}

function initAdmin() {
  if (getApps().length > 0) return
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  initializeApp({ credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(), projectId: PROJECT_ID, storageBucket: BUCKET })
}

async function main() {
  const key = chave()
  const teste = randomBytes(64)
  if (!decifrar(key, cifrar(key, teste)).equals(teste)) throw new Error('Ida e volta da cifra falhou.')

  initAdmin()
  const bucket = getStorage().bucket()
  console.log(`Projeto ${PROJECT_ID} · bucket ${BUCKET} — ${APLICAR ? 'APLICANDO' : 'DRY-RUN (nada é gravado)'}`)

  const [arquivos] = await bucket.getFiles({ prefix: 'certificados/' })
  const contagem = { lidos: 0, jaCifrados: 0, emClaro: 0, cifrados: 0, pulados: 0 }
  for (const arquivo of arquivos) {
    if (!arquivo.name.endsWith('.pfx.b64')) continue
    contagem.lidos++
    const [buffer] = await arquivo.download()
    if (cifrado(buffer)) { contagem.jaCifrados++; continue }
    contagem.emClaro++
    const pfx = pfxBinarioDoLegado(buffer)
    if (pfx[0] !== 0x30) {
      console.log(`  ${arquivo.name}: conteúdo não parece PKCS#12 — pulado (confira à mão)`)
      contagem.pulados++
      continue
    }
    console.log(`  ${arquivo.name}: em claro (${pfx.length} bytes)`)
    if (!APLICAR) continue
    const envelope = cifrar(key, pfx)
    if (!decifrar(key, envelope).equals(pfx)) throw new Error(`Falha ao conferir ${arquivo.name}.`)
    const [meta] = await arquivo.getMetadata()
    try {
      await arquivo.save(envelope, {
        contentType: 'application/octet-stream',
        metadata: { metadata: { ...(meta.metadata ?? {}), cifrado: VERSAO } },
        preconditionOpts: { ifGenerationMatch: meta.generation },
        resumable: false,
      })
      contagem.cifrados++
    } catch (err) {
      console.log(`  ${arquivo.name}: mudou durante a execução (novo upload?) — pulado: ${err?.message ?? err}`)
      contagem.pulados++
    }
  }

  console.log(`\nArquivos: ${contagem.lidos} · já cifrados: ${contagem.jaCifrados} · em claro: ${contagem.emClaro} · ${APLICAR ? 'cifrados' : 'a cifrar'}: ${APLICAR ? contagem.cifrados : contagem.emClaro - contagem.pulados} · pulados: ${contagem.pulados}`)
  if (APLICAR && contagem.cifrados > 0) {
    await getFirestore().collection('logs_auditoria').add({
      tenantId: TENANT,
      usuarioId: 'script',
      usuarioNome: 'scripts/cifrar-certificados.mjs',
      usuarioEmail: null,
      entidade: 'certificados',
      entidadeId: null,
      acao: 'certificados_cifrados_em_lote',
      dadosAntes: null,
      dadosDepois: { arquivos: contagem.cifrados, pulados: contagem.pulados },
      origem: 'script',
      criadoEm: FieldValue.serverTimestamp(),
    })
  }
  if (!APLICAR && contagem.emClaro > 0) console.log('Rode de novo com --aplicar para gravar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
