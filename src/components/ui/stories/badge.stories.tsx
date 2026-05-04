import type { Meta, StoryObj } from '@storybook/nextjs'
import { Badge } from '../badge'

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'success', 'warning', 'info', 'neutral'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = { args: { children: 'Default', variant: 'default' } }
export const Success: Story = { args: { children: 'Pago', variant: 'success' } }
export const Warning: Story = { args: { children: 'SLA Crítico 48h', variant: 'warning' } }
export const Destructive: Story = { args: { children: 'Atrasado', variant: 'destructive' } }
export const Neutral: Story = { args: { children: 'Aguardando', variant: 'neutral' } }
export const Info: Story = { args: { children: 'Em andamento', variant: 'info' } }

export const AllSemanticVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      <Badge variant="success">Pago / Concluído</Badge>
      <Badge variant="warning">SLA 48h / Atenção</Badge>
      <Badge variant="destructive">Atrasado / Inadimplente</Badge>
      <Badge variant="neutral">Aguardando / Rascunho</Badge>
      <Badge variant="info">Em andamento</Badge>
      <Badge variant="default">Ativo</Badge>
      <Badge variant="secondary">Inativo</Badge>
      <Badge variant="outline">Suspenso</Badge>
    </div>
  ),
}

export const OperationalStatuses: Story = {
  name: 'Status Operacionais Contábeis',
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">Tarefas</p>
        <div className="flex gap-2">
          <Badge variant="destructive">Atrasada</Badge>
          <Badge variant="warning">Hoje</Badge>
          <Badge variant="neutral">Próximos</Badge>
          <Badge variant="success">Concluída</Badge>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">Financeiro</p>
        <div className="flex gap-2">
          <Badge variant="success">Pago</Badge>
          <Badge variant="destructive">Inadimplente</Badge>
          <Badge variant="warning">Vence hoje</Badge>
          <Badge variant="neutral">Pendente</Badge>
          <Badge variant="secondary">Cancelado</Badge>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">Competências</p>
        <div className="flex gap-2">
          <Badge variant="success">Fechada</Badge>
          <Badge variant="warning">Aberta</Badge>
          <Badge variant="info">Em revisão</Badge>
        </div>
      </div>
    </div>
  ),
}
