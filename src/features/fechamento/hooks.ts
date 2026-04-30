import { useFechamentosQuery } from './queries'
import type { FechamentoFilters } from './types'

export function useFechamentoList(filters: FechamentoFilters) {
  const query = useFechamentosQuery(filters)
  return {
    ...query,
    fechamentos: query.data ?? [],
  }
}
