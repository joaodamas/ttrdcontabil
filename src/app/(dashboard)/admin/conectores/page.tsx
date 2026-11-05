'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { getErrorMessage } from '@/lib/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TableEmptyState } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import { Plug, RefreshCw } from 'lucide-react'
import { criarConectorNacionalAdmin, fetchConectoresFiscaisAdmin, updateConectorFiscalAdmin } from '@/features/admin/services'
import { MUNICIPIOS } from '@/components/fiscal/config-fiscal-form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ConectorFiscalAdmin } from '@/features/admin/types'

function caminhoBadge(conector: ConectorFiscalAdmin) {
  return conector.provedor === 'nacional'
    ? <Badge variant="info">Ambiente Nacional</Badge>
    : <Badge variant="secondary">Prefeitura</Badge>
}

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
  const [ibgeNacional, setIbgeNacional] = useState('')
  const [criandoNacional, setCriandoNacional] = useState(false)

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

  const municipiosSemNacional = MUNICIPIOS.filter(
    (m) => !conectores.some((c) => c.provedor === 'nacional' && c.municipioIbge === m.ibge),
  )

  async function adicionarNacional() {
    const municipio = MUNICIPIOS.find((m) => m.ibge === ibgeNacional)
    if (!municipio) return
    setCriandoNacional(true)
    try {
      await criarConectorNacionalAdmin({ ibge: municipio.ibge, nome: municipio.nome })
      toast.success(`${municipio.nome} adicionado ao Ambiente Nacional. Marque "homologado" depois de validar e só então libere a produção.`)
      setIbgeNacional('')
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível adicionar o município ao Ambiente Nacional.'))
    } finally {
      setCriandoNacional(false)
    }
  }

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
          <div className="flex flex-wrap items-center gap-2">
            <Select value={ibgeNacional} onValueChange={(v) => setIbgeNacional(v ?? '')}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Município p/ Ambiente Nacional" />
              </SelectTrigger>
              <SelectContent>
                {municipiosSemNacional.map((m) => (
                  <SelectItem key={m.ibge} value={m.ibge}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="cta" onClick={adicionarNacional} disabled={!ibgeNacional} loading={criandoNacional}>
              Adicionar ao Ambiente Nacional
            </Button>
            <Button variant="outline" size="cta" onClick={load} loading={loading}>
              <RefreshCw />
              Atualizar
            </Button>
          </div>
        }
      />

      <Card className="border-border/65 bg-card/95 card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm md:table-auto md:min-w-[960px]">
            <thead className="hidden border-b bg-muted/50 md:table-header-group">
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
                <Fragment key={conector.id}>
                <tr className="hidden hover:bg-muted/35 md:table-row">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Plug className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{conector.nome ?? conector.id}</p>
                        <div className="mt-0.5">{caminhoBadge(conector)}</div>
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
                <tr className="md:hidden">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-medium">{conector.nome ?? conector.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {conector.municipio ?? 'Geral'} · {conector.uf ?? '-'} · {conector.provedor === 'nacional' ? 'Ambiente Nacional' : 'Prefeitura'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {boolBadge(conector.emissao, 'Emissão', 'Emissão pendente')}
                      {boolBadge(conector.consulta, 'Consulta', 'Consulta pendente')}
                      {boolBadge(conector.cancelamento, 'Cancelamento', 'Cancelamento pendente')}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <label className="flex flex-col items-start gap-1">
                        Homologado
                        <Switch
                          checked={Boolean(conector.homologado)}
                          disabled={savingId === conector.id}
                          onCheckedChange={(value) => toggle(conector.id, 'homologado', value)}
                        />
                      </label>
                      <label className="flex flex-col items-start gap-1">
                        Produção
                        <Switch
                          checked={Boolean(conector.producaoLiberada)}
                          disabled={savingId === conector.id || !conector.homologado}
                          onCheckedChange={(value) => toggle(conector.id, 'producaoLiberada', value)}
                        />
                      </label>
                      <label className="flex flex-col items-start gap-1">
                        Ativo
                        <Switch
                          checked={conector.ativo !== false}
                          disabled={savingId === conector.id}
                          onCheckedChange={(value) => toggle(conector.id, 'ativo', value)}
                        />
                      </label>
                    </div>
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
