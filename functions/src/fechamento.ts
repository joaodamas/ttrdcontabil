import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireEnvironmentTenant } from './tenant'
import { writeAuditLog } from './audit'

const db = () => admin.firestore()

type GerarFechamentoInput = {
  mes: number
  ano: number
  regime?: string
}

async function assertOperacional(uid: string) {
  const snap = await db().collection('usuarios').doc(uid).get()
  if (!snap.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  const usuario = snap.data() ?? {}
  if (usuario.ativo === false) throw new HttpsError('permission-denied', 'Usuário inativo.')
  const perfil = usuario.perfil as string | undefined
  if (!['admin', 'operacional'].includes(perfil ?? '')) {
    throw new HttpsError('permission-denied', 'Perfil sem permissão para gerar fechamento.')
  }
  return {
    id: uid,
    nome: (usuario.nome as string | undefined) ?? uid,
    tenantId: requireEnvironmentTenant(usuario.tenantId, 'Usuário'),
  }
}

function validateInput(data: unknown): GerarFechamentoInput {
  const input = data as Partial<GerarFechamentoInput>
  const mes = Number(input.mes)
  const ano = Number(input.ano)
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new HttpsError('invalid-argument', 'Mês inválido para geração de fechamento.')
  }
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    throw new HttpsError('invalid-argument', 'Ano inválido para geração de fechamento.')
  }
  return { mes, ano, regime: input.regime || undefined }
}

export const gerarFechamentoMensal = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 300, memory: '512MiB', invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const input = validateInput(request.data)
    const usuario = await assertOperacional(request.auth.uid)

    const clientesQuery = db()
      .collection('clientes')
      .where('status', '==', 'ativo')
      .where('tenantId', '==', usuario.tenantId)

    const clientesSnap = await clientesQuery.get()
    if (clientesSnap.empty) {
      return { criados: 0, ignorados: 0, totalClientes: 0 }
    }

    let criados = 0
    let ignorados = 0
    let batch = db().batch()
    let ops = 0
    const now = Timestamp.now()

    for (const clienteDoc of clientesSnap.docs) {
      const cliente = clienteDoc.data()
      if (cliente.tenantId !== usuario.tenantId) {
        ignorados++
        continue
      }
      if (input.regime && cliente.regimeTributario !== input.regime) {
        ignorados++
        continue
      }

      const tenantId = usuario.tenantId
      const docId = `${tenantId}_${input.ano}_${String(input.mes).padStart(2, '0')}_${clienteDoc.id}`
      const ref = db().collection('fechamentos').doc(docId)
      const existing = await ref.get()
      if (existing.exists) {
        ignorados++
        continue
      }

      batch.set(ref, {
        tenantId,
        clienteId: clienteDoc.id,
        clienteNome: cliente.razaoSocial ?? '',
        clienteCodigo: cliente.codigo ?? 0,
        mes: input.mes,
        ano: input.ano,
        regime: cliente.regimeTributario ?? 'simples_nacional',
        responsavel: cliente.responsavelNome ?? '',
        portalUrl: cliente.portalUrl ?? null,
        formaEntrega: cliente.formaEntrega ?? null,
        dasStatus: 'pendente',
        esocialStatus: 'na',
        reinfStatus: 'na',
        fgtsStatus: 'na',
        criadoEm: now,
        atualizadoEm: now,
        criadoPorId: usuario.id,
        criadoPorNome: usuario.nome,
      })

      const eventRef = db().collection('events').doc()
      batch.set(eventRef, {
        tenantId,
        clienteId: clienteDoc.id,
        tipo: 'fechamento',
        titulo: `Fechamento gerado - ${String(input.mes).padStart(2, '0')}/${input.ano}`,
        descricao: `Fechamento mensal criado para ${cliente.razaoSocial ?? clienteDoc.id}.`,
        origemColecao: 'fechamentos',
        origemId: docId,
        actorId: usuario.id,
        actorNome: usuario.nome,
        metadata: {
          severidade: 'media',
          href: `/fechamento?mes=${input.mes}&ano=${input.ano}`,
          mes: input.mes,
          ano: input.ano,
        },
        criadoEm: now,
      })
      criados++
      ops += 2

      if (ops >= 400) {
        await batch.commit()
        batch = db().batch()
        ops = 0
      }
    }

    if (ops > 0) await batch.commit()

    await writeAuditLog({
      tenantId: usuario.tenantId,
      actor: { id: usuario.id, nome: usuario.nome },
      entidade: 'fechamentos',
      entidadeId: `${input.ano}_${String(input.mes).padStart(2, '0')}`,
      acao: 'batch_create',
      dadosAntes: null,
      dadosDepois: {
        mes: input.mes,
        ano: input.ano,
        regime: input.regime ?? null,
        criados,
        ignorados,
        totalClientes: clientesSnap.size,
      },
      origem: 'cloud_function',
    })

    return { criados, ignorados, totalClientes: clientesSnap.size }
  }
)
