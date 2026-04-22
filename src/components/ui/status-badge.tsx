import { Badge } from './badge'
import type { VariantProps } from 'class-variance-authority'
import type { badgeVariants } from './badge'

type Variant = VariantProps<typeof badgeVariants>['variant']

interface StatusConfig { label: string; variant: Variant }

// ── Cliente ───────────────────────────────────────────────────────────────────
const CLIENTE_STATUS: Record<string, StatusConfig> = {
  ativo:    { label: 'Ativo',    variant: 'success' },
  inativo:  { label: 'Inativo', variant: 'secondary' },
  suspenso: { label: 'Suspenso', variant: 'warning' },
}

// ── Competência ───────────────────────────────────────────────────────────────
const COMPETENCIA_STATUS: Record<string, StatusConfig> = {
  aberta:       { label: 'Aberta',       variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'info' },
  concluida:    { label: 'Concluída',    variant: 'success' },
  cancelada:    { label: 'Cancelada',    variant: 'secondary' },
}

// ── Tarefa ────────────────────────────────────────────────────────────────────
const TAREFA_STATUS: Record<string, StatusConfig> = {
  pendente:     { label: 'Pendente',     variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'info' },
  concluida:    { label: 'Concluída',    variant: 'success' },
  cancelada:    { label: 'Cancelada',    variant: 'secondary' },
}

const TAREFA_PRIORIDADE: Record<string, StatusConfig> = {
  baixa:   { label: 'Baixa',   variant: 'outline' },
  normal:  { label: 'Normal',  variant: 'secondary' },
  alta:    { label: 'Alta',    variant: 'warning' },
  urgente: { label: 'Urgente', variant: 'destructive' },
}

// ── Lançamento (pagamento) ────────────────────────────────────────────────────
const PAGAMENTO_STATUS: Record<string, StatusConfig> = {
  pendente:  { label: 'Pendente',  variant: 'outline' },
  pago:      { label: 'Pago',      variant: 'success' },
  atrasado:  { label: 'Atrasado',  variant: 'destructive' },
  cancelado: { label: 'Cancelado', variant: 'secondary' },
  estornado: { label: 'Estornado', variant: 'warning' },
}

// ── NFS-e ─────────────────────────────────────────────────────────────────────
const NFSE_STATUS: Record<string, StatusConfig> = {
  emitida:                 { label: 'Emitida',     variant: 'success' },
  pendente_processamento:  { label: 'Pendente',    variant: 'outline' },
  aguardando_emissao:      { label: 'Rascunho',    variant: 'secondary' },
  rejeitada:               { label: 'Rejeitada',   variant: 'destructive' },
  cancelada:               { label: 'Cancelada',   variant: 'secondary' },
  erro_integracao:         { label: 'Erro',        variant: 'destructive' },
}

// ── IR ────────────────────────────────────────────────────────────────────────
const IR_STATUS: Record<string, StatusConfig> = {
  pendente:     { label: 'Pendente',     variant: 'outline' },
  em_andamento: { label: 'Em andamento', variant: 'info' },
  entregue:     { label: 'Entregue',     variant: 'success' },
  retificado:   { label: 'Retificado',   variant: 'warning' },
  cancelado:    { label: 'Cancelado',    variant: 'secondary' },
}

// ── Ambiente de emissão ───────────────────────────────────────────────────────
const AMBIENTE_STATUS: Record<string, StatusConfig> = {
  producao:    { label: 'Produção',    variant: 'success' },
  homologacao: { label: 'Homologação', variant: 'warning' },
}

// ── Generic fallback ──────────────────────────────────────────────────────────
function resolveConfig(map: Record<string, StatusConfig>, value: string): StatusConfig {
  return map[value] ?? { label: value, variant: 'outline' }
}

// ── Components ────────────────────────────────────────────────────────────────

export function ClienteStatusBadge({ status }: { status: string }) {
  const { label, variant } = resolveConfig(CLIENTE_STATUS, status)
  return <Badge variant={variant}>{label}</Badge>
}

export function CompetenciaStatusBadge({ status }: { status: string }) {
  const { label, variant } = resolveConfig(COMPETENCIA_STATUS, status)
  return <Badge variant={variant}>{label}</Badge>
}

export function TarefaStatusBadge({ status }: { status: string }) {
  const { label, variant } = resolveConfig(TAREFA_STATUS, status)
  return <Badge variant={variant}>{label}</Badge>
}

export function TarefaPrioridadeBadge({ prioridade }: { prioridade: string }) {
  const { label, variant } = resolveConfig(TAREFA_PRIORIDADE, prioridade)
  return <Badge variant={variant}>{label}</Badge>
}

export function PagamentoStatusBadge({ status }: { status: string }) {
  const { label, variant } = resolveConfig(PAGAMENTO_STATUS, status)
  return <Badge variant={variant}>{label}</Badge>
}

export function NfseStatusBadge({ status }: { status: string }) {
  const { label, variant } = resolveConfig(NFSE_STATUS, status)
  return <Badge variant={variant}>{label}</Badge>
}

export function IrStatusBadge({ status }: { status: string }) {
  const { label, variant } = resolveConfig(IR_STATUS, status)
  return <Badge variant={variant}>{label}</Badge>
}

export function AmbienteBadge({ ambiente }: { ambiente: string }) {
  const { label, variant } = resolveConfig(AMBIENTE_STATUS, ambiente)
  return <Badge variant={variant}>{label}</Badge>
}
