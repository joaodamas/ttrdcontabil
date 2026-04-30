import { useQuery } from '@tanstack/react-query'
import { fetchHojeCockpit, fetchUsuarios } from './services'
import { createFeatureKeys } from '@/lib/feature-keys'

const base = createFeatureKeys('hoje')
export const hojeKeys = {
  all: base.all,
  cockpit: (responsavelId?: string) => [...base.list('cockpit'), responsavelId ?? 'equipe'] as const,
  usuarios: () => base.list('usuarios'),
}

export function useHojeCockpitQuery(responsavelId?: string) {
  return useQuery({
    queryKey: hojeKeys.cockpit(responsavelId),
    queryFn: () => fetchHojeCockpit(responsavelId),
  })
}

export function useHojeUsuariosQuery() {
  return useQuery({
    queryKey: hojeKeys.usuarios(),
    queryFn: fetchUsuarios,
  })
}
