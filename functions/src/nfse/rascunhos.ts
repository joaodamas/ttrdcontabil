import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { Timestamp } from 'firebase-admin/firestore'
import { requireEnvironmentTenant } from '../tenant'

const db = () => admin.firestore()

type GerarRascunhosInput = {
  mes?: number
  ano?: number
  clienteId?: string
  gerarAteHoje?: boolean
}

async function assertCanGenerate(uid: string) {
  const userDoc = await db().collection('usuarios').doc(uid).get()
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  const user = userDoc.data() ?? {}
  if (user.ativo === false) throw new HttpsError('permission-denied', 'Usuário inativo.')
  const perfil = user.perfil as string | undefined
  if (!perfil || !['admin', 'fiscal'].includes(perfil)) {
    throw new HttpsError('permission-denied', 'Perfil sem permissão para gerar rascunhos NFS-e.')
  }
  return {
    uid,
    nome: (user.nome as string | undefined) ?? uid,
    perfil,
    tenantId: requireEnvironmentTenant(user.tenantId, 'Usuário'),
  }
}

function clampDay(ano: number, mes: number, dia: number) {
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return Math.min(Math.max(1, dia), ultimoDia)
}

function competenciaLabel(mes: number, ano: number) {
  return `${String(mes).padStart(2, '0')}/${ano}`
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

export const gerarRascunhosNfseMensais = onCall(
  {
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const actor = await assertCanGenerate(request.auth.uid)

    const input = (request.data ?? {}) as GerarRascunhosInput
    const hoje = new Date()
    const mes = Number(input.mes ?? hoje.getMonth() + 1)
    const ano = Number(input.ano ?? hoje.getFullYear())
    const gerarAteHoje = input.gerarAteHoje !== false

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new HttpsError('invalid-argument', 'Mês inválido.')
    }
    if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
      throw new HttpsError('invalid-argument', 'Ano inválido.')
    }

    const clientesSnap = input.clienteId
      ? {
        docs: [await db().collection('clientes').doc(input.clienteId).get()]
          .filter((doc) => doc.exists && doc.data()?.tenantId === actor.tenantId),
      }
      : await db()
        .collection('clientes')
        .where('status', '==', 'ativo')
        .where('tenantId', '==', actor.tenantId)
        .get()

    if (clientesSnap.docs.length === 0) {
      return { criados: 0, ignorados: 0, pendentesRevisao: 0, motivos: ['Nenhum cliente ativo encontrado.'] }
    }

    const fiscalSnap = await db()
      .collection('clientes_fiscal')
      .where('tenantId', '==', actor.tenantId)
      .get()
      .catch(() => null)
    const fiscalByCliente = new Map<string, FirebaseFirestore.DocumentData>()
    fiscalSnap?.docs.forEach((doc) => fiscalByCliente.set(doc.data().clienteId as string, doc.data()))

    const servicosSnap = await db()
      .collection('clientes_servicos')
      .where('tenantId', '==', actor.tenantId)
      .where('status', '==', 'ativo')
      .get()
    const servicosByCliente = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>()
    servicosSnap.docs.forEach((doc) => {
      const clienteId = doc.data().clienteId as string | undefined
      if (!clienteId) return
      if (!servicosByCliente.has(clienteId)) servicosByCliente.set(clienteId, [])
      servicosByCliente.get(clienteId)!.push(doc)
    })
    const existentesSnap = await db()
      .collection('nfse_rascunhos')
      .where('tenantId', '==', actor.tenantId)
      .where('competenciaMes', '==', mes)
      .where('competenciaAno', '==', ano)
      .get()
      .catch(() => null)
    const existentes = new Set((existentesSnap?.docs ?? []).map((doc) => doc.id))

    let batch = db().batch()
    let ops = 0
    let criados = 0
    let ignorados = 0
    const motivos: string[] = []
    const comp = competenciaLabel(mes, ano)

    for (const clienteDoc of clientesSnap.docs) {
      const cliente = clienteDoc.data() ?? {}
      const clienteId = clienteDoc.id
      const diaEmissao = Number(cliente.diaEmissaoNFSe)

      if (!Number.isInteger(diaEmissao) || diaEmissao < 1 || diaEmissao > 31) {
        ignorados++
        motivos.push(`${cliente.razaoSocial ?? clienteId}: sem dia de emissão NFS-e.`)
        continue
      }
      if (gerarAteHoje && ano === hoje.getFullYear() && mes === hoje.getMonth() + 1 && diaEmissao > hoje.getDate()) {
        ignorados++
        continue
      }

      const fiscal = fiscalByCliente.get(clienteId)
      if (!fiscal) {
        ignorados++
        motivos.push(`${cliente.razaoSocial ?? clienteId}: sem configuração fiscal.`)
        continue
      }

      const servicos = servicosByCliente.get(clienteId) ?? []
      if (servicos.length === 0) {
        ignorados++
        motivos.push(`${cliente.razaoSocial ?? clienteId}: sem serviço contratado ativo.`)
        continue
      }

      const codigoServico = fiscal.codigoServicoPadrao ?? fiscal.itemListaServico
      if (!hasText(codigoServico) || !hasText(fiscal.itemListaServico) || !Number.isFinite(Number(fiscal.aliquotaPadrao))) {
        ignorados++
        motivos.push(`${cliente.razaoSocial ?? clienteId}: configuração fiscal sem código/item/alíquota padrão.`)
        continue
      }

      for (const servicoDoc of servicos) {
        const servico = servicoDoc.data()
        const valor = Number(servico.valor ?? servico.valorPadrao ?? 0)
        if (!Number.isFinite(valor) || valor <= 0) {
          ignorados++
          motivos.push(`${cliente.razaoSocial ?? clienteId}: serviço ${servicoDoc.id} sem valor positivo.`)
          continue
        }

        const ref = db().collection('nfse_rascunhos').doc(`${actor.tenantId}_${ano}_${String(mes).padStart(2, '0')}_${clienteId}_${servicoDoc.id}`)
        if (existentes.has(ref.id)) {
          ignorados++
          continue
        }
        const dataEmissaoPrevista = new Date(ano, mes - 1, clampDay(ano, mes, diaEmissao), 12, 0, 0)
        batch.set(ref, {
          tenantId: actor.tenantId,
          clienteId,
          clienteNome: cliente.razaoSocial ?? cliente.nomeFantasia ?? clienteId,
          competencia: comp,
          competenciaMes: mes,
          competenciaAno: ano,
          clienteServicoId: servicoDoc.id,
          titulo: `NFS-e ${comp} - ${cliente.razaoSocial ?? clienteId}`,
          status: 'rascunho',
          origem: 'nfse_recorrente',
          requerRevisao: true,
          dataEmissaoPrevista: Timestamp.fromDate(dataEmissaoPrevista),
          dados: {
            tomadorNome: cliente.razaoSocial ?? cliente.nomeFantasia ?? '',
            tomadorCpfCnpj: onlyDigits(cliente.cpfCnpj),
            tomadorEmail: cliente.email ?? null,
            descricaoServico: fiscal.descricaoServicoPadrao ?? servico.descricaoServico ?? servico.servicoNome ?? servico.nomeServico ?? 'Serviços prestados',
            codigoServico,
            itemListaServico: fiscal.itemListaServico,
            cnae: fiscal.cnae ?? null,
            valorServico: valor,
            aliquota: Number(fiscal.aliquotaPadrao),
            issRetido: Boolean(fiscal.issRetidoPadrao ?? false),
          },
          criadoEm: Timestamp.now(),
          atualizadoEm: Timestamp.now(),
          criadoPor: actor.uid,
          criadoPorNome: actor.nome,
        }, { merge: false })
        criados++
        ops++

        if (ops >= 400) {
          await batch.commit()
          batch = db().batch()
          ops = 0
        }
      }
    }

    if (ops > 0) await batch.commit()

    await db().collection('logs_auditoria').add({
      tenantId: actor.tenantId,
      atorId: actor.uid,
      atorNome: actor.nome,
      acao: 'gerar_rascunhos_nfse_mensais',
      entidade: 'nfse_rascunhos',
      data: Timestamp.now(),
      detalhes: { mes, ano, criados, ignorados, motivos: motivos.slice(0, 50) },
      origem: 'cloud_function',
    })

    return {
      criados,
      ignorados,
      pendentesRevisao: criados,
      motivos: motivos.slice(0, 20),
    }
  }
)
