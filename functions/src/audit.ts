import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { dataDeExpiracao } from './retencao'

const db = () => getFirestore()

const SENSITIVE_KEYS = new Set([
  'senha',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'certificado',
  'certificadoBase64',
  'certificadoSenha',
  'senhaCertificado',
  'privateKey',
  'chavePrivada',
  'configJson',
  'credenciais',
  'payloadEnvio',
  'payloadRetorno',
  'respostaIntegracao',
  'xmlNfse',
])

const SENSITIVE_KEY_PARTS = [
  'senha',
  'password',
  'token',
  'credential',
  'credencial',
  'cert',
  'chave',
  'private',
  'secret',
  'cpf',
  'cnpj',
  'email',
  'telefone',
  'xml',
  'soap',
  'payload',
  'response',
  'resposta',
  'retorno',
  'integracao',
  'inscricaomunicipal',
  'simpliss',
  'giap',
  'conam',
  'apikey',
  // loginPrefeitura/loginPostoFiscal (senhas de portal) — o redator do front
  // já tinha 'login'; o do servidor deixava o usuário do portal passar.
  'login',
]

// Campos que casam com uma "parte sensível" acima mas não são segredo: sem
// eles o log de quem trocou o certificado A1 não dizia de quem era nem até
// quando valia (certTitular/certVencimento caíam em 'cert'), e o de senhas de
// portal não dizia QUAIS campos mudaram (credenciaisPreenchidas é só a lista
// de nomes, nunca o valor).
const SAFE_KEYS = new Set([
  'certTitular',
  'certVencimento',
  'certValido',
  'certEnviadoEm',
  'credenciaisPreenchidas',
  'camposPreenchidos',
  'camposAlterados',
  'campos',
])

function normalizeKey(key: string): string {
  return key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f_.-]/g, '')
}

export function isSensitiveKey(key: string): boolean {
  if (SAFE_KEYS.has(key)) return false
  const normalized = normalizeKey(key)
  return SENSITIVE_KEYS.has(key) || SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
}

export function sanitizeAuditString(value: string): string {
  const trimmed = value.trim()
  if (/^<\?xml|^<soap|<[^>]+>[\s\S]*<\/[^>]+>/i.test(trimmed)) return '[XML_REDACTED]'
  if (trimmed.length > 3000 && /[{}[\]":,]/.test(trimmed)) return '[PAYLOAD_REDACTED]'

  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REDACTED]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_REDACTED]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ_REDACTED]')
    .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g, '[PHONE_REDACTED]')
}

export type AuditActor = {
  id: string
  nome: string
  email?: string | null
}

/** De onde veio a chamada (callables): IP e navegador, para o log servir de prova. */
export type AuditRequisicao = {
  ip: string | null
  userAgent: string | null
}

type RequisicaoCallable = {
  auth?: { uid: string; token?: Record<string, unknown> } | null
  rawRequest?: { ip?: string; headers?: Record<string, string | string[] | undefined> }
}

/**
 * Ator do log a partir do TOKEN do Firebase Auth (uid e e-mail assinados pelo
 * Google), não do `usuarios/{uid}.nome` — esse campo o próprio usuário edita
 * pelas regras, e o log mostrava o nome que ele quisesse.
 */
export function atorDaRequisicao(request: RequisicaoCallable): AuditActor {
  const uid = request.auth?.uid ?? 'desconhecido'
  const token = request.auth?.token ?? {}
  const email = typeof token.email === 'string' ? token.email : null
  const nome = typeof token.name === 'string' && token.name.trim() ? token.name : (email ?? uid)
  return { id: uid, nome, email }
}

export function requisicaoDoCallable(request: RequisicaoCallable): AuditRequisicao {
  const raw = request.rawRequest
  const ua = raw?.headers?.['user-agent']
  return {
    ip: typeof raw?.ip === 'string' && raw.ip ? raw.ip : null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null,
  }
}

export function redactAuditData(value: unknown): unknown {
  if (value == null) return value
  if (value instanceof Timestamp) return value
  if (Array.isArray(value)) return value.map(redactAuditData)
  if (typeof value === 'string') return sanitizeAuditString(value)
  if (typeof value !== 'object') return value
  if ('toDate' in (value as Record<string, unknown>)) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? redactSensitive(nested) : redactAuditData(nested),
    ])
  )
}

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
    && !(v instanceof Timestamp) && !('toDate' in (v as Record<string, unknown>))
}

/**
 * Valor de chave sensível. Objeto (ex.: clientes_fiscal.credenciais) não some
 * inteiro: só passam as chaves de SAFE_KEYS (certTitular, certVencimento…),
 * todo o resto vira [REDACTED] — inclusive campos sem nome "sensível", porque
 * dentro de um bloco de credenciais tudo é tratado como segredo.
 */
function redactSensitive(value: unknown): unknown {
  if (!ehObjetoSimples(value)) return '[REDACTED]'
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SAFE_KEYS.has(k) ? redactAuditData(v) : '[REDACTED]'])
  )
}

export type AuditLogParams = {
  tenantId: string
  actor: AuditActor
  entidade: string
  entidadeId?: string | null
  acao: string
  dadosAntes?: Record<string, unknown> | null
  dadosDepois?: Record<string, unknown> | null
  origem: 'cloud_function' | 'scheduler' | 'trigger'
  requisicao?: AuditRequisicao | null
  /** Nomes dos campos que mudaram (triggers de auditoria). */
  camposAlterados?: string[] | null
}

/**
 * Documento de log pronto para gravar — para quem precisa do log na MESMA
 * transação/batch da mudança (callables de usuário: sem log, sem mudança).
 */
export function montarAuditLog(params: AuditLogParams) {
  return {
    tenantId: params.tenantId,
    usuarioId: params.actor.id,
    usuarioNome: params.actor.nome,
    usuarioEmail: params.actor.email ?? null,
    entidade: params.entidade,
    entidadeId: params.entidadeId ?? null,
    acao: params.acao,
    dadosAntes: params.dadosAntes ? redactAuditData(params.dadosAntes) : null,
    dadosDepois: params.dadosDepois ? redactAuditData(params.dadosDepois) : null,
    origem: params.origem,
    ...(params.requisicao ? { ip: params.requisicao.ip, userAgent: params.requisicao.userAgent } : {}),
    ...(params.camposAlterados ? { camposAlterados: params.camposAlterados } : {}),
    criadoEm: FieldValue.serverTimestamp(),
    // TTL do Firestore (functions/src/retencao.ts).
    expiraEm: Timestamp.fromDate(dataDeExpiracao('logs_auditoria')),
  }
}

export async function writeAuditLog(params: AuditLogParams) {
  await db().collection('logs_auditoria').add(montarAuditLog(params))
}

export const SYSTEM_ACTOR: AuditActor = {
  id: 'system',
  nome: 'Sistema',
  email: null,
}
