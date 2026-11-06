// @vitest-environment node
// KPIs do Painel: dashboard_kpis (todo perfil ativo) × dashboard_kpis_financeiro
// (só quem lê lançamentos — canReadFinanceiro). Projeto próprio no emulador para
// não disputar o clearFirestore com as outras suítes de regras.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const PROJECT_ID = 'ttrdcontabil-rules-dashboard'
const describeIfEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

let testEnv: RulesTestEnvironment
const dbAs = (uid: string) => testEnv.authenticatedContext(uid).firestore()

const PERFIS = ['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'] as const
const LEEM_FINANCEIRO = new Set(['admin', 'financeiro'])
const ID = 'tenant-a_2026_11'

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const perfil of PERFIS) {
      await setDoc(doc(db, `usuarios/${perfil}-a`), { nome: perfil, perfil, ativo: true, tenantId: 'tenant-a' })
    }
    await setDoc(doc(db, 'usuarios/admin-b'), { nome: 'admin b', perfil: 'admin', ativo: true, tenantId: 'tenant-b' })
    await setDoc(doc(db, 'usuarios/financeiro-inativo'), { nome: 'x', perfil: 'financeiro', ativo: false, tenantId: 'tenant-a' })
    // Tela 'financeiro' concedida por override: lê lançamentos, então lê os KPIs financeiros.
    await setDoc(doc(db, 'usuarios/operacional-tela-fin'), {
      nome: 'op', perfil: 'operacional', ativo: true, tenantId: 'tenant-a', telas: ['dashboard', 'financeiro'],
    })
    // Telas explícitas sem 'financeiro' para um perfil financeiro: o perfil ainda vale (isFinanceiro).
    await setDoc(doc(db, 'usuarios/financeiro-sem-tela'), {
      nome: 'fin', perfil: 'financeiro', ativo: true, tenantId: 'tenant-a', telas: ['dashboard'],
    })

    await setDoc(doc(db, `dashboard_kpis/${ID}`), { tenantId: 'tenant-a', mes: 11, ano: 2026, totalClientesAtivos: 3 })
    await setDoc(doc(db, `dashboard_kpis_financeiro/${ID}`), { tenantId: 'tenant-a', mes: 11, ano: 2026, somaAtrasados: 999 })
    await setDoc(doc(db, 'dashboard_kpis_financeiro/tenant-b_2026_11'), { tenantId: 'tenant-b', somaAtrasados: 1 })
  })
}

describeIfEmulator('regras dos KPIs do Painel', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    })
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await seed()
  })

  afterAll(async () => {
    await testEnv?.cleanup()
  })

  it('dashboard_kpis: todo perfil ativo do tenant lê', async () => {
    for (const perfil of PERFIS) {
      await assertSucceeds(getDoc(doc(dbAs(`${perfil}-a`), `dashboard_kpis/${ID}`)))
    }
    await assertFails(getDoc(doc(dbAs('admin-b'), `dashboard_kpis/${ID}`)))
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), `dashboard_kpis/${ID}`)))
  })

  it('dashboard_kpis_financeiro: só admin e financeiro (perfil), não operacional/fiscal/leitura', async () => {
    for (const perfil of PERFIS) {
      const leitura = getDoc(doc(dbAs(`${perfil}-a`), `dashboard_kpis_financeiro/${ID}`))
      if (LEEM_FINANCEIRO.has(perfil)) await assertSucceeds(leitura)
      else await assertFails(leitura)
    }
  })

  it('dashboard_kpis_financeiro: tela financeiro concedida lê; inativo, outro tenant e anônimo não', async () => {
    await assertSucceeds(getDoc(doc(dbAs('operacional-tela-fin'), `dashboard_kpis_financeiro/${ID}`)))
    await assertSucceeds(getDoc(doc(dbAs('financeiro-sem-tela'), `dashboard_kpis_financeiro/${ID}`)))
    await assertFails(getDoc(doc(dbAs('financeiro-inativo'), `dashboard_kpis_financeiro/${ID}`)))
    await assertFails(getDoc(doc(dbAs('admin-b'), `dashboard_kpis_financeiro/${ID}`)))
    await assertFails(getDoc(doc(dbAs('admin-a'), 'dashboard_kpis_financeiro/tenant-b_2026_11')))
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), `dashboard_kpis_financeiro/${ID}`)))
  })

  it('ninguém escreve KPIs pelo navegador (só o servidor)', async () => {
    for (const perfil of PERFIS) {
      const db = dbAs(`${perfil}-a`)
      for (const colecao of ['dashboard_kpis', 'dashboard_kpis_financeiro']) {
        await assertFails(setDoc(doc(db, `${colecao}/novo`), { tenantId: 'tenant-a', somaAtrasados: 0 }))
        await assertFails(updateDoc(doc(db, `${colecao}/${ID}`), { totalClientesAtivos: 0 }))
        await assertFails(deleteDoc(doc(db, `${colecao}/${ID}`)))
      }
    }
  })
})
