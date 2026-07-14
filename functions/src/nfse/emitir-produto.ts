/**
 * Emissão de NF-e (produto, modelo 55) via Spedy.
 *
 * Mais simples que o NFS-e: não tem RPS (isso é do mundo municipal) e não carrega
 * o certificado A1 local — a Spedy assina do lado dela, com o certificado já
 * carregado na empresa. O conector (SpedyConector.emitirProduto) faz a
 * transmissão; aqui a gente carrega config/cliente, chama, e persiste o resultado.
 *
 * Só via Spedy: os conectores municipais caseiros fazem apenas NFS-e.
 * A tela de emissão (frontend) monta o EmitirProdutoInput a partir do catálogo
 * de produtos + tomador e chama este callable.
 */
import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { Timestamp } from 'firebase-admin/firestore'
import { requireEnvironmentTenant } from '../tenant'
import { writeAuditLog, SYSTEM_ACTOR, type AuditActor } from '../audit'
import { assertCanAccessCliente } from '../authz'
import { credentialSecrets } from './secrets'
import { SpedyConector } from './provedores/spedy'
import type { ConfigFiscalCliente, EmitirProdutoInput, Prestador } from './types'

const db = () => admin.firestore()

async function getConfigFiscal(clienteId: string): Promise<ConfigFiscalCliente> {
  const snap = await db().collection('clientes_fiscal').where('clienteId', '==', clienteId).limit(1).get()
  if (snap.empty) {
    throw new HttpsError('not-found', 'Configuração fiscal do cliente não encontrada. Configure em Clientes → Fiscal.')
  }
  const data = snap.docs[0].data()
  return { clienteId, ...data, tenantId: requireEnvironmentTenant(data.tenantId, 'Configuração fiscal') } as ConfigFiscalCliente
}

async function getCliente(clienteId: string): Promise<Record<string, unknown>> {
  const doc = await db().collection('clientes').doc(clienteId).get()
  if (!doc.exists) throw new HttpsError('not-found', 'Cliente não encontrado.')
  return { id: doc.id, ...doc.data() }
}

export async function processarEmissaoProduto(input: EmitirProdutoInput, uid: string) {
  const [config, cliente] = await Promise.all([getConfigFiscal(input.clienteId), getCliente(input.clienteId)])
  const tenantId = requireEnvironmentTenant(config.tenantId, 'Configuração fiscal')
  const actor: AuditActor = {
    id: uid,
    nome: uid === SYSTEM_ACTOR.id ? 'Sistema' : 'Usuário autenticado',
    email: null,
  }

  if (config.provedorNfse !== 'spedy') {
    throw new HttpsError('failed-precondition', 'Emissão de NF-e (produto) exige o provedor Spedy configurado para este cliente.')
  }
  if (!config.credenciais?.spedyApiKey) {
    throw new HttpsError('failed-precondition', 'Chave da Spedy não configurada para este cliente. Configure em Clientes → Fiscal.')
  }
  if (!input.itens?.length) {
    throw new HttpsError('invalid-argument', 'Informe ao menos um item para a NF-e.')
  }
  // Trava de segurança: produção só com a config liberada (evita nota real sem querer).
  if (config.ambienteEmissao === 'producao' && !config.producaoLiberada) {
    throw new HttpsError('failed-precondition', 'Emissão em produção ainda não liberada para este cliente. Valide em homologação primeiro.')
  }

  const prestador: Prestador = {
    cnpj: String(cliente.cpfCnpj ?? '').replace(/\D/g, ''),
    inscricaoMunicipal: config.inscricaoMunicipal ?? '',
    razaoSocial: (cliente.razaoSocial as string) ?? '',
    municipioIbge: config.municipioIbge ?? '',
  }

  const resultado = await new SpedyConector().emitirProduto(input, config, prestador)
  const now = Timestamp.now()
  const valorTotal = Number(
    input.itens.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0), 0).toFixed(2),
  )

  if (resultado.sucesso) {
    const ref = await db().collection('nfse_emitidas').add({
      tenantId,
      tipoDocumento: 'nfe',
      clienteId: input.clienteId,
      clienteNome: (cliente.razaoSocial as string) ?? '',
      tomadorNome: input.tomador?.razaoSocial ?? null,
      tomadorCpfCnpj: input.tomador?.cpfCnpj ?? null,
      naturezaOperacao: input.naturezaOperacao,
      itens: input.itens,
      valorTotal,
      numeroNfse: resultado.numeroNfse ?? null,
      codigoVerificacao: resultado.codigoVerificacao ?? null,
      status: 'emitida',
      tentativas: 1,
      dataEmissao: now,
      criadoEm: now,
      criadoPorId: uid,
      origemEmissao: uid === SYSTEM_ACTOR.id ? 'automatica' : 'manual',
      ambienteEmissao: config.ambienteEmissao,
    })
    await writeAuditLog({
      tenantId,
      actor,
      entidade: 'nfse_emitidas',
      entidadeId: ref.id,
      acao: 'emitir_nfe_produto',
      dadosDepois: { clienteId: input.clienteId, valorTotal, numeroNfse: resultado.numeroNfse ?? null },
      origem: 'cloud_function',
    })
    return { sucesso: true, id: ref.id, numeroNfse: resultado.numeroNfse ?? null }
  }

  const erroRef = await db().collection('nfse_erros').add({
    tenantId,
    tipoDocumento: 'nfe',
    clienteId: input.clienteId,
    clienteNome: (cliente.razaoSocial as string) ?? '',
    naturezaOperacao: input.naturezaOperacao,
    valorTotal,
    codigoErro: resultado.codigoErro ?? null,
    erro: resultado.erro ?? 'Erro desconhecido na emissão.',
    detalhes: resultado.detalhes ?? null,
    status: 'erro_integracao',
    criadoEm: now,
    criadoPorId: uid,
    ambienteEmissao: config.ambienteEmissao,
  })
  return { sucesso: false, id: erroRef.id, erro: resultado.erro ?? 'Erro na emissão.', codigoErro: resultado.codigoErro ?? null }
}

export const emitirNfeProduto = onCall(
  { region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 120, secrets: credentialSecrets },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const input = (request.data ?? {}) as EmitirProdutoInput
    if (!input.clienteId) throw new HttpsError('invalid-argument', 'clienteId é obrigatório.')
    await assertCanAccessCliente(request.auth.uid, input.clienteId, 'fiscal')
    return processarEmissaoProduto(input, request.auth.uid)
  },
)
