import { limit } from 'firebase/firestore'
import {
  createDocument,
  getDocument,
  getServicos,
  getUsuarios,
  invalidateUsuariosCache,
  listDocuments,
  setDocument,
  updateDocument,
} from '@/lib/firestore-client'
import type {
  ConectorFiscalAdmin,
  ParametrosEscritorio,
  ServicoAdmin,
  UsuarioAdmin,
} from './types'
import { appConfig } from '@/lib/app-config'

export const DEFAULT_PARAMETROS_ESCRITORIO: ParametrosEscritorio = {
  nomeEscritorio: appConfig.name,
  cnpjEscritorio: '',
  emailAlertas: '',
  tenantId: appConfig.tenantId,
  diaVencimentoPadrao: 10,
  ambienteFiscalPadrao: 'homologacao',
}

export async function fetchUsuariosAdmin() {
  return getUsuarios() as Promise<UsuarioAdmin[]>
}

export async function updateUsuarioAdmin(id: string, data: Pick<UsuarioAdmin, 'nome' | 'perfil' | 'ativo' | 'telas'>) {
  await updateDocument('usuarios', id, data)
  invalidateUsuariosCache()
}

export async function createUsuarioProfileAdmin(
  id: string,
  data: Omit<UsuarioAdmin, 'id' | 'ultimoAcesso'>
) {
  await setDocument('usuarios', id, data)
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

export async function fetchConectoresFiscaisAdmin() {
  const conectores = await listDocuments<ConectorFiscalAdmin>('fiscal_conectores', [limit(200)])
  return conectores.sort((a, b) => String(a.nome ?? a.id).localeCompare(String(b.nome ?? b.id), 'pt-BR'))
}

export async function updateConectorFiscalAdmin(
  id: string,
  field: keyof ConectorFiscalAdmin,
  value: boolean
) {
  return updateDocument('fiscal_conectores', id, { [field]: value })
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
    },
  }
}

export async function saveParametrosEscritorio(exists: boolean, form: ParametrosEscritorio) {
  const payload = {
    ...form,
    diaVencimentoPadrao: Math.min(28, Math.max(1, Number(form.diaVencimentoPadrao) || 10)),
  }
  if (exists) {
    await updateDocument('configuracoes', 'escritorio', payload)
  } else {
    await setDocument('configuracoes', 'escritorio', payload)
  }
  return payload
}
