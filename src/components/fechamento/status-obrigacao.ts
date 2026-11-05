import type { StatusObrigacaoFechamento } from '@/lib/fechamento-resumo'

// Fonte única de rótulo/cor dos status de obrigação do fechamento,
// usada pela tabela completa e pelos cartões de pendência.

// Ciclo de status ao clicar
export const STATUS_CYCLE: Record<string, StatusObrigacaoFechamento[]> = {
  das:     ['pendente', 'guia', 'sm', 'enviado', 'parcial', 'na'],
  esocial: ['na', 'pendente', 'ok', 'sm', 'guia'],
  reinf:   ['na', 'pendente', 'ok', 'sm', 'guia'],
  fgts:    ['na', 'pendente', 'ok', 'sm', 'guia'],
}

export const STATUS_STYLE: Record<StatusObrigacaoFechamento, string> = {
  pendente: 'bg-warning/10 text-amber-800 dark:text-warning border-warning/30 hover:bg-warning/20',
  enviado:  'bg-success/10 text-success border-success/30 hover:bg-success/20',
  parcial:  'bg-info/10 text-info border-info/30 hover:bg-info/20',
  ok:       'bg-success/15 text-success border-success/35 hover:bg-success/25',
  sm:       'bg-success/10 text-success border-success/30 hover:bg-success/20',
  guia:     'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20',
  na:       'bg-muted text-muted-foreground border-border hover:bg-muted/80',
}

/** Sigla curta exibida na célula. */
export const STATUS_LABEL: Record<StatusObrigacaoFechamento, string> = {
  pendente: 'PEND',
  enviado:  'ENV',
  parcial:  'PARC',
  ok:       'OK',
  sm:       'SM',
  guia:     'GUIA',
  na:       '—',
}

/** Nome por extenso, para tooltip e leitores de tela. */
export const STATUS_NOME: Record<StatusObrigacaoFechamento, string> = {
  pendente: 'Pendente',
  enviado:  'Enviado',
  parcial:  'Parcial',
  ok:       'Concluído',
  sm:       'Sem movimento',
  guia:     'Guia emitida',
  na:       'Não se aplica',
}
