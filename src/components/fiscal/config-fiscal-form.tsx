'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { createDocument, updateDocument } from '@/lib/firestore-client'
import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export const MUNICIPIOS = [
  { ibge: '3525904', nome: 'Jundiaí' },
  { ibge: '3509502', nome: 'Campinas' },
  { ibge: '3508900', nome: 'Cajamar' },
  { ibge: '3550308', nome: 'São Paulo' },
  { ibge: '3505708', nome: 'Barueri' },
  { ibge: '3547304', nome: 'Santana de Parnaíba' },
  { ibge: '3552502', nome: 'Taboão da Serra' },
  { ibge: '3513009', nome: 'Cotia' },
]

export const MUNICIPIO_TIPO: Record<string, 'abrasf_a1' | 'simpliss' | 'conam' | 'giap'> = {
  '3525904': 'abrasf_a1',
  '3509502': 'abrasf_a1',
  '3508900': 'abrasf_a1',
  '3550308': 'abrasf_a1',
  '3505708': 'abrasf_a1',
  '3547304': 'simpliss',
  '3552502': 'conam',
  '3513009': 'giap',
}

const schema = z.object({
  municipioIbge:       z.string().min(1, 'Selecione o município'),
  inscricaoMunicipal:  z.string().min(1, 'Inscrição municipal obrigatória'),
  inscricaoEstadual:   z.string().optional().nullable(),
  ambienteEmissao:     z.enum(['homologacao', 'producao']),
  regimeTributario:    z.string().min(1, 'Regime tributário obrigatório'),
  optanteSimples:      z.boolean(),
  incentivadorCultural: z.boolean().optional(),
  naturezaOperacao:    z.string().optional(),
  itemListaServico:    z.string().optional().nullable(),
  cnae:                z.string().optional().nullable(),
  aliquotaPadrao:      z.number().min(0).max(100).optional().nullable(),
  // token credentials
  simplissToken:       z.string().optional().nullable(),
  conamCodigoUsuario:  z.string().optional().nullable(),
  conamCodigoContribuinte: z.string().optional().nullable(),
  giaplogin:           z.string().optional().nullable(),
  giapSenha:           z.string().optional().nullable(),
})

type FormData = z.input<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  clienteId: string
  docId?: string
  defaultValues?: Partial<FormData> & { credenciais?: Record<string, unknown> }
  onSaved?: () => void
}

export function ConfigFiscalForm({ open, onOpenChange, clienteId, docId, defaultValues, onSaved }: Props) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ambienteEmissao:  'homologacao',
      optanteSimples:   true,
      naturezaOperacao: '1',
    },
  })

  useEffect(() => {
    if (!open) return
    const creds = defaultValues?.credenciais ?? {}
    reset({
      ambienteEmissao:  'homologacao',
      optanteSimples:   true,
      naturezaOperacao: '1',
      ...defaultValues,
      simplissToken:          (creds.simplissToken as string) ?? null,
      conamCodigoUsuario:     (creds.conamCodigoUsuario as string) ?? null,
      conamCodigoContribuinte:(creds.conamCodigoContribuinte as string) ?? null,
      giaplogin:              (creds.giaplogin as string) ?? null,
      giapSenha:              (creds.giapSenha as string) ?? null,
    })
  }, [open, defaultValues, reset])

  const municipioIbge = watch('municipioIbge')
  const tipo = MUNICIPIO_TIPO[municipioIbge]
  const municipioNome = MUNICIPIOS.find(m => m.ibge === municipioIbge)?.nome ?? ''

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      // Payload sem credenciais — dados de configuração salvos diretamente
      const payload: Record<string, unknown> = {
        clienteId,
        municipioIbge:        data.municipioIbge,
        municipioEmissor:     municipioNome,
        inscricaoMunicipal:   data.inscricaoMunicipal,
        inscricaoEstadual:    data.inscricaoEstadual  || null,
        ambienteEmissao:      data.ambienteEmissao,
        regimeTributario:     data.regimeTributario,
        optanteSimples:       data.optanteSimples,
        incentivadorCultural: data.incentivadorCultural ?? false,
        naturezaOperacao:     data.naturezaOperacao || '1',
        itemListaServico:     data.itemListaServico  || null,
        cnae:                 data.cnae              || null,
        aliquotaPadrao:       data.aliquotaPadrao    ?? null,
      }

      let savedDocId = docId
      if (docId) {
        await updateDocument('clientes_fiscal', docId, payload)
      } else {
        savedDocId = await createDocument('clientes_fiscal', payload)
      }

      // Credenciais sensíveis enviadas via Cloud Function (criptografadas no servidor)
      const credenciais: Record<string, string> = {}
      if (tipo === 'simpliss' && data.simplissToken)            credenciais.simplissToken = data.simplissToken
      if (tipo === 'conam'    && data.conamCodigoUsuario)       credenciais.conamCodigoUsuario = data.conamCodigoUsuario
      if (tipo === 'conam'    && data.conamCodigoContribuinte)  credenciais.conamCodigoContribuinte = data.conamCodigoContribuinte
      if (tipo === 'giap'     && data.giaplogin)                credenciais.giaplogin = data.giaplogin
      if (tipo === 'giap'     && data.giapSenha)                credenciais.giapSenha = data.giapSenha

      if (Object.keys(credenciais).length > 0) {
        const functions = getFunctions(app, 'southamerica-east1')
        const salvar = httpsCallable(functions, 'salvarCredenciaisFiscais')
        await salvar({ clienteId, docId: savedDocId, credenciais })
      }

      toast.success('Configuração fiscal salva!')
      onOpenChange(false)
      onSaved?.()
    } catch {
      toast.error('Erro ao salvar configuração.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: '640px' }} className="w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração Fiscal — NFS-e</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">

          {/* Município + Ambiente */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Município de Emissão *</Label>
              <Controller name="municipioIbge" control={control} render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {MUNICIPIOS.map(m => (
                      <SelectItem key={m.ibge} value={m.ibge}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
              {errors.municipioIbge && <p className="text-xs text-destructive">{errors.municipioIbge.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Ambiente *</Label>
              <Controller name="ambienteEmissao" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Homologação (Testes)</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>

          {/* Inscrições */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Inscrição Municipal *</Label>
              <Input {...register('inscricaoMunicipal')} placeholder="Ex: 123456" />
              {errors.inscricaoMunicipal && <p className="text-xs text-destructive">{errors.inscricaoMunicipal.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Inscrição Estadual</Label>
              <Input {...register('inscricaoEstadual')} placeholder="Opcional" />
            </div>
          </div>

          {/* Regime + Simples */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Regime Tributário *</Label>
              <Controller name="regimeTributario" control={control} render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                    <SelectItem value="mei">MEI</SelectItem>
                    <SelectItem value="isento">Isento / Imune</SelectItem>
                  </SelectContent>
                </Select>
              )} />
              {errors.regimeTributario && <p className="text-xs text-destructive">{errors.regimeTributario.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Optante Simples *</Label>
              <Controller name="optanteSimples" control={control} render={({ field }) => (
                <Select value={field.value ? 'sim' : 'nao'} onValueChange={v => field.onChange(v === 'sim')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>

          {/* Serviço padrão */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Item Lista Serviço</Label>
              <Input {...register('itemListaServico')} placeholder="Ex: 17.19" />
            </div>
            <div className="space-y-1.5">
              <Label>CNAE</Label>
              <Input {...register('cnae')} placeholder="Ex: 6920601" />
            </div>
            <div className="space-y-1.5">
              <Label>Alíquota ISS (%)</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                placeholder="Ex: 5"
                {...register('aliquotaPadrao', { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* Natureza da operação */}
          <div className="space-y-1.5">
            <Label>Natureza da Operação</Label>
            <Controller name="naturezaOperacao" control={control} render={({ field }) => (
              <Select value={field.value ?? '1'} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Tributação no município</SelectItem>
                  <SelectItem value="2">2 — Tributação fora do município</SelectItem>
                  <SelectItem value="3">3 — Isenção</SelectItem>
                  <SelectItem value="4">4 — Imune</SelectItem>
                  <SelectItem value="5">5 — Exigibilidade Suspensa (Judicial)</SelectItem>
                  <SelectItem value="6">6 — Exigibilidade Suspensa (Adm.)</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>

          {/* Credenciais: Santana de Parnaíba */}
          {tipo === 'simpliss' && (
            <div className="border rounded-md p-3 bg-muted/30 space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Credenciais — SimplissWeb (Santana de Parnaíba)</p>
              <div className="space-y-1.5">
                <Label>Token de Acesso</Label>
                <Input {...register('simplissToken')} placeholder="Token fornecido pela prefeitura" />
              </div>
            </div>
          )}

          {/* Credenciais: Taboão da Serra */}
          {tipo === 'conam' && (
            <div className="border rounded-md p-3 bg-muted/30 space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Credenciais — Conam/Etransparência (Taboão da Serra)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Código de Usuário</Label>
                  <Input {...register('conamCodigoUsuario')} placeholder="Cód. usuário" />
                </div>
                <div className="space-y-1.5">
                  <Label>Código do Contribuinte</Label>
                  <Input {...register('conamCodigoContribuinte')} placeholder="Cód. contribuinte" />
                </div>
              </div>
            </div>
          )}

          {/* Credenciais: Cotia */}
          {tipo === 'giap' && (
            <div className="border rounded-md p-3 bg-muted/30 space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Credenciais — GIAP/Oracle APEX (Cotia)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Login</Label>
                  <Input {...register('giaplogin')} placeholder="Login" />
                </div>
                <div className="space-y-1.5">
                  <Label>Senha</Label>
                  <Input type="password" {...register('giapSenha')} placeholder="Senha" />
                </div>
              </div>
            </div>
          )}

          {/* Aviso certificado A1 */}
          {tipo === 'abrasf_a1' && (
            <div className="border rounded-md p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Certificado A1 necessário.</strong> Após salvar, faça o upload do arquivo .pfx na seção de credenciais da página fiscal.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Configuração
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
