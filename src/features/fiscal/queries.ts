import { useQuery } from '@tanstack/react-query'
import { createFeatureKeys } from '@/lib/feature-keys'
import { queryStaleTimes } from '@/lib/query-stale-times'
import { fetchFiscalReadiness, fetchFiscalSnapshot, fetchFiscalSnapshotNfe } from './services'

const base = createFeatureKeys('fiscal')

export const fiscalKeys = {
  all: base.all,
  snapshot: () => base.list('snapshot'),
  snapshotNfe: () => base.list('snapshot-nfe'),
  readiness: () => base.list('readiness'),
}

export function useFiscalSnapshotQuery() {
  return useQuery({
    queryKey: fiscalKeys.snapshot(),
    queryFn: fetchFiscalSnapshot,
    staleTime: queryStaleTimes.fiscal,
  })
}

export function useFiscalSnapshotNfeQuery() {
  return useQuery({
    queryKey: fiscalKeys.snapshotNfe(),
    queryFn: fetchFiscalSnapshotNfe,
    staleTime: queryStaleTimes.fiscal,
  })
}

export function useFiscalReadinessQuery() {
  return useQuery({
    queryKey: fiscalKeys.readiness(),
    queryFn: fetchFiscalReadiness,
    staleTime: queryStaleTimes.fiscal,
  })
}
