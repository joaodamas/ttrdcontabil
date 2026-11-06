/**
 * Cifra as senhas de portal que estiverem em TEXTO PURO em
 * clientes_credenciais/{clienteId} (AES-256-GCM, mesma chave e formato do
 * helper das functions: functions/src/nfse/encrypt.ts → "iv:authTag:cifra" em hex).
 *
 * Desde 2026-11-06 os callables salvarCredenciaisCliente/lerCredenciaisCliente
 * gravam e leem cifrado; o leitor ainda aceita texto puro (legado), então este
 * script pode rodar depois do deploy, sem pressa. Em 2026-11-06 havia 0 docs
 * com senha — fica pronto para quando houver.
 *
 * Ordem: rode antes scripts/migrar-credenciais-clientes.mjs (tira a senha de
 * `clientes` e põe em clientes_credenciais, ainda em texto puro); depois este.
 *
 *   CREDENTIAL_KEY=$(gcloud secrets versions access latest --secret=CREDENTIAL_KEY --project ttrdcontabil-jpproject) \
 *     node scripts/cifrar-credenciais-clientes.mjs            # DRY-RUN (padrão): só relata
 *   ... node scripts/cifrar-credenciais-clientes.mjs --aplicar  # grava
 *
 * Credencial do Firestore: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) ou Application
 * Default Credentials. Projeto: FIREBASE_PROJECT_ID (padrão ttrdcontabil-jpproject).
 *
 * Garantias:
 * - Confere ida e volta (cifra → decifra) com a chave ANTES de gravar; chave
 *   errada/ausente aborta sem tocar em nada.
 * - Transação por doc: relê e só cifra o que ainda está em texto puro
 *   (idempotente — rodar de novo não faz nada).
 * - Nunca imprime valor de senha — só ids, nomes de campo e contagens.
 * - Grava um log de auditoria-resumo (origem 'script') quando aplica.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const APLICAR = process.argv.includes('--aplicar')
const PAGINA = 300
const TENANT = process.env.APP_TENANT_ID ?? 'ttrd'

// Espelha functions/src/clientes/credenciais-campos.ts
const CAMPOS = [
  'loginPrefeitura',
  'senhaWebPrefeitura',
  'senhaPinCertificadoDigitalECnpj',
  'loginPostoFiscal',
  'senhaPostoFiscal',
  'responsavelSenhaMeuGov',
  'responsavelSenhaEcacPf',
  'responsavelSenhaWebPrefeitura',
  'responsavelSenhaPinCertificadoDigitalCpf',
]

function chave() {
  const hex = process.env.CREDENTIAL_KEY ?? ''
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    console.error('CREDENTIAL_KEY ausente ou inválida (64 caracteres hex). Nada foi feito.')
    process.exit(1)
  }
  return Buffer.from(hex, 'hex')
}

function cifrar(key, texto) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':')
}

function decifrar(key, valor) {
  const [iv, tag, enc] = valor.split(':')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  d.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([d.update(Buffer.from(enc, 'hex')), d.final()]).toString('utf8')
}

// Espelha pareceCifrado() de functions/src/clientes/credenciais-regras.ts
function pareceCifrado(v) {
  const p = v.split(':')
  return p.length === 3 && p.every((x) => /^[0-9a-f]+$/i.test(x)) && p[0].length === 24
}

const emTextoPuro = (dados) =>
  CAMPOS.filter((k) => typeof dados[k] === 'string' && dados[k].trim() !== '' && !pareceCifrado(dados[k]))

function initAdmin() {
  if (getApps().length > 0) return
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  initializeApp({ credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(), projectId: PROJECT_ID })
}

async function* todos(db) {
  let ultimo = null
  for (;;) {
    let q = db.collection('clientes_credenciais').orderBy(FieldPath.documentId()).limit(PAGINA)
    if (ultimo) q = q.startAfter(ultimo)
    const snap = await q.get()
    if (snap.empty) return
    for (const d of snap.docs) yield d
    ultimo = snap.docs.at(-1)
  }
}

async function main() {
  const key = chave()
  const teste = 'verificacao-' + randomBytes(4).toString('hex')
  if (decifrar(key, cifrar(key, teste)) !== teste) throw new Error('Ida e volta da cifra falhou.')

  initAdmin()
  const db = getFirestore()
  console.log(`Projeto ${PROJECT_ID} — ${APLICAR ? 'APLICANDO' : 'DRY-RUN (nada é gravado)'}`)

  let docs = 0
  let comTextoPuro = 0
  let camposCifrados = 0
  for await (const snap of todos(db)) {
    docs++
    const campos = emTextoPuro(snap.data() ?? {})
    if (campos.length === 0) continue
    comTextoPuro++
    console.log(`  ${snap.id}: ${campos.join(', ')}`)
    if (!APLICAR) {
      camposCifrados += campos.length
      continue
    }
    camposCifrados += await db.runTransaction(async (tx) => {
      const atual = await tx.get(snap.ref)
      if (!atual.exists) return 0
      const pendentes = emTextoPuro(atual.data() ?? {})
      if (pendentes.length === 0) return 0
      const escrita = Object.fromEntries(pendentes.map((k) => [k, cifrar(key, atual.get(k))]))
      // Confere cada valor antes de gravar.
      for (const k of pendentes) if (decifrar(key, escrita[k]) !== atual.get(k)) throw new Error(`Falha ao conferir ${snap.id}.${k}`)
      tx.update(snap.ref, { ...escrita, cifradoEm: FieldValue.serverTimestamp() })
      return pendentes.length
    })
  }

  console.log(`\nDocs lidos: ${docs} · com texto puro: ${comTextoPuro} · campos ${APLICAR ? 'cifrados' : 'a cifrar'}: ${camposCifrados}`)
  if (APLICAR && comTextoPuro > 0) {
    await db.collection('logs_auditoria').add({
      tenantId: TENANT,
      usuarioId: 'script',
      usuarioNome: 'scripts/cifrar-credenciais-clientes.mjs',
      usuarioEmail: null,
      entidade: 'clientes_credenciais',
      entidadeId: null,
      acao: 'credenciais_cifradas_em_lote',
      dadosAntes: null,
      dadosDepois: { docs: comTextoPuro, campos: camposCifrados },
      origem: 'script',
      criadoEm: FieldValue.serverTimestamp(),
    })
  }
  if (!APLICAR && comTextoPuro > 0) console.log('Rode de novo com --aplicar para gravar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
