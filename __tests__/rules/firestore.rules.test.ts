// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const PROJECT_ID = 'ttrdcontabil-rules-test'

let testEnv: RulesTestEnvironment
const describeIfEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'usuarios/admin-a'), {
      perfil: 'admin',
      ativo: true,
      tenantId: 'tenant-a',
    })
    await setDoc(doc(db, 'usuarios/operacional-a'), {
      perfil: 'operacional',
      ativo: true,
      tenantId: 'tenant-a',
    })
    await setDoc(doc(db, 'usuarios/fiscal-a'), {
      perfil: 'fiscal',
      ativo: true,
      tenantId: 'tenant-a',
    })
    await setDoc(doc(db, 'usuarios/financeiro-a'), {
      perfil: 'financeiro',
      ativo: true,
      tenantId: 'tenant-a',
    })
    await setDoc(doc(db, 'usuarios/leitura-a'), {
      perfil: 'leitura',
      ativo: true,
      tenantId: 'tenant-a',
    })
    await setDoc(doc(db, 'usuarios/operacional-b'), {
      perfil: 'operacional',
      ativo: true,
      tenantId: 'tenant-b',
    })
    await setDoc(doc(db, 'clientes/cliente-a'), {
      tenantId: 'tenant-a',
      status: 'ativo',
      razaoSocial: 'Cliente A Ltda',
    })
    await setDoc(doc(db, 'clientes/cliente-b'), {
      tenantId: 'tenant-b',
      status: 'ativo',
      razaoSocial: 'Cliente B Ltda',
    })
    // Coleções escritas só por Cloud Functions (Admin SDK) — semeadas para
    // testar leitura por perfil/tenant e bloqueio de escrita via regras.
    await setDoc(doc(db, 'logs_auditoria/log-a'), {
      tenantId: 'tenant-a',
      usuarioId: 'operacional-a',
      acao: 'create',
      entidade: 'clientes',
    })
    await setDoc(doc(db, 'whatsapp_messages/msg-a'), {
      tenantId: 'tenant-a',
      lancamentoId: 'lanc-a',
      status: 'enviado',
    })
    await setDoc(doc(db, 'whatsapp_campaign_rules/rule-a'), {
      tenantId: 'tenant-a',
      etapa: 'pre_vencimento',
      ativo: true,
    })
    await setDoc(doc(db, 'nfse_erros/erro-a'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      erro: 'rejeicao_teste',
    })
  })
}

function dbAs(uid: string) {
  return testEnv.authenticatedContext(uid).firestore()
}

describeIfEmulator('firestore.rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    })
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await seedBaseData()
  })

  afterAll(async () => {
    await testEnv?.cleanup()
  })

  it('bloqueia leitura cross-tenant em colecoes criticas', async () => {
    const db = dbAs('operacional-a')

    await assertSucceeds(getDoc(doc(db, 'clientes/cliente-a')))
    await expect(assertFails(getDoc(doc(db, 'clientes/cliente-b')))).resolves.toBeDefined()
  })

  it('permite operacional criar cliente apenas no proprio tenant', async () => {
    const db = dbAs('operacional-a')

    await assertSucceeds(setDoc(doc(db, 'clientes/novo-a'), {
      tenantId: 'tenant-a',
      status: 'ativo',
      razaoSocial: 'Novo Cliente A',
    }))

    await assertFails(setDoc(doc(db, 'clientes/novo-b'), {
      tenantId: 'tenant-b',
      status: 'ativo',
      razaoSocial: 'Novo Cliente B',
    }))
  })

  it('bloqueia financeiro fora de lancamentos e respeita tenant', async () => {
    const db = dbAs('financeiro-a')

    await assertFails(setDoc(doc(db, 'clientes/financeiro-nao-cria-cliente'), {
      tenantId: 'tenant-a',
      status: 'ativo',
      razaoSocial: 'Cliente indevido',
    }))

    await assertSucceeds(setDoc(doc(db, 'lancamentos/lanc-a'), {
      tenantId: 'tenant-a',
      tipo: 'receita',
      status: 'pendente',
      valor: 100,
    }))

    await assertFails(setDoc(doc(db, 'lancamentos/lanc-b'), {
      tenantId: 'tenant-b',
      tipo: 'receita',
      status: 'pendente',
      valor: 100,
    }))
  })

  it('bloqueia fiscal em financeiro e escrita direta em nfse_emitidas', async () => {
    const db = dbAs('fiscal-a')

    await assertSucceeds(setDoc(doc(db, 'nfse_rascunhos/rascunho-a'), {
      tenantId: 'tenant-a',
      status: 'aguardando_emissao',
      clienteId: 'cliente-a',
    }))

    await assertFails(setDoc(doc(db, 'lancamentos/fiscal-nao-cria-lancamento'), {
      tenantId: 'tenant-a',
      tipo: 'receita',
      status: 'pendente',
      valor: 100,
    }))

    await assertFails(setDoc(doc(db, 'nfse_emitidas/nfse-direta'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      status: 'emitida',
    }))
  })

  it('impede update que troca tenant do documento existente', async () => {
    const db = dbAs('operacional-a')

    await assertFails(updateDoc(doc(db, 'clientes/cliente-a'), {
      tenantId: 'tenant-b',
    }))
  })

  // ─── Anti-escalada de privilégio (usuarios/{uid}) ────────────────────────────

  it('impede usuario de auto-promover o proprio perfil', async () => {
    const db = dbAs('operacional-a')
    await assertFails(updateDoc(doc(db, 'usuarios/operacional-a'), { perfil: 'admin' }))
  })

  it('impede usuario de alterar o proprio campo ativo', async () => {
    const db = dbAs('operacional-a')
    await assertFails(updateDoc(doc(db, 'usuarios/operacional-a'), { ativo: false }))
  })

  it('impede usuario de trocar o proprio tenantId', async () => {
    const db = dbAs('operacional-a')
    await assertFails(updateDoc(doc(db, 'usuarios/operacional-a'), { tenantId: 'tenant-b' }))
  })

  it('permite self-update de campo nao sensivel (nome)', async () => {
    const db = dbAs('operacional-a')
    await assertSucceeds(updateDoc(doc(db, 'usuarios/operacional-a'), { nome: 'Novo Nome' }))
  })

  it('admin promove usuario do proprio tenant, mas nao de outro', async () => {
    const db = dbAs('admin-a')
    await assertSucceeds(updateDoc(doc(db, 'usuarios/operacional-a'), { perfil: 'fiscal' }))
    await assertFails(updateDoc(doc(db, 'usuarios/operacional-b'), { perfil: 'admin' }))
  })

  // ─── logs_auditoria: append-only e leitura só admin ──────────────────────────

  it('logs_auditoria: cria, mas nunca edita nem deleta', async () => {
    const db = dbAs('operacional-a')
    await assertSucceeds(setDoc(doc(db, 'logs_auditoria/novo-log'), {
      tenantId: 'tenant-a',
      usuarioId: 'operacional-a',
      acao: 'update',
      entidade: 'clientes',
    }))
    await assertFails(updateDoc(doc(db, 'logs_auditoria/log-a'), { acao: 'adulterado' }))
    await assertFails(deleteDoc(doc(db, 'logs_auditoria/log-a')))
  })

  it('logs_auditoria: leitura so admin do mesmo tenant', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'logs_auditoria/log-a')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'logs_auditoria/log-a')))
    await assertFails(getDoc(doc(dbAs('operacional-b'), 'logs_auditoria/log-a')))
  })

  // ─── WhatsApp / nfse_erros: leitura por perfil/tenant, escrita só Functions ──

  it('whatsapp_messages: financeiro le do proprio tenant, escrita direta bloqueada', async () => {
    await assertSucceeds(getDoc(doc(dbAs('financeiro-a'), 'whatsapp_messages/msg-a')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'whatsapp_messages/msg-a')))
    await assertFails(setDoc(doc(dbAs('financeiro-a'), 'whatsapp_messages/forjada'), {
      tenantId: 'tenant-a',
      status: 'enviado',
    }))
  })

  it('whatsapp_campaign_rules: leitura permitida, escrita direta bloqueada', async () => {
    await assertSucceeds(getDoc(doc(dbAs('operacional-a'), 'whatsapp_campaign_rules/rule-a')))
    await assertFails(setDoc(doc(dbAs('operacional-a'), 'whatsapp_campaign_rules/forjada'), {
      tenantId: 'tenant-a',
      etapa: 'x',
      ativo: true,
    }))
  })

  it('nfse_erros: le do proprio tenant, escrita direta bloqueada e isolamento', async () => {
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'nfse_erros/erro-a')))
    await assertFails(getDoc(doc(dbAs('operacional-b'), 'nfse_erros/erro-a')))
    await assertFails(setDoc(doc(dbAs('fiscal-a'), 'nfse_erros/forjado'), {
      tenantId: 'tenant-a',
      erro: 'x',
    }))
  })

  // ─── usuarios/list: permitido p/ usuario ativo (isolamento single-tenant) ────

  it('usuarios/list: usuario ativo lista; nao autenticado nao', async () => {
    await assertSucceeds(getDocs(collection(dbAs('operacional-a'), 'usuarios')))
    await assertFails(getDocs(collection(testEnv.unauthenticatedContext().firestore(), 'usuarios')))
  })
})
