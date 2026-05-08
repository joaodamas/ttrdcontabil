import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

const db = () => admin.firestore()

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
]

function normalizeKey(key: string): string {
  return key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f_.-]/g, '')
}

function isSensitiveKey(key: string): boolean {
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

export function redactAuditData(value: unknown): unknown {
  if (value == null) return value
  if (value instanceof admin.firestore.Timestamp) return value
  if (Array.isArray(value)) return value.map(redactAuditData)
  if (typeof value === 'string') return sanitizeAuditString(value)
  if (typeof value !== 'object') return value
  if ('toDate' in (value as Record<string, unknown>)) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? '[REDACTED]' : redactAuditData(nested),
    ])
  )
}

export async function writeAuditLog(params: {
  tenantId: string
  actor: AuditActor
  entidade: string
  entidadeId?: string | null
  acao: string
  dadosAntes?: Record<string, unknown> | null
  dadosDepois?: Record<string, unknown> | null
  origem: 'cloud_function' | 'scheduler' | 'trigger'
}) {
  await db().collection('logs_auditoria').add({
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
    criadoEm: FieldValue.serverTimestamp(),
  })
}

export const SYSTEM_ACTOR: AuditActor = {
  id: 'system',
  nome: 'Sistema',
  email: null,
}
