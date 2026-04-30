import {
  ActionBar,
  ActionPanel,
  ClientHeader,
  DataTable,
  DecisionCard,
  KpiCard,
  PriorityList,
  ProgressBlock,
  RiskBanner,
  Timeline,
} from '@/components/premium/saas-blocks'

type Row = { id: string; cliente: string; valor: string; vencimento: string; status: string }

const financeiroRows: Row[] = [
  { id: '1', cliente: 'Acme Ltda', valor: 'R$ 6.200,00', vencimento: 'Ontem', status: 'Atrasado' },
  { id: '2', cliente: 'Beta Comércio', valor: 'R$ 2.800,00', vencimento: 'Hoje', status: 'Pendente' },
]

export default function PremiumBlueprintPage() {
  return (
    <div className="stack-6">
      <section className="stack-4">
        <h2 className="text-title">Financeiro: centro de decisão</h2>
        <RiskBanner
          title="R$ 42.340 em risco de inadimplência"
          description="11 títulos vencidos e 8 vencendo em 72h. Priorize renegociação de 3 contas-chave."
          severity="critical"
          ctaLabel="Abrir fila de cobrança"
          ctaHref="/financeiro"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiCard title="Atrasados" value="R$ 42.340" detail="+12% vs semana anterior" trend="up" />
          <KpiCard title="Vencem hoje" value="R$ 9.780" />
          <KpiCard title="Recebido no mês" value="R$ 183.000" />
        </div>
        <DecisionCard title="Prioridade automática de cobrança" subtitle="Score: SLA + atraso + impacto de caixa">
          <PriorityList
            items={[
              { id: 'a', title: 'Acme Ltda', subtitle: 'R$ 6.200 • 6 dias em atraso', severity: 'critical', href: '/financeiro' },
              { id: 'b', title: 'Nova Sul', subtitle: 'R$ 5.400 • vence hoje', severity: 'high', href: '/financeiro' },
            ]}
          />
        </DecisionCard>
        <ActionBar
          title="Ações rápidas"
          actions={[
            { label: 'Baixar em lote' },
            { label: 'Cobrar por e-mail', variant: 'outline' },
            { label: 'Propor negociação', variant: 'outline' },
          ]}
        />
        <DataTable
          columns={[
            { key: 'cliente', header: 'Cliente', render: (r) => r.cliente },
            { key: 'valor', header: 'Valor', align: 'right', render: (r) => r.valor },
            { key: 'vencimento', header: 'Vencimento', render: (r) => r.vencimento },
            { key: 'status', header: 'Status', render: (r) => r.status },
          ]}
          rows={financeiroRows}
          emptyTitle="Sem lançamentos"
          emptyDescription="Ajuste filtros para visualizar os registros."
        />
      </section>

      <section className="stack-4">
        <h2 className="text-title">Cliente 360: workspace principal</h2>
        <div className="grid gap-6 lg:grid-cols-[7fr_3fr]">
          <div className="space-y-4">
            <ClientHeader
              name="Acme Ltda"
              segment="Simples Nacional • Código #184"
              health={[
                { label: 'Financeiro', state: 'risk' },
                { label: 'Fiscal', state: 'warning' },
                { label: 'Operacional', state: 'ok' },
              ]}
            />
            <DecisionCard title="Timeline unificada">
              <Timeline
                items={[
                  { id: '1', title: 'Cobrança enviada', description: 'E-mail com boleto atualizado', at: 'Hoje 09:12', type: 'Financeiro', done: true },
                  { id: '2', title: 'Competência abril bloqueada', description: 'Falta DAS', at: 'Ontem 17:40', type: 'Fechamento' },
                ]}
              />
            </DecisionCard>
          </div>
          <ActionPanel title="Próximos passos">
            <PriorityList
              items={[
                { id: '1', title: 'Regularizar DAS de abril', subtitle: 'Bloqueia fechamento mensal', severity: 'critical', href: '/fechamento' },
                { id: '2', title: 'Confirmar pagamento em atraso', subtitle: 'Cliente com risco de churn', severity: 'high', href: '/financeiro' },
              ]}
            />
          </ActionPanel>
        </div>
      </section>

      <section className="stack-4">
        <h2 className="text-title">Cockpit hoje</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <KpiCard title="Atrasados" value="14" />
          <KpiCard title="Vencem hoje" value="22" />
          <KpiCard title="Próx. 7 dias" value="57" />
          <KpiCard title="Bloqueios" value="6" detail="3 críticos" trend="up" />
        </div>
        <ActionBar title="Ações em lote" actions={[{ label: 'Concluir selecionadas' }, { label: 'Reatribuir', variant: 'outline' }, { label: 'Alterar prazo', variant: 'outline' }]} />
      </section>

      <section className="stack-4">
        <h2 className="text-title">Fechamento mensal</h2>
        <ProgressBlock title="Progresso global" current={98} total={120} blockerCount={6} />
        <RiskBanner
          title="6 bloqueios impedem fechamento"
          description="Sem resolver os bloqueios críticos, o mês não pode ser finalizado com segurança."
          severity="high"
          ctaLabel="Resolver bloqueios"
          ctaHref="/fechamento"
        />
      </section>
    </div>
  )
}
