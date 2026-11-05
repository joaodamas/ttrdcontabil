'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { getErrorMessage } from '@/lib/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TableEmptyState } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import { Plug, RefreshCw } from 'lucide-react'
import { fetchConectoresFiscaisAdmin, updateConectorFiscalAdmin } from '@/features/admin/services'
import type { ConectorFiscalAdmin } from '@/features/admin/types'

function boolBadge(value?: boolean, positiveLabel = 'Sim', negativeLabel = 'Não') {
  return (
    <Badge variant={value ? 'success' : 'secondary'}>
      {value ? positiveLabel : negativeLabel}
    </Badge>
  )
}

export default function AdminConectoresPage() {
  const [conectores, setConectores] = useState<ConectorFiscalAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErroCarga(null)
    try {
      const data = await fetchConectoresFiscaisAdmin()
      setConectores(data)
    } catch (err) {
      console.error('[admin/conectores] falha ao carregar', err)
      setErroCarga(getErrorMessage(err, 'Verifique sua conexão e tente novamente.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(id: string, field: keyof ConectorFiscalAdmin, value: boolean) {
    setSavingId(id)
    try {
      await updateConectorFiscalAdmin(id, field, value)
      setConectores((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
      toast.success('Conector atualizado.')
    } catch {
      toast.error('Não foi possível atualizar o conector. Verifique seu perfil de acesso.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Conectores"
        description="Conectores fiscais por município: homologação e liberação de produção."
        breadcrumbs={[{ label: 'Administração', href: '/admin' }, { label: 'Conectores' }]}
        action={
          <Button variant="outline" size="cta" onClick={load} loading={loading}>
            <RefreshCw />
            Atualizar
          </Button>
        }
      />

      <Card className="border-border/65 bg-card/95 card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left section-label">Conector</th>
                <th className="px-4 py-3 text-left section-label">Município</th>
                <th className="px-4 py-3 text-left section-label">Capacidades</th>
                <th className="px-4 py-3 text-left section-label">Homologado</th>
                <th className="px-4 py-3 text-left section-label">Produção</th>
                <th className="px-4 py-3 text-left section-label">Ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando conectores fiscais...
                  </td>
                </tr>
              ) : erroCarga ? (
                <TableEmptyState
                  colSpan={6}
                  icon={Plug}
                  title="Não foi possível carregar os conectores fiscais"
                  description={erroCarga}
                  action={{ label: 'Tentar novamente', onClick: () => { void load() } }}
                />
              ) : conectores.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  icon={Plug}
                  title="Nenhum conector cadastrado"
                  description="Rode o seed de conectores fiscais antes da homologação e mantenha produção bloqueada até validar emissão, consulta e cancelamento."
                />
              ) : conectores.map((conector) => (
                <tr key={conector.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Plug className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{conector.nome ?? conector.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {conector.tipoIntegracao ?? 'manual_assistido'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p>{conector.municipio ?? 'Geral'}</p>
                    <p className="text-xs text-muted-foreground">{conector.uf ?? '-'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {boolBadge(conector.emissao, 'Emissão', 'Emissão pendente')}
                      {boolBadge(conector.consulta, 'Consulta', 'Consulta pendente')}
                      {boolBadge(conector.cancelamento, 'Cancelamento', 'Cancelamento pendente')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={Boolean(conector.homologado)}
                      disabled={savingId === conector.id}
                      onCheckedChange={(value) => toggle(conector.id, 'homologado', value)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={Boolean(conector.producaoLiberada)}
                      disabled={savingId === conector.id || !conector.homologado}
                      onCheckedChange={(value) => toggle(conector.id, 'producaoLiberada', value)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={conector.ativo !== false}
                      disabled={savingId === conector.id}
                      onCheckedChange={(value) => toggle(conector.id, 'ativo', value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
