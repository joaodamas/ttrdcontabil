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
import { dataDeExpiracao } from '../../functions/src/retencao'

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

  // ─── clientes_credenciais: só pelo servidor ───────────────────────────────

  const credValida = (extra: Record<string, unknown> = {}) => ({
    tenantId: 'tenant-a', clienteId: 'cliente-a', senhaWebPrefeitura: 'nova', responsavelSenhaMeuGov: 'gov', ...extra,
  })

  it('credenciais: NINGUÉM lê nem grava pelo navegador — nem admin nem fiscal (só callables)', async () => {
    for (const uid of ['admin-a', 'fiscal-a', 'operacional-a', 'financeiro-a', 'leitura-a', 'operacional-telas-fiscal', 'inativo-a']) {
      const db = dbAs(uid)
      await assertFails(getDoc(doc(db, 'clientes_credenciais/cliente-a')))
      await assertFails(getDocs(query(collection(db, 'clientes_credenciais'), where('tenantId', '==', 'tenant-a'))))
      await assertFails(setDoc(doc(db, 'clientes_credenciais/cliente-a'), credValida()))
      await assertFails(updateDoc(doc(db, 'clientes_credenciais/cliente-a'), { senhaWebPrefeitura: 'x' }))
      await assertFails(updateDoc(doc(db, 'clientes_credenciais/cliente-a'), { senhaPostoFiscal: deleteField() }))
      await assertFails(deleteDoc(doc(db, 'clientes_credenciais/cliente-a')))
    }
    await assertFails(setDoc(doc(dbAs('fiscal-a'), 'clientes_credenciais/cliente-legado'), {
      tenantId: 'tenant-a', clienteId: 'cliente-legado', senhaWebPrefeitura: 'antiga',
    }))
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

  // ─── logs_auditoria: trilha não forjável ──────────────────────────────────

  const dbComEmail = (uid: string, email: string, extra: Record<string, unknown> = {}) =>
    testEnv.authenticatedContext(uid, { email, ...extra }).firestore()
  const logValido = (extra: Record<string, unknown> = {}) => ({
    tenantId: 'tenant-a', usuarioId: 'operacional-a', usuarioNome: 'Operacional', usuarioEmail: 'operacional@a.com',
    entidade: 'tarefas', entidadeId: 't1', acao: 'update', dadosAntes: null, dadosDepois: { titulo: 'x' },
    origem: 'client', path: '/tarefas', criadoEm: serverTimestamp(), ...extra,
  })

  it('logs_auditoria: grava em nome próprio, com e-mail do token e hora do servidor', async () => {
    const db = dbComEmail('operacional-a', 'operacional@a.com')
    await assertSucceeds(setDoc(doc(db, 'logs_auditoria/ok'), logValido()))
  })

  it('logs_auditoria: ninguém grava log em nome de outro, como servidor, nem com e-mail alheio', async () => {
    const db = dbComEmail('operacional-a', 'operacional@a.com')
    await assertFails(setDoc(doc(db, 'logs_auditoria/l2'), logValido({ usuarioId: 'admin-a' })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/l3'), logValido({ origem: 'cloud_function' })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/l4'), logValido({ origem: 'trigger' })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/l5'), logValido({ usuarioEmail: 'admin@a.com' })))
    const semUsuario: Record<string, unknown> = logValido()
    delete semUsuario.usuarioId
    await assertFails(setDoc(doc(db, 'logs_auditoria/l6'), semUsuario))
    await assertFails(setDoc(doc(dbComEmail('inativo-a', 'inativo@a.com'), 'logs_auditoria/l7'), logValido({ usuarioId: 'inativo-a', usuarioEmail: 'inativo@a.com' })))
  })

  it('logs_auditoria: data retroativa/futura e campos extras são recusados', async () => {
    const db = dbComEmail('operacional-a', 'operacional@a.com')
    await assertFails(setDoc(doc(db, 'logs_auditoria/d1'), logValido({ criadoEm: Timestamp.fromDate(new Date('2020-01-01')) })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/d2'), logValido({ criadoEm: Timestamp.fromDate(new Date('2099-01-01')) })))
    const semData: Record<string, unknown> = logValido()
    delete semData.criadoEm
    await assertFails(setDoc(doc(db, 'logs_auditoria/d3'), semData))
    await assertFails(setDoc(doc(db, 'logs_auditoria/d4'), logValido({ ip: '1.2.3.4' })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/d5'), logValido({ tenantId: 'tenant-b' })))
  })

  // ─── TTL: expiraEm (functions/src/retencao.ts) ─────────────────────────────

  const emDias = (dias: number) => Timestamp.fromDate(new Date(Date.now() + dias * 86_400_000))

  it('logs_auditoria: expiraEm opcional, com a retenção configurada; prazo menor ou tipo errado recusados', async () => {
    const db = dbComEmail('operacional-a', 'operacional@a.com')
    await assertSucceeds(setDoc(doc(db, 'logs_auditoria/ttl1'), logValido({ expiraEm: Timestamp.fromDate(dataDeExpiracao('logs_auditoria')) })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/ttl2'), logValido({ expiraEm: emDias(30) })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/ttl3'), logValido({ expiraEm: emDias(2 * 365) })))
    await assertFails(setDoc(doc(db, 'logs_auditoria/ttl4'), logValido({ expiraEm: '2099-01-01' })))
  })

  // ─── events / nfse_eventos ────────────────────────────────────────────────

  const eventoFechamento = (extra: Record<string, unknown> = {}) => ({
    tenantId: 'tenant-a', tipo: 'fechamento', titulo: 'Revisão encerrada', descricao: 'ok',
    origemColecao: 'fechamento_revisoes', origemId: '2026_07', actorId: 'operacional-a', actorNome: 'Op',
    metadata: { severidade: 'baixa' }, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
    criadoPorId: 'operacional-a', criadoPorNome: 'Op', ...extra,
  })

  it('events: navegador cria só fechamento/lancamento, em nome próprio e com hora do servidor', async () => {
    await assertSucceeds(setDoc(doc(dbAs('operacional-a'), 'events/e1'), eventoFechamento()))
    await assertSucceeds(setDoc(doc(dbAs('fiscal-a'), 'events/e2'), eventoFechamento({ actorId: 'fiscal-a', criadoPorId: 'fiscal-a' })))
    // Cobrança iniciada (fila-cobranca.tsx): financeiro, sem actorId.
    const cobranca: Record<string, unknown> = {
      ...eventoFechamento({ tipo: 'lancamento', origemColecao: 'lancamentos', origemId: 'l1', clienteId: null,
        criadoPorId: 'financeiro-a' }),
    }
    delete cobranca.actorId
    delete cobranca.actorNome
    await assertSucceeds(setDoc(doc(dbAs('financeiro-a'), 'events/e3'), cobranca))
  })

  it('events: tipo fora da lista, autor alheio, data forjada, perfil errado ou campo extra são recusados', async () => {
    const db = dbAs('operacional-a')
    await assertFails(setDoc(doc(db, 'events/f1'), eventoFechamento({ tipo: 'nfse_emitida' })))
    await assertFails(setDoc(doc(db, 'events/f2'), eventoFechamento({ actorId: 'admin-a' })))
    await assertFails(setDoc(doc(db, 'events/f3'), eventoFechamento({ criadoPorId: 'admin-a' })))
    await assertFails(setDoc(doc(db, 'events/f4'), eventoFechamento({ criadoEm: Timestamp.fromDate(new Date('2020-01-01')) })))
    await assertFails(setDoc(doc(db, 'events/f5'), eventoFechamento({ extra: true })))
    await assertFails(setDoc(doc(db, 'events/f6'), eventoFechamento({ tipo: 'lancamento', origemColecao: 'lancamentos' })))
    await assertFails(setDoc(doc(dbAs('leitura-a'), 'events/f7'), eventoFechamento({ actorId: 'leitura-a', criadoPorId: 'leitura-a' })))
  })

  it('events: expiraEm opcional, com a retenção configurada; prazo menor recusado', async () => {
    const db = dbAs('operacional-a')
    await assertSucceeds(setDoc(doc(db, 'events/ttl1'), eventoFechamento({ expiraEm: Timestamp.fromDate(dataDeExpiracao('events')) })))
    await assertFails(setDoc(doc(db, 'events/ttl2'), eventoFechamento({ expiraEm: emDias(7) })))
    await assertFails(setDoc(doc(db, 'events/ttl3'), eventoFechamento({ expiraEm: emDias(365) })))
  })

  it('nfse_eventos: navegador não cria (só Cloud Functions), nem o fiscal', async () => {
    for (const uid of ['admin-a', 'fiscal-a']) {
      await assertFails(setDoc(doc(dbAs(uid), `nfse_eventos/${uid}`), {
        tenantId: 'tenant-a', nfseId: 'n1', tipo: 'cancelamento', criadoEm: serverTimestamp(),
      }))
    }
  })

  // ─── M1: financeiro não lê config fiscal ──────────────────────────────────

  it('clientes_fiscal: financeiro com a tela fiscal (padrão do perfil) NÃO lê; operacional com a tela concedida lê', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'usuarios/financeiro-telas'), {
        nome: 'fin', perfil: 'financeiro', ativo: true, tenantId: 'tenant-a', telas: ['hoje', 'dashboard', 'clientes', 'financeiro', 'fiscal'],
      })
      await setDoc(doc(db, 'clientes_fiscal/cf-a'), {
        tenantId: 'tenant-a', clienteId: 'cliente-a', credenciais: { certificadoSenha: 'cifrado' },
      })
      await setDoc(doc(db, 'nfse_emitidas/n-a'), { tenantId: 'tenant-a', clienteId: 'cliente-a' })
    })
    await assertFails(getDoc(doc(dbAs('financeiro-telas'), 'clientes_fiscal/cf-a')))
    await assertFails(getDocs(query(collection(dbAs('financeiro-telas'), 'clientes_fiscal'), where('tenantId', '==', 'tenant-a'))))
    await assertFails(getDoc(doc(dbAs('financeiro-a'), 'clientes_fiscal/cf-a')))
    // Continua lendo NFS-e (conciliação).
    await assertSucceeds(getDoc(doc(dbAs('financeiro-telas'), 'nfse_emitidas/n-a')))
    await assertSucceeds(getDoc(doc(dbAs('operacional-telas-fiscal'), 'clientes_fiscal/cf-a')))
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'clientes_fiscal/cf-a')))
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'clientes_fiscal/cf-a')))
  })

  // ─── configuracoes/seguranca: interruptor do 2º fator ─────────────────────

  it('configuracoes/seguranca: só admin que entrou com 2º fator liga/desliga; ninguém apaga', async () => {
    const adminSemMfa = dbAs('admin-a')
    // Claim do ID token de quem entrou com TOTP (o tipo do rules-unit-testing não a lista).
    const tokenMfa = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } } as unknown as
      Parameters<typeof testEnv.authenticatedContext>[1]
    const adminComMfa = testEnv.authenticatedContext('admin-a', tokenMfa).firestore()
    const fiscalComMfa = testEnv.authenticatedContext('fiscal-a', tokenMfa).firestore()
    const ref = (db: ReturnType<typeof dbAs>) => doc(db, 'configuracoes/seguranca')

    await assertFails(setDoc(ref(adminSemMfa), { tenantId: 'tenant-a', mfaObrigatorio: true }))
    await assertFails(setDoc(ref(fiscalComMfa), { tenantId: 'tenant-a', mfaObrigatorio: true }))
    await assertSucceeds(setDoc(ref(adminComMfa), { tenantId: 'tenant-a', mfaObrigatorio: true }))
    await assertFails(updateDoc(ref(adminSemMfa), { mfaObrigatorio: false }))
    await assertSucceeds(updateDoc(ref(adminComMfa), { mfaObrigatorio: false }))
    await assertFails(deleteDoc(ref(adminComMfa)))
    // Todo usuário ativo lê (o front decide o redirecionamento).
    await assertSucceeds(getDoc(ref(dbAs('leitura-a'))))
    // Outros docs de configuracoes seguem só admin, sem exigir 2º fator.
    await assertSucceeds(setDoc(doc(adminSemMfa, 'configuracoes/escritorio'), { tenantId: 'tenant-a', nome: 'X' }))
  })
})
