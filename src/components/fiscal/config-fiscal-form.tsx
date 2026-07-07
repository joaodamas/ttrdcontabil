'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AppModal } from '@/components/ui/app-modal'
import { Settings2 } from 'lucide-react'
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
import { getFirebaseApp } from '@/lib/firebase'
import { getErrorMessage } from '@/lib/error-message'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'
import { Lc116Picker } from '@/components/fiscal/lc116-picker'
import { Switch } from '@/components/ui/switch'
import { AlertTriangle } from 'lucide-react'

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

export const MUNICIPIO_TIPO: Record<string, 'abrasf_a1' | 'geisweb_a1' | 'simpliss' | 'conam' | 'giap'> = {
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
  codigoServicoPadrao: z.string().optional().nullable(),
  descricaoServicoPadrao: z.string().optional().nullable(),
  itemListaServico:    z.string().optional().nullable(),
  cnae:                z.string().optional().nullable(),
  aliquotaPadrao:      z.number().min(0).max(100).optional().nullable(),
  issRetidoPadrao:     z.boolean().optional(),
  // token credentials
  simplissToken:       z.string().optional().nullable(),
  usuario:             z.string().optional().nullable(),
  senha:               z.string().optional().nullable(),
  conamCodigoUsuario:  z.string().optional().nullable(),
  conamCodigoContribuinte: z.string().optional().nullable(),
  giaplogin:           z.string().optional().nullable(),
  giapSenha:           z.string().optional().nullable(),
  // Spedy (API agregadora — cobre qualquer município)
  provedorNfse:        z.enum(['municipio', 'spedy']).optional(),
  spedyApiKey:         z.string().optional().nullable(),
  // Emissão automática (sem revisão humana) no dia configurado abaixo
  emissaoAutomatica:   z.boolean().optional(),
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
      provedorNfse:     'municipio',
      emissaoAutomatica:false,
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      ambienteEmissao:  'homologacao',
      optanteSimples:   true,
      naturezaOperacao: '1',
      provedorNfse:     'municipio',
      ...defaultValues,
      // Credenciais NUNCA são pré-preenchidas: o que vem de defaultValues.credenciais
      // já está criptografado (formato iv:authTag:ciphertext). Preencher o campo com
      // isso e salvar de novo sem alterar reencripta o ciphertext por cima do
      // ciphertext a cada edição — foi exatamente o que corrompeu a chave de API da
      // Spedy do JPProject (694 caracteres depois de 3 salvamentos). Campo fica
      // sempre vazio; só é enviado pro backend se o usuário digitar algo novo.
      simplissToken:          null,
      usuario:                null,
      senha:                  null,
      conamCodigoUsuario:     null,
      conamCodigoContribuinte:null,
      giaplogin:              null,
      giapSenha:              null,
      spedyApiKey:            null,
    })
  }, [open, defaultValues, reset])

  const municipioIbge = watch('municipioIbge')
  const provedorNfse = watch('provedorNfse') ?? 'municipio'
  const tipo = MUNICIPIO_TIPO[municipioIbge]
  const municipioNome = MUNICIPIOS.find(m => m.ibge === municipioIbge)?.nome ?? ''
  const credenciais = (defaultValues?.credenciais ?? {}) as Record<string, unknown>
  const certInfo: CertInfo | null = credenciais.certTitular
    ? {
        titular: credenciais.certTitular as string,
        vencimento: credenciais.certVencimento as string,
        valido: credenciais.certValido as boolean,
        storagePath: credenciais.certificadoStoragePath as string,
      }
    : null

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
        codigoServicoPadrao:  data.codigoServicoPadrao || null,
        descricaoServicoPadrao: data.descricaoServicoPadrao || null,
        itemListaServico:     data.itemListaServico  || null,
        cnae:                 data.cnae              || null,
        aliquotaPadrao:       data.aliquotaPadrao    ?? null,
        issRetidoPadrao:      data.issRetidoPadrao   ?? false,
        provedorNfse:         data.provedorNfse ?? 'municipio',
        emissaoAutomatica:    data.emissaoAutomatica ?? false,
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
      if (data.provedorNfse === 'spedy' && data.spedyApiKey)    credenciais.spedyApiKey = data.spedyApiKey

      if (Object.keys(credenciais).length > 0) {
        const functions = getFunctions(getFirebaseApp(), 'southamerica-east1')
        const salvar = httpsCallable(functions, 'salvarCredenciaisFiscais')
        await salvar({ clienteId, docId: savedDocId, credenciais })
      }

      toast.success('Configuração fiscal salva!')
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Nao foi possivel salvar a configuracao fiscal. Verifique permissao, municipio e credenciais.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Configuração Fiscal — NFS-e"
      description="Defina município, regime tributário, credenciais e dados padrão da emissão."
      icon={<Settings2 className="size-4" />}
      size="lg"
    >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">

          {/* Provedor de emissão */}
          <div className="space-y-1.5">
            <Label>Provedor de Emissão *</Label>
            <Controller name="provedorNfse" control={control} render={({ field }) => (
              <Select value={field.value ?? 'municipio'} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="municipio">Conector direto do município (padrão)</SelectItem>
                  <SelectItem value="spedy">Spedy (API — qualquer município)</SelectItem>
                </SelectContent>
              </Select>
            )} />
            <p className="text-xs text-muted-foreground">
              {provedorNfse === 'spedy'
                ? 'Emite via API da Spedy — cobre qualquer município do Brasil, não só os 8 com conector próprio.'
                : 'Usa o conector escrito para o município selecionado abaixo (só cobre os municípios listados).'}
            </p>
          </div>

          {/* Emissão automática — reverte a trava de revisão humana, por cliente */}
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="size-3.5" />
                  Emissão automática (sem revisão)
                </Label>
                <p className="text-xs text-muted-foreground">
                  No dia de emissão configurado no cadastro do cliente, a NFS-e é gerada <strong>e emitida direto</strong>,
                  sem ninguém revisar antes. Qualquer erro de configuração (valor, alíquota, regime) vira nota fiscal
                  real emitida errada, sem chance de corrigir antes de sair. Deixe desligado se preferir revisar
                  cada rascunho manualmente antes de emitir.
                </p>
              </div>
              <Controller name="emissaoAutomatica" control={control} render={({ field }) => (
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              )} />
            </div>
          </div>

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
              <Label>Código Serviço Municipal</Label>
              <Input {...register('codigoServicoPadrao')} placeholder="Ex: 1719" />
            </div>
            <div className="space-y-1.5">
              <Label>Item Lista Serviço (LC 116)</Label>
              <Controller name="itemListaServico" control={control} render={({ field }) => (
                <Lc116Picker value={field.value} onChange={field.onChange} />
              )} />
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

          <div className="grid grid-cols-[1fr_180px] gap-3">
            <div className="space-y-1.5">
              <Label>Descrição padrão da NFS-e</Label>
              <Input {...register('descricaoServicoPadrao')} placeholder="Ex: Serviços contábeis mensais" />
            </div>
            <div className="space-y-1.5">
              <Label>ISS retido padrão</Label>
              <Controller name="issRetidoPadrao" control={control} render={({ field }) => (
                <Select value={field.value ? 'sim' : 'nao'} onValueChange={v => field.onChange(v === 'sim')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              )} />
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
                <Input {...register('simplissToken')} placeholder={credenciais.simplissToken ? 'Já configurado — deixe em branco para manter' : 'Token fornecido pela prefeitura'} />
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
                  <Input {...register('conamCodigoUsuario')} placeholder={credenciais.conamCodigoUsuario ? 'Já configurado' : 'Cód. usuário'} />
                </div>
                <div className="space-y-1.5">
                  <Label>Código do Contribuinte</Label>
                  <Input {...register('conamCodigoContribuinte')} placeholder={credenciais.conamCodigoContribuinte ? 'Já configurado' : 'Cód. contribuinte'} />
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
                  <Input {...register('giaplogin')} placeholder={credenciais.giaplogin ? 'Já configurado' : 'Login'} />
                </div>
                <div className="space-y-1.5">
                  <Label>Senha</Label>
                  <Input type="password" {...register('giapSenha')} placeholder={credenciais.giapSenha ? 'Já configurada — deixe em branco para manter' : 'Senha'} />
                </div>
              </div>
            </div>
          )}

          {/* Credenciais: Spedy */}
          {provedorNfse === 'spedy' && (
            <div className="border rounded-md p-3 bg-muted/30 space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Credenciais — Spedy (API)</p>
              <div className="space-y-1.5">
                <Label>Chave de API</Label>
                <Input
                  type="password"
                  {...register('spedyApiKey')}
                  placeholder={credenciais.spedyApiKey ? 'Já configurada — deixe em branco para manter' : 'Cole a chave de API da Spedy (aba Geral → Credenciais da API)'}
                />
                <p className="text-xs text-muted-foreground">
                  Criptografada antes de salvar — nunca fica em texto puro. Deixe em branco pra manter a chave já salva; só preencha se for trocar. O certificado A1 continua sendo enviado direto no painel da Spedy, não aqui.
                </p>
              </div>
            </div>
          )}

          {/* Aviso certificado A1 */}
          {provedorNfse !== 'spedy' && (tipo === 'abrasf_a1' || tipo === 'geisweb_a1') && (
            <div className="space-y-3 rounded-md border border-warning/25 bg-warning/8 p-3">
              <p className="text-xs text-warning">
                <strong>Certificado A1 necessário.</strong> O upload pode ser feito aqui mesmo na configuração fiscal do cliente.
              </p>
              <CertificadoUpload clienteId={clienteId} certInfo={certInfo} onUploaded={() => onSaved?.()} />
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
    </AppModal>
  )
}
