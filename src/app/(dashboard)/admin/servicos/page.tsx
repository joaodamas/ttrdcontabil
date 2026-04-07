export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { adminDb } from '@/lib/firebase-admin'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ServicoForm } from '@/components/admin/servico-form'

const FREQUENCIA_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  avulso: 'Avulso',
  anual: 'Anual',
  trimestral: 'Trimestral',
}

export default async function AdminServicosPage() {
  await requireAdmin()

  const snap = await adminDb
    .collection('servicos')
    .orderBy('nome')
    .get()

  const servicos = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Array<Record<string, unknown>>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tipos de Serviço</h2>
          <p className="text-sm text-muted-foreground">
            {servicos.length} serviço{servicos.length !== 1 ? 's' : ''} cadastrado{servicos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <ServicoForm />
      </div>

      <Card>
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Frequência</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Valor Padrão
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {servicos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum serviço cadastrado.
                  </td>
                </tr>
              ) : (
                servicos.map((s) => (
                  <tr key={s.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{s.nome as string}</p>
                        {s.descricao ? (
                          <p className="text-xs text-muted-foreground">{s.descricao as string}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {FREQUENCIA_LABELS[s.frequencia as string] ?? (s.frequencia as string)}
                    </td>
                    <td className="px-4 py-3">
                      {s.valorPadrao ? formatCurrency(s.valorPadrao as number) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.ativo ? 'default' : 'secondary'}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ServicoForm servico={s} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
