import { createDocument, getClientes, getFechamentos, updateDocument } from '@/lib/firestore-client'
import type { FechamentoFilters, FechamentoRecord } from './types'

export async function fetchFechamentos(filters: FechamentoFilters): Promise<FechamentoRecord[]> {
  const data = await getFechamentos(filters.mes, filters.ano, filters.regime || undefined)
  return data as FechamentoRecord[]
}

export async function updateFechamentoField(id: string, field: string, value: string) {
  await updateDocument('fechamentos', id, { [field]: value })
}

export async function gerarFechamentoMensal(filters: FechamentoFilters): Promise<number> {
  const clientes = await getClientes({ status: 'ativo' })
  const existentes = await getFechamentos(filters.mes, filters.ano)
  const existentesIds = new Set(
    existentes.map((f) => (f as Record<string, unknown>).clienteId as string)
  )

  let criados = 0
  for (const cliente of clientes) {
    const c = cliente as Record<string, unknown>
    if (existentesIds.has(c.id as string)) continue

    await createDocument('fechamentos', {
      clienteId: c.id,
      clienteNome: c.razaoSocial ?? '',
      clienteCodigo: c.codigo ?? 0,
      mes: filters.mes,
      ano: filters.ano,
      regime: c.regimeTributario ?? 'simples_nacional',
      responsavel: c.responsavelNome ?? '',
      portalUrl: c.portalUrl ?? null,
      formaEntrega: c.formaEntrega ?? null,
      dasStatus: 'pendente',
      esocialStatus: 'na',
      reinfStatus: 'na',
      fgtsStatus: 'na',
    })
    criados++
  }

  return criados
}
