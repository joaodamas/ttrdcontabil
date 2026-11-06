/**
 * Recalcula o contador da numeração da DPS (`dps_sequencias`) a partir do que
 * já foi usado — para depois de RESTAURAR um backup do Firestore (o export
 * semanal inclui dps_sequencias, mas notas emitidas depois do backup podem ter
 * usado números além do contador restaurado; reusar um deles = E0014, ou pior,
 * a consulta prévia registrando a nota errada). Ver docs/RESTAURACAO-BACKUP.md.
 *
 *   node scripts/recalcular-contador-dps.mjs            # DRY-RUN (padrão): só relata
 *   node scripts/recalcular-contador-dps.mjs --aplicar  # grava
 *
 * Credencial: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) ou Application Default
 * Credentials. Projeto: FIREBASE_PROJECT_ID (padrão ttrdcontabil-jpproject).
 *
 * Fontes, por prestador (CNPJ/CPF) + ambiente (tpAmb 1/2) + série:
 * - nfse_emitidas do Ambiente Nacional: idDps (DPS + IBGE 7 + tipo 1 +
 *   inscrição 14 + série 5 + nº 15) quando existe; senão numeroRps/serieRps +
 *   ambienteEmissao + CNPJ do cliente;
 * - nfse_rascunhos com número reservado (dados.provedorRps 'nacional',
 *   dados.tpAmbRps, dados.serieRps, dados.numeroRps), em qualquer status —
 *   o número reservado pode já ter saído;
 * - clientes_fiscal.proximoNumeroDps (piso informado por admin/fiscal) − 1,
 *   para a série/ambiente de numeracaoDpsAjuste.
 * O contador fica com o MAIOR número encontrado. Só sobe: se o atual já é
 * maior ou igual, não mexe (nunca desce).
 *
 * Limite: números usados FORA da plataforma (Emissor Nacional web/app) não
 * aparecem aqui — para esses vale o "próximo número da DPS" da configuração
 * fiscal, e a emissão pula sozinha os que colidirem (E0014).
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'ttrdcontabil-jpproject'
const APLICAR = process.argv.includes('--aplicar')
const PAGINA = 500
const TENANT = process.env.APP_TENANT_ID ?? 'ttrd'

function initAdmin() {
  if (getApps().length > 0) return
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  initializeApp({ credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(), projectId: PROJECT_ID })
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')
/** Espelha normalizarSerieDps (sem zeros à esquerda). */
const serieNormal = (s) => {
  const t = String(s ?? '').trim() || '1'
  const z = t.replace(/^0+(?=\d)/, '')
  return /^([0-9]{1,4}|[0-8][0-9]{4})$/.test(z) ? z : null
}
const numeroValido = (n) => /^[1-9][0-9]{0,14}$/.test(String(n ?? ''))

/** idDps "DPS" + 42 dígitos → { cnpj, serie, numero }. */
export function lerIdDps(idDps) {
  const m = String(idDps ?? '').match(/^(?:DPS)?(\d{7})([12])(\d{14})(\d{5})(\d{15})$/)
  if (!m) return null
  const inscricao = m[2] === '2' ? m[3] : m[3].slice(3) // CPF vem com 3 zeros à esquerda
  return { cnpj: inscricao, serie: serieNormal(m[4]), numero: Number(m[5]) }
}

async function* todos(db, colecao) {
  let ultimo = null
  for (;;) {
    let q = db.collection(colecao).orderBy(FieldPath.documentId()).limit(PAGINA)
    if (ultimo) q = q.startAfter(ultimo)
    const snap = await q.get()
    if (snap.empty) return
    for (const d of snap.docs) yield d
    ultimo = snap.docs.at(-1)
  }
}

async function main() {
  initAdmin()
  const db = getFirestore()
  console.log(`Projeto ${PROJECT_ID} — ${APLICAR ? 'APLICANDO' : 'DRY-RUN (nada é gravado)'}`)

  const cnpjCliente = new Map()
  for await (const c of todos(db, 'clientes')) cnpjCliente.set(c.id, { cnpj: soDigitos(c.get('cpfCnpj')), tenantId: c.get('tenantId') ?? null })

  /** chave `${cnpj}_${tpAmb}_${serie}` → { maior, origem, tenantId } */
  const usados = new Map()
  const registrar = (cnpj, tpAmb, serie, numero, origem, tenantId) => {
    if (!cnpj || (cnpj.length !== 14 && cnpj.length !== 11) || !serie || !Number.isSafeInteger(numero) || numero < 1) return
    const id = `${cnpj}_${tpAmb}_${serie}`
    const atual = usados.get(id)
    if (!atual || numero > atual.maior) usados.set(id, { cnpj, tpAmb, serie, maior: numero, origem, tenantId: tenantId ?? atual?.tenantId ?? null })
  }

  let notas = 0
  for await (const n of todos(db, 'nfse_emitidas')) {
    const d = n.data()
    if (d.provedorNfse && d.provedorNfse !== 'nacional') continue
    const tpAmb = d.ambienteEmissao === 'producao' ? '1' : d.ambienteEmissao === 'homologacao' ? '2' : null
    if (!tpAmb) continue
    const pelaChave = lerIdDps(d.idDps)
    if (pelaChave) {
      registrar(pelaChave.cnpj, tpAmb, pelaChave.serie, pelaChave.numero, `nfse_emitidas/${n.id}`, d.tenantId)
    } else if (numeroValido(d.numeroRps)) {
      registrar(cnpjCliente.get(d.clienteId)?.cnpj, tpAmb, serieNormal(d.serieRps), Number(d.numeroRps), `nfse_emitidas/${n.id}`, d.tenantId)
    }
    notas++
  }

  let rascunhos = 0
  for await (const r of todos(db, 'nfse_rascunhos')) {
    const dados = r.get('dados') ?? {}
    if (dados.provedorRps !== 'nacional' || !numeroValido(dados.numeroRps)) continue
    if (dados.tpAmbRps !== '1' && dados.tpAmbRps !== '2') continue
    registrar(cnpjCliente.get(r.get('clienteId'))?.cnpj, dados.tpAmbRps, serieNormal(dados.serieRps), Number(dados.numeroRps), `nfse_rascunhos/${r.id}`, r.get('tenantId'))
    rascunhos++
  }

  for await (const f of todos(db, 'clientes_fiscal')) {
    const piso = f.get('proximoNumeroDps')
    const ajuste = f.get('numeracaoDpsAjuste')
    if (typeof piso !== 'number' || piso < 2 || !ajuste) continue
    registrar(cnpjCliente.get(f.get('clienteId'))?.cnpj, ajuste.tpAmb, serieNormal(ajuste.serie), piso - 1, `clientes_fiscal/${f.id} (próximo nº informado)`, f.get('tenantId'))
  }

  let subir = 0
  for (const [id, u] of [...usados].sort()) {
    const ref = db.collection('dps_sequencias').doc(id)
    const atual = (await ref.get()).get('ultimoNumero')
    const ultimo = typeof atual === 'number' ? atual : 0
    if (ultimo >= u.maior) {
      console.log(`  ${id}: contador ${ultimo} ≥ maior usado ${u.maior} — ok`)
      continue
    }
    subir++
    console.log(`  ${id}: contador ${atual ?? '(ausente)'} → ${u.maior} (maior usado em ${u.origem})`)
    if (!APLICAR) continue
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref)
      const agora = s.get('ultimoNumero')
      if (typeof agora === 'number' && agora >= u.maior) return // a emissão andou no meio: nunca desce
      tx.set(ref, {
        cnpj: u.cnpj, tpAmb: u.tpAmb, serie: u.serie, tenantId: u.tenantId,
        ultimoNumero: u.maior,
        recalculadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true })
    })
  }

  console.log(`\nNotas nacionais lidas: ${notas} · rascunhos com nº reservado: ${rascunhos} · contadores: ${usados.size} · ${APLICAR ? 'ajustados' : 'a ajustar'}: ${subir}`)
  if (APLICAR && subir > 0) {
    await db.collection('logs_auditoria').add({
      tenantId: TENANT,
      usuarioId: 'script',
      usuarioNome: 'scripts/recalcular-contador-dps.mjs',
      usuarioEmail: null,
      entidade: 'dps_sequencias',
      entidadeId: null,
      acao: 'contador_dps_recalculado',
      dadosAntes: null,
      dadosDepois: { contadores: subir },
      origem: 'script',
      criadoEm: FieldValue.serverTimestamp(),
      // TTL: mesma retenção de logs_auditoria em functions/src/retencao.ts (6 anos).
      expiraEm: Timestamp.fromMillis(Date.now() + (6 * 365 + 2) * 86_400_000),
    })
  }
  if (!APLICAR && subir > 0) console.log('Rode de novo com --aplicar para gravar.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
