'use client'
import { LancamentoForm } from '@/components/financeiro/lancamento-form'
import { InlineAlert } from '@/components/ui/inline-alert'

export default function Page() {
  return (
    <div className="stack-6">
      <div>
        <h1 className="text-title">Novo Lançamento</h1>
        <p className="text-subtle">Cadastre receitas e despesas com clareza operacional.</p>
      </div>
      <InlineAlert
        tone="info"
        title="Dica de produtividade"
        description="Preencha descrição e vencimento de forma padronizada para facilitar o acompanhamento em lote."
      />
      <LancamentoForm />
    </div>
  )
}
