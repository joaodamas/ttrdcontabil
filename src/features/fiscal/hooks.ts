import { useFiscalReadinessQuery, useFiscalSnapshotQuery } from './queries'

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

export function useFiscalReadiness() {
  const query = useFiscalReadinessQuery()
  return {
    ...query,
    totalClientesAtivos: query.data?.totalClientesAtivos ?? 0,
    prontosRascunho: query.data?.prontosRascunho ?? 0,
    prontosEmissao: query.data?.prontosEmissao ?? 0,
    bloqueados: query.data?.bloqueados ?? 0,
    clientes: query.data?.clientes ?? [],
  }
}
