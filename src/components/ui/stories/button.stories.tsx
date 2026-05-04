import type { Meta, StoryObj } from '@storybook/nextjs'
import { Button } from '../button'
import { Plus, CheckSquare, Loader2 } from 'lucide-react'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'default', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = { args: { children: 'Salvar' } }
export const Outline: Story = { args: { children: 'Cancelar', variant: 'outline' } }
export const Destructive: Story = { args: { children: 'Excluir', variant: 'destructive' } }
export const Ghost: Story = { args: { children: 'Ver detalhes', variant: 'ghost' } }

export const AllSizes: Story = {
  name: 'Todos os Tamanhos',
  render: () => (
    <div className="flex items-center gap-3 flex-wrap p-4">
      <Button size="xs">XS — ação em tabela</Button>
      <Button size="sm">SM — ação secundária</Button>
      <Button size="default">Default — ação primária</Button>
      <Button size="lg">LG — CTA principal</Button>
    </div>
  ),
}

export const WithIcons: Story = {
  name: 'Com Ícones',
  render: () => (
    <div className="flex items-center gap-3 flex-wrap p-4">
      <Button size="sm"><Plus size={14} />Novo Cliente</Button>
      <Button size="sm" variant="outline"><CheckSquare size={14} />Concluir Tarefa</Button>
      <Button size="icon-sm" variant="ghost"><Plus size={14} /></Button>
    </div>
  ),
}

export const LoadingState: Story = {
  name: 'Estado de Carregamento',
  render: () => (
    <div className="flex items-center gap-3 p-4">
      <Button disabled><Loader2 size={14} className="animate-spin" />Salvando...</Button>
      <Button variant="outline" disabled><Loader2 size={14} className="animate-spin" />Processando</Button>
    </div>
  ),
}

export const CTAsCockpit: Story = {
  name: 'CTAs do Cockpit',
  render: () => (
    <div className="flex flex-col gap-3 p-4 max-w-xs">
      <Button size="lg" className="w-full">Iniciar Execução do Dia</Button>
      <Button size="default" variant="outline" className="w-full"><CheckSquare size={14} />Marcar como Concluída</Button>
      <Button size="sm" variant="ghost">Ver histórico completo</Button>
    </div>
  ),
}
