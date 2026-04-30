import { useHojeCockpitQuery, useHojeUsuariosQuery } from './queries'

export function useHojeData(responsavelId?: string) {
  const cockpit = useHojeCockpitQuery(responsavelId)
  const usuarios = useHojeUsuariosQuery()

  return {
    cockpit,
    usuarios,
    isLoading: cockpit.isLoading || usuarios.isLoading,
  }
}
