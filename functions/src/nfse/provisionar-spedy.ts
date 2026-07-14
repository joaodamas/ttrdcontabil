/**
 * Provisionamento em massa de empresas na Spedy.
 *
 * A Spedy tem hierarquia Owner → empresas secundárias: com a X-Api-Key da conta
 * principal (Owner), `POST /v1/companies` cria cada empresa e devolve, no
 * response, a X-Api-Key própria daquela empresa. Guardamos essa chave cifrada em
 * clientes_fiscal.credenciais.spedyApiKey e marcamos provedorNfse='spedy'.
 *
 * SEGURANÇA / CUSTO — leia antes de rodar:
 * - dry-run é o PADRÃO: sem `confirmarCriacaoReal: true`, NENHUMA chamada é feita
 *   à Spedy — a function só valida cada cliente e reporta o que falta pra
 *   provisionar (serve como raio-x de prontidão da carteira).
 * - A criação real cria empresas DE VERDADE na conta Spedy — consome o limite do
 *   plano e pode ter custo por empresa. Rode só depois de confirmar limite/custo.
 * - A chave Owner vem do Secret Manager (SPEDY_OWNER_API_KEY), nunca do código.
 * - NÃO sobe o certificado A1 (POST /v1/companies/{id}/certificates fica como
 *   follow-up): a empresa é criada, mas só EMITE depois do certificado carregado.
 */
import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { DEFAULT_TENANT_ID } from '../tenant'
import { defineSecret } from 'firebase-functions/params'
import { writeAuditLog, type AuditActor } from '../audit'
import { encrypt } from './encrypt'
import { CREDENTIAL_KEY_SECRET } from './secrets'

// Declarado aqui (não em secrets.ts) pra que o defineSecret só rode quando esta
// function estiver ATIVA (export em index.ts). Enquanto deferida, o deploy não
// exige o secret SPEDY_OWNER_API_KEY.
const SPEDY_OWNER_API_KEY_SECRET = defineSecret('SPEDY_OWNER_API_KEY')
const spedyOwnerSecrets = [CREDENTIAL_KEY_SECRET, SPEDY_OWNER_API_KEY_SECRET]

const db = () => admin.firestore()

const SPEDY_HOST = {
  producao: 'https://api.spedy.com.br/v1',
  homologacao: 'https://stage-api.spedy.com.br/v1',
} as const
type Ambiente = keyof typeof SPEDY_HOST

type ClienteDoc = Record<string, unknown>
type FiscalDoc = Record<string, unknown>

// regimeTributario interno → taxRegime da Spedy
function mapTaxRegime(regime: unknown): string {
  switch (regime) {
    case 'simples_nacional': return 'simplesNacional'
    case 'mei':              return 'simplesNacionalMEI'
    default:                 return 'regimeNormal' // lucro_presumido, lucro_real, isento
  }
}

function digits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Monta o payload de POST /v1/companies e lista o que falta (se faltar algo). */
function buildCompanyPayload(cliente: ClienteDoc, fiscal: FiscalDoc | null) {
  const cnpj = digits(cliente.cpfCnpj)
  const cep = digits(cliente.cep)
  const faltando: string[] = []
  if (cnpj.length !== 14) faltando.push('CNPJ válido (14 díg.)')
  if (!str(cliente.razaoSocial)) faltando.push('razão social')
  if (!str(cliente.email)) faltando.push('e-mail')
  if (!str(cliente.logradouro) || !str(cliente.numero) || !str(cliente.bairro) || cep.length !== 8) {
    faltando.push('endereço completo (logradouro, número, bairro, CEP)')
  }
  if (!fiscal || !str(fiscal.inscricaoMunicipal)) faltando.push('inscrição municipal (config fiscal)')
  if (!fiscal || !str(fiscal.municipioIbge)) faltando.push('município IBGE (config fiscal)')

  const cnae = digits(fiscal?.cnae)
  const payload = {
    name: str(cliente.nomeFantasia) || str(cliente.razaoSocial),
    legalName: str(cliente.razaoSocial),
    federalTaxNumber: cnpj,
    stateTaxNumber: fiscal ? str(fiscal.inscricaoEstadual) || undefined : undefined,
    cityTaxNumber: fiscal ? str(fiscal.inscricaoMunicipal) || undefined : undefined,
    email: str(cliente.email) || undefined,
    phone: digits(cliente.telefone) || undefined,
    address: {
      street: str(cliente.logradouro),
      number: str(cliente.numero),
      district: str(cliente.bairro),
      postalCode: cep,
      city: {
        code: fiscal ? str(fiscal.municipioIbge) : undefined,
        name: str(cliente.cidade) || undefined,
        state: str(cliente.uf) || undefined,
      },
    },
    taxRegime: mapTaxRegime(fiscal?.regimeTributario),
    economicActivities: cnae ? [{ code: cnae, isMain: true }] : undefined,
  }
  return { payload, faltando }
}

async function getFiscalDoc(clienteId: string) {
  const snap = await db().collection('clientes_fiscal').where('clienteId', '==', clienteId).limit(1).get()
  return snap.empty ? null : snap.docs[0]
}

async function criarEmpresaSpedy(host: string, ownerKey: string, payload: unknown) {
  const resp = await fetch(`${host}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': ownerKey },
    body: JSON.stringify(payload),
  })
  const text = await resp.text()
  let body: Record<string, unknown> | null = null
  try { body = text ? JSON.parse(text) : null } catch { /* resposta não-JSON */ }
  return { ok: resp.ok, status: resp.status, body, text }
}

async function assertAdmin(uid: string): Promise<AuditActor> {
  const snap = await db().collection('usuarios').doc(uid).get()
  if (!snap.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.')
  const data = snap.data() ?? {}
  if (data.ativo === false) throw new HttpsError('permission-denied', 'Usuário inativo.')
  if (data.perfil !== 'admin') {
    throw new HttpsError('permission-denied', 'Provisionamento em massa na Spedy é restrito a administradores.')
  }
  return { id: uid, nome: str(data.nome) || uid, email: str(data.email) || null }
}

type StatusResultado =
  | 'previa_ok'
  | 'criada'
  | 'incompleto'
  | 'ignorada_ja_provisionada'
  | 'erro'

type Resultado = {
  clienteId: string
  razaoSocial: string
  status: StatusResultado
  faltando?: string[]
  detalhe?: string
  spedyCompanyId?: string
  // Preenchido no dry-run: exatamente o corpo que seria enviado à Spedy, pra
  // conferir o mapeamento de campos/regime antes de qualquer criação real.
  payload?: Record<string, unknown>
}

type Input = {
  clienteIds?: string[]
  confirmarCriacaoReal?: boolean
  ambiente?: Ambiente
  limite?: number
}

export const provisionarEmpresasSpedy = onCall(
  { region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 540, secrets: spedyOwnerSecrets },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const actor = await assertAdmin(request.auth.uid)

    const input = (request.data ?? {}) as Input
    const dryRun = input.confirmarCriacaoReal !== true
    const ambiente: Ambiente = input.ambiente === 'homologacao' ? 'homologacao' : 'producao'
    const limite = Math.min(Math.max(Number(input.limite ?? 25), 1), 100)
    const host = SPEDY_HOST[ambiente]
    const ownerKey = process.env.SPEDY_OWNER_API_KEY ?? ''

    if (!dryRun && !ownerKey) {
      throw new HttpsError(
        'failed-precondition',
        'Secret SPEDY_OWNER_API_KEY não configurado. Rode: firebase functions:secrets:set SPEDY_OWNER_API_KEY',
      )
    }

    // Alvos: lista explícita de clienteIds, ou todos os clientes ativos
    // (single-tenant, ~centena de docs — filtragem em memória é segura na escala).
    let clienteDocs: FirebaseFirestore.DocumentSnapshot[] = []
    if (input.clienteIds?.length) {
      const gets = await Promise.all(
        input.clienteIds.slice(0, limite).map((id) => db().collection('clientes').doc(id).get()),
      )
      clienteDocs = gets.filter((d) => d.exists)
    } else {
      const snap = await db().collection('clientes').get()
      clienteDocs = snap.docs
        .filter((d) => {
          const c = d.data()
          return c.status !== 'inativo' && !c.deletedAt
        })
        .slice(0, limite)
    }

    const resultados: Resultado[] = []

    for (const doc of clienteDocs) {
      const cliente = (doc.data() ?? {}) as ClienteDoc
      const razaoSocial = str(cliente.razaoSocial) || doc.id
      const fiscalDoc = await getFiscalDoc(doc.id)
      const fiscal = (fiscalDoc?.data() ?? null) as FiscalDoc | null

      // Idempotência: pula quem já tem empresa/chave Spedy.
      const jaTemChave = Boolean((fiscal?.credenciais as Record<string, unknown> | undefined)?.spedyApiKey)
      if (fiscal && (str(fiscal.spedyCompanyId) || jaTemChave)) {
        resultados.push({ clienteId: doc.id, razaoSocial, status: 'ignorada_ja_provisionada' })
        continue
      }

      const { payload, faltando } = buildCompanyPayload(cliente, fiscal)
      if (faltando.length > 0 || !fiscalDoc) {
        resultados.push({
          clienteId: doc.id,
          razaoSocial,
          status: 'incompleto',
          faltando: fiscalDoc ? faltando : [...faltando, 'config fiscal do cliente (clientes_fiscal)'],
        })
        continue
      }

      if (dryRun) {
        resultados.push({ clienteId: doc.id, razaoSocial, status: 'previa_ok', payload })
        continue
      }

      // ── Criação real ──────────────────────────────────────────────────────
      try {
        const r = await criarEmpresaSpedy(host, ownerKey, payload)
        if (!r.ok) {
          resultados.push({
            clienteId: doc.id,
            razaoSocial,
            status: 'erro',
            detalhe: `HTTP ${r.status}: ${str(r.body?.message) || r.text.slice(0, 300)}`,
          })
          continue
        }
        const companyId = str(r.body?.id)
        const apiKey = str((r.body?.apiCredentials as Record<string, unknown> | undefined)?.apiKey)
        if (!companyId || !apiKey) {
          resultados.push({ clienteId: doc.id, razaoSocial, status: 'erro', detalhe: 'Response da Spedy sem id/apiKey.' })
          continue
        }
        await fiscalDoc.ref.update({
          spedyCompanyId: companyId,
          provedorNfse: 'spedy',
          ambienteEmissao: ambiente,
          'credenciais.spedyApiKey': encrypt(apiKey),
          spedyProvisionadoEm: FieldValue.serverTimestamp(),
        })
        await writeAuditLog({
          tenantId: DEFAULT_TENANT_ID,
          actor,
          entidade: 'clientes_fiscal',
          entidadeId: doc.id,
          acao: 'provisionar_empresa_spedy',
          dadosDepois: { spedyCompanyId: companyId, ambiente },
          origem: 'cloud_function',
        })
        resultados.push({ clienteId: doc.id, razaoSocial, status: 'criada', spedyCompanyId: companyId })
      } catch (err) {
        resultados.push({
          clienteId: doc.id,
          razaoSocial,
          status: 'erro',
          detalhe: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const contar = (s: StatusResultado) => resultados.filter((r) => r.status === s).length
    return {
      resumo: {
        dryRun,
        ambiente,
        total: resultados.length,
        previa_ok: contar('previa_ok'),
        criadas: contar('criada'),
        incompletos: contar('incompleto'),
        ja_provisionadas: contar('ignorada_ja_provisionada'),
        erros: contar('erro'),
      },
      resultados,
    }
  },
)
