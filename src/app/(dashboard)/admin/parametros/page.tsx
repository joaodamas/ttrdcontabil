'use client'

import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { fetchWhatsappTemplates, updateWhatsappTemplate } from '@/features/whatsapp/services'
import type { WhatsappTemplate } from '@/features/whatsapp/types'
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

  const [templates, setTemplates] = useState<WhatsappTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [savingTemplateKey, setSavingTemplateKey] = useState<string | null>(null)
  const [draftContentSid, setDraftContentSid] = useState<Record<string, string>>({})

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

  useEffect(() => {
    let mounted = true
    fetchWhatsappTemplates()
      .then((rows) => mounted && setTemplates(rows))
      .catch(() => toast.error('Não foi possível carregar o catálogo de mensagens.'))
      .finally(() => mounted && setTemplatesLoading(false))
    return () => { mounted = false }
  }, [])

  async function saveTemplateField(template: WhatsappTemplate, patch: Partial<Pick<WhatsappTemplate, 'providerContentSid' | 'ativo' | 'aprovadoProvider'>>) {
    if (!template.templateKey) return
    setSavingTemplateKey(template.templateKey)
    try {
      await updateWhatsappTemplate({ templateKey: template.templateKey, ...patch })
      setTemplates((prev) => prev.map((item) => (item.id === template.id ? { ...item, ...patch } : item)))
      toast.success('Template atualizado.')
    } catch {
      toast.error('Não foi possível atualizar o template. Verifique seu perfil de acesso.')
    } finally {
      setSavingTemplateKey(null)
    }
  }

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
      <div className="surface-subtle border px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold">Parâmetros do Escritório</h2>
        <p className="text-sm text-muted-foreground">
          Configurações usadas por alertas, vencimentos e ambiente fiscal padrão.
        </p>
      </div>

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

            <div className="space-y-1.5 sm:col-span-2 pt-2">
              <h3 className="text-sm font-semibold">Cobrança por WhatsApp</h3>
              <p className="text-xs text-muted-foreground">
                Configuração base da régua automática e do canal via Twilio.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Canal habilitado</Label>
              <Select
                value={form.whatsappCloudApiEnabled ? 'sim' : 'nao'}
                onValueChange={(value) => update('whatsappCloudApiEnabled', value === 'sim')}
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
            </div>

            <div className="space-y-1.5">
              <Label>Usar dias úteis</Label>
              <Select
                value={form.whatsappUsaDiasUteis ? 'sim' : 'nao'}
                onValueChange={(value) => update('whatsappUsaDiasUteis', value === 'sim')}
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
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="whatsappTwilioFromNumber">Número Twilio (WhatsApp)</Label>
              <Input
                id="whatsappTwilioFromNumber"
                placeholder="+5511999999999"
                value={form.whatsappTwilioFromNumber}
                disabled={loading}
                onChange={(event) => update('whatsappTwilioFromNumber', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="whatsappJanelaHoraMinima">Janela mínima</Label>
              <Input
                id="whatsappJanelaHoraMinima"
                type="time"
                value={form.whatsappJanelaHoraMinima}
                disabled={loading}
                onChange={(event) => update('whatsappJanelaHoraMinima', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="whatsappJanelaHoraMaxima">Janela máxima</Label>
              <Input
                id="whatsappJanelaHoraMaxima"
                type="time"
                value={form.whatsappJanelaHoraMaxima}
                disabled={loading}
                onChange={(event) => update('whatsappJanelaHoraMaxima', event.target.value)}
              />
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

      <Card className="max-w-3xl border-border/65 bg-card/95 card-shadow">
        <CardHeader>
          <CardTitle className="text-base">Catálogo de mensagens WhatsApp</CardTitle>
          <p className="text-sm text-muted-foreground">
            Vincule cada chave interna ao ContentSid do template aprovado no Content API da Twilio.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {templatesLoading && <p className="text-sm text-muted-foreground">Carregando catálogo...</p>}
          {!templatesLoading && templates.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum template encontrado.</p>
          )}
          {templates.map((template) => {
            const key = template.templateKey ?? template.id
            const isSaving = savingTemplateKey === template.templateKey
            const contentSidValue = draftContentSid[key] ?? template.providerContentSid ?? ''
            return (
              <div key={template.id} className="grid gap-3 border-b border-border/60 pb-4 last:border-0 last:pb-0 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="font-mono text-xs text-muted-foreground">{key}</Label>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`contentSid-${key}`}>ContentSid da Twilio</Label>
                  <Input
                    id={`contentSid-${key}`}
                    placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={contentSidValue}
                    disabled={isSaving}
                    onChange={(event) => setDraftContentSid((prev) => ({ ...prev, [key]: event.target.value }))}
                    onBlur={() => {
                      if (contentSidValue !== (template.providerContentSid ?? '')) {
                        void saveTemplateField(template, { providerContentSid: contentSidValue })
                      }
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Ativo</Label>
                  <Select
                    value={template.ativo ? 'sim' : 'nao'}
                    onValueChange={(value) => void saveTemplateField(template, { ativo: value === 'sim' })}
                    disabled={isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Aprovado pela Meta</Label>
                  <Select
                    value={template.aprovadoProvider ? 'sim' : 'nao'}
                    onValueChange={(value) => void saveTemplateField(template, { aprovadoProvider: value === 'sim' })}
                    disabled={isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
