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
import { Loader2, Search } from 'lucide-react'
import { createDocument, updateDocument, getDocument } from '@/lib/firestore-client'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'
import { getErrorMessage } from '@/lib/error-message'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'
import { Lc116Picker } from '@/components/fiscal/lc116-picker'
import { Switch } from '@/components/ui/switch'
import { AlertTriangle } from 'lucide-react'
import { buscarDadosCnpj } from '@/lib/cnpj-lookup'
import { normalizarIbge } from '@/lib/ibge'
import { Textarea } from '@/components/ui/textarea'
import { REGRAS_COMPETENCIA, normalizarRegraCompetencia } from '@/lib/nfse-modelo'
import { CatalogoPicker } from '@/components/fiscal/catalogo-picker'
import { CST_IBSCBS, INDICADOR_OPERACAO, MUNICIPIOS as MUNICIPIOS_IBGE, NBS, SERVICOS_NACIONAIS, classificacoesIbsCbs } from '@/lib/nfse-dominios'
import municipiosIbge from '@/lib/nfse-dominios/municipios.json'
import { situacaoNacional } from '@/lib/nfse-nacional-convenio'

const nomeDoMunicipio = (ibge: string | null | undefined) =>
  (municipiosIbge as { ibge: string; nome: string }[]).find((m) => m.ibge === ibge)?.nome

export const MUNICIPIOS = [
  { ibge: '3525904', nome: 'Jundiaí' },
  { ibge: '3509502', nome: 'Campinas' },
  { ibge: '3509205', nome: 'Cajamar' },
  { ibge: '3550308', nome: 'São Paulo' },
  { ibge: '3505708', nome: 'Barueri' },
  { ibge: '3547304', nome: 'Santana de Parnaíba' },
  { ibge: '3552809', nome: 'Taboão da Serra' },
  { ibge: '3513009', nome: 'Cotia' },
]

export const MUNICIPIO_TIPO: Record<string, 'abrasf_a1' | 'geisweb_a1' | 'simpliss' | 'conam' | 'giap'> = {
  '3525904': 'abrasf_a1',
  '3509502': 'abrasf_a1',
  '3509205': 'abrasf_a1',
  '3550308': 'abrasf_a1',
  '3505708': 'abrasf_a1',
  '3547304': 'simpliss',
  '3552809': 'conam',
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
  // 'nacional' (padrão) ou 'prefeitura' (legado). 'municipio' e 'spedy' só vêm de config antiga
  // e é migrado para 'nacional' ao salvar (ver aviso abaixo).
  provedorNfse:        z.enum(['nacional', 'prefeitura', 'municipio', 'spedy']).optional(),
  // Ambiente Nacional
  codigoTributacaoNacional:  z.string().regex(/^\d{6}$/, 'Use 6 dígitos (ex.: 171901)').optional().nullable().or(z.literal('')),
  codigoTributacaoMunicipal: z.string().regex(/^\d{3}$/, 'Use 3 dígitos (ex.: 001)').optional().nullable().or(z.literal('')),
  serieDps:                  z.string().regex(/^([0-9]{1,4}|[0-8][0-9]{4})$/, 'Série de 1 a 5 dígitos (até 89999)').optional().nullable().or(z.literal('')),
  aliquotaSimplesNacional:   z.number().min(0).max(100).optional().nullable(),
  codigoNbs:                 z.string().optional().nullable(),
  ibsCbsCst:                 z.string().optional().nullable(),
  ibsCbsClassTrib:           z.string().optional().nullable(),
  ibsCbsIndOp:               z.string().optional().nullable(),
  // Emissão automática (sem revisão humana) no dia configurado abaixo
  emissaoAutomatica:   z.boolean().optional(),
  // Padrões da tela de emissão (não mudam a DPS por si só)
  competenciaPadrao:   z.enum(['mes_atual', 'mes_anterior', 'manual']).optional(),
  informacoesComplementaresPadrao: z.string().max(2000, 'Até 2000 caracteres').optional().nullable(),
})

type FormData = z.input<typeof schema>

/**
 * Documento de clientes_fiscal → defaultValues do formulário. Único lugar que
 * lista os campos: antes cada tela montava o objeto à mão e esquecia os do
 * Ambiente Nacional (cTribNac, cTribMun, série, alíquota do Simples) — o
 * formulário abria com eles vazios e salvar gravava null por cima.
 */
export function defaultsDaConfigFiscal(
  fiscal: Record<string, unknown> | null | undefined,
): (Partial<FormData> & { credenciais?: Record<string, unknown> }) | undefined {
  if (!fiscal) return undefined
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return {
    municipioIbge:          s(fiscal.municipioIbge),
    inscricaoMunicipal:     s(fiscal.inscricaoMunicipal),
    inscricaoEstadual:      s(fiscal.inscricaoEstadual),
    ambienteEmissao:        fiscal.ambienteEmissao === 'producao' ? 'producao' : 'homologacao',
    regimeTributario:       s(fiscal.regimeTributario),
    optanteSimples:         typeof fiscal.optanteSimples === 'boolean' ? fiscal.optanteSimples : true,
    incentivadorCultural:   fiscal.incentivadorCultural === true,
    naturezaOperacao:       s(fiscal.naturezaOperacao) ?? '1',
    codigoServicoPadrao:    s(fiscal.codigoServicoPadrao),
    descricaoServicoPadrao: s(fiscal.descricaoServicoPadrao),
    itemListaServico:       s(fiscal.itemListaServico),
    cnae:                   s(fiscal.cnae),
    aliquotaPadrao:         typeof fiscal.aliquotaPadrao === 'number' ? fiscal.aliquotaPadrao : undefined,
    issRetidoPadrao:        fiscal.issRetidoPadrao === true,
    provedorNfse:           s(fiscal.provedorNfse) as FormData['provedorNfse'],
    codigoTributacaoNacional:  s(fiscal.codigoTributacaoNacional) ?? '',
    codigoTributacaoMunicipal: s(fiscal.codigoTributacaoMunicipal) ?? '',
    serieDps:                  s(fiscal.serieDps) ?? '',
    aliquotaSimplesNacional:   typeof fiscal.aliquotaSimplesNacional === 'number' ? fiscal.aliquotaSimplesNacional : null,
    codigoNbs:                 s(fiscal.codigoNbs) ?? '',
    ibsCbsCst:                 s(fiscal.ibsCbsCst) ?? '',
    ibsCbsClassTrib:           s(fiscal.ibsCbsClassTrib) ?? '',
    ibsCbsIndOp:               s(fiscal.ibsCbsIndOp) ?? '',
    emissaoAutomatica:      fiscal.emissaoAutomatica === true,
    competenciaPadrao:      normalizarRegraCompetencia(fiscal.competenciaPadrao),
    informacoesComplementaresPadrao: s(fiscal.informacoesComplementaresPadrao) ?? '',
    credenciais:            (fiscal.credenciais as Record<string, unknown> | undefined) ?? {},
  }
}

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
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)

  const { register, handleSubmit, control, watch, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ambienteEmissao:  'homologacao',
      optanteSimples:   true,
      naturezaOperacao: '1',
      provedorNfse:     'nacional',
      emissaoAutomatica:false,
      competenciaPadrao:'mes_atual',
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      ambienteEmissao:  'homologacao',
      optanteSimples:   true,
      naturezaOperacao: '1',
      competenciaPadrao: 'mes_atual',
      ...defaultValues,
      // Config sem provedor (antiga ou nova) emite pelo Ambiente Nacional.
      // Só 'prefeitura' (escolha explícita) fica no conector municipal; o resto — inclusive o
      // 'municipio' que o formulário antigo gravava à força — abre como Ambiente Nacional.
      provedorNfse:     defaultValues?.provedorNfse === 'prefeitura' || defaultValues?.provedorNfse === 'spedy'
        ? (defaultValues.provedorNfse as FormData['provedorNfse'])
        : 'nacional',
      // Config antiga pode ter o código IBGE errado de Cajamar/Taboão (ver src/lib/ibge.ts).
      municipioIbge:    normalizarIbge(defaultValues?.municipioIbge as string | undefined) || undefined,
      // Credenciais NUNCA são pré-preenchidas: o que vem de defaultValues.credenciais
      // já está criptografado (formato iv:authTag:ciphertext). Preencher o campo com
      // isso e salvar de novo sem alterar reencripta o ciphertext por cima do
      // ciphertext a cada edição (já corrompeu uma chave de API: 694 caracteres
      // depois de 3 salvamentos). Campo fica
      // sempre vazio; só é enviado pro backend se o usuário digitar algo novo.
      simplissToken:          null,
      usuario:                null,
      senha:                  null,
      conamCodigoUsuario:     null,
      conamCodigoContribuinte:null,
      giaplogin:              null,
      giapSenha:              null,
    })
  }, [open, defaultValues, reset])

  const municipioIbge = watch('municipioIbge')
  const provedorNfse = watch('provedorNfse') ?? 'nacional'
  const nacional = provedorNfse !== 'prefeitura'
  // Credenciais de portal municipal (token/login) só valem no conector legado;
  // no Ambiente Nacional a única credencial é o certificado A1.
  const tipo = nacional ? undefined : MUNICIPIO_TIPO[municipioIbge]
  const municipioNome = MUNICIPIOS.find(m => m.ibge === municipioIbge)?.nome ?? nomeDoMunicipio(municipioIbge) ?? ''
  const situacaoMunicipio = municipioIbge ? situacaoNacional(municipioIbge) : null
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
        // Spedy foi descontinuada (sem integrador): salvar migra para o Ambiente Nacional.
        provedorNfse:         'nacional',
        codigoTributacaoNacional:  data.codigoTributacaoNacional  || null,
        codigoTributacaoMunicipal: data.codigoTributacaoMunicipal || null,
        serieDps:                  data.serieDps                  || null,
        aliquotaSimplesNacional:   Number.isFinite(data.aliquotaSimplesNacional) ? data.aliquotaSimplesNacional : null,
        codigoNbs:                 data.codigoNbs       || null,
        ibsCbsCst:                 data.ibsCbsCst       || null,
        ibsCbsClassTrib:           data.ibsCbsClassTrib || null,
        ibsCbsIndOp:               data.ibsCbsIndOp     || null,
        emissaoAutomatica:    data.emissaoAutomatica ?? false,
        competenciaPadrao:    normalizarRegraCompetencia(data.competenciaPadrao),
        informacoesComplementaresPadrao: data.informacoesComplementaresPadrao?.trim() || null,
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
        const functions = getFunctions(getFirebaseApp(), 'southamerica-east1')
        const salvar = httpsCallable(functions, 'salvarCredenciaisFiscais')
        await salvar({ clienteId, docId: savedDocId, credenciais })
      }

      toast.success('Configuração fiscal salva!')
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar a configuração fiscal. Verifique permissão, município e credenciais.'))
    } finally {
      setSaving(false)
    }
  }

  async function buscarCnpj() {
    setBuscandoCnpj(true)
    try {
      const cliente = await getDocument<{ cpfCnpj?: string }>('clientes', clienteId)
      const cnpj = cliente?.cpfCnpj ?? ''
      const dados = await buscarDadosCnpj(cnpj)

      if (dados.regimeTributario) setValue('regimeTributario', dados.regimeTributario)
      setValue('optanteSimples', dados.optanteSimples)
      if (dados.cnae) setValue('cnae', dados.cnae)

      const ibgeReceita = normalizarIbge(dados.municipioIbge ?? undefined)
      const municipioConhecido = ibgeReceita && nomeDoMunicipio(ibgeReceita) ? ibgeReceita : undefined
      if (municipioConhecido) setValue('municipioIbge', municipioConhecido)

      const avisos: string[] = []
      if (!dados.regimeTributario) avisos.push('regime tributário (Lucro Presumido/Real) precisa ser confirmado manualmente')
      if (dados.municipioIbge && !municipioConhecido) {
        avisos.push(`município (${dados.municipio ?? dados.municipioIbge}/${dados.uf ?? '?'}) não foi encontrado na tabela IBGE`)
      }
      toast.success(
        avisos.length > 0
          ? `Dados da Receita preenchidos. Falta revisar: ${avisos.join('; ')}.`
          : 'Dados da Receita preenchidos — revise antes de salvar.'
      )
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível buscar os dados do CNPJ.'))
    } finally {
      setBuscandoCnpj(false)
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

          <Button type="button" variant="outline" size="sm" onClick={buscarCnpj} disabled={buscandoCnpj} className="gap-1.5">
            {buscandoCnpj ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Buscar dados do CNPJ
          </Button>

          {/* Config antiga apontando para a Spedy (conta encerrada, sem integrador) */}
          {provedorNfse === 'spedy' && (
            <div className="rounded-md border border-warning/30 bg-warning/8 p-3 text-xs text-muted-foreground">
              Este cliente estava configurado com a Spedy, que foi descontinuada. Ele já emite pelo Ambiente
              Nacional, com o certificado A1 do próprio cliente — não precisa fazer nada.
            </div>
          )}

          {/* Emissão só pelo Ambiente Nacional (decisão do dono, 2026-11-05): sem
              conector de prefeitura na operação, então não há escolha de provedor. */}
          <p className="rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            Emissão pelo <strong className="text-foreground">Ambiente Nacional</strong>, com o certificado A1 do próprio
            cliente. Municípios que não aderiram ao Emissor Nacional emitem no portal da prefeitura, fora da plataforma.
          </p>

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
              <Label required>Município de Emissão</Label>
              <Controller name="municipioIbge" control={control} render={({ field }) => (
                <CatalogoPicker
                  opcoes={MUNICIPIOS_IBGE}
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  placeholder="Selecione o município"
                  buscaPlaceholder="Buscar município ou código IBGE..."
                />
              )} />
              {errors.municipioIbge
                ? <p className="text-xs text-destructive">{errors.municipioIbge.message}</p>
                : situacaoMunicipio === 'prefeitura' || situacaoMunicipio === 'sem_convenio'
                  ? <p className="text-xs text-amber-600">Este município não emite pelo Ambiente Nacional — a nota sai no portal da prefeitura.</p>
                  : null}
            </div>

            <div className="space-y-1.5">
              <Label required>Ambiente</Label>
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
              <Label required>Inscrição Municipal</Label>
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
              <Label required>Regime Tributário</Label>
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
              <Label required>Optante Simples</Label>
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

          {/* Padrões da tela de emissão */}
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Padrões da emissão</p>
            <div className="space-y-1.5">
              <Label>Competência padrão da nota</Label>
              <Controller name="competenciaPadrao" control={control} render={({ field }) => (
                <Select value={field.value ?? 'mes_atual'} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGRAS_COMPETENCIA.map((r) => (
                      <SelectItem key={r.valor} value={r.valor}>{r.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
              <p className="text-xs text-muted-foreground">
                Sugestão inicial do campo Competência na emissão (sempre editável). Honorário faturado no mês seguinte
                ao serviço costuma usar &quot;Mês anterior&quot;.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Informações complementares padrão</Label>
              <Textarea
                rows={3}
                {...register('informacoesComplementaresPadrao')}
                placeholder="Ex.: dados bancários para pagamento — Banco, agência, conta, PIX"
              />
              {errors.informacoesComplementaresPadrao && <p className="text-xs text-destructive">{errors.informacoesComplementaresPadrao.message}</p>}
              <p className="text-xs text-muted-foreground">
                Vem preenchido em cada nota e pode ser alterado nela. Na NFS-e, as quebras de linha viram &quot; | &quot;.
              </p>
            </div>
          </div>

          {/* Ambiente Nacional: códigos e numeração da DPS */}
          {nacional && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Ambiente Nacional</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Código de tributação nacional</Label>
                  <Controller name="codigoTributacaoNacional" control={control} render={({ field }) => (
                    <CatalogoPicker
                      opcoes={SERVICOS_NACIONAIS}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? '')}
                      placeholder="Automático pelo item LC 116"
                      buscaPlaceholder="Buscar código ou serviço..."
                      permitirLimpar
                    />
                  )} />
                  {errors.codigoTributacaoNacional && <p className="text-xs text-destructive">{errors.codigoTributacaoNacional.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Desdobro municipal (cTribMun)</Label>
                  <Input {...register('codigoTributacaoMunicipal')} placeholder="Só se a prefeitura exigir (ex.: 001)" />
                  {errors.codigoTributacaoMunicipal && <p className="text-xs text-destructive">{errors.codigoTributacaoMunicipal.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Série da DPS</Label>
                  <Input {...register('serieDps')} placeholder="Padrão: 1" />
                  {errors.serieDps && <p className="text-xs text-destructive">{errors.serieDps.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Alíquota efetiva do Simples (%)</Label>
                  <Input
                    type="number" step="0.01" min="0" max="100"
                    placeholder="Só ME/EPP — padrão: alíquota ISS"
                    {...register('aliquotaSimplesNacional', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A numeração da DPS é sequencial por CNPJ, ambiente e série, controlada pela plataforma.
              </p>

              <div className="space-y-1.5">
                <Label>Código NBS padrão</Label>
                <Controller name="codigoNbs" control={control} render={({ field }) => (
                  <CatalogoPicker
                    opcoes={NBS}
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? '')}
                    placeholder="Selecione o NBS"
                    buscaPlaceholder="Buscar código ou descrição do NBS..."
                    permitirLimpar
                  />
                )} />
              </div>

              <p className="pt-1 text-xs font-semibold uppercase text-muted-foreground">IBS/CBS padrão</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>CST do IBS/CBS</Label>
                  <Controller name="ibsCbsCst" control={control} render={({ field }) => (
                    <CatalogoPicker
                      opcoes={CST_IBSCBS}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v ?? '')
                        // Classificação de outro CST deixa de valer.
                        if (!v || !String(watch('ibsCbsClassTrib') ?? '').startsWith(v)) setValue('ibsCbsClassTrib', '')
                      }}
                      placeholder="Selecione o CST"
                      permitirLimpar
                    />
                  )} />
                </div>
                <div className="space-y-1.5">
                  <Label>Classificação tributária (cClassTrib)</Label>
                  <Controller name="ibsCbsClassTrib" control={control} render={({ field }) => (
                    <CatalogoPicker
                      opcoes={classificacoesIbsCbs(new Date().toISOString().slice(0, 10), watch('ibsCbsCst') || undefined)}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v ?? '')
                        if (v) setValue('ibsCbsCst', v.slice(0, 3))
                      }}
                      placeholder="Selecione a classificação"
                      permitirLimpar
                    />
                  )} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Indicador de operação (cIndOp)</Label>
                  <Controller name="ibsCbsIndOp" control={control} render={({ field }) => (
                    <CatalogoPicker
                      opcoes={INDICADOR_OPERACAO}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? '')}
                      placeholder="Selecione o indicador de operação"
                      permitirLimpar
                    />
                  )} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Obrigatório para Lucro Presumido e Real; Simples e MEI a partir de 2027. Preencha os três ou deixe todos vazios.
              </p>
            </div>
          )}

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

          {/* Aviso certificado A1 — obrigatório no Ambiente Nacional para qualquer município */}
          {(nacional || tipo === 'abrasf_a1' || tipo === 'geisweb_a1') && (
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
