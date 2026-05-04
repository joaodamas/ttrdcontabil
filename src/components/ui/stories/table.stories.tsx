import type { Meta, StoryObj } from '@storybook/nextjs'
import {
  Table, TableHeader, TableBody, TableFooter,
  TableHead, TableRow, TableCell, TableCurrencyCell, TableCaption,
} from '../table'
import { Badge } from '../badge'

const meta: Meta = {
  title: 'UI/Table',
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj

export const FinancialTable: Story = {
  name: 'Tabela Financeira (Lançamentos)',
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          { cliente: 'Tech Solutions Ltda', desc: 'Honorários Mai/25', venc: '10/05/2025', valor: 'R$ 1.800,00', status: 'Pago', s: 'success' },
          { cliente: 'Comércio ABC', desc: 'Folha de Pagamento', venc: '05/05/2025', valor: 'R$ 3.200,00', status: 'Vence hoje', s: 'warning' },
          { cliente: 'J.Silva MEI', desc: 'DASN-SIMEI', venc: '28/04/2025', valor: 'R$ 320,00', status: 'Atrasado', s: 'destructive' },
          { cliente: 'Global Trade SA', desc: 'Declaração IRPJ', venc: '31/05/2025', valor: 'R$ 5.600,00', status: 'Pendente', s: 'neutral' },
        ].map((row, i) => (
          <TableRow key={i} className={row.s === 'destructive' ? 'table-row-critical' : undefined}>
            <TableCell className="font-medium">{row.cliente}</TableCell>
            <TableCell className="text-muted-foreground">{row.desc}</TableCell>
            <TableCell className={row.s === 'destructive' ? 'text-destructive font-semibold' : ''}>{row.venc}</TableCell>
            <TableCurrencyCell>{row.valor}</TableCurrencyCell>
            <TableCell>
              <Badge variant={row.s as 'success' | 'warning' | 'destructive' | 'neutral'}>
                {row.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="text-muted-foreground">4 lançamentos</TableCell>
          <TableCurrencyCell className="font-semibold">R$ 10.920,00</TableCurrencyCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  ),
}

export const TaskTable: Story = {
  name: 'Tabela de Tarefas (Cockpit)',
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1" />
          <TableHead>Tarefa</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Prazo</TableHead>
          <TableHead>Prioridade</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          { prio: 'priority-urgente', task: 'PGDAS-D Maio', cliente: 'Comércio ABC', prazo: 'hoje', prioLabel: 'Urgente', s: 'destructive' },
          { prio: 'priority-alta', task: 'Folha de Pag.', cliente: 'J.Silva MEI', prazo: 'amanhã', prioLabel: 'Alta', s: 'warning' },
          { prio: 'priority-normal', task: 'Revisão Balanço', cliente: 'Tech Solutions', prazo: '15/05', prioLabel: 'Normal', s: 'neutral' },
        ].map((row, i) => (
          <TableRow key={i} className={row.prio}>
            <TableCell className="w-1 pr-0" />
            <TableCell className="font-medium">{row.task}</TableCell>
            <TableCell className="text-muted-foreground">{row.cliente}</TableCell>
            <TableCell>{row.prazo}</TableCell>
            <TableCell>
              <Badge variant={row.s as 'destructive' | 'warning' | 'neutral'}>{row.prioLabel}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="neutral">Aberta</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}
