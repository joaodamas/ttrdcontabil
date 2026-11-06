import { limit, serverTimestamp } from 'firebase/firestore'
import { sendPasswordResetEmail } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getClientAuth, getFirebaseApp } from '@/lib/firebase'
import {
  createDocument,
  getDocument,
  getServicos,
  invalidateUsuariosCache,
  listDocuments,
  setDocument,
  updateDocument,
} from '@/lib/firestore-client'
import type {
  ParametrosEscritorio,
  ServicoAdmin,
  UsuarioAdmin,
} from './types'
import { appConfig } from '@/lib/app-config'
import { DEFAULT_UI_FEATURE_FLAGS, normalizeUiFeatureFlags } from '@/lib/feature-flags'

export const DEFAULT_PARAMETROS_ESCRITORIO: ParametrosEscritorio = {
  nomeEscritorio: appConfig.name,
  cnpjEscritorio: '',
  emailAlertas: '',
  tenantId: appConfig.tenantId,
  diaVencimentoPadrao: 10,
  ambienteFiscalPadrao: 'homologacao',
  // Default DESLIGADO: ligar emissao automatica e uma decisao explicita do
  // escritorio, nunca um efeito colateral de deploy ou de doc ausente.
  emissaoAutomaticaNfseHabilitada: false,
  uiFeatureFlags: DEFAULT_UI_FEATURE_FLAGS,
}

/** Lista completa (e-mail, perfil, telas) — as regras só deixam o admin listar `usuarios`. */
export async function fetchUsuariosAdmin() {
  const data = await listDocuments<Omit<UsuarioAdmin, 'id'>>('usuarios', [limit(200)])
  return data.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR')) as UsuarioAdmin[]
}

// ─── Ciclo de vida do usuário: só pelas Cloud Functions ───────────────────────
// (functions/src/usuarios/callables.ts). As regras não deixam o navegador criar,
// excluir nem mudar perfil/telas/ativo de ninguém.

function callable<I, O>(nome: string) {
  return httpsCallable<I, O>(getFunctions(getFirebaseApp(), 'southamerica-east1'), nome)
}

/**
 * O convite é o e-mail de "definir senha" do Firebase: o usuário escolhe a
 * própria senha pelo link e ninguém mais a conhece. Texto do e-mail: modelo de
 * redefinição de senha no Console (Authentication → Templates), em pt.
 */
export async function enviarConviteSenha(email: string) {
  const auth = getClientAuth()
  auth.languageCode = 'pt'
  await sendPasswordResetEmail(auth, email)
}

export async function criarUsuarioAdmin(data: { nome: string; email: string; perfil: string; telas: string[] }) {
  const { data: r } = await callable<typeof data, { uid: string; email: string; contaReaproveitada: boolean }>('criarUsuario')(data)
  invalidateUsuariosCache()
  return r
}

export async function atualizarUsuarioAdmin(
  uid: string,
  data: Partial<Pick<UsuarioAdmin, 'nome' | 'perfil' | 'ativo' | 'telas'>>,
) {
  const { data: r } = await callable<{ uid: string } & typeof data, { uid: string; alterados: string[] }>('atualizarUsuario')({ uid, ...data })
  invalidateUsuariosCache()
  return r
}

/** Confere/registra no servidor e dispara o e-mail de definir senha. */
export async function reenviarConviteAdmin(uid: string) {
  const { data } = await callable<{ uid: string }, { uid: string; email: string }>('redefinirSenhaUsuario')({ uid })
  await enviarConviteSenha(data.email)
  return data.email
}

export async function excluirUsuarioAdmin(uid: string) {
  await callable<{ uid: string }, { uid: string }>('excluirUsuario')({ uid })
  invalidateUsuariosCache()
}

export async function fetchServicosAdmin() {
  return getServicos() as Promise<ServicoAdmin[]>
}

export async function createServicoAdmin(data: Record<string, unknown>) {
  return createDocument('servicos', data)
}

export async function updateServicoAdmin(id: string, data: Record<string, unknown>) {
  return updateDocument('servicos', id, data)
}

export async function gerarTabelaCobAdmin() {
  const promises = Array.from({ length: 20 }, (_, i) => {
    const n = i + 1
    const valor = n * 50
    const codigo = `COB${String(n).padStart(2, '0')}`
    return createServicoAdmin({
      codigo,
      codigoNumero: n,
      nome: `Honorário ${codigo}`,
      frequencia: 'mensal',
      valorPadrao: valor,
      ativo: true,
    })
  })
  await Promise.all(promises)
}

/** Chave única do Ambiente Nacional (espelha DOC_NFSE_NACIONAL em functions/src/nfse/provedor.ts). */
export const DOC_NFSE_NACIONAL = 'nfse_nacional'

export interface ChaveNfseNacional {
  producaoLiberada: boolean
  alteradoPorNome?: string | null
  alteradoEm?: { toDate?: () => Date } | null
}

export async function fetchChaveNfseNacional(): Promise<ChaveNfseNacional | null> {
  // Antes da primeira vez que o admin liga a chave o documento não existe, e a
  // regra de `configuracoes` (sameTenantExisting) nega a leitura de doc
  // inexistente. Ausente/negado = chave desligada — sem derrubar a tela.
  return getDocument<ChaveNfseNacional>('configuracoes', DOC_NFSE_NACIONAL).catch(() => null)
}

/**
 * Liga/desliga a emissão em PRODUÇÃO pelo Ambiente Nacional para o escritório
 * inteiro. As regras só deixam admin gravar em `configuracoes`.
 */
export async function salvarChaveNfseNacional(producaoLiberada: boolean, existe: boolean, alteradoPorNome: string) {
  const payload = { producaoLiberada, alteradoPorNome, alteradoEm: serverTimestamp() }
  if (existe) return updateDocument('configuracoes', DOC_NFSE_NACIONAL, payload)
  return setDocument('configuracoes', DOC_NFSE_NACIONAL, payload)
}

export async function fetchParametrosEscritorio(tenantId?: string) {
  const data = await getDocument<Partial<ParametrosEscritorio>>('configuracoes', 'escritorio')
  if (!data) {
    return {
      exists: false,
      data: {
        ...DEFAULT_PARAMETROS_ESCRITORIO,
        tenantId: tenantId ?? DEFAULT_PARAMETROS_ESCRITORIO.tenantId,
      },
    }
  }

  return {
    exists: true,
    data: {
      ...DEFAULT_PARAMETROS_ESCRITORIO,
      tenantId: tenantId ?? DEFAULT_PARAMETROS_ESCRITORIO.tenantId,
      ...data,
      diaVencimentoPadrao: Number(data.diaVencimentoPadrao ?? DEFAULT_PARAMETROS_ESCRITORIO.diaVencimentoPadrao),
      emissaoAutomaticaNfseHabilitada: data.emissaoAutomaticaNfseHabilitada === true,
      uiFeatureFlags: normalizeUiFeatureFlags(data.uiFeatureFlags),
    },
  }
}

export async function saveParametrosEscritorio(exists: boolean, form: ParametrosEscritorio) {
  const payload = {
    ...form,
    diaVencimentoPadrao: Math.min(28, Math.max(1, Number(form.diaVencimentoPadrao) || 10)),
    // === true e nao Boolean(): mantem o fail-closed do backend, onde ausente
    // e indefinido significam desligado.
    emissaoAutomaticaNfseHabilitada: form.emissaoAutomaticaNfseHabilitada === true,
    uiFeatureFlags: normalizeUiFeatureFlags(form.uiFeatureFlags),
  }
  if (exists) {
    await updateDocument('configuracoes', 'escritorio', payload)
  } else {
    await setDocument('configuracoes', 'escritorio', payload)
  }
  return payload
}
