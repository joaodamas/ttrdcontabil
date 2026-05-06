// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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
})
