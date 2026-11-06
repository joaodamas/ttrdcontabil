/**
 * Regras puras do ciclo de vida de usuários (criar, atualizar, excluir):
 * validação da entrada dos callables e a trava do último administrador.
 * Sem firebase aqui — testado em __tests__/lib/usuarios-regras.test.ts.
 */
import { PERFIS, TELAS, ehPerfil, ehTela, type Perfil, type TelaKey } from './perfis'

export type CodigoErroUsuario = 'invalid-argument' | 'failed-precondition'

/** Erro de regra; o callable o converte em HttpsError com o mesmo código. */
export class ErroRegraUsuario extends Error {
  constructor(public readonly codigo: CodigoErroUsuario, mensagem: string) {
    super(mensagem)
    this.name = 'ErroRegraUsuario'
  }
}

const invalido = (mensagem: string) => new ErroRegraUsuario('invalid-argument', mensagem)

// Propositalmente simples: o Firebase Auth valida de novo no createUser.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizarEmail(valor: unknown): string {
  const email = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw invalido('E-mail inválido.')
  return email
}

export function validarNome(valor: unknown): string {
  const nome = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : ''
  if (nome.length < 2) throw invalido('Nome é obrigatório (mínimo 2 caracteres).')
  if (nome.length > 100) throw invalido('Nome muito longo (máximo 100 caracteres).')
  return nome
}

export function validarPerfil(valor: unknown): Perfil {
  if (!ehPerfil(valor)) throw invalido(`Perfil inválido. Use um destes: ${PERFIS.join(', ')}.`)
  return valor
}

/** Subconjunto das telas conhecidas, sem repetição, na ordem canônica de TELAS. */
export function validarTelas(valor: unknown): TelaKey[] {
  if (!Array.isArray(valor)) throw invalido('Telas devem ser uma lista.')
  const desconhecidas = valor.filter((t) => !ehTela(t))
  if (desconhecidas.length > 0) throw invalido(`Tela desconhecida: ${desconhecidas.map(String).join(', ')}.`)
  const escolhidas = new Set(valor as TelaKey[])
  return TELAS.filter((t) => escolhidas.has(t))
}

export function validarUid(valor: unknown): string {
  const uid = typeof valor === 'string' ? valor.trim() : ''
  // uid do Firebase Auth: até 128 caracteres, sem barra (vira id de documento).
  if (!uid || uid.length > 128 || uid.includes('/')) throw invalido('Usuário inválido.')
  return uid
}

export interface EntradaCriarUsuario {
  nome: string
  email: string
  perfil: Perfil
  telas: TelaKey[]
}

export function validarEntradaCriar(data: unknown): EntradaCriarUsuario {
  const d = (data ?? {}) as Record<string, unknown>
  return {
    nome: validarNome(d.nome),
    email: normalizarEmail(d.email),
    perfil: validarPerfil(d.perfil),
    telas: validarTelas(d.telas ?? []),
  }
}

export interface AlteracoesUsuario {
  nome?: string
  perfil?: Perfil
  telas?: TelaKey[]
  ativo?: boolean
}

/** Só os campos enviados; e-mail e tenant não mudam por aqui. */
export function validarEntradaAtualizar(data: unknown): { uid: string; alteracoes: AlteracoesUsuario } {
  const d = (data ?? {}) as Record<string, unknown>
  const uid = validarUid(d.uid)
  const alteracoes: AlteracoesUsuario = {}
  if (d.nome !== undefined) alteracoes.nome = validarNome(d.nome)
  if (d.perfil !== undefined) alteracoes.perfil = validarPerfil(d.perfil)
  if (d.telas !== undefined) alteracoes.telas = validarTelas(d.telas)
  if (d.ativo !== undefined) {
    if (typeof d.ativo !== 'boolean') throw invalido('Status inválido.')
    alteracoes.ativo = d.ativo
  }
  if (Object.keys(alteracoes).length === 0) throw invalido('Nada para alterar.')
  return { uid, alteracoes }
}

export interface UsuarioResumo {
  uid: string
  perfil?: unknown
  ativo?: unknown
}

/** `ativo` ausente conta como ativo — mesma convenção das regras (isAtivo). */
export function ehAdminAtivo(u: { perfil?: unknown; ativo?: unknown }): boolean {
  return u.perfil === 'admin' && u.ativo !== false
}

/**
 * true quando, depois da mudança no usuário `alvoUid`, o escritório ficaria sem
 * nenhum administrador ativo. `depois = null` = o usuário será excluído.
 * `admins` é a lista de admins do tenant ANTES da mudança (pode incluir o alvo).
 */
export function deixariaSemAdmin(
  admins: UsuarioResumo[],
  alvoUid: string,
  depois: { perfil?: unknown; ativo?: unknown } | null,
): boolean {
  const outros = admins.filter((u) => u.uid !== alvoUid && ehAdminAtivo(u)).length
  const alvoContinuaAdmin = depois !== null && ehAdminAtivo(depois)
  return outros + (alvoContinuaAdmin ? 1 : 0) === 0
}

export const MSG_ULTIMO_ADMIN =
  'O escritório precisa de pelo menos um administrador ativo. Promova outro usuário a administrador antes.'

/**
 * Checa a mudança proposta contra quem a faz e contra a trava do último admin.
 * Lança ErroRegraUsuario('failed-precondition') quando não pode.
 */
export function verificarMudanca(params: {
  atorUid: string
  alvoUid: string
  antes: { perfil?: unknown; ativo?: unknown }
  /** null = exclusão */
  depois: { perfil?: unknown; ativo?: unknown } | null
  adminsDoTenant: UsuarioResumo[]
}): void {
  const { atorUid, alvoUid, antes, depois, adminsDoTenant } = params
  const proprio = atorUid === alvoUid
  if (proprio && depois === null) {
    throw new ErroRegraUsuario('failed-precondition', 'Você não pode excluir o seu próprio usuário.')
  }
  if (proprio && depois !== null && depois.ativo === false) {
    throw new ErroRegraUsuario('failed-precondition', 'Você não pode desativar o seu próprio usuário.')
  }
  // Só importa quando o alvo É admin ativo hoje: mudar quem não é admin nunca
  // reduz o número de admins.
  if (ehAdminAtivo(antes) && deixariaSemAdmin(adminsDoTenant, alvoUid, depois)) {
    throw new ErroRegraUsuario('failed-precondition', MSG_ULTIMO_ADMIN)
  }
}

const CAMPOS_AUDITADOS = ['nome', 'perfil', 'telas', 'ativo'] as const

/** Antes/depois só dos campos de acesso, para o log de auditoria. */
export function resumoParaAuditoria(dados: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!dados) return null
  return Object.fromEntries(CAMPOS_AUDITADOS.map((k) => [k, dados[k] === undefined ? null : dados[k]]))
}

export function camposAlterados(antes: Record<string, unknown>, alteracoes: AlteracoesUsuario): string[] {
  return (Object.keys(alteracoes) as (keyof AlteracoesUsuario)[]).filter(
    (k) => JSON.stringify(antes[k] ?? null) !== JSON.stringify(alteracoes[k] ?? null),
  )
}

// ─── Reaproveitar conta de login sem perfil (criarUsuario) ────────────────────

/** Login mais recente que isso impede o reaproveitamento: a conta está em uso. */
export const DIAS_SEM_LOGIN_PARA_REAPROVEITAR = 30

export interface ContaAuthResumo {
  /** providerData[].providerId — 'password', 'google.com', 'phone'… */
  provedores: string[]
  /** metadata.lastSignInTime (string do Auth) ou null/undefined se nunca entrou. */
  ultimoLogin?: string | null
  /** Fatores de 2º fator cadastrados (multiFactor.enrolledFactors.length). */
  fatoresMfa: number
}

export type DecisaoReaproveitamento =
  | { reaproveitar: true }
  | { reaproveitar: false; motivo: 'outro_provedor' | 'segundo_fator' | 'login_recente' }

/**
 * Conta do Auth com o e-mail, mas sem `usuarios/{uid}` (sobra do cadastro
 * antigo pelo navegador, ou cadastro público). O callable troca a senha por
 * uma aleatória e revoga as sessões — isso só tira o acesso de quem conhece a
 * SENHA. Por isso só reaproveita quando é seguro:
 * - só provedor de senha: com Google/telefone vinculado, quem controla esse
 *   provedor continuaria entrando na conta que vai ganhar perfil (e os dados
 *   do escritório) — trocar a senha não o derruba;
 * - sem 2º fator cadastrado: o fator continuaria de quem o cadastrou;
 * - sem login nos últimos DIAS_SEM_LOGIN_PARA_REAPROVEITAR dias: conta em uso é
 *   de alguém, e trocar a senha calado tira o acesso dela sem aviso.
 * Nos demais casos o admin recebe a recusa e resolve no console (apagar a
 * conta órfã) ou cadastra outro e-mail.
 */
export function decidirReaproveitamentoConta(conta: ContaAuthResumo, agora: Date): DecisaoReaproveitamento {
  if (conta.provedores.some((p) => p !== 'password')) return { reaproveitar: false, motivo: 'outro_provedor' }
  if (conta.fatoresMfa > 0) return { reaproveitar: false, motivo: 'segundo_fator' }
  if (conta.ultimoLogin) {
    const ultimo = new Date(conta.ultimoLogin).getTime()
    const limite = agora.getTime() - DIAS_SEM_LOGIN_PARA_REAPROVEITAR * 24 * 60 * 60 * 1000
    // Data ilegível conta como recente: na dúvida, não mexe na conta.
    if (!Number.isFinite(ultimo) || ultimo > limite) return { reaproveitar: false, motivo: 'login_recente' }
  }
  return { reaproveitar: true }
}

export const MSG_CONTA_NAO_REAPROVEITAVEL =
  'Já existe uma conta de login com este e-mail que está em uso ou ligada a outro meio de acesso ' +
  '(Google, telefone ou 2º fator). Por segurança ela não é reaproveitada: remova-a no Firebase ' +
  'Authentication (console) ou cadastre outro e-mail.'
