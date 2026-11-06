'use client'

import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/auth-context'
import {
  DEFAULT_PARAMETROS_ESCRITORIO,
  fetchParametrosEscritorio,
  saveParametrosEscritorio,
} from '@/features/admin/services'
import type { ParametrosEscritorio } from '@/features/admin/types'
import {
  UI_FEATURE_FLAG_KEYS,
  UI_FEATURE_FLAG_META,
  type UiFeatureFlagKey,
} from '@/lib/feature-flags'

export default function AdminParametrosPage() {
  const { usuario } = useAuth()
  const [form, setForm] = useState<ParametrosEscritorio>({
    ...DEFAULT_PARAMETROS_ESCRITORIO,
    tenantId: usuario?.tenantId ?? DEFAULT_PARAMETROS_ESCRITORIO.tenantId,
  })
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    fetchParametrosEscritorio(usuario?.tenantId)
      .then((result) => {
        if (!mounted) return
        setExists(result.exists)
        setForm(result.data)
      })
      .catch(() => toast.error('Não foi possível carregar os parâmetros do escritório.'))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [usuario?.tenantId])

  function update<K extends keyof ParametrosEscritorio>(key: K, value: ParametrosEscritorio[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateFeatureFlag(key: UiFeatureFlagKey, value: boolean) {
    setForm((prev) => ({
      ...prev,
      uiFeatureFlags: {
        ...prev.uiFeatureFlags,
        [key]: value,
      },
    }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = await saveParametrosEscritorio(exists, form)
      setExists(true)
      setForm(payload)
      toast.success('Parâmetros salvos.')
    } catch {
      toast.error('Não foi possível salvar os parâmetros. Verifique seu perfil de acesso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Parâmetros"
        description="Configurações do escritório usadas por alertas, vencimentos e ambiente fiscal padrão."
        breadcrumbs={[{ label: 'Administração', href: '/admin' }, { label: 'Parâmetros' }]}
      />

      <Card className="max-w-3xl border-border/65 bg-card/95 card-shadow">
        <CardHeader>
          <CardTitle className="text-base">Dados operacionais</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nomeEscritorio">Nome do escritório</Label>
              <Input
                id="nomeEscritorio"
                value={form.nomeEscritorio}
                disabled={loading}
                onChange={(event) => update('nomeEscritorio', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cnpjEscritorio">CNPJ do escritório</Label>
              <Input
                id="cnpjEscritorio"
                value={form.cnpjEscritorio}
                disabled={loading}
                onChange={(event) => update('cnpjEscritorio', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emailAlertas">E-mail de alertas</Label>
              <Input
                id="emailAlertas"
                type="email"
                value={form.emailAlertas}
                disabled={loading}
                onChange={(event) => update('emailAlertas', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="diaVencimentoPadrao">Dia padrão de vencimento</Label>
              <Input
                id="diaVencimentoPadrao"
                type="number"
                min={1}
                max={28}
                value={form.diaVencimentoPadrao}
                disabled={loading}
                onChange={(event) => update('diaVencimentoPadrao', Number(event.target.value))}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Ambiente fiscal padrão</Label>
              <Select
                value={form.ambienteFiscalPadrao}
                onValueChange={(value) => update('ambienteFiscalPadrao', value as ParametrosEscritorio['ambienteFiscalPadrao'])}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologação</SelectItem>
                  <SelectItem value="producao">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Interruptor geral da emissão automática. Fica aqui, e não na ficha
                de cada cliente, porque o caso de uso é justamente o oposto do
                switch por cliente: desligar TUDO de uma vez, no meio de um
                incidente, sem precisar abrir 119 fichas. */}
            <div className="sm:col-span-2 rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="emissao-automatica-geral" className="text-sm font-semibold">
                    Emitir NFS-e automaticamente
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-prose">
                    Com isto ligado, o robô diário emite de verdade as notas dos clientes que
                    também tiverem a emissão automática ativada na ficha fiscal. Desligado, os
                    rascunhos continuam sendo preparados todo dia e ficam em Fiscal esperando
                    alguém revisar e emitir — nada é perdido.
                  </p>
                  {form.emissaoAutomaticaNfseHabilitada && (
                    <p className="text-xs font-medium text-warning pt-1">
                      Ligado: notas fiscais reais podem sair sem revisão humana.
                    </p>
                  )}
                </div>
                <Select
                  value={form.emissaoAutomaticaNfseHabilitada ? 'sim' : 'nao'}
                  onValueChange={(value) => update('emissaoAutomaticaNfseHabilitada', value === 'sim')}
                  disabled={loading}
                >
                  <SelectTrigger id="emissao-automatica-geral" className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Desligado</SelectItem>
                    <SelectItem value="sim">Ligado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2 border-t border-border/70 pt-4">
              <h3 className="text-sm font-semibold">Rollout de UI premium</h3>
              <p className="text-xs text-muted-foreground">
                Flags por tenant para liberar o redesign em etapas, mantendo a interface atual como padrão seguro.
              </p>
            </div>

            {UI_FEATURE_FLAG_KEYS.map((key) => {
              const meta = UI_FEATURE_FLAG_META[key]
              return (
                <div className="space-y-1.5" key={key}>
                  <Label>{meta.label}</Label>
                  <Select
                    value={form.uiFeatureFlags[key] ? 'sim' : 'nao'}
                    onValueChange={(value) => updateFeatureFlag(key, value === 'sim')}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
              )
            })}

            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={saving || loading}>
                Salvar parâmetros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
