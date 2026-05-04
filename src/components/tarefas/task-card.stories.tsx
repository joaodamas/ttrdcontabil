import type { Meta, StoryObj } from '@storybook/nextjs'
import { TaskCard } from './task-card'
import { Timestamp } from 'firebase/firestore'

const meta: Meta<typeof TaskCard> = {
  title: 'Domain/TaskCard',
  component: TaskCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof TaskCard>

const usuarios = [
  { id: 'u1', nome: 'Ana Lima' },
  { id: 'u2', nome: 'Carlos Mota' },
  { id: 'u3', nome: 'Beatriz Costa' },
]

function daysFromNow(days: number): Timestamp {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return Timestamp.fromDate(d)
}

export const Urgente: Story = {
  args: {
    task: {
      id: '1',
      titulo: 'Emitir PGDAS-D Maio/25 — Comércio ABC',
      clienteNome: 'Comércio ABC Ltda',
      prioridade: 'urgente',
      responsavelId: 'u1',
      responsavelNome: 'Ana Lima',
      dataPrazo: daysFromNow(0),
      status: 'aberta',
    },
    usuarios,
  },
}

export const AltaComSLACritico: Story = {
  name: 'Alta + SLA Crítico (48h)',
  args: {
    task: {
      id: '2',
      titulo: 'Folha de Pagamento — J.Silva MEI',
      clienteNome: 'J.Silva MEI',
      prioridade: 'alta',
      responsavelId: 'u2',
      responsavelNome: 'Carlos Mota',
      dataPrazo: daysFromNow(1),
      status: 'aberta',
    },
    usuarios,
  },
}

export const Atrasada: Story = {
  args: {
    task: {
      id: '3',
      titulo: 'DCTF Mensal Abril/25',
      clienteNome: 'Tech Solutions SA',
      prioridade: 'normal',
      responsavelId: 'u3',
      responsavelNome: 'Beatriz Costa',
      dataPrazo: daysFromNow(-5),
      status: 'aberta',
    },
    usuarios,
  },
}

export const Normal: Story = {
  args: {
    task: {
      id: '4',
      titulo: 'Revisão Balanço Patrimonial Q1',
      clienteNome: 'Global Trade SA',
      prioridade: 'normal',
      responsavelId: 'u1',
      responsavelNome: 'Ana Lima',
      dataPrazo: daysFromNow(10),
      status: 'aberta',
    },
    usuarios,
  },
}

export const Selecionada: Story = {
  args: {
    ...Normal.args,
    selected: true,
  },
}

export const ListaVariada: Story = {
  name: 'Lista com Prioridades Variadas',
  render: () => (
    <div className="flex flex-col gap-2 max-w-2xl">
      <TaskCard
        task={{ id: '1', titulo: 'PGDAS-D — Bloqueio de fechamento', clienteNome: 'Comércio ABC', prioridade: 'urgente', responsavelNome: 'Ana Lima', dataPrazo: daysFromNow(0), status: 'aberta' }}
        usuarios={usuarios}
      />
      <TaskCard
        task={{ id: '2', titulo: 'Folha Pagamento — entrega amanhã', clienteNome: 'J.Silva MEI', prioridade: 'alta', responsavelNome: 'Carlos Mota', dataPrazo: daysFromNow(1), status: 'aberta' }}
        usuarios={usuarios}
      />
      <TaskCard
        task={{ id: '3', titulo: 'DCTF Mensal — em atraso', clienteNome: 'Tech Solutions SA', prioridade: 'normal', responsavelNome: 'Beatriz Costa', dataPrazo: daysFromNow(-3), status: 'aberta' }}
        usuarios={usuarios}
      />
      <TaskCard
        task={{ id: '4', titulo: 'Revisão de contrato trimestral', clienteNome: 'Global Trade SA', prioridade: 'baixa', responsavelNome: 'Ana Lima', dataPrazo: daysFromNow(20), status: 'aberta' }}
        usuarios={usuarios}
      />
    </div>
  ),
}
