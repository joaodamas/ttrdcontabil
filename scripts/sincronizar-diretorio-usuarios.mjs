/**
 * Popula `usuarios_diretorio` (id/nome/ativo/tenant) a partir de `usuarios`.
 *
 * O trigger sincronizarDiretorioUsuario mantém a projeção a partir do deploy,
 * mas só reage a escritas: os usuários que já existiam precisam desta carga
 * inicial, ANTES de publicar as regras novas (com elas, só admin lista
 * `usuarios` e os seletores de responsável passam a ler o diretório).
 *
 *   node scripts/sincronizar-diretorio-usuarios.mjs            # DRY-RUN (padrão)
 *   node scripts/sincronizar-diretorio-usuarios.mjs --aplicar  # grava
 *
 * Idempotente. Também relata perfis sem `ativo` (contam como ativos — regra e
 * front tratam ausente como ativo) e sem tenantId (sem acesso a nada).
 * Credencial e projeto: como scripts/migrar-credenciais-clientes.mjs.
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const APLICAR = process.argv.includes('--aplicar')

// Espelha projecaoDiretorio() em functions/src/usuarios/diretorio.ts.
function projecao(d) {
  return {
    nome: typeof d.nome === 'string' && d.nome.trim() ? d.nome.trim() : null,
    ativo: d.ativo !== false,
    tenantId: typeof d.tenantId === 'string' ? d.tenantId : null,
  }
}

async function main() {
  if (getApps().length === 0) {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    initializeApp({ credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(), projectId: PROJECT_ID })
  }
  const db = getFirestore()
  console.log(`Projeto: ${PROJECT_ID} · ${APLICAR ? 'MODO --aplicar (GRAVA)' : 'dry-run (nada é gravado)'}\n`)

  const [usuarios, diretorio] = await Promise.all([
    db.collection('usuarios').get(),
    db.collection('usuarios_diretorio').get(),
  ])
  const existentes = new Map(diretorio.docs.map((d) => [d.id, d.data()]))
  const batch = db.batch()
  let gravar = 0
  const semAtivo = []
  const semTenant = []

  for (const u of usuarios.docs) {
    const d = u.data()
    if (!('ativo' in d)) semAtivo.push(u.id)
    if (typeof d.tenantId !== 'string' || !d.tenantId) semTenant.push(u.id)
    const p = projecao(d)
    const atual = existentes.get(u.id)
    existentes.delete(u.id)
    if (atual && atual.nome === p.nome && atual.ativo === p.ativo && atual.tenantId === p.tenantId) continue
    gravar += 1
    console.log(`${APLICAR ? 'grava ' : 'gravaria'} usuarios_diretorio/${u.id} (${p.ativo ? 'ativo' : 'inativo'})`)
    batch.set(db.collection('usuarios_diretorio').doc(u.id), { ...p, atualizadoEm: FieldValue.serverTimestamp() })
  }
  for (const id of existentes.keys()) {
    gravar += 1
    console.log(`${APLICAR ? 'apaga ' : 'apagaria'} usuarios_diretorio/${id} (usuário não existe mais)`)
    batch.delete(db.collection('usuarios_diretorio').doc(id))
  }

  if (APLICAR && gravar > 0) await batch.commit()
  console.log(`\nUsuários: ${usuarios.size} · escritas ${APLICAR ? 'feitas' : 'necessárias'}: ${gravar}`)
  if (semAtivo.length) console.log(`Sem campo ativo (tratados como ATIVOS): ${semAtivo.join(', ')}`)
  if (semTenant.length) console.log(`Sem tenantId (sem acesso até corrigir): ${semTenant.join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
