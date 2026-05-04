import type { Meta, StoryObj } from '@storybook/nextjs'
import { Timeline, type TimelineEvent } from './timeline'

const meta: Meta<typeof Timeline> = {
  title: 'Domain/Timeline',
  component: Timeline,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof Timeline>

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

const eventos: TimelineEvent[] = [
  {
    id: '1',
    type: 'nfse',
    title: 'NFS-e 00142 emitida',
    description: 'Serviços contábeis mensais — Maio/25',
    timestamp: daysAgo(0),
    variant: 'success',
    metadata: 'R$ 1.800,00',
  },
  {
    id: '2',
    type: 'tarefa',
    title: 'PGDAS-D Maio/25 concluída',
    description: 'Prazo original: 20/05/2025',
    timestamp: daysAgo(1),
    variant: 'success',
  },
  {
    id: '3',
    type: 'competencia',
    title: 'Competência Mai/25 aberta',
    description: 'Aguardando documentação do cliente',
    timestamp: daysAgo(3),
    variant: 'warning',
    metadata: 'Mai/25',
  },
  {
    id: '4',
    type: 'lancamento',
    title: 'Cobrança em atraso — Honorários Abr/25',
    description: 'Vencimento: 10/04/2025 • Pendente há 25 dias',
    timestamp: daysAgo(5),
    variant: 'destructive',
    metadata: 'R$ 1.800,00',
  },
  {
    id: '5',
    type: 'comentario',
    title: 'Nota: Cliente solicitou prazo adicional',
    description: 'Documentação fiscal pendente de envio por e-mail.',
    timestamp: daysAgo(7),
    variant: 'neutral',
  },
  {
    id: '6',
    type: 'sistema',
    title: 'Configuração fiscal NFS-e atualizada',
    description: 'Alíquota ISS alterada de 2% para 2,5%',
    timestamp: daysAgo(14),
    variant: 'default',
  },
]

export const Default: Story = {
  args: { events: eventos },
}

export const Empty: Story = {
  name: 'Estado Vazio',
  args: { events: [] },
}

export const SomenteAlertas: Story = {
  name: 'Somente Alertas',
  args: {
    events: eventos.filter((e) => e.variant === 'destructive' || e.variant === 'warning'),
  },
}
