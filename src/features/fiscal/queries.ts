import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { fetchFiscalSnapshot } from './services'

const base = createFeatureKeys('fiscal')

export const fiscalKeys = {
  all: base.all,
  snapshot: () => base.list('snapshot'),
}

export function useFiscalSnapshotQuery() {
  return useQuery({
    queryKey: fiscalKeys.snapshot(),
    queryFn: fetchFiscalSnapshot,
  })
}
