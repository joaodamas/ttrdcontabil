// @vitest-environment node
// storage.rules no emulador do Storage. As regras consultam o Firestore
// (usuarios/{uid}, clientes/{id}) — por isso o emulador do Firestore também
// precisa estar no ar (`--only firestore,storage`).
//
// ARMADILHA: o emulador do Storage resolve firestore.get() no projeto com que
// os emuladores subiram (--project), não no projectId do teste. Por isso esta
// suite usa o MESMO projeto de firestore.rules.test.ts — e, como aquela suite
// limpa o Firestore a cada teste, os arquivos de regras rodam em sequência
// quando o emulador do Storage está no ar (fileParallelism em vitest.config.ts).
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, getMetadata, ref, uploadString } from 'firebase/storage'

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'ttrdcontabil-rules-test'

let testEnv: RulesTestEnvironment
const comEmuladores = process.env.FIREBASE_STORAGE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST
const describeIfEmulator = comEmuladores ? describe : describe.skip

const ARQUIVOS = [
  'nfse/cliente-a/2026/nota-1.xml',
  'nfse/cliente-a/2026/nota-1.pdf',
  'nfse/cliente-b/2026/nota-9.xml',
  'certificados/cliente-a/a1.pfx',
  'documentos/cliente-a/contrato.pdf',
  'outros/solto.txt',
]

const storageAs = (uid: string) => testEnv.authenticatedContext(uid).storage()

describeIfEmulator('storage.rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
      storage: { rules: readFileSync('storage.rules', 'utf8') },
    })
    await testEnv.clearFirestore()
    await testEnv.clearStorage()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const usuarios: Record<string, Record<string, unknown>> = {
        'admin-a': { perfil: 'admin', ativo: true, tenantId: 'tenant-a' },
        'fiscal-a': { perfil: 'fiscal', ativo: true, tenantId: 'tenant-a' },
        'financeiro-a': { perfil: 'financeiro', ativo: true, tenantId: 'tenant-a' },
        'operacional-a': { perfil: 'operacional', ativo: true, tenantId: 'tenant-a' },
        'leitura-a': { perfil: 'leitura', ativo: true, tenantId: 'tenant-a' },
        'operacional-telas-fiscal': { perfil: 'operacional', ativo: true, tenantId: 'tenant-a', telas: ['hoje', 'clientes', 'fiscal'] },
        'fiscal-inativo': { perfil: 'fiscal', ativo: false, tenantId: 'tenant-a' },
        'fiscal-b': { perfil: 'fiscal', ativo: true, tenantId: 'tenant-b' },
      }
      for (const [uid, dados] of Object.entries(usuarios)) await setDoc(doc(db, `usuarios/${uid}`), dados)
      await setDoc(doc(db, 'clientes/cliente-a'), { tenantId: 'tenant-a', razaoSocial: 'Cliente A' })
      await setDoc(doc(db, 'clientes/cliente-b'), { tenantId: 'tenant-b', razaoSocial: 'Cliente B' })

      const storage = ctx.storage()
      for (const caminho of ARQUIVOS) await uploadString(ref(storage, caminho), 'conteudo')
    })
  })

  afterAll(async () => {
    await testEnv?.cleanup()
  })

  // ─── nfse/{clienteId}/** ──────────────────────────────────────────────────

  it('nfse/: admin, fiscal e financeiro do tenant do cliente leem XML e PDF', async () => {
    for (const uid of ['admin-a', 'fiscal-a', 'financeiro-a']) {
      await assertSucceeds(getMetadata(ref(storageAs(uid), 'nfse/cliente-a/2026/nota-1.xml')))
      await assertSucceeds(getBytes(ref(storageAs(uid), 'nfse/cliente-a/2026/nota-1.pdf')))
    }
  })

  it('nfse/: tela fiscal concedida também lê; operacional e leitura sem a tela não', async () => {
    await assertSucceeds(getMetadata(ref(storageAs('operacional-telas-fiscal'), 'nfse/cliente-a/2026/nota-1.xml')))
    await assertFails(getMetadata(ref(storageAs('operacional-a'), 'nfse/cliente-a/2026/nota-1.xml')))
    await assertFails(getBytes(ref(storageAs('leitura-a'), 'nfse/cliente-a/2026/nota-1.pdf')))
  })

  it('nfse/: isolamento por tenant, usuário inativo e anônimo', async () => {
    await assertFails(getMetadata(ref(storageAs('fiscal-a'), 'nfse/cliente-b/2026/nota-9.xml')))
    await assertFails(getMetadata(ref(storageAs('fiscal-b'), 'nfse/cliente-a/2026/nota-1.xml')))
    await assertFails(getMetadata(ref(storageAs('fiscal-inativo'), 'nfse/cliente-a/2026/nota-1.xml')))
    await assertFails(getMetadata(ref(storageAs('sem-perfil'), 'nfse/cliente-a/2026/nota-1.xml')))
    await assertFails(getMetadata(ref(testEnv.unauthenticatedContext().storage(), 'nfse/cliente-a/2026/nota-1.xml')))
  })

  it('nfse/: cliente inexistente não abre por caminho', async () => {
    await assertFails(getMetadata(ref(storageAs('admin-a'), 'nfse/cliente-x/2026/nota.xml')))
  })

  it('nfse/: ninguém grava nem apaga pelo navegador (só as Cloud Functions)', async () => {
    for (const uid of ['admin-a', 'fiscal-a']) {
      await assertFails(uploadString(ref(storageAs(uid), `nfse/cliente-a/2026/forjada-${uid}.xml`), '<x/>'))
      await assertFails(uploadString(ref(storageAs(uid), 'nfse/cliente-a/2026/nota-1.xml'), 'trocado'))
      await assertFails(deleteObject(ref(storageAs(uid), 'nfse/cliente-a/2026/nota-1.pdf')))
    }
  })

  // ─── certificados/{clienteId}/** ──────────────────────────────────────────

  it('certificados/: o .pfx não é lido nem gravado por ninguém pelo navegador, nem admin/fiscal', async () => {
    for (const uid of ['admin-a', 'fiscal-a', 'financeiro-a']) {
      await assertFails(getMetadata(ref(storageAs(uid), 'certificados/cliente-a/a1.pfx')))
      await assertFails(getBytes(ref(storageAs(uid), 'certificados/cliente-a/a1.pfx')))
      await assertFails(uploadString(ref(storageAs(uid), 'certificados/cliente-a/novo.pfx'), 'pfx'))
      await assertFails(deleteObject(ref(storageAs(uid), 'certificados/cliente-a/a1.pfx')))
    }
    await assertFails(getMetadata(ref(testEnv.unauthenticatedContext().storage(), 'certificados/cliente-a/a1.pfx')))
  })

  // ─── resto: trancado ──────────────────────────────────────────────────────

  it('documentos/ e qualquer outro caminho: trancados', async () => {
    for (const caminho of ['documentos/cliente-a/contrato.pdf', 'outros/solto.txt']) {
      await assertFails(getMetadata(ref(storageAs('admin-a'), caminho)))
      await assertFails(uploadString(ref(storageAs('admin-a'), caminho), 'x'))
    }
  })
})
