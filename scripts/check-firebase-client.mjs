/**
 * Falha o CI se o SDK cliente Firebase for inicializado fora dos módulos permitidos.
 * Uso: node scripts/check-firebase-client.mjs
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

const ALLOWED_FILES = new Set([
  'src/lib/firebase.ts',
  'src/components/admin/usuario-form.tsx', // FirebaseApp secundário para criar usuário
])

const PATTERNS = [
  { name: 'initializeApp (client)', re: /\binitializeApp\s*\(/ },
  { name: 'getFirestore (client)', re: /\bgetFirestore\s*\(/ },
  { name: 'getAuth (client)', re: /\bgetAuth\s*\(/ },
  { name: 'getStorage (client)', re: /\bgetStorage\s*\(/ },
]

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.name === 'node_modules' || e.name === '.next') continue
    if (e.isDirectory()) await walk(p, files)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p)
  }
  return files
}

function norm(p) {
  return relative(ROOT, p).replaceAll('\\', '/')
}

const files = await walk(SRC)
const violations = []

for (const abs of files) {
  const rel = norm(abs)
  if (rel.startsWith('scripts/')) continue
  const text = await readFile(abs, 'utf8')
  if (text.includes("from 'firebase-admin") || text.includes('from "firebase-admin')) continue

  for (const { name, re } of PATTERNS) {
    if (!re.test(text)) continue
    if (ALLOWED_FILES.has(rel)) continue
    // firebase-admin imports em mesmo arquivo já filtrados acima; rotas backup podem usar admin
    if (rel.includes('/_api_backup/')) continue
    if (rel === 'src/lib/firebase-admin.ts') continue
    if (rel === 'src/scripts/seed.ts') continue
    violations.push(`${rel}: possível uso direto de SDK cliente (${name}) — prefira getFirebaseApp / getClientDb / getClientAuth / getClientStorage em @/lib/firebase`)
    break
  }
}

if (violations.length) {
  console.error('check-firebase-client: violações:\n', violations.join('\n'))
  process.exit(1)
}
console.log('check-firebase-client: OK')
