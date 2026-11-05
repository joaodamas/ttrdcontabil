import { Badge } from './badge'
import { getStatusInfo, type StatusEntity } from '@/lib/status-semantics'

// O mapeamento status → rótulo/cor vive em `@/lib/status-semantics`.
// Nenhuma tela deve definir o próprio mapa de cores: use estes componentes.

interface EntityBadgeProps {
  entity: StatusEntity
  value: string | null | undefined
  className?: string
  /** Ponto pulsante antes do rótulo (usado em prioridade urgente). */
  pulse?: boolean
}

export function StatusBadge({ entity, value, className, pulse }: EntityBadgeProps) {
  const { label, tone } = getStatusInfo(entity, value)
  return (
    <Badge variant={tone} className={className}>
      {pulse && <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </Badge>
  )
}

interface StatusProps { status: string | null | undefined; className?: string }

export function ClienteStatusBadge({ status, className }: StatusProps) {
  return <StatusBadge entity="cliente" value={status} className={className} />
}

export function CompetenciaStatusBadge({ status, className }: StatusProps) {
  return <StatusBadge entity="competencia" value={status} className={className} />
}

export function TarefaStatusBadge({ status, className }: StatusProps) {
  return <StatusBadge entity="tarefa" value={status} className={className} />
}

export function TarefaPrioridadeBadge({ prioridade, className }: { prioridade: string | null | undefined; className?: string }) {
  return (
    <StatusBadge
      entity="tarefaPrioridade"
      value={prioridade}
      className={className}
      pulse={prioridade === 'urgente'}
    />
  )
}

export function PagamentoStatusBadge({ status, className }: StatusProps) {
  return <StatusBadge entity="pagamento" value={status} className={className} />
}

export function NfseStatusBadge({ status, className }: StatusProps) {
  return <StatusBadge entity="nfse" value={status} className={className} />
}

export function IrStatusBadge({ status, className }: StatusProps) {
  return <StatusBadge entity="ir" value={status} className={className} />
}

export function AmbienteBadge({ ambiente, className }: { ambiente: string | null | undefined; className?: string }) {
  return <StatusBadge entity="ambiente" value={ambiente} className={className} />
}
