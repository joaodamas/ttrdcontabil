/**
 * Migração única: senhas de portal de `clientes` → `clientes_credenciais/{clienteId}`.
 *
 * Por quê: os campos abaixo ficavam em texto puro no doc do cliente, legível
 * por qualquer usuário ativo (até "leitura"). Agora vivem num doc que as regras
 * só deixam admin e fiscal lerem; em `clientes` fica só
 * `credenciaisPreenchidas` (nomes dos campos com valor, sem valor).
 *
 * Como roda:
 *   node scripts/migrar-credenciais-clientes.mjs            # DRY-RUN (padrão): só relata
 *   node scripts/migrar-credenciais-clientes.mjs --aplicar  # grava
 *
 * Credencial: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) ou Application Default
 * Credentials (`gcloud auth application-default login`). Projeto:
 * FIREBASE_PROJECT_ID (padrão ttrdcontabil-jpproject).
 *
 * Garantias:
 * - Cópia e remoção na MESMA transação por cliente: o texto puro só sai de
 *   `clientes` se a cópia foi gravada.
 * - Idempotente: rodar de novo não faz nada (não sobra campo legado).
 * - Não sobrescreve: se clientes_credenciais já tem valor num campo (gravado
 *   pela tela nova), esse valor vence; o legado daquele campo é só removido.
 * - Nunca imprime valor de senha — só nomes de campo e contagens.
 * - Cliente sem tenantId é pulado e listado (as regras precisam do tenant).
 *
 * Lista de campos: espelha functions/src/clientes/credenciais-campos.ts.
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const APLICAR = process.argv.includes('--aplicar')
const PAGINA = 300

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

const temValor = (v) => (typeof v === 'string' ? v.trim() !== '' : v != null)

function initAdmin() {
  if (getApps().length > 0) return
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  initializeApp({
    credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(),
    projectId: PROJECT_ID,
  })
}

async function* todosOsClientes(db) {
  let ultimo = null
  for (;;) {
    let q = db.collection('clientes').orderBy(FieldPath.documentId()).limit(PAGINA)
    if (ultimo) q = q.startAfter(ultimo)
    const snap = await q.get()
    if (snap.empty) return
    for (const d of snap.docs) yield d
    ultimo = snap.docs.at(-1)
  }
}

async function migrarCliente(db, clienteSnap) {
  const clienteRef = clienteSnap.ref
  const credRef = db.collection('clientes_credenciais').doc(clienteSnap.id)

  return db.runTransaction(async (tx) => {
    // Relê dentro da transação: a tela pode ter salvo entre a listagem e aqui.
    const [cliente, cred] = await Promise.all([tx.get(clienteRef), tx.get(credRef)])
    if (!cliente.exists) return { situacao: 'sumiu' }
    const dados = cliente.data() ?? {}
    const legados = CAMPOS.filter((k) => k in dados)
    if (legados.length === 0) return { situacao: 'nada' }
    if (typeof dados.tenantId !== 'string' || !dados.tenantId) return { situacao: 'sem_tenant', legados }

    const atual = cred.exists ? cred.data() ?? {} : {}
    if (cred.exists && atual.tenantId !== dados.tenantId) return { situacao: 'tenant_divergente', legados }

    const copiar = {}
    const jaNoDocNovo = []
    for (const k of legados) {
      if (!temValor(dados[k])) continue
      if (temValor(atual[k])) jaNoDocNovo.push(k)
      else copiar[k] = String(dados[k])
    }
    const final = { ...atual, ...copiar }
    const preenchidas = CAMPOS.filter((k) => temValor(final[k]))

    if (APLICAR) {
      tx.set(
        credRef,
        {
          ...copiar,
          tenantId: dados.tenantId,
          clienteId: clienteSnap.id,
          atualizadoEm: FieldValue.serverTimestamp(),
          ...(cred.exists ? {} : { criadoEm: FieldValue.serverTimestamp() }),
          ...(cred.exists ? {} : { criadoPorId: 'migracao', criadoPorNome: 'Migração de credenciais' }),
        },
        { merge: true },
      )
      tx.update(clienteRef, {
        ...Object.fromEntries(legados.map((k) => [k, FieldValue.delete()])),
        credenciaisPreenchidas: preenchidas,
      })
    }
    return { situacao: 'migrar', legados, copiados: Object.keys(copiar), jaNoDocNovo }
  })
}

async function main() {
  initAdmin()
  const db = getFirestore()
  console.log(`Projeto: ${PROJECT_ID}`)
  console.log(APLICAR ? 'MODO: --aplicar (GRAVA)\n' : 'MODO: dry-run (nada é gravado; use --aplicar para gravar)\n')

  const resumo = { lidos: 0, migrar: 0, nada: 0, sem_tenant: [], tenant_divergente: [], camposCopiados: 0, camposMantidosDoNovo: 0 }
  const porCampo = Object.fromEntries(CAMPOS.map((k) => [k, 0]))

  for await (const snap of todosOsClientes(db)) {
    resumo.lidos += 1
    const r = await migrarCliente(db, snap)
    if (r.situacao === 'nada' || r.situacao === 'sumiu') {
      resumo.nada += 1
      continue
    }
    if (r.situacao === 'sem_tenant' || r.situacao === 'tenant_divergente') {
      resumo[r.situacao].push(snap.id)
      continue
    }
    resumo.migrar += 1
    resumo.camposCopiados += r.copiados.length
    resumo.camposMantidosDoNovo += r.jaNoDocNovo.length
    for (const k of r.copiados) porCampo[k] += 1
    console.log(`${APLICAR ? 'migrado ' : 'migraria'} ${snap.id}: copia [${r.copiados.join(', ')}]`
      + (r.jaNoDocNovo.length ? ` · já no doc novo [${r.jaNoDocNovo.join(', ')}]` : '')
      + ` · remove de clientes [${r.legados.join(', ')}]`)
  }

  console.log('\n── Resumo ──')
  console.log(`Clientes lidos: ${resumo.lidos}`)
  console.log(`Com senha em texto puro: ${resumo.migrar}${APLICAR ? ' (migrados)' : ' (seriam migrados)'}`)
  console.log(`Sem nada a migrar: ${resumo.nada}`)
  console.log(`Campos copiados: ${resumo.camposCopiados} · mantidos do doc novo: ${resumo.camposMantidosDoNovo}`)
  for (const [k, n] of Object.entries(porCampo)) if (n) console.log(`  ${k}: ${n}`)
  if (resumo.sem_tenant.length) console.log(`PULADOS sem tenantId (corrigir e rodar de novo): ${resumo.sem_tenant.join(', ')}`)
  if (resumo.tenant_divergente.length) console.log(`PULADOS com tenant divergente no doc de credenciais: ${resumo.tenant_divergente.join(', ')}`)
  if (!APLICAR) console.log('\nNada foi gravado. Revise e rode com --aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
