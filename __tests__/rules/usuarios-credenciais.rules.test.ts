// @vitest-environment node
// Regras de usuários, diretório de usuários, credenciais de clientes e
// logs_auditoria (feat/usuarios-permissoes). Projeto próprio no emulador para
// não disputar o clearFirestore com firestore.rules.test.ts, que roda em paralelo.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

const PROJECT_ID = 'ttrdcontabil-rules-usuarios'
const describeIfEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

let testEnv: RulesTestEnvironment
const dbAs = (uid: string) => testEnv.authenticatedContext(uid).firestore()

const PERFIS = ['admin', 'operacional', 'fiscal', 'financeiro', 'leitura'] as const

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const perfil of PERFIS) {
      await setDoc(doc(db, `usuarios/${perfil}-a`), { nome: perfil, email: `${perfil}@a.com`, perfil, ativo: true, tenantId: 'tenant-a' })
    }
    await setDoc(doc(db, 'usuarios/admin-b'), { nome: 'admin b', perfil: 'admin', ativo: true, tenantId: 'tenant-b' })
    await setDoc(doc(db, 'usuarios/inativo-a'), { nome: 'inativo', perfil: 'operacional', ativo: false, tenantId: 'tenant-a' })
    // Perfil antigo sem o campo `ativo`: continua contando como ativo.
    await setDoc(doc(db, 'usuarios/legado-a'), { nome: 'legado', perfil: 'operacional', tenantId: 'tenant-a' })
    // Override de tela 'fiscal' NÃO dá acesso às senhas (critério é perfil).
    await setDoc(doc(db, 'usuarios/operacional-telas-fiscal'), {
      nome: 'op', perfil: 'operacional', ativo: true, tenantId: 'tenant-a', telas: ['hoje', 'clientes', 'fiscal'],
    })

    await setDoc(doc(db, 'usuarios_diretorio/admin-a'), { nome: 'admin', ativo: true, tenantId: 'tenant-a' })
    await setDoc(doc(db, 'usuarios_diretorio/admin-b'), { nome: 'admin b', ativo: true, tenantId: 'tenant-b' })

    await setDoc(doc(db, 'clientes/cliente-a'), { tenantId: 'tenant-a', status: 'ativo', razaoSocial: 'Cliente A' })
    await setDoc(doc(db, 'clientes/cliente-b'), { tenantId: 'tenant-b', status: 'ativo', razaoSocial: 'Cliente B' })
    // Doc anterior à migração, ainda com senha em texto puro.
    await setDoc(doc(db, 'clientes/cliente-legado'), {
      tenantId: 'tenant-a', status: 'ativo', razaoSocial: 'Legado', senhaWebPrefeitura: 'antiga',
    })
    await setDoc(doc(db, 'clientes_credenciais/cliente-a'), {
      tenantId: 'tenant-a', clienteId: 'cliente-a', senhaWebPrefeitura: 's3cr3t', loginPrefeitura: 'login',
    })
    await setDoc(doc(db, 'clientes_credenciais/cliente-b'), {
      tenantId: 'tenant-b', clienteId: 'cliente-b', senhaWebPrefeitura: 'outra',
    })
  })
}

describeIfEmulator('regras de usuários, credenciais e auditoria', () => {
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

  // ─── usuarios: auto-escalada ──────────────────────────────────────────────

  it('ninguém se concede perfil, telas, ativo, tenant ou troca o e-mail', async () => {
    for (const perfil of PERFIS) {
      const db = dbAs(`${perfil}-a`)
      const ref = doc(db, `usuarios/${perfil}-a`)
      await assertFails(updateDoc(ref, { perfil: perfil === 'admin' ? 'leitura' : 'admin' }))
      await assertFails(updateDoc(ref, { telas: ['admin', 'financeiro', 'fiscal'] }))
      await assertFails(updateDoc(ref, { ativo: false }))
      await assertFails(updateDoc(ref, { tenantId: 'tenant-b' }))
      await assertFails(updateDoc(ref, { email: 'outro@x.com' }))
    }
  })

  it('self-update: nome e ultimoAcesso (hora do servidor); nada mais', async () => {
    const ref = doc(dbAs('leitura-a'), 'usuarios/leitura-a')
    await assertSucceeds(updateDoc(ref, { nome: 'Novo Nome' }))
    await assertSucceeds(updateDoc(ref, { ultimoAcesso: serverTimestamp() }))
    await assertFails(updateDoc(ref, { ultimoAcesso: Timestamp.fromDate(new Date('2020-01-01')) }))
    await assertFails(updateDoc(ref, { nome: 'X' }))
    await assertFails(updateDoc(ref, { nome: 'Ok Nome', atualizadoPorId: 'admin-a' }))
  })

  it('usuário inativo não atualiza nem o próprio nome', async () => {
    await assertFails(updateDoc(doc(dbAs('inativo-a'), 'usuarios/inativo-a'), { nome: 'Voltei' }))
    await assertFails(updateDoc(doc(dbAs('inativo-a'), 'usuarios/inativo-a'), { ultimoAcesso: serverTimestamp() }))
    // Mas ainda lê o próprio doc — é assim que o front descobre que foi desativado.
    await assertSucceeds(getDoc(doc(dbAs('inativo-a'), 'usuarios/inativo-a')))
  })

  it('perfil sem `ativo` (legado) continua ativo', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('legado-a'), 'usuarios/legado-a'), { ultimoAcesso: serverTimestamp() }))
    await assertSucceeds(getDoc(doc(dbAs('legado-a'), 'clientes/cliente-a')))
  })

  it('nem admin cria, exclui ou altera usuário pelo navegador', async () => {
    const db = dbAs('admin-a')
    await assertFails(setDoc(doc(db, 'usuarios/novo'), { nome: 'Novo', perfil: 'leitura', ativo: true, tenantId: 'tenant-a' }))
    await assertFails(deleteDoc(doc(db, 'usuarios/leitura-a')))
    await assertFails(updateDoc(doc(db, 'usuarios/leitura-a'), { telas: ['admin'] }))
    await assertFails(updateDoc(doc(db, 'usuarios/leitura-a'), { ativo: false }))
    await assertFails(updateDoc(doc(db, 'usuarios/leitura-a'), { nome: 'Renomeado' }))
  })

  it('nenhum usuário cria o próprio perfil (cadastro público não vira acesso)', async () => {
    await assertFails(setDoc(doc(dbAs('intruso'), 'usuarios/intruso'), {
      nome: 'Intruso', perfil: 'admin', ativo: true, tenantId: 'tenant-a',
    }))
  })

  // ─── usuarios: leitura ────────────────────────────────────────────────────

  it('list de usuarios só para admin', async () => {
    await assertSucceeds(getDocs(collection(dbAs('admin-a'), 'usuarios')))
    for (const perfil of ['operacional', 'fiscal', 'financeiro', 'leitura']) {
      await assertFails(getDocs(collection(dbAs(`${perfil}-a`), 'usuarios')))
    }
    await assertFails(getDocs(collection(dbAs('inativo-a'), 'usuarios')))
  })

  it('get: o próprio doc sempre; doc alheio só admin do mesmo tenant', async () => {
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'usuarios/fiscal-a')))
    await assertFails(getDoc(doc(dbAs('fiscal-a'), 'usuarios/admin-a')))
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'usuarios/fiscal-a')))
    await assertFails(getDoc(doc(dbAs('admin-b'), 'usuarios/fiscal-a')))
  })

  // ─── usuarios_diretorio ───────────────────────────────────────────────────

  it('diretório: qualquer ativo lista o próprio tenant; outro tenant, inativo e escrita não', async () => {
    const q = (uid: string, tenant: string) =>
      getDocs(query(collection(dbAs(uid), 'usuarios_diretorio'), where('tenantId', '==', tenant)))
    await assertSucceeds(q('leitura-a', 'tenant-a'))
    await assertFails(q('leitura-a', 'tenant-b'))
    await assertFails(q('inativo-a', 'tenant-a'))
    await assertFails(getDocs(collection(dbAs('leitura-a'), 'usuarios_diretorio')))
    await assertFails(setDoc(doc(dbAs('admin-a'), 'usuarios_diretorio/x'), { nome: 'x', ativo: true, tenantId: 'tenant-a' }))
  })

  // ─── clientes_credenciais ─────────────────────────────────────────────────

  const credValida = (extra: Record<string, unknown> = {}) => ({
    tenantId: 'tenant-a', clienteId: 'cliente-a', senhaWebPrefeitura: 'nova', responsavelSenhaMeuGov: 'gov', ...extra,
  })

  it('credenciais: admin e fiscal leem e gravam', async () => {
    for (const uid of ['admin-a', 'fiscal-a']) {
      const db = dbAs(uid)
      await assertSucceeds(getDoc(doc(db, 'clientes_credenciais/cliente-a')))
      await assertSucceeds(getDocs(query(collection(db, 'clientes_credenciais'), where('tenantId', '==', 'tenant-a'))))
      await assertSucceeds(setDoc(doc(db, 'clientes_credenciais/cliente-a'), credValida({ atualizadoPorId: uid })))
      await assertSucceeds(updateDoc(doc(db, 'clientes_credenciais/cliente-a'), { senhaPostoFiscal: deleteField() }))
    }
    await assertSucceeds(setDoc(doc(dbAs('fiscal-a'), 'clientes_credenciais/cliente-legado'), {
      tenantId: 'tenant-a', clienteId: 'cliente-legado', senhaWebPrefeitura: 'antiga',
    }))
  })

  it('credenciais: operacional, financeiro, leitura, override de tela e inativo não leem nem gravam', async () => {
    for (const uid of ['operacional-a', 'financeiro-a', 'leitura-a', 'operacional-telas-fiscal', 'inativo-a']) {
      const db = dbAs(uid)
      await assertFails(getDoc(doc(db, 'clientes_credenciais/cliente-a')))
      await assertFails(getDocs(query(collection(db, 'clientes_credenciais'), where('tenantId', '==', 'tenant-a'))))
      await assertFails(setDoc(doc(db, 'clientes_credenciais/cliente-a'), credValida()))
      await assertFails(updateDoc(doc(db, 'clientes_credenciais/cliente-a'), { senhaWebPrefeitura: 'x' }))
    }
  })

  it('credenciais: isolamento de tenant e payload validado', async () => {
    const db = dbAs('admin-a')
    await assertFails(getDoc(doc(db, 'clientes_credenciais/cliente-b')))
    // Doc no tenant A apontando para cliente do tenant B.
    await assertFails(setDoc(doc(db, 'clientes_credenciais/cliente-b'), { tenantId: 'tenant-a', clienteId: 'cliente-b' }))
    // Id do doc diferente do clienteId.
    await assertFails(setDoc(doc(db, 'clientes_credenciais/cliente-legado'), credValida()))
    // Campo fora da lista e valor não-texto.
    await assertFails(setDoc(doc(db, 'clientes_credenciais/cliente-a'), credValida({ razaoSocial: 'x' })))
    await assertFails(setDoc(doc(db, 'clientes_credenciais/cliente-a'), credValida({ senhaWebPrefeitura: 123 })))
    // Cliente inexistente.
    await assertFails(setDoc(doc(db, 'clientes_credenciais/nao-existe'), { tenantId: 'tenant-a', clienteId: 'nao-existe' }))
    // Exclusão: só admin.
    await assertFails(deleteDoc(doc(dbAs('fiscal-a'), 'clientes_credenciais/cliente-a')))
    await assertSucceeds(deleteDoc(doc(db, 'clientes_credenciais/cliente-a')))
  })

  // ─── clientes: senha em texto puro não volta ──────────────────────────────

  it('clientes: create/update não grava senha nem credenciaisPreenchidas; remover a legada pode', async () => {
    const db = dbAs('operacional-a')
    const base = { tenantId: 'tenant-a', status: 'ativo', razaoSocial: 'Novo Cliente' }
    await assertSucceeds(setDoc(doc(db, 'clientes/novo'), base))
    await assertFails(setDoc(doc(db, 'clientes/novo2'), { ...base, senhaWebPrefeitura: 'x' }))
    await assertFails(setDoc(doc(db, 'clientes/novo3'), { ...base, credenciaisPreenchidas: ['senhaWebPrefeitura'] }))
    await assertFails(updateDoc(doc(db, 'clientes/cliente-a'), { responsavelSenhaMeuGov: 'x' }))
    await assertFails(updateDoc(doc(db, 'clientes/cliente-a'), { credenciaisPreenchidas: [] }))
    await assertFails(updateDoc(doc(db, 'clientes/cliente-legado'), { senhaWebPrefeitura: 'trocada' }))
    // Salvar outros campos com a senha legada intocada continua funcionando.
    await assertSucceeds(updateDoc(doc(db, 'clientes/cliente-legado'), { nomeFantasia: 'L' }))
    await assertSucceeds(updateDoc(doc(db, 'clientes/cliente-legado'), { senhaWebPrefeitura: deleteField() }))
  })

  // ─── logs_auditoria ───────────────────────────────────────────────────────

  it('logs_auditoria: ninguém grava log em nome de outro nem como servidor', async () => {
    const db = dbAs('operacional-a')
    const log = { tenantId: 'tenant-a', acao: 'update', entidade: 'clientes', origem: 'client' }
    await assertSucceeds(setDoc(doc(db, 'logs_auditoria/l1'), { ...log, usuarioId: 'operacional-a' }))
    await assertFails(setDoc(doc(db, 'logs_auditoria/l2'), { ...log, usuarioId: 'admin-a' }))
    await assertFails(setDoc(doc(db, 'logs_auditoria/l3'), { ...log }))
    await assertFails(setDoc(doc(db, 'logs_auditoria/l4'), { ...log, usuarioId: 'operacional-a', origem: 'cloud_function' }))
    await assertFails(setDoc(doc(dbAs('inativo-a'), 'logs_auditoria/l5'), { ...log, usuarioId: 'inativo-a' }))
  })
})
