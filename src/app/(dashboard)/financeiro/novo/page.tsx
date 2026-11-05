'use client'
import { PageHeader } from '@/components/layout/page-header'
import { LancamentoForm } from '@/components/financeiro/lancamento-form'
import { InlineAlert } from '@/components/ui/inline-alert'

export default function Page() {
  return (
    <div className="stack-6">
      <PageHeader
        title="Novo lançamento"
        breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Novo lançamento' }]}
        description="Cadastre receitas e despesas com clareza operacional."
      />
      <InlineAlert
        tone="info"
        title="Dica de produtividade"
        description="Preencha descrição e vencimento de forma padronizada para facilitar o acompanhamento em lote."
      />
      <LancamentoForm />
    </div>
  )
}
