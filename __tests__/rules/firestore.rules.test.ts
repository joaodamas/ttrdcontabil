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
    // [P1] Perfil 'operacional' com override de `telas` concedendo acesso a telas
    // fora do default do perfil (via usuario-form) — usado para testar hasTela().
    await setDoc(doc(db, 'usuarios/operacional-telas-financeiro'), {
      perfil: 'operacional',
      ativo: true,
      tenantId: 'tenant-a',
      telas: ['hoje', 'clientes', 'tarefas', 'competencias', 'fechamento', 'financeiro'],
    })
    await setDoc(doc(db, 'usuarios/operacional-telas-fiscal'), {
      perfil: 'operacional',
      ativo: true,
      tenantId: 'tenant-a',
      telas: ['hoje', 'clientes', 'tarefas', 'competencias', 'fechamento', 'fiscal'],
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
    // [P0-1] Seeds dedicados para testar leitura gated por perfil (ids distintos
    // dos usados em testes de escrita, para não colidir com setDoc/assertFails
    // que já exercitam create/update nestas mesmas coleções).
    await setDoc(doc(db, 'lancamentos/lanc-seed'), {
      tenantId: 'tenant-a',
      tipo: 'receita',
      status: 'pendente',
      valor: 100,
    })
    await setDoc(doc(db, 'ir_declaracoes/ir-seed'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      status: 'pendente',
    })
    await setDoc(doc(db, 'nfse_rascunhos/rascunho-seed'), {
      tenantId: 'tenant-a',
      status: 'aguardando_emissao',
      clienteId: 'cliente-a',
    })
    await setDoc(doc(db, 'nfse_emitidas/nfse-seed'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      status: 'emitida',
    })
    await setDoc(doc(db, 'fechamentos/fechamento-seed'), {
      tenantId: 'tenant-a',
      competenciaId: 'comp-a',
      status: 'aberto',
    })
    // [P1] Seeds das coleções fiscais irmãs (Tarefa 2).
    await setDoc(doc(db, 'ir_checklist/checklist-seed'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      item: 'documentos_pendentes',
    })
    await setDoc(doc(db, 'clientes_fiscal/cf-seed'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      regime: 'simples_nacional',
    })
    await setDoc(doc(db, 'clientes_fiscal_integracao/cfi-seed'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      provedor: 'x',
    })
    // [P1] Fechamento de julho/2026 travado por revisão encerrada, e um segundo
    // mês (agosto/2026) sem revisão registrada — usados para testar o enforcement
    // server-side da trava mensal (mesFechamentoTravado) e a reabertura restrita
    // a admin (revisaoReabrindo) na Tarefa 3.
    await setDoc(doc(db, 'fechamento_revisoes/2026_07'), {
      tenantId: 'tenant-a',
      ano: 2026,
      mes: 7,
      travado: true,
    })
    await setDoc(doc(db, 'fechamentos/fechamento-travado'), {
      tenantId: 'tenant-a',
      ano: 2026,
      mes: 7,
      clienteId: 'cliente-a',
      dasStatus: 'pendente',
    })
    await setDoc(doc(db, 'fechamentos/fechamento-aberto'), {
      tenantId: 'tenant-a',
      ano: 2026,
      mes: 8,
      clienteId: 'cliente-a',
      dasStatus: 'pendente',
    })
    // [Matriz de transição] competencias/tarefas em cada estado, usadas para
    // testar competenciaTransicaoPermitida()/tarefaTransicaoPermitida().
    await setDoc(doc(db, 'competencias/comp-aberta'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      mes: 1,
      ano: 2026,
      status: 'aberta',
    })
    await setDoc(doc(db, 'competencias/comp-concluida'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      mes: 2,
      ano: 2026,
      status: 'concluida',
    })
    await setDoc(doc(db, 'competencias/comp-cancelada'), {
      tenantId: 'tenant-a',
      clienteId: 'cliente-a',
      mes: 3,
      ano: 2026,
      status: 'cancelada',
    })
    await setDoc(doc(db, 'tarefas/tarefa-pendente'), {
      tenantId: 'tenant-a',
      titulo: 'Tarefa pendente',
      prioridade: 'normal',
      status: 'pendente',
    })
    await setDoc(doc(db, 'tarefas/tarefa-concluida'), {
      tenantId: 'tenant-a',
      titulo: 'Tarefa concluida',
      prioridade: 'normal',
      status: 'concluida',
      responsavelId: 'operacional-a',
    })
    await setDoc(doc(db, 'tarefas/tarefa-cancelada'), {
      tenantId: 'tenant-a',
      titulo: 'Tarefa cancelada',
      prioridade: 'normal',
      status: 'cancelada',
      responsavelId: 'operacional-a',
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

  // ─── P0-1: leitura de colecoes sensiveis restrita por perfil (nao so por tenant) ──

  it('lancamentos: leitura restrita a admin/financeiro', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'lancamentos/lanc-seed')))
    await assertSucceeds(getDoc(doc(dbAs('financeiro-a'), 'lancamentos/lanc-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'lancamentos/lanc-seed')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'lancamentos/lanc-seed')))
    await assertFails(getDoc(doc(dbAs('fiscal-a'), 'lancamentos/lanc-seed')))
  })

  it('ir_declaracoes: leitura restrita a admin/fiscal', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'ir_declaracoes/ir-seed')))
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'ir_declaracoes/ir-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'ir_declaracoes/ir-seed')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'ir_declaracoes/ir-seed')))
    await assertFails(getDoc(doc(dbAs('financeiro-a'), 'ir_declaracoes/ir-seed')))
  })

  it('nfse_rascunhos: leitura restrita a admin/fiscal/financeiro', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'nfse_rascunhos/rascunho-seed')))
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'nfse_rascunhos/rascunho-seed')))
    await assertSucceeds(getDoc(doc(dbAs('financeiro-a'), 'nfse_rascunhos/rascunho-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'nfse_rascunhos/rascunho-seed')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'nfse_rascunhos/rascunho-seed')))
  })

  it('nfse_emitidas: leitura restrita a admin/fiscal/financeiro', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'nfse_emitidas/nfse-seed')))
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'nfse_emitidas/nfse-seed')))
    await assertSucceeds(getDoc(doc(dbAs('financeiro-a'), 'nfse_emitidas/nfse-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'nfse_emitidas/nfse-seed')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'nfse_emitidas/nfse-seed')))
  })

  it('nfse_erros: leitura restrita a admin/fiscal/financeiro (perfil errado, mesmo tenant)', async () => {
    await assertSucceeds(getDoc(doc(dbAs('financeiro-a'), 'nfse_erros/erro-a')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'nfse_erros/erro-a')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'nfse_erros/erro-a')))
  })

  it('fechamentos: leitura restrita a admin/operacional/fiscal', async () => {
    await assertSucceeds(getDoc(doc(dbAs('admin-a'), 'fechamentos/fechamento-seed')))
    await assertSucceeds(getDoc(doc(dbAs('operacional-a'), 'fechamentos/fechamento-seed')))
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'fechamentos/fechamento-seed')))
    await assertFails(getDoc(doc(dbAs('financeiro-a'), 'fechamentos/fechamento-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'fechamentos/fechamento-seed')))
  })

  // ─── P1 (Tarefa 1): override de tela (hasTela) nao pode travar quem tem a tela ──

  it('lancamentos: operacional com override de tela financeiro le; sem override, nao', async () => {
    await assertSucceeds(getDoc(doc(dbAs('operacional-telas-financeiro'), 'lancamentos/lanc-seed')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'lancamentos/lanc-seed')))
  })

  it('nfse_rascunhos: operacional com override de tela fiscal le; sem override, nao', async () => {
    await assertSucceeds(getDoc(doc(dbAs('operacional-telas-fiscal'), 'nfse_rascunhos/rascunho-seed')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'nfse_rascunhos/rascunho-seed')))
  })

  // ─── P1 (Tarefa 2): colecoes fiscais irma que ficaram com canRead() ──────────

  it('ir_checklist: leitura restrita a admin/fiscal, negada para leitura', async () => {
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'ir_checklist/checklist-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'ir_checklist/checklist-seed')))
    await assertFails(getDoc(doc(dbAs('operacional-a'), 'ir_checklist/checklist-seed')))
  })

  it('clientes_fiscal: leitura restrita a admin/fiscal, negada para leitura', async () => {
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'clientes_fiscal/cf-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'clientes_fiscal/cf-seed')))
  })

  it('clientes_fiscal_integracao: leitura restrita a admin/fiscal, negada para leitura', async () => {
    await assertSucceeds(getDoc(doc(dbAs('fiscal-a'), 'clientes_fiscal_integracao/cfi-seed')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'clientes_fiscal_integracao/cfi-seed')))
  })

  it('fechamento_revisoes: leitura restrita a admin/operacional/fiscal, negada para leitura/financeiro', async () => {
    await assertSucceeds(getDoc(doc(dbAs('operacional-a'), 'fechamento_revisoes/2026_07')))
    await assertFails(getDoc(doc(dbAs('leitura-a'), 'fechamento_revisoes/2026_07')))
    await assertFails(getDoc(doc(dbAs('financeiro-a'), 'fechamento_revisoes/2026_07')))
  })

  // ─── P1 (Tarefa 3): trava mensal do fechamento — enforcement server-side ────

  it('fechamento_revisoes: reabertura (travado:false) exige admin', async () => {
    await assertFails(updateDoc(doc(dbAs('operacional-a'), 'fechamento_revisoes/2026_07'), { travado: false }))
    await assertFails(updateDoc(doc(dbAs('fiscal-a'), 'fechamento_revisoes/2026_07'), { travado: false }))
    await assertSucceeds(updateDoc(doc(dbAs('admin-a'), 'fechamento_revisoes/2026_07'), { travado: false }))
  })

  it('fechamento_revisoes: encerrar revisao (travado:true) permitido para operacional e fiscal', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('operacional-a'), 'fechamento_revisoes/2026_07'), {
      travado: true,
      nota: 'revisado por operacional',
    }))
    await assertSucceeds(updateDoc(doc(dbAs('fiscal-a'), 'fechamento_revisoes/2026_07'), {
      travado: true,
      nota: 'revisado por fiscal',
    }))
  })

  it('fechamentos: update bloqueado no mes travado; liberado em mes sem revisao', async () => {
    await assertFails(updateDoc(doc(dbAs('operacional-a'), 'fechamentos/fechamento-travado'), { dasStatus: 'ok' }))
    await assertSucceeds(updateDoc(doc(dbAs('operacional-a'), 'fechamentos/fechamento-aberto'), { dasStatus: 'ok' }))
  })

  // ─── Matriz de transição de status: competencias e tarefas ──────────────────
  // Espelha src/lib/status-transitions.ts — ver competenciaTransicaoPermitida()
  // e tarefaTransicaoPermitida() em firestore.rules.

  it('competencias: fluxo normal (aberta -> em_andamento -> concluida/cancelada) livre para operacional', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('operacional-a'), 'competencias/comp-aberta'), { status: 'em_andamento' }))
    await assertSucceeds(updateDoc(doc(dbAs('operacional-a'), 'competencias/comp-aberta'), { status: 'concluida' }))
  })

  it('competencias: reabrir concluida bloqueado para nao-admin, permitido para admin', async () => {
    await assertFails(updateDoc(doc(dbAs('operacional-a'), 'competencias/comp-concluida'), { status: 'em_andamento' }))
    // operacional-telas-fiscal também é perfil 'operacional' (isOperacional() == true)
    // — usado para garantir que a restrição é especificamente "precisa ser admin",
    // não apenas "não é o perfil certo para editar a coleção".
    await assertFails(updateDoc(doc(dbAs('operacional-telas-fiscal'), 'competencias/comp-concluida'), { status: 'aberta' }))
    await assertSucceeds(updateDoc(doc(dbAs('admin-a'), 'competencias/comp-concluida'), { status: 'em_andamento' }))
  })

  it('competencias: salvar outros campos sem trocar status nao exige admin', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('operacional-a'), 'competencias/comp-concluida'), {
      status: 'concluida',
      observacoes: 'nota qualquer',
    }))
  })

  it('competencias: ressuscitar cancelada exige admin, e nunca direto para concluida', async () => {
    await assertFails(updateDoc(doc(dbAs('operacional-a'), 'competencias/comp-cancelada'), { status: 'aberta' }))
    // Mesmo admin não pode pular direto de 'cancelada' para 'concluida' — precisa
    // reabrir primeiro. Verificado antes da próxima asserção mudar o doc de fato.
    await assertFails(updateDoc(doc(dbAs('admin-a'), 'competencias/comp-cancelada'), { status: 'concluida' }))
    await assertSucceeds(updateDoc(doc(dbAs('admin-a'), 'competencias/comp-cancelada'), { status: 'aberta' }))
  })

  it('tarefas: fluxo normal (pendente -> em_andamento/concluida) livre para operacional', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('operacional-a'), 'tarefas/tarefa-pendente'), { status: 'em_andamento' }))
    await assertSucceeds(updateDoc(doc(dbAs('admin-a'), 'tarefas/tarefa-pendente'), { status: 'concluida' }))
  })

  it('tarefas: reabrir concluida bloqueada para quem nao e admin nem responsavel', async () => {
    // operacional-telas-financeiro é perfil 'operacional' (isOperacional() == true)
    // mas não é admin nem o responsável ('operacional-a') pela tarefa.
    await assertFails(updateDoc(doc(dbAs('operacional-telas-financeiro'), 'tarefas/tarefa-concluida'), { status: 'pendente' }))
  })

  it('tarefas: o responsavel atual pode reabrir a propria tarefa concluida', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('operacional-a'), 'tarefas/tarefa-concluida'), { status: 'pendente' }))
  })

  it('tarefas: admin pode reabrir/ressuscitar tarefa de qualquer responsavel', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('admin-a'), 'tarefas/tarefa-concluida'), { status: 'em_andamento' }))
    await assertSucceeds(updateDoc(doc(dbAs('admin-a'), 'tarefas/tarefa-cancelada'), { status: 'pendente' }))
  })

  it('tarefas: nunca permite ir de cancelada direto para concluida', async () => {
    await assertFails(updateDoc(doc(dbAs('admin-a'), 'tarefas/tarefa-cancelada'), { status: 'concluida' }))
  })
})
