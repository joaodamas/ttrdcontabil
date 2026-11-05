import { AlertCircle, SearchX } from 'lucide-react'
import { EmptyState } from './empty-state'

export type RecordLoadFailure = 'nao_encontrado' | 'erro'

interface RecordUnavailableProps {
  /** Motivo: o registro não existe, ou a leitura falhou. */
  reason: RecordLoadFailure
  /** Título já flexionado, ex.: "Tarefa não encontrada". */
  notFoundTitle: string
  /** Título já flexionado, ex.: "Não foi possível carregar a tarefa". */
  errorTitle: string
  /** Mensagem amigável do erro (nunca o código técnico). */
  errorDescription?: string
  backHref: string
  backLabel?: string
  onRetry?: () => void
}

/**
 * Estado de detalhe/edição quando o registro não pôde ser exibido.
 * Substitui o `return null` (tela em branco) e o spinner infinito.
 */
export function RecordUnavailable({
  reason,
  notFoundTitle,
  errorTitle,
  errorDescription,
  backHref,
  backLabel = 'Voltar',
  onRetry,
}: RecordUnavailableProps) {
  const naoEncontrado = reason === 'nao_encontrado'
  return (
    <EmptyState
      size="lg"
      icon={naoEncontrado ? SearchX : AlertCircle}
      title={naoEncontrado ? notFoundTitle : errorTitle}
      description={
        naoEncontrado
          ? 'O registro pode ter sido excluído ou o link está incorreto.'
          : errorDescription ?? 'Verifique sua conexão e tente novamente.'
      }
      action={{ label: backLabel, href: backHref, variant: naoEncontrado ? 'default' : 'outline' }}
      secondaryAction={!naoEncontrado && onRetry ? { label: 'Tentar novamente', onClick: onRetry, variant: 'default' } : undefined}
    />
  )
}
