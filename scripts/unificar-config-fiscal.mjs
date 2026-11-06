/**
 * Uma configuração fiscal por cliente: migra `clientes_fiscal` para id = clienteId.
 *
 * Por quê: os docs antigos têm auto-id e um cliente pode ter mais de um. As
 * functions liam com where(clienteId).limit(1) — qualquer um deles — e
 * algumas telas ainda leem assim. Desde 2026-11-06 o formulário cria com
 * id = clienteId, as regras recusam outro id e as functions leem o doc de
 * id = clienteId primeiro (fallback: o antigo mais recente). Este script
 * deixa todo cliente com UM doc, de id = clienteId.
 *
 *   node scripts/unificar-config-fiscal.mjs            # DRY-RUN (padrão): só relata
 *   node scripts/unificar-config-fiscal.mjs --aplicar  # grava
 *
 * Credencial: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) ou Application Default
 * Credentials (`gcloud auth application-default login`). Projeto:
 * FIREBASE_PROJECT_ID (padrão ttrdcontabil-jpproject).
 *
 * Regra de unificação (por cliente com doc fora do padrão):
 * - base = o doc MAIS RECENTE (atualizadoEm, depois criadoEm, depois id —
 *   a mesma escolha de functions/src/nfse/config-fiscal.ts); se já existe o
 *   doc de id = clienteId, ele é a base;
 * - `credenciais` (caminho do A1, senha cifrada, titular, validade) vêm do doc
 *   que tem certificado e foi atualizado por último (o uploadCertificado
 *   atualiza o doc ao gravar). O arquivo do A1 no Storage já é por clienteId,
 *   então não muda. Se dois docs têm certificados diferentes, o script AVISA:
 *   confira e, na dúvida, reenvie o A1 depois;
 * - campos de numeração (proximoNumeroDps/numeracaoDpsAjuste) vêm do doc com
 *   o maior proximoNumeroDps.
 * - Com --aplicar, por cliente e numa transação: grava clientes_fiscal/{clienteId}
 *   e só então apaga os docs antigos. Antes, salva uma cópia de TODOS os docs
 *   envolvidos em ./unificar-config-fiscal-backup-<data>.json (contém senha do
 *   A1 CIFRADA — guarde fora do repositório e apague depois de conferir).
 * - Sem --aplicar nada é gravado nem apagado.
 * - Doc sem clienteId ou sem tenantId é só listado (precisa de olho humano).
 */
import { writeFileSync } from 'node:fs'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const APLICAR = process.argv.includes('--aplicar')
const PAGINA = 300
const TENANT = process.env.APP_TENANT_ID ?? 'ttrd'

function initAdmin() {
  if (getApps().length > 0) return
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  initializeApp({ credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(), projectId: PROJECT_ID })
}

const millis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'string' ? Date.parse(v) || 0 : 0)
const maisRecente = (a, b) =>
  (millis(b.data.atualizadoEm) - millis(a.data.atualizadoEm))
  || (millis(b.data.criadoEm) - millis(a.data.criadoEm))
  || a.id.localeCompare(b.id)

async function* todos(db) {
  let ultimo = null
  for (;;) {
    let q = db.collection('clientes_fiscal').orderBy(FieldPath.documentId()).limit(PAGINA)
    if (ultimo) q = q.startAfter(ultimo)
    const snap = await q.get()
    if (snap.empty) return
    for (const d of snap.docs) yield d
    ultimo = snap.docs.at(-1)
  }
}

/** Doc unificado a partir dos docs do mesmo cliente. */
export function unificar(clienteId, docs) {
  const ordenados = [...docs].sort(maisRecente)
  const base = docs.find((d) => d.id === clienteId) ?? ordenados[0]
  const comCert = ordenados.filter((d) => d.data.credenciais?.certificadoStoragePath)
  const credDe = comCert[0] ?? base
  const avisos = []
  const titulares = new Set(comCert.map((d) => `${d.data.credenciais?.certTitular ?? '?'}|${d.data.credenciais?.certVencimento ?? '?'}`))
  if (titulares.size > 1) avisos.push(`certificados diferentes em ${comCert.map((d) => d.id).join(', ')} — usado o de ${credDe.id}; confira e, na dúvida, reenvie o A1`)
  const comPiso = docs.filter((d) => typeof d.data.proximoNumeroDps === 'number').sort((a, b) => b.data.proximoNumeroDps - a.data.proximoNumeroDps)[0]
  const dados = { ...base.data, clienteId }
  if (credDe.data.credenciais) dados.credenciais = credDe.data.credenciais
  if (comPiso) {
    dados.proximoNumeroDps = comPiso.data.proximoNumeroDps
    dados.numeracaoDpsAjuste = comPiso.data.numeracaoDpsAjuste ?? null
  }
  return { dados, base: base.id, credenciaisDe: credDe.id, apagar: docs.filter((d) => d.id !== clienteId).map((d) => d.id), avisos }
}

async function main() {
  initAdmin()
  const db = getFirestore()
  console.log(`Projeto ${PROJECT_ID} — ${APLICAR ? 'APLICANDO' : 'DRY-RUN (nada é gravado nem apagado)'}`)

  const porCliente = new Map()
  const semCliente = []
  let lidos = 0
  for await (const snap of todos(db)) {
    lidos++
    const data = snap.data() ?? {}
    if (typeof data.clienteId !== 'string' || !data.clienteId || !data.tenantId) {
      semCliente.push(snap.id)
      continue
    }
    porCliente.set(data.clienteId, [...(porCliente.get(data.clienteId) ?? []), { id: snap.id, data }])
  }

  const planos = []
  for (const [clienteId, docs] of porCliente) {
    if (docs.length === 1 && docs[0].id === clienteId) continue
    const tenants = new Set(docs.map((d) => d.data.tenantId))
    if (tenants.size > 1) {
      console.log(`  ${clienteId}: docs de tenants diferentes (${[...tenants].join(', ')}) — pulado, confira à mão`)
      continue
    }
    planos.push({ clienteId, docs, ...unificar(clienteId, docs) })
  }

  for (const p of planos) {
    console.log(`  ${p.clienteId}: ${p.docs.length} doc(s) [${p.docs.map((d) => d.id).join(', ')}] → clientes_fiscal/${p.clienteId} (base ${p.base}, credenciais de ${p.credenciaisDe}); apagar: ${p.apagar.join(', ') || '—'}`)
    for (const a of p.avisos) console.log(`    AVISO: ${a}`)
  }
  if (semCliente.length) console.log(`\nDocs sem clienteId/tenantId (não migrados): ${semCliente.join(', ')}`)
  console.log(`\nDocs lidos: ${lidos} · clientes a unificar: ${planos.length} · com mais de um doc: ${planos.filter((p) => p.docs.length > 1).length}`)

  if (!APLICAR) {
    if (planos.length) console.log('Rode de novo com --aplicar para gravar.')
    return
  }
  if (planos.length === 0) return

  const arquivo = `unificar-config-fiscal-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const serializar = (v) => (v instanceof Timestamp ? { _timestamp: v.toDate().toISOString() } : v)
  writeFileSync(arquivo, JSON.stringify(planos.map((p) => ({ clienteId: p.clienteId, docs: p.docs })), (_k, v) => serializar(v), 2), { mode: 0o600 })
  console.log(`Cópia dos docs originais: ${arquivo} (contém a senha do A1 cifrada — guarde fora do repositório)`)

  let feitos = 0
  for (const p of planos) {
    await db.runTransaction(async (tx) => {
      const refs = p.docs.map((d) => db.collection('clientes_fiscal').doc(d.id))
      const atuais = await Promise.all(refs.map((r) => tx.get(r)))
      // Mudou desde a leitura (alguém salvou a config): não unifica às cegas.
      atuais.forEach((s, i) => {
        if (!s.exists || millis(s.data()?.atualizadoEm) !== millis(p.docs[i].data.atualizadoEm)) {
          throw new Error(`${p.clienteId}: clientes_fiscal/${p.docs[i].id} mudou durante a execução — rode de novo.`)
        }
      })
      tx.set(db.collection('clientes_fiscal').doc(p.clienteId), { ...p.dados, unificadoEm: FieldValue.serverTimestamp() })
      for (const id of p.apagar) tx.delete(db.collection('clientes_fiscal').doc(id))
    })
    feitos++
  }
  await db.collection('logs_auditoria').add({
    tenantId: TENANT,
    usuarioId: 'script',
    usuarioNome: 'scripts/unificar-config-fiscal.mjs',
    usuarioEmail: null,
    entidade: 'clientes_fiscal',
    entidadeId: null,
    acao: 'config_fiscal_unificada_em_lote',
    dadosAntes: null,
    dadosDepois: { clientes: feitos, docsApagados: planos.reduce((n, p) => n + p.apagar.length, 0) },
    origem: 'script',
    criadoEm: FieldValue.serverTimestamp(),
    // TTL: mesma retenção de logs_auditoria em functions/src/retencao.ts (6 anos).
    expiraEm: Timestamp.fromMillis(Date.now() + (6 * 365 + 2) * 86_400_000),
  })
  console.log(`Unificados: ${feitos}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
