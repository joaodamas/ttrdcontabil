import { useFiscalSnapshotQuery } from './queries'

export function useFiscalDashboard() {
  const query = useFiscalSnapshotQuery()
  return {
    ...query,
    emitidaMesCount: query.data?.emitidaMesCount ?? 0,
    somaEmitidaMes: query.data?.somaEmitidaMes ?? 0,
    pendenteCount: query.data?.pendenteCount ?? 0,
    erroCount: query.data?.erroCount ?? 0,
    canceladaCount: query.data?.canceladaCount ?? 0,
    notas: query.data?.notas ?? [],
  }
}
