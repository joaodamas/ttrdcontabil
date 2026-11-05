'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CpfCnpjInput } from '@/components/ui/cpf-cnpj-input'
import { Loader2, Save, Send, ArrowLeft, CheckCircle2, ChevronRight, RotateCcw, Search, FileStack, Info, Sparkles, X } from 'lucide-react'
import { formatCep, formatCurrency, formatCpfCnpj, validateCpf, validateCnpj } from '@/lib/utils'
import { getClientes, getCompetencias, createDocument, getDocument, updateDocument, listDocuments } from '@/lib/firestore-client'
import { where, orderBy, limit } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'
import { getErrorMessage } from '@/lib/error-message'
import { SELECT_NONE_VALUE } from '@/lib/select-values'
import { Lc116Picker } from '@/components/fiscal/lc116-picker'
import { ClientePicker } from '@/components/ui/cliente-picker'
import { fetchTomadores } from '@/features/tomadores/services'
import type { TomadorRecord } from '@/features/tomadores/types'
import { provedorNfseEfetivo } from '@/features/fiscal/services'
import { fetchChaveNfseNacional } from '@/features/admin/services'
import { situacaoNacional } from '@/lib/nfse-nacional-convenio'
import { normalizarIbge } from '@/lib/ibge'
import { buscarDadosCnpj } from '@/lib/cnpj-lookup'
import { useViaCep } from '@/hooks/use-viacep'
import { NfseCopiarNota } from '@/components/fiscal/nfse-copiar-nota'
import { CatalogoPicker } from '@/components/fiscal/catalogo-picker'
import { CST_IBSCBS, INDICADOR_OPERACAO, MUNICIPIOS as MUNICIPIOS_IBGE, NBS, SERVICOS_NACIONAIS, classificacoesIbsCbs } from '@/lib/nfse-dominios'
import municipiosIbge from '@/lib/nfse-dominios/municipios.json'
import {
  VARIAVEIS_DESCRICAO,
  codigoNacionalDerivado,
  competenciaFutura,
  competenciaPadrao,
  competenciaParaData,
  competenciaParaInput,
  contemVariaveis,
  extrairDadosXmlNfse,
  formatarCompetencia,
  lerCompetencia,
  modeloDoFormulario,
  nbsValido,
  normalizarRegraCompetencia,
  notasParaCopia,
  renderizarDescricao,
  sugerirModeloComVariaveis,
  valoresDaNotaEmitida,
  valoresDoModelo,
  type Competencia as CompetenciaMesAno,
  type NotaEmitidaParaCopia,
  type SugestaoModelo,
  type ValoresCopiados,
} from '@/lib/nfse-modelo'

function isValidCpfCnpj(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return validateCpf(digits)
  if (digits.length === 14) return validateCnpj(digits)
  return false
}

function isValidCodigoServico(code: string): boolean {
  return /^\d{1,4}(\.\d{1,4})?$/.test(code.trim())
}

const textoOpcional = z.string().optional().nullable()

const nfseSchema = z.object({
  clienteId:        z.string().min(1, 'Cliente é obrigatório'),
  competenciaId:    z.string().optional().nullable(),
  /** "AAAA-MM" (input type=month). Vira input.dataCompetencia = AAAA-MM-01. */
  competencia:      z.string({ error: 'Informe a competência (mês/ano)' }).regex(/^\d{4}-\d{2}$/, 'Informe a competência (mês/ano)'),
  tomadorNome:      z.string().min(1, 'Nome do tomador é obrigatório').max(150),
  tomadorCpfCnpj:   z.string().min(11, 'CPF/CNPJ inválido').max(18).refine(
    v => isValidCpfCnpj(v),
    { message: 'CPF/CNPJ inválido — verifique os dígitos' }
  ),
  tomadorEmail:     z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  tomadorCep:         textoOpcional,
  tomadorLogradouro:  textoOpcional,
  tomadorNumero:      textoOpcional,
  tomadorComplemento: textoOpcional,
  tomadorBairro:      textoOpcional,
  tomadorMunicipio:   textoOpcional,
  tomadorMunicipioIbge: textoOpcional,
  tomadorUf:          textoOpcional,
  descricaoServico: z.string().min(10, 'Descrição muito curta (mín. 10 caracteres)').max(2000, 'Descrição com até 2000 caracteres'),
  codigoServico:    z.string().min(1, 'Código do serviço é obrigatório').max(20).refine(
    v => isValidCodigoServico(v),
    { message: 'Formato inválido. Use ex: 17.19 ou 6014' }
  ),
  itemListaServico: z.string().min(1, 'Item da lista de serviço (LC 116) é obrigatório').max(20).refine(
    v => isValidCodigoServico(v),
    { message: 'Formato inválido. Use ex: 1.07 ou 17.19' }
  ),
  /** cTribNac explícito (6 dígitos). Vazio = derivado do item LC 116 (ou da config). */
  codigoTributacaoNacional: textoOpcional.refine(
    (v) => !v || /^\d{6}$/.test(v.trim()),
    { message: 'Use 6 dígitos (ex.: 010201) ou deixe vazio para derivar do item LC 116' },
  ),
  codigoNbs:        textoOpcional.refine((v) => nbsValido(v), { message: 'NBS tem 9 dígitos (ex.: 1.1501.10.00)' }),
  municipioPrestacaoIbge: textoOpcional.refine(
    (v) => !v || /^\d{7}$/.test(v.trim()),
    { message: 'Código IBGE com 7 dígitos' },
  ),
  ibsCbsCst:        textoOpcional,
  ibsCbsClassTrib:  textoOpcional,
  ibsCbsIndOp:      textoOpcional,
  valorServico:     z.number({ error: 'Informe o valor do serviço' }).min(0.01, 'Valor deve ser maior que zero'),
  aliquota:         z.number().min(0).max(100).optional().nullable(),
  issRetido:        z.boolean().default(false),
  informacoesComplementares: z.string().max(2000, 'Até 2000 caracteres').optional().nullable(),
}).superRefine((d, ctx) => {
  // Endereço nacional do tomador: tudo ou nada (parcial = E1235 na Sefin).
  const cep = digitosDe(d.tomadorCep)
  const ibge = digitosDe(d.tomadorMunicipioIbge)
  const algum = Boolean(cep || d.tomadorLogradouro?.trim() || d.tomadorNumero?.trim() || d.tomadorBairro?.trim() || ibge)
  if (algum) {
    if (cep.length !== 8) ctx.addIssue({ code: 'custom', path: ['tomadorCep'], message: 'CEP com 8 dígitos' })
    if (!d.tomadorLogradouro?.trim()) ctx.addIssue({ code: 'custom', path: ['tomadorLogradouro'], message: 'Informe o logradouro' })
    if (!d.tomadorNumero?.trim()) ctx.addIssue({ code: 'custom', path: ['tomadorNumero'], message: 'Informe o número (ou S/N)' })
    if (!d.tomadorBairro?.trim()) ctx.addIssue({ code: 'custom', path: ['tomadorBairro'], message: 'Informe o bairro' })
    if (ibge.length !== 7) ctx.addIssue({ code: 'custom', path: ['tomadorMunicipioIbge'], message: 'Código IBGE do município com 7 dígitos (obrigatório no endereço nacional)' })
  }
  const comp = lerCompetencia(d.competencia)
  if (comp && competenciaFutura(comp, new Date())) {
    ctx.addIssue({ code: 'custom', path: ['competencia'], message: 'A competência não pode ser posterior ao mês atual' })
  }
  if (comp && renderizarDescricao(d.descricaoServico ?? '', comp).length > 2000) {
    ctx.addIssue({ code: 'custom', path: ['descricaoServico'], message: 'Com as variáveis substituídas, a descrição passa de 2000 caracteres' })
  }
})

function digitosDe(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '')
}

const CAMPOS_TOMADOR = [
  'tomadorNome', 'tomadorCpfCnpj', 'tomadorEmail', 'tomadorCep', 'tomadorLogradouro', 'tomadorNumero',
  'tomadorComplemento', 'tomadorBairro', 'tomadorMunicipio', 'tomadorMunicipioIbge', 'tomadorUf',
] as const

/** Endereço completo do formulário → payload da callable / mapa gravado (sem undefined). */
function enderecoDoFormulario(d: Pick<NfseFormData, typeof CAMPOS_TOMADOR[number]>) {
  const cep = digitosDe(d.tomadorCep)
  const ibge = digitosDe(d.tomadorMunicipioIbge)
  if (cep.length !== 8 || ibge.length !== 7 || !d.tomadorLogradouro?.trim() || !d.tomadorNumero?.trim() || !d.tomadorBairro?.trim()) {
    return null
  }
  const e: Record<string, string> = {
    cep,
    logradouro: d.tomadorLogradouro.trim(),
    numero: d.tomadorNumero.trim(),
    bairro: d.tomadorBairro.trim(),
    municipioIbge: ibge,
  }
  if (d.tomadorComplemento?.trim()) e.complemento = d.tomadorComplemento.trim()
  if (d.tomadorMunicipio?.trim()) e.municipio = d.tomadorMunicipio.trim()
  if (d.tomadorUf?.trim()) e.uf = d.tomadorUf.trim().toUpperCase()
  return e
}

function codigoNacionalDoItem(item: string | null | undefined): string | undefined {
  return codigoNacionalDerivado(item)
}

function textoEndereco(e: Record<string, string>): string {
  const municipio = [e.municipio, e.uf].filter(Boolean).join('/')
  return [
    [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '),
    e.bairro,
    municipio ? `${municipio} (IBGE ${e.municipioIbge})` : `IBGE ${e.municipioIbge}`,
    `CEP ${formatCep(e.cep)}`,
  ].filter(Boolean).join(' — ')
}

function nomeMunicipioConhecido(ibge: string | null | undefined): string | undefined {
  const codigo = normalizarIbge(digitosDe(ibge))
  return (municipiosIbge as { ibge: string; nome: string }[]).find((m) => m.ibge === codigo)?.nome
}

type NfseFormData = z.input<typeof nfseSchema>

interface Cliente { id: string; razaoSocial: string; nomeFantasia?: string; cpfCnpj?: string; email?: string }
interface Competencia { id: string; mes: number; ano: number; servicoNome?: string }
type RascunhoNfse = {
  id: string
  clienteId?: string
  clienteNome?: string
  competenciaId?: string | null
  status?: string
  dados?: Record<string, unknown>
}

interface NfseEmissaoFormProps {
  initialClienteId?: string
  initialRascunhoId?: string
  layout?: 'page' | 'modal'
  onCancel?: () => void
  onFinished?: () => void | Promise<void>
  onStepChange?: (step: number) => void
}

const cardClassByLayout: Record<'page' | 'modal', string> = {
  page: '',
  modal: 'border-border/70 bg-card/95 shadow-none',
}

export function NfseEmissaoForm({
  initialClienteId,
  initialRascunhoId,
  layout = 'page',
  onCancel,
  onFinished,
  onStepChange,
}: NfseEmissaoFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clienteIdParam = initialClienteId ?? searchParams.get('clienteId') ?? ''
  const rascunhoIdParam = initialRascunhoId ?? searchParams.get('rascunhoId') ?? ''

  const [clientes,           setClientes]           = useState<Cliente[]>([])
  const [competencias,       setCompetencias]       = useState<Competencia[]>([])
  const [loadingClientes,    setLoadingClientes]    = useState(true)
  const [loadingCompetencias,setLoadingCompetencias]= useState(false)
  const [loadingRascunho, setLoadingRascunho] = useState(Boolean(rascunhoIdParam))
  const [rascunhoAtual, setRascunhoAtual] = useState<RascunhoNfse | null>(null)
  const [carteira, setCarteira] = useState<TomadorRecord[]>([])
  // Chave única do Ambiente Nacional (Admin → Conectores). undefined = ainda não lida.
  const [producaoNacionalLiberada, setProducaoNacionalLiberada] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    fetchChaveNfseNacional()
      .then((c) => setProducaoNacionalLiberada(c?.producaoLiberada === true))
      .catch(() => setProducaoNacionalLiberada(undefined))
  }, [])
  // Configuração fiscal do prestador escolhido: decide se dá para emitir (provedor
  // descontinuado / sem config) e mostra o ambiente real no resumo.
  const [configFiscal, setConfigFiscal] = useState<{ clienteId: string; dados: Record<string, unknown> | null } | null>(null)
  const [carteiraClienteId, setCarteiraClienteId] = useState<string | null>(null)
  const [tomadorCarteiraId, setTomadorCarteiraId] = useState<string | null>(null)
  const [saving,             setSaving]             = useState(false)
  const [emitting,           setEmitting]           = useState(false)
  const [emissaoPendente,    setEmissaoPendente]    = useState<NfseFormData | null>(null)
  const [showResume,         setShowResume]         = useState(false)
  const [ultimoRascunho,     setUltimoRascunho]     = useState<RascunhoNfse | null>(null)
  const [loadingUltimoRasc,  setLoadingUltimoRasc]  = useState(false)
  const [templates,          setTemplates]          = useState<RascunhoNfse[]>([])
  // "Copiar de nota anterior" (nfse_emitidas do prestador) e modelo padrão.
  const [notasCliente,       setNotasCliente]       = useState<{ clienteId: string; notas: NotaEmitidaParaCopia[] } | null>(null)
  const [copiaOrigem,        setCopiaOrigem]        = useState<string | null>(null)
  const [sugestaoModelo,     setSugestaoModelo]     = useState<SugestaoModelo | null>(null)
  const [salvandoModelo,     setSalvandoModelo]     = useState(false)
  const [buscandoCnpjTomador, setBuscandoCnpjTomador] = useState(false)
  const { buscar: buscarCep, loading: buscandoCep, error: erroCep } = useViaCep()

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<NfseFormData>({
    resolver: zodResolver(nfseSchema),
    defaultValues: { issRetido: false, clienteId: clienteIdParam || undefined },
  })

  const selectedClienteId = watch('clienteId')
  const watchedValues = watch()

  // Compute active wizard step based on filled fields
  useEffect(() => {
    if (!onStepChange) return
    if (showResume) { onStepChange(4); return }
    const { clienteId, tomadorNome, tomadorCpfCnpj, descricaoServico, codigoServico, valorServico } = watchedValues
    if (!clienteId) { onStepChange(0); return }
    if (!tomadorNome || !tomadorCpfCnpj) { onStepChange(1); return }
    if (!descricaoServico || !codigoServico || !valorServico) { onStepChange(2); return }
    onStepChange(3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.clienteId, watchedValues.tomadorNome, watchedValues.tomadorCpfCnpj, watchedValues.descricaoServico, watchedValues.codigoServico, watchedValues.valorServico, onStepChange, showResume])

  const competenciasPorId = useMemo(
    () => Object.fromEntries(competencias.map((c) => [c.id, { mes: c.mes, ano: c.ano }])) as Record<string, CompetenciaMesAno>,
    [competencias],
  )

  // Competência vinculada escolhida → o mês/ano da nota acompanha (continua editável).
  const competenciaIdSelecionada = watch('competenciaId')
  useEffect(() => {
    const c = competenciaIdSelecionada ? competenciasPorId[competenciaIdSelecionada] : undefined
    if (c) setValue('competencia', competenciaParaInput(c), { shouldValidate: true })
  }, [competenciaIdSelecionada, competenciasPorId, setValue])

  // Load clients on mount
  useEffect(() => {
    getClientes({ status: 'ativo' })
      .then((data) => setClientes(data as unknown as Cliente[]))
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar clientes ativos. Verifique sua permissão de acesso.')))
      .finally(() => setLoadingClientes(false))
  }, [])

  useEffect(() => {
    if (!rascunhoIdParam) return
    setLoadingRascunho(true)
    getDocument<RascunhoNfse>('nfse_rascunhos', rascunhoIdParam)
      .then((rascunho) => {
        if (!rascunho) {
          toast.error('Rascunho NFS-e não encontrado.')
          router.push('/fiscal')
          return
        }
        const dados = rascunho.dados ?? {}
        const endRasc = (dados.tomadorEndereco ?? {}) as Record<string, string | undefined>
        const compRasc = lerCompetencia(dados.dataCompetencia as string | undefined)
        setRascunhoAtual(rascunho)
        reset({
          competencia: compRasc ? competenciaParaInput(compRasc) : '',
          tomadorCep: endRasc.cep ? formatCep(endRasc.cep) : '',
          tomadorLogradouro: endRasc.logradouro ?? '',
          tomadorNumero: endRasc.numero ?? '',
          tomadorComplemento: endRasc.complemento ?? '',
          tomadorBairro: endRasc.bairro ?? '',
          tomadorMunicipio: endRasc.municipio ?? '',
          tomadorMunicipioIbge: endRasc.municipioIbge ?? '',
          tomadorUf: endRasc.uf ?? '',
          codigoTributacaoNacional: (dados.codigoTributacaoNacional as string | null | undefined) ?? '',
          codigoNbs: (dados.codigoNbs as string | null | undefined) ?? '',
          municipioPrestacaoIbge: (dados.municipioPrestacaoIbge as string | null | undefined) ?? '',
          ibsCbsCst: (dados.ibsCbsCst as string | null | undefined) ?? '',
          ibsCbsClassTrib: (dados.ibsCbsClassTrib as string | null | undefined) ?? '',
          ibsCbsIndOp: (dados.ibsCbsIndOp as string | null | undefined) ?? '',
          informacoesComplementares: (dados.informacoesComplementares as string | null | undefined) ?? '',
          clienteId: rascunho.clienteId ?? '',
          competenciaId: (rascunho.competenciaId as string | null | undefined) ?? (dados.competenciaId as string | null | undefined) ?? null,
          tomadorNome: (dados.tomadorNome as string | undefined) ?? (dados.tomador as Record<string, unknown> | undefined)?.razaoSocial as string | undefined ?? rascunho.clienteNome ?? '',
          tomadorCpfCnpj: (dados.tomadorCpfCnpj as string | undefined) ?? (dados.tomador as Record<string, unknown> | undefined)?.cpfCnpj as string | undefined ?? '',
          tomadorEmail: (dados.tomadorEmail as string | undefined) ?? (dados.tomador as Record<string, unknown> | undefined)?.email as string | undefined ?? '',
          descricaoServico: (dados.descricaoServicoModelo as string | undefined) ?? (dados.descricaoServico as string | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.discriminacao as string | undefined ?? '',
          codigoServico: (dados.codigoServico as string | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.codigoServico as string | undefined ?? '',
          itemListaServico: (dados.itemListaServico as string | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.itemListaServico as string | undefined ?? '',
          valorServico: Number((dados.valorServico as number | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.valorServico ?? 0),
          aliquota: (dados.aliquota as number | null | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.aliquota as number | null | undefined ?? null,
          issRetido: Boolean((dados.issRetido as boolean | undefined) ?? (dados.servico as Record<string, unknown> | undefined)?.issRetido ?? false),
        })
      })
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar o rascunho NFS-e para revisão.')))
      .finally(() => setLoadingRascunho(false))
  }, [rascunhoIdParam, reset, router])

  // Load last rascunhos for auto-fill + templates
  useEffect(() => {
    if (!selectedClienteId || rascunhoIdParam) { setUltimoRascunho(null); setTemplates([]); return }
    setLoadingUltimoRasc(true)
    listDocuments<RascunhoNfse>('nfse_rascunhos', [
      where('clienteId', '==', selectedClienteId),
      orderBy('criadoEm', 'desc'),
      limit(5),
    ]).then(results => {
      setUltimoRascunho(results.length > 0 ? results[0] : null)
      setTemplates(results)
    })
      .catch(() => { setUltimoRascunho(null); setTemplates([]) })
      .finally(() => setLoadingUltimoRasc(false))
  }, [selectedClienteId, rascunhoIdParam])

  // Notas emitidas do prestador, para "Copiar de nota anterior". Índice
  // (tenantId, clienteId, dataEmissao desc) existe; se a consulta ordenada falhar
  // (índice ainda construindo, emulador), cai no filtro por igualdade e ordena aqui.
  useEffect(() => {
    if (!selectedClienteId || rascunhoIdParam) { setNotasCliente(null); return }
    let ativo = true
    setNotasCliente(null)
    // Aviso de cópia e sugestão eram do prestador anterior.
    setCopiaOrigem(null)
    setSugestaoModelo(null)
    listDocuments<NotaEmitidaParaCopia>('nfse_emitidas', [
      where('clienteId', '==', selectedClienteId),
      orderBy('dataEmissao', 'desc'),
      limit(25),
    ])
      .catch(() => listDocuments<NotaEmitidaParaCopia>('nfse_emitidas', [where('clienteId', '==', selectedClienteId), limit(200)]))
      .then((rows) => { if (ativo) setNotasCliente({ clienteId: selectedClienteId, notas: notasParaCopia(rows, 20) }) })
      .catch(() => { if (ativo) setNotasCliente({ clienteId: selectedClienteId, notas: [] }) })
    return () => { ativo = false }
  }, [selectedClienteId, rascunhoIdParam])

  function applyRascunhoData(r: RascunhoNfse) {
    const dados = r.dados ?? {}
    if (dados.descricaoServico) setValue('descricaoServico', dados.descricaoServico as string)
    if (dados.codigoServico)    setValue('codigoServico',    dados.codigoServico as string)
    if (dados.itemListaServico) setValue('itemListaServico', dados.itemListaServico as string)
    if (dados.valorServico)     setValue('valorServico',     Number(dados.valorServico))
    if (dados.aliquota != null) setValue('aliquota',         Number(dados.aliquota))
    if (dados.issRetido != null) setValue('issRetido',       Boolean(dados.issRetido))
  }

  function applyUltimoRascunho() {
    if (!ultimoRascunho) return
    applyRascunhoData(ultimoRascunho)
    toast.success('Dados do último rascunho aplicados.')
  }

  // Cliente escolhido: carrega competências e a carteira de tomadores dele.
  // O tomador NÃO é mais preenchido com os dados do próprio cliente: a nota sai
  // em nome do cliente (prestador) PARA o cliente dele — copiar o prestador no
  // tomador emitia nota para o próprio CNPJ se ninguém corrigisse o campo.
  useEffect(() => {
    if (!selectedClienteId) {
      setCompetencias([])
      return
    }

    let ativo = true
    fetchTomadores(selectedClienteId)
      .then(({ tomadores }) => {
        if (!ativo) return
        setCarteira(tomadores.filter((t) => t.ativo !== false))
        setCarteiraClienteId(selectedClienteId)
      })
      .catch(() => { if (ativo) { setCarteira([]); setCarteiraClienteId(selectedClienteId) } })

    // Pré-preenche com os padrões da configuração fiscal do cliente (código de
    // serviço, item LC 116, alíquota, descrição) — sem sobrescrever um rascunho
    // já existente ou algo que o usuário já tenha digitado.
    listDocuments<Record<string, unknown>>('clientes_fiscal', [
      where('clienteId', '==', selectedClienteId),
      limit(1),
    ]).then(([fiscal]) => {
      if (!ativo) return
      setConfigFiscal({ clienteId: selectedClienteId, dados: fiscal ?? null })
      // Competência: regra do cliente (padrão "mês da emissão", o comportamento de antes).
      if (!watch('competencia')) {
        const sugerida = competenciaPadrao(normalizarRegraCompetencia(fiscal?.competenciaPadrao), new Date())
        if (sugerida) setValue('competencia', competenciaParaInput(sugerida))
      }
      if (rascunhoAtual) return
      if (!fiscal) return
      const ibgePrestador = normalizarIbge((fiscal.municipioIbge ?? fiscal.codigoMunicipioIbge) as string | undefined)
      if (!watch('municipioPrestacaoIbge') && /^\d{7}$/.test(ibgePrestador)) setValue('municipioPrestacaoIbge', ibgePrestador)
      if (!watch('informacoesComplementares') && typeof fiscal.informacoesComplementaresPadrao === 'string') {
        setValue('informacoesComplementares', fiscal.informacoesComplementaresPadrao)
      }
      if (!watch('codigoServico') && fiscal.codigoServicoPadrao) setValue('codigoServico', fiscal.codigoServicoPadrao as string)
      // NBS e IBS/CBS padrão do cliente (configuração fiscal); editáveis na nota.
      if (!watch('codigoNbs') && typeof fiscal.codigoNbs === 'string') setValue('codigoNbs', fiscal.codigoNbs)
      if (!watch('ibsCbsCst') && !watch('ibsCbsClassTrib') && !watch('ibsCbsIndOp')) {
        if (typeof fiscal.ibsCbsCst === 'string') setValue('ibsCbsCst', fiscal.ibsCbsCst)
        if (typeof fiscal.ibsCbsClassTrib === 'string') setValue('ibsCbsClassTrib', fiscal.ibsCbsClassTrib)
        if (typeof fiscal.ibsCbsIndOp === 'string') setValue('ibsCbsIndOp', fiscal.ibsCbsIndOp)
      }
      if (!watch('itemListaServico') && fiscal.itemListaServico) setValue('itemListaServico', fiscal.itemListaServico as string)
      if (!watch('descricaoServico') && fiscal.descricaoServicoPadrao) setValue('descricaoServico', fiscal.descricaoServicoPadrao as string)
      if (watch('aliquota') == null && fiscal.aliquotaPadrao != null) setValue('aliquota', Number(fiscal.aliquotaPadrao))
    }).catch(() => { /* segue sem pré-preencher — usuário digita na mão */ })

    setLoadingCompetencias(true)
    getCompetencias({ clienteId: selectedClienteId })
      .then((data) => setCompetencias(data as unknown as Competencia[]))
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar competências do cliente selecionado.')))
      .finally(() => setLoadingCompetencias(false))
    return () => { ativo = false }
  }, [selectedClienteId, clientes, setValue, watch, rascunhoAtual])

  /**
   * Aplica valores copiados. O tomador é trocado por inteiro (campo ausente na
   * origem fica vazio — não mistura o endereço do tomador anterior); no serviço,
   * campo ausente mantém o que já está (padrões da configuração fiscal).
   */
  function aplicarValores(v: ValoresCopiados) {
    const opts = { shouldDirty: true } as const
    for (const campo of CAMPOS_TOMADOR) {
      const valor = v[campo]
      if (campo === 'tomadorCpfCnpj') setValue(campo, valor ? formatCpfCnpj(valor) : '', opts)
      else if (campo === 'tomadorCep') setValue(campo, valor ? formatCep(valor) : '', opts)
      else setValue(campo, valor ?? '', opts)
    }
    if (v.descricaoServico !== undefined) setValue('descricaoServico', v.descricaoServico, opts)
    if (v.codigoServico !== undefined) setValue('codigoServico', v.codigoServico, opts)
    if (v.itemListaServico !== undefined) setValue('itemListaServico', v.itemListaServico, opts)
    setValue('codigoTributacaoNacional', v.codigoTributacaoNacional ?? '', opts)
    setValue('codigoNbs', v.codigoNbs ?? '', opts)
    if (v.municipioPrestacaoIbge !== undefined) setValue('municipioPrestacaoIbge', v.municipioPrestacaoIbge, opts)
    if (v.ibsCbsCst || v.ibsCbsClassTrib || v.ibsCbsIndOp) {
      setValue('ibsCbsCst', v.ibsCbsCst ?? '', opts)
      setValue('ibsCbsClassTrib', v.ibsCbsClassTrib ?? '', opts)
      setValue('ibsCbsIndOp', v.ibsCbsIndOp ?? '', opts)
    }
    if (v.valorServico !== undefined) setValue('valorServico', v.valorServico, opts)
    if (v.aliquota !== undefined) setValue('aliquota', v.aliquota, opts)
    if (v.issRetido !== undefined) setValue('issRetido', v.issRetido, opts)
    if (v.informacoesComplementares !== undefined) setValue('informacoesComplementares', v.informacoesComplementares, opts)
    setTomadorCarteiraId(null)
  }

  function usarNotaComoBase(nota: NotaEmitidaParaCopia) {
    const { valores, competenciaOrigem, numeroNfse } = valoresDaNotaEmitida(nota, extrairDadosXmlNfse(nota.xmlNfse))
    aplicarValores(valores)
    const origem = competenciaOrigem ?? (nota.competenciaId ? competenciasPorId[nota.competenciaId] : undefined) ?? null
    const desc = valores.descricaoServico
    setSugestaoModelo(desc && !contemVariaveis(desc) ? sugerirModeloComVariaveis(desc, origem) : null)
    setCopiaOrigem(numeroNfse ? `Dados copiados da NFS-e nº ${numeroNfse}` : 'Dados copiados de uma NFS-e anterior')
    toast.success(numeroNfse ? `Dados da NFS-e nº ${numeroNfse} aplicados.` : 'Dados da nota anterior aplicados.')
  }

  function usarModeloPadrao() {
    const valores = valoresDoModelo(fiscalDoCliente?.modeloNfse)
    if (!valores) return
    aplicarValores(valores)
    setSugestaoModelo(null)
    setCopiaOrigem('Dados copiados do modelo padrão do cliente')
    toast.success('Modelo padrão do cliente aplicado.')
  }

  function aceitarSugestaoModelo() {
    if (!sugestaoModelo) return
    setValue('descricaoServico', sugestaoModelo.depois, { shouldDirty: true, shouldValidate: true })
    setSugestaoModelo(null)
    toast.success('Descrição convertida em modelo com variáveis.')
  }

  function inserirVariavel(nome: string) {
    const atual = watch('descricaoServico') ?? ''
    const sep = atual && !/\s$/.test(atual) ? ' ' : ''
    setValue('descricaoServico', `${atual}${sep}${nome}`, { shouldDirty: true, shouldValidate: true })
  }

  async function salvarModeloPadrao() {
    const docId = (fiscalDoCliente as { id?: string } | null | undefined)?.id
    if (!docId) {
      toast.error('Cliente sem configuração fiscal — configure antes de salvar um modelo.')
      return
    }
    const v = watch()
    setSalvandoModelo(true)
    try {
      const modeloNfse = modeloDoFormulario({
        ...v,
        tomadorCpfCnpj: v.tomadorCpfCnpj ?? undefined,
        valorServico: Number.isFinite(v.valorServico) ? Number(v.valorServico) : undefined,
        aliquota: Number.isFinite(v.aliquota) ? Number(v.aliquota) : undefined,
        issRetido: v.issRetido === true,
      } as ValoresCopiados, new Date())
      await updateDocument('clientes_fiscal', docId, { modeloNfse })
      setConfigFiscal((atual) => atual && atual.dados
        ? { ...atual, dados: { ...atual.dados, modeloNfse } }
        : atual)
      toast.success(
        contemVariaveis(modeloNfse.descricaoServico)
          ? 'Modelo padrão salvo — a descrição usa variáveis de competência.'
          : 'Modelo padrão salvo para este cliente.'
      )
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o modelo padrão. Verifique sua permissão fiscal.'))
    } finally {
      setSalvandoModelo(false)
    }
  }

  async function preencherPeloCep(valor: string) {
    if (digitosDe(valor).length !== 8) return
    const r = await buscarCep(valor)
    if (!r) return
    const opts = { shouldDirty: true, shouldValidate: true } as const
    if (r.logradouro) setValue('tomadorLogradouro', r.logradouro, opts)
    if (r.bairro) setValue('tomadorBairro', r.bairro, opts)
    if (r.cidade) setValue('tomadorMunicipio', r.cidade, opts)
    if (r.uf) setValue('tomadorUf', r.uf, opts)
    if (r.ibge) setValue('tomadorMunicipioIbge', r.ibge, opts)
  }

  async function buscarTomadorPeloCnpj() {
    const cnpj = digitosDe(watch('tomadorCpfCnpj'))
    if (cnpj.length !== 14) {
      toast.error('Informe um CNPJ com 14 dígitos para buscar na Receita.')
      return
    }
    setBuscandoCnpjTomador(true)
    try {
      const d = await buscarDadosCnpj(cnpj)
      const opts = { shouldDirty: true, shouldValidate: true } as const
      if (d.razaoSocial) setValue('tomadorNome', d.razaoSocial, opts)
      if (d.email && !watch('tomadorEmail')) setValue('tomadorEmail', d.email, opts)
      if (d.cep) setValue('tomadorCep', formatCep(d.cep), opts)
      setValue('tomadorLogradouro', d.logradouro ?? '', opts)
      setValue('tomadorNumero', d.numero ?? '', opts)
      setValue('tomadorComplemento', d.complemento ?? '', opts)
      setValue('tomadorBairro', d.bairro ?? '', opts)
      if (d.municipio) setValue('tomadorMunicipio', d.municipio, opts)
      if (d.uf) setValue('tomadorUf', d.uf, opts)
      if (d.municipioIbge) setValue('tomadorMunicipioIbge', d.municipioIbge, opts)
      setTomadorCarteiraId(null)
      toast.success(d.situacao && d.situacao.toUpperCase() !== 'ATIVA'
        ? `Dados da Receita preenchidos — atenção: situação cadastral ${d.situacao}.`
        : 'Dados da Receita preenchidos — confira antes de emitir.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível buscar o CNPJ na Receita.'))
    } finally {
      setBuscandoCnpjTomador(false)
    }
  }

  /** Descrição como vai para a DPS (variáveis já substituídas pela competência da nota). */
  function descricaoFinal(data: Pick<NfseFormData, 'descricaoServico' | 'competencia'>): string {
    return renderizarDescricao(data.descricaoServico ?? '', lerCompetencia(data.competencia))
  }

  async function handleSaveRascunho(data: NfseFormData) {
    setSaving(true)
    try {
      const cliente = clientes.find((c) => c.id === data.clienteId)
      const payload = {
        clienteId:     data.clienteId,
        clienteNome:   cliente?.razaoSocial ?? data.tomadorNome,
        competenciaId: data.competenciaId ?? null,
        titulo:        `NFS-e — ${data.tomadorNome}`,
        status:        'aguardando_emissao',
        requerRevisao: false,
        dados: {
          tomadorNome:      data.tomadorNome,
          tomadorCpfCnpj:   data.tomadorCpfCnpj.replace(/\D/g, ''),
          tomadorEmail:     data.tomadorEmail || null,
          tomadorEndereco:  enderecoDoFormulario(data),
          descricaoServico: descricaoFinal(data),
          descricaoServicoModelo: contemVariaveis(data.descricaoServico) ? data.descricaoServico : null,
          codigoServico:    data.codigoServico,
          itemListaServico: data.itemListaServico,
          codigoTributacaoNacional: data.codigoTributacaoNacional?.trim() || null,
          codigoNbs:        data.codigoNbs?.trim() || null,
          municipioPrestacaoIbge: data.municipioPrestacaoIbge?.trim() || null,
          ibsCbsCst:        data.ibsCbsCst?.trim() || null,
          ibsCbsClassTrib:  data.ibsCbsClassTrib?.trim() || null,
          ibsCbsIndOp:      data.ibsCbsIndOp?.trim() || null,
          informacoesComplementares: data.informacoesComplementares?.trim() || null,
          dataCompetencia:  lerCompetencia(data.competencia) ? competenciaParaData(lerCompetencia(data.competencia)!) : null,
          valorServico:     data.valorServico,
          aliquota:         data.aliquota ?? null,
          issRetido:        data.issRetido,
        },
      }
      if (rascunhoAtual) {
        await updateDocument('nfse_rascunhos', rascunhoAtual.id, payload)
        toast.success('Rascunho revisado e liberado para emissão em lote.')
      } else {
        await createDocument('nfse_rascunhos', payload)
        toast.success('Rascunho salvo com sucesso!')
      }
      await finishFlow()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o rascunho. Verifique cliente, serviço e permissão fiscal.'))
    } finally {
      setSaving(false)
    }
  }

  function solicitarEmissao(data: NfseFormData) {
    if (bloqueioEmissao) {
      toast.error(bloqueioEmissao.titulo)
      return
    }
    setEmissaoPendente(data)
  }

  function onEmissaoInvalida(formErrors: typeof errors) {
    const primeiraMensagem = Object.values(formErrors)[0]?.message
    toast.error(
      typeof primeiraMensagem === 'string'
        ? primeiraMensagem
        : 'Revise os campos antes de emitir — algum dado está incompleto ou inválido.'
    )
    setShowResume(false)
  }

  async function confirmarEmissao() {
    if (!emissaoPendente) return
    const data = emissaoPendente

    setEmitting(true)
    try {
      const functions = getFunctions(getFirebaseApp(), 'southamerica-east1')
      const emitirNfse = httpsCallable<Record<string, unknown>, { sucesso: boolean; numeroNfse?: string; codigoVerificacao?: string; erro?: string; detalhes?: string; codigoErro?: string }>(
        functions,
        'emitirNfse'
      )

      const competencia = lerCompetencia(data.competencia)
      const endereco = enderecoDoFormulario(data)
      const payload = {
        clienteId:     data.clienteId,
        rascunhoId:    rascunhoAtual?.id,
        competenciaId: data.competenciaId ?? null,
        // Competência explícita da tela; o backend ainda limita à data de emissão.
        dataCompetencia: competencia ? competenciaParaData(competencia) : undefined,
        tomador: {
          razaoSocial: data.tomadorNome,
          cpfCnpj:     data.tomadorCpfCnpj.replace(/\D/g, ''),
          email:       data.tomadorEmail || undefined,
          endereco:    endereco ?? undefined,
        },
        servico: {
          discriminacao:    descricaoFinal(data),
          descricaoModelo:  contemVariaveis(data.descricaoServico) ? data.descricaoServico : undefined,
          codigoServico:    data.codigoServico,
          itemListaServico: data.itemListaServico,
          codigoTributacaoNacional: data.codigoTributacaoNacional?.trim() || undefined,
          codigoNbs:        data.codigoNbs?.trim() || undefined,
          municipioPrestacao: data.municipioPrestacaoIbge?.trim() || undefined,
          ibsCbsCst:        data.ibsCbsCst?.trim() || undefined,
          ibsCbsClassTrib:  data.ibsCbsClassTrib?.trim() || undefined,
          ibsCbsIndOp:      data.ibsCbsIndOp?.trim() || undefined,
          informacoesComplementares: data.informacoesComplementares?.trim() || undefined,
          valorServico:     data.valorServico,
          aliquota:         data.aliquota ?? undefined,
          issRetido:        data.issRetido,
        },
      }

      const result = await emitirNfse(payload)
      const res = result.data

      if (res.sucesso) {
        const msg = res.numeroNfse
          ? `NFS-e emitida com sucesso! Número: ${res.numeroNfse}`
          : 'NFS-e emitida com sucesso!'
        toast.success(msg)
        await finishFlow()
      } else {
        const mensagem = [
          res.codigoErro ? `Código: ${res.codigoErro}` : null,
          res.erro ?? 'Erro ao emitir NFS-e.',
          res.detalhes && res.detalhes !== res.erro ? `Detalhes técnicos: ${res.detalhes}` : null,
        ].filter(Boolean).join('\n')
        toast.error(mensagem.slice(0, 1500))
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível emitir a NFS-e. Verifique configuração fiscal, credencial e homologação do município.'))
    } finally {
      setEmitting(false)
      setEmissaoPendente(null)
    }
  }

  const isLoading = saving || emitting
  const isEditingRascunho = Boolean(rascunhoAtual)
  const previewCliente = clientes.find((c) => c.id === selectedClienteId)
  const previewCompetenciaId = watch('competenciaId')
  const previewCompetencia = competencias.find((c) => c.id === previewCompetenciaId)
  const previewValor = watch('valorServico')
  const previewCodigo = watch('codigoServico')
  const previewItemListaServico = watch('itemListaServico')
  const previewAliquota = watch('aliquota')
  const previewIssRetido = watch('issRetido')
  const previewTomadorNome = watch('tomadorNome')
  const fiscalDoCliente = configFiscal && configFiscal.clienteId === selectedClienteId ? configFiscal.dados : undefined
  const ambienteEmissao = fiscalDoCliente?.ambienteEmissao as string | undefined
  // Sem o campo = Ambiente Nacional (mesma regra do backend).
  const provedorEmissao = fiscalDoCliente ? provedorNfseEfetivo(fiscalDoCliente) : undefined
  const credenciaisDoCliente = (fiscalDoCliente?.credenciais ?? {}) as Record<string, unknown>
  const situacaoMunicipio = situacaoNacional((fiscalDoCliente?.municipioIbge ?? fiscalDoCliente?.codigoMunicipioIbge) as string | undefined)
  const municipioForaDoNacional = situacaoMunicipio === 'prefeitura' || situacaoMunicipio === 'sem_convenio'
  const semA1Nacional = provedorEmissao === 'nacional'
    && !(typeof credenciaisDoCliente.certificadoStoragePath === 'string' && credenciaisDoCliente.certificadoStoragePath && credenciaisDoCliente.certValido === true)
  // Barra a emissão ANTES do último clique: antes, um cliente ainda com a Spedy
  // (descontinuada) só descobria o problema no erro do backend, depois das 5 etapas.
  const bloqueioEmissao: { titulo: string; detalhe: string } | null =
    !selectedClienteId || fiscalDoCliente === undefined ? null
      : fiscalDoCliente === null
        ? { titulo: 'Cliente sem configuração fiscal.', detalhe: 'Configure município, inscrição municipal e certificado antes de emitir.' }
        : provedorEmissao === 'nacional' && ambienteEmissao === 'producao' && producaoNacionalLiberada === false
          ? { titulo: 'Emissão em produção pelo Ambiente Nacional ainda não liberada.', detalhe: 'Um administrador libera em Administração → Conectores (chave "Ambiente Nacional"). Para testar, deixe o cliente em Homologação.' }
          : provedorEmissao === 'nacional' && ambienteEmissao === 'producao' && municipioForaDoNacional
            ? { titulo: `${(fiscalDoCliente.municipioEmissor as string | undefined) ?? 'O município do cliente'} não emite pelo Ambiente Nacional.`, detalhe: 'Este município não aderiu ao Emissor Nacional — a NFS-e deste cliente é emitida no portal da prefeitura, fora da plataforma.' }
            : semA1Nacional
            ? { titulo: 'Cliente sem certificado A1 válido.', detalhe: 'A emissão pelo Ambiente Nacional é assinada com o A1 do próprio cliente. Envie o certificado na configuração fiscal.' }
            : null
  const previewTomadorCpf = watch('tomadorCpfCnpj')
  const previewTomadorEmail = watch('tomadorEmail')
  const previewDescricao = watch('descricaoServico')
  const previewCompetenciaNota = lerCompetencia(watch('competencia'))
  const previewDescricaoFinal = renderizarDescricao(previewDescricao ?? '', previewCompetenciaNota)
  const previewLocalPrestacao = watch('municipioPrestacaoIbge')
  const previewNbs = watch('codigoNbs')
  const previewCTribNac = watch('codigoTributacaoNacional')
  const previewInfoCompl = watch('informacoesComplementares')
  const previewEndereco = enderecoDoFormulario(watchedValues)
  // Mesma precedência do backend: nota > configuração fiscal > item LC 116.
  const cTribNacConfig = typeof fiscalDoCliente?.codigoTributacaoNacional === 'string' && /^\d{6}$/.test(fiscalDoCliente.codigoTributacaoNacional)
    ? fiscalDoCliente.codigoTributacaoNacional
    : undefined
  const cTribNacDerivado = cTribNacConfig ?? codigoNacionalDoItem(previewItemListaServico)
  const regraCompetencia = normalizarRegraCompetencia(fiscalDoCliente?.competenciaPadrao)
  const regraCompetenciaRotulo = regraCompetencia === 'mes_anterior'
    ? 'mês anterior à emissão'
    : regraCompetencia === 'manual' ? 'escolher a cada nota' : 'mês da emissão'
  const allFieldsFilled = Boolean(
    selectedClienteId
    && previewCompetenciaNota
    && previewTomadorNome
    && previewTomadorCpf && isValidCpfCnpj(previewTomadorCpf)
    && previewDescricao && previewDescricao.length >= 10
    && previewCodigo && isValidCodigoServico(previewCodigo)
    && previewItemListaServico && isValidCodigoServico(previewItemListaServico)
    && previewValor
  )
  const isModal = layout === 'modal'

  function handleShowResume() { setShowResume(true) }
  function handleBackFromResume() { setShowResume(false) }

  async function finishFlow() {
    if (onFinished) await onFinished()
    if (onCancel) {
      onCancel()
      return
    }
    router.push('/fiscal')
  }

  function cancelFlow() {
    if (onCancel) {
      onCancel()
      return
    }
    router.back()
  }

  return (
    <form className={isModal ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]' : 'space-y-5'}>
      <div className={isModal ? 'space-y-5' : undefined}>
      {loadingRascunho ? (
        <div className="flex items-center justify-center rounded-xl border py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      {/* Resumo — step 4 */}
      {showResume && !loadingRascunho && (
        <Card className={cardClassByLayout[layout]}>
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <button type="button" onClick={handleBackFromResume} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar e editar
            </button>
            <CardTitle className="text-sm flex items-center gap-2 ml-auto">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Resumo da nota
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prestador / Tomador</h3>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Prestador</dt><dd className="font-medium">{previewCliente?.razaoSocial ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tomador</dt><dd className="font-medium">{previewTomadorNome || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">CPF / CNPJ tomador</dt><dd className="font-mono">{previewTomadorCpf ? formatCpfCnpj(previewTomadorCpf) : '—'}</dd></div>
                {previewTomadorEmail && <div><dt className="text-xs text-muted-foreground">E-mail tomador</dt><dd>{previewTomadorEmail}</dd></div>}
                <div><dt className="text-xs text-muted-foreground">Competência</dt><dd className="font-medium">{formatarCompetencia(previewCompetenciaNota)}</dd></div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Endereço do tomador</dt>
                  <dd>{previewEndereco ? textoEndereco(previewEndereco) : 'Não informado'}</dd>
                </div>
              </dl>
            </section>
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Serviço</h3>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Descrição (como sai na nota)</dt><dd className="whitespace-pre-wrap">{previewDescricaoFinal || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Código</dt><dd className="font-mono">{previewCodigo || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Item Lista Serviço</dt><dd className="font-mono">{previewItemListaServico || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Código de tributação nacional</dt><dd className="font-mono">{previewCTribNac?.trim() || (cTribNacDerivado ? `${cTribNacDerivado} (automático)` : '—')}</dd></div>
                <div><dt className="text-xs text-muted-foreground">NBS</dt><dd className="font-mono">{previewNbs?.trim() || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Local da prestação</dt><dd>{previewLocalPrestacao ? `${nomeMunicipioConhecido(previewLocalPrestacao) ?? 'IBGE'} (${previewLocalPrestacao})` : 'Município do prestador'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Valor</dt><dd className="font-semibold tabular-nums">{Number.isFinite(previewValor) ? formatCurrency(Number(previewValor)) : '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Alíquota ISS</dt><dd>{Number.isFinite(previewAliquota) ? `${Number(previewAliquota)}%` : 'Padrão configuração'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">ISS retido</dt><dd>{previewIssRetido ? 'Sim' : 'Não'}</dd></div>
                {previewInfoCompl?.trim() && (
                  <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Informações complementares</dt><dd className="whitespace-pre-wrap">{previewInfoCompl}</dd></div>
                )}
              </dl>
            </section>
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-warning-foreground">
              Revise os dados acima. Após emitir, a nota é registrada na prefeitura e não pode ser cancelada automaticamente.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vínculo + Tomador + Serviço — hidden when resume is shown */}
      {!showResume && (<>
      <Card className={[cardClassByLayout[layout], loadingRascunho ? 'pointer-events-none opacity-60' : undefined].filter(Boolean).join(' ')}>
        <CardHeader><CardTitle className="text-sm">Vínculo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Cliente</Label>
            <Controller
              name="clienteId"
              control={control}
              render={({ field }) => (
                <ClientePicker
                  clientes={clientes}
                  value={field.value}
                  onChange={(id) => field.onChange(id ?? '')}
                  loading={loadingClientes}
                />
              )}
            />
            {errors.clienteId && <p className="text-xs text-destructive">{errors.clienteId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Competência (opcional)</Label>
            <Controller
              name="competenciaId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? SELECT_NONE_VALUE}
                  onValueChange={(v) => field.onChange(v === SELECT_NONE_VALUE ? null : v)}
                  disabled={loadingCompetencias || !selectedClienteId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !selectedClienteId ? 'Selecione um cliente primeiro'
                        : loadingCompetencias ? 'Carregando...'
                        : 'Selecione a competência'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>Nenhuma</SelectItem>
                    {competencias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {String(c.mes).padStart(2, '0')}/{c.ano}
                        {c.servicoNome ? ` — ${c.servicoNome}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">Vincula a nota ao fechamento do mês no escritório.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="competencia" required>Competência da nota (mês/ano)</Label>
            <Input id="competencia" type="month" className="max-w-[220px]" {...register('competencia')} />
            {errors.competencia
              ? <p className="text-xs text-destructive">{errors.competencia.message}</p>
              : (
                  <p className="text-xs text-muted-foreground">
                    Padrão do cliente: {regraCompetenciaRotulo}. Vai como data de competência (1º dia do mês) na NFS-e.
                  </p>
                )}
          </div>

          {selectedClienteId && !isEditingRascunho && (
            <NfseCopiarNota
              notas={notasCliente?.clienteId === selectedClienteId ? notasCliente.notas : []}
              loading={notasCliente?.clienteId !== selectedClienteId}
              temModelo={Boolean(valoresDoModelo(fiscalDoCliente?.modeloNfse))}
              competenciasPorId={competenciasPorId}
              onUsarNota={usarNotaComoBase}
              onUsarModelo={usarModeloPadrao}
            />
          )}

          {copiaOrigem && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="flex-1 text-foreground">{copiaOrigem} — confira competência, valor e descrição.</p>
              <button type="button" onClick={() => setCopiaOrigem(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar aviso">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tomador */}
      <Card className={cardClassByLayout[layout]}>
        <CardHeader><CardTitle className="text-sm">Dados do Tomador</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {selectedClienteId && (
            <div className="space-y-1.5">
              <Label>Tomador da carteira do cliente</Label>
              <ClientePicker
                clientes={carteiraClienteId === selectedClienteId ? carteira : []}
                value={tomadorCarteiraId}
                loading={carteiraClienteId !== selectedClienteId}
                placeholder={carteira.length ? 'Escolher tomador cadastrado' : 'Nenhum tomador na carteira deste cliente'}
                onChange={(id) => {
                  setTomadorCarteiraId(id)
                  const t = carteira.find((x) => x.id === id)
                  if (!t) return
                  setValue('tomadorNome', t.razaoSocial, { shouldValidate: true })
                  setValue('tomadorCpfCnpj', formatCpfCnpj(t.cpfCnpj), { shouldValidate: true })
                  setValue('tomadorEmail', t.email ?? '', { shouldValidate: true })
                  const e = t.endereco ?? {}
                  setValue('tomadorCep', e.cep ? formatCep(e.cep) : '', { shouldValidate: true })
                  setValue('tomadorLogradouro', e.logradouro ?? '', { shouldValidate: true })
                  setValue('tomadorNumero', e.numero ?? '', { shouldValidate: true })
                  setValue('tomadorComplemento', e.complemento ?? '', { shouldValidate: true })
                  setValue('tomadorBairro', e.bairro ?? '', { shouldValidate: true })
                  setValue('tomadorMunicipio', e.municipio ?? '', { shouldValidate: true })
                  setValue('tomadorMunicipioIbge', e.municipioIbge ? normalizarIbge(e.municipioIbge) : '', { shouldValidate: true })
                  setValue('tomadorUf', e.uf ?? '', { shouldValidate: true })
                }}
              />
              <p className="text-xs text-muted-foreground">
                Ou preencha abaixo. A carteira de tomadores fica em Clientes → (cliente) → Tomadores.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tomadorNome" required>Nome / Razão Social</Label>
            <Input id="tomadorNome" {...register('tomadorNome')} placeholder="Nome completo ou razão social" />
            {errors.tomadorNome && <p className="text-xs text-destructive">{errors.tomadorNome.message}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tomadorCpfCnpj" required>CPF / CNPJ</Label>
              <Controller
                name="tomadorCpfCnpj"
                control={control}
                render={({ field }) => (
                  <CpfCnpjInput
                    id="tomadorCpfCnpj"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChange={(masked) => field.onChange(masked)}
                    placeholder="000.000.000-00"
                  />
                )}
              />
              {errors.tomadorCpfCnpj && <p className="text-xs text-destructive">{errors.tomadorCpfCnpj.message}</p>}
              {digitosDe(previewTomadorCpf).length === 14 && (
                <Button type="button" variant="outline" size="sm" className="mt-1" onClick={buscarTomadorPeloCnpj} disabled={buscandoCnpjTomador}>
                  {buscandoCnpjTomador ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
                  Buscar pelo CNPJ
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tomadorEmail">E-mail</Label>
              <Input id="tomadorEmail" type="email" {...register('tomadorEmail')} placeholder="tomador@email.com" />
              {errors.tomadorEmail && <p className="text-xs text-destructive">{errors.tomadorEmail.message}</p>}
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endereço do tomador</p>
            <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_110px]">
              <div className="space-y-1.5">
                <Label htmlFor="tomadorCep">CEP</Label>
                <Controller name="tomadorCep" control={control} render={({ field }) => (
                  <Input
                    id="tomadorCep"
                    inputMode="numeric"
                    placeholder="00000-000"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChange={(e) => {
                      const v = formatCep(e.target.value)
                      field.onChange(v)
                      if (digitosDe(v).length === 8) void preencherPeloCep(v)
                    }}
                  />
                )} />
                {buscandoCep && <p className="text-xs text-muted-foreground">Buscando CEP…</p>}
                {!buscandoCep && erroCep && <p className="text-xs text-warning">{erroCep}</p>}
                {errors.tomadorCep && <p className="text-xs text-destructive">{errors.tomadorCep.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tomadorLogradouro">Logradouro</Label>
                <Input id="tomadorLogradouro" {...register('tomadorLogradouro')} placeholder="Rua, avenida…" />
                {errors.tomadorLogradouro && <p className="text-xs text-destructive">{errors.tomadorLogradouro.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tomadorNumero">Número</Label>
                <Input id="tomadorNumero" {...register('tomadorNumero')} placeholder="S/N" />
                {errors.tomadorNumero && <p className="text-xs text-destructive">{errors.tomadorNumero.message}</p>}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tomadorComplemento">Complemento</Label>
                <Input id="tomadorComplemento" {...register('tomadorComplemento')} placeholder="Sala, andar…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tomadorBairro">Bairro</Label>
                <Input id="tomadorBairro" {...register('tomadorBairro')} />
                {errors.tomadorBairro && <p className="text-xs text-destructive">{errors.tomadorBairro.message}</p>}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="tomadorMunicipio">Município</Label>
                <Input id="tomadorMunicipio" {...register('tomadorMunicipio')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tomadorUf">UF</Label>
                <Input id="tomadorUf" maxLength={2} {...register('tomadorUf')} />
              </div>
              <div className="space-y-1.5">
                <Label>Município (lista IBGE)</Label>
                <Controller name="tomadorMunicipioIbge" control={control} render={({ field }) => (
                  <CatalogoPicker
                    opcoes={MUNICIPIOS_IBGE}
                    value={field.value}
                    placeholder="Selecione o município"
                    buscaPlaceholder="Buscar município ou código IBGE..."
                    permitirLimpar
                    onChange={(ibge) => {
                      field.onChange(ibge ?? '')
                      const m = (municipiosIbge as { ibge: string; nome: string; uf: string }[]).find((x) => x.ibge === ibge)
                      if (m) {
                        setValue('tomadorMunicipio', m.nome, { shouldDirty: true })
                        setValue('tomadorUf', m.uf, { shouldDirty: true })
                      }
                    }}
                  />
                )} />
                {errors.tomadorMunicipioIbge && <p className="text-xs text-destructive">{errors.tomadorMunicipioIbge.message}</p>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Opcional, mas se preencher precisa estar completo (CEP, logradouro, número, bairro e IBGE) — o CEP
              preenche o resto sozinho.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Serviço */}
      <Card className={cardClassByLayout[layout]}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm">Serviço</CardTitle>
          <div className="flex items-center gap-1.5">
            {(ultimoRascunho || loadingUltimoRasc) && (
              <button
                type="button"
                disabled={loadingUltimoRasc}
                onClick={applyUltimoRascunho}
                className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {loadingUltimoRasc ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Último
              </button>
            )}
            {templates.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  Templates ({templates.length})
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-[280px]">
                  {templates.map((t, i) => {
                    const desc = (t.dados?.descricaoServico as string | undefined) ?? `Rascunho ${i + 1}`
                    const valor = t.dados?.valorServico ? formatCurrency(Number(t.dados.valorServico)) : ''
                    return (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => { applyRascunhoData(t); toast.success('Template aplicado.') }}
                        className="flex-col items-start gap-0.5"
                      >
                        <span className="line-clamp-1 text-xs font-medium">{desc.slice(0, 60)}{desc.length > 60 ? '…' : ''}</span>
                        {valor && <span className="text-[11px] text-muted-foreground">{valor}</span>}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="descricaoServico" required>Descrição do Serviço</Label>
            <Textarea id="descricaoServico" rows={4} {...register('descricaoServico')} placeholder="Descreva o serviço prestado conforme contrato..." />
            {errors.descricaoServico && <p className="text-xs text-destructive">{errors.descricaoServico.message}</p>}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Inserir variável:</span>
              {VARIAVEIS_DESCRICAO.map((v) => (
                <button
                  key={v.nome}
                  type="button"
                  title={`${v.ajuda} (ex.: ${v.exemplo})`}
                  onClick={() => inserirVariavel(v.nome)}
                  className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {v.nome}
                </button>
              ))}
            </div>
            {contemVariaveis(previewDescricao) && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <p className="font-medium text-muted-foreground">
                  Como sai na nota{previewCompetenciaNota ? ` (competência ${formatarCompetencia(previewCompetenciaNota)})` : ''}:
                </p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">
                  {previewCompetenciaNota ? previewDescricaoFinal : 'Informe a competência para ver o texto final.'}
                </p>
              </div>
            )}
            {sugestaoModelo && (
              <div className="space-y-2 rounded-md border border-primary/25 bg-primary/[0.04] px-3 py-2.5 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Converter em modelo com variáveis?
                </p>
                <p className="text-muted-foreground">
                  A descrição cita a competência da nota copiada. Com variáveis, ela acompanha a competência de cada nova nota.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Antes</p>
                    <p className="mt-0.5 whitespace-pre-wrap rounded border bg-background px-2 py-1.5">{sugestaoModelo.antes}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Depois</p>
                    <p className="mt-0.5 whitespace-pre-wrap rounded border bg-background px-2 py-1.5 font-mono text-[11px]">{sugestaoModelo.depois}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={aceitarSugestaoModelo}>Converter</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSugestaoModelo(null)}>Manter como está</Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="codigoServico" required>Código do Serviço (município)</Label>
              <Input id="codigoServico" {...register('codigoServico')} placeholder="Ex: 17.19" />
              {errors.codigoServico && <p className="text-xs text-destructive">{errors.codigoServico.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label required>Item Lista Serviço (LC 116)</Label>
              <Controller name="itemListaServico" control={control} render={({ field }) => (
                <Lc116Picker value={field.value} onChange={field.onChange} />
              )} />
              {errors.itemListaServico && <p className="text-xs text-destructive">{errors.itemListaServico.message}</p>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="codigoTributacaoNacional">Código de tributação nacional</Label>
              <Controller name="codigoTributacaoNacional" control={control} render={({ field }) => (
                <CatalogoPicker
                  opcoes={SERVICOS_NACIONAIS}
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  placeholder={cTribNacDerivado ? `Automático: ${cTribNacDerivado}` : 'Automático pelo item LC 116'}
                  buscaPlaceholder="Buscar código ou serviço..."
                  permitirLimpar
                />
              )} />
              {errors.codigoTributacaoNacional
                ? <p className="text-xs text-destructive">{errors.codigoTributacaoNacional.message}</p>
                : <p className="text-xs text-muted-foreground">Lista nacional de serviços. Vazio = o da configuração fiscal ou o derivado do item LC 116.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="codigoNbs">Código NBS</Label>
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
              {errors.codigoNbs
                ? <p className="text-xs text-destructive">{errors.codigoNbs.message}</p>
                : (
                    <p className="text-xs text-muted-foreground">Opcional. Tabela NBS 2.0 oficial (Anexo B da NFS-e).</p>
                  )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="municipioPrestacaoIbge">Local da prestação (IBGE)</Label>
              <Controller name="municipioPrestacaoIbge" control={control} render={({ field }) => (
                <CatalogoPicker
                  opcoes={MUNICIPIOS_IBGE}
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  placeholder="Município do prestador"
                  buscaPlaceholder="Buscar município ou código IBGE..."
                  permitirLimpar
                />
              )} />
              {errors.municipioPrestacaoIbge
                ? <p className="text-xs text-destructive">{errors.municipioPrestacaoIbge.message}</p>
                : (
                    <p className="text-xs text-muted-foreground">
                      {previewLocalPrestacao ? 'Onde o serviço foi prestado' : 'Vazio = município do prestador'}
                    </p>
                  )}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">IBS/CBS</p>
              <p className="text-xs text-muted-foreground">
                Vem do padrão do cliente. Obrigatório para Lucro Presumido e Real; Simples e MEI a partir de 2027.
                Preencha os três ou deixe todos vazios.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>CST</Label>
                <Controller name="ibsCbsCst" control={control} render={({ field }) => (
                  <CatalogoPicker
                    opcoes={CST_IBSCBS}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v ?? '')
                      if (!v || !String(watch('ibsCbsClassTrib') ?? '').startsWith(v)) setValue('ibsCbsClassTrib', '', { shouldDirty: true })
                    }}
                    placeholder="Selecione o CST"
                    permitirLimpar
                  />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Classificação tributária</Label>
                <Controller name="ibsCbsClassTrib" control={control} render={({ field }) => (
                  <CatalogoPicker
                    opcoes={classificacoesIbsCbs(new Date().toISOString().slice(0, 10), watch('ibsCbsCst') || undefined)}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v ?? '')
                      if (v) setValue('ibsCbsCst', v.slice(0, 3), { shouldDirty: true })
                    }}
                    placeholder="Selecione a classificação"
                    permitirLimpar
                  />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Indicador de operação</Label>
                <Controller name="ibsCbsIndOp" control={control} render={({ field }) => (
                  <CatalogoPicker
                    opcoes={INDICADOR_OPERACAO}
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? '')}
                    placeholder="Selecione o indicador"
                    permitirLimpar
                  />
                )} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="valorServico" required>Valor do Serviço (R$)</Label>
              <Controller name="valorServico" control={control} render={({ field }) => (
                <CurrencyInput id="valorServico" ref={field.ref} value={field.value} onChange={(v) => field.onChange(v ?? NaN)} onBlur={field.onBlur} />
              )} />
              {errors.valorServico && <p className="text-xs text-destructive">{errors.valorServico.message}</p>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="aliquota">Alíquota ISS (%)</Label>
              <Input id="aliquota" type="number" step="0.01" min="0" max="100" placeholder="Ex: 5" {...register('aliquota', { valueAsNumber: true })} />
              {errors.aliquota && <p className="text-xs text-destructive">{errors.aliquota.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>ISS Retido</Label>
              <Controller
                name="issRetido"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ? 'sim' : 'nao'} onValueChange={(v) => field.onChange(v === 'sim')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="informacoesComplementares">Informações complementares</Label>
            <Textarea
              id="informacoesComplementares"
              rows={3}
              {...register('informacoesComplementares')}
              placeholder="Ex.: dados bancários para pagamento"
            />
            {errors.informacoesComplementares
              ? <p className="text-xs text-destructive">{errors.informacoesComplementares.message}</p>
              : <p className="text-xs text-muted-foreground">Padrão vem da configuração fiscal do cliente. Na NFS-e, as quebras de linha viram &quot; | &quot;.</p>}
          </div>
        </CardContent>
      </Card>
      </>)}
      </div>

      <div className={isModal ? 'space-y-5 lg:sticky lg:top-0 lg:self-start' : 'space-y-5'}>
        {bloqueioEmissao && (
          <div className="space-y-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-destructive">Emissão bloqueada: {bloqueioEmissao.titulo}</p>
            <p className="text-xs text-destructive/80">{bloqueioEmissao.detalhe}</p>
            <a href={`/clientes/${selectedClienteId}/fiscal`} className="text-xs font-medium text-destructive underline underline-offset-2">
              Abrir configuração fiscal do cliente
            </a>
          </div>
        )}

        {/* Alertas de validação — avisos não-bloqueantes */}
        {(() => {
          const avisos: string[] = []
          if (previewTomadorCpf && !isValidCpfCnpj(previewTomadorCpf))
            avisos.push('CPF/CNPJ do tomador parece inválido.')
          if (previewCodigo && !isValidCodigoServico(previewCodigo))
            avisos.push('Código de serviço fora do padrão (ex.: 17.19).')
          if (Number.isFinite(previewAliquota) && Number(previewAliquota) < 2)
            avisos.push('Alíquota abaixo de 2% — confirme com a prefeitura.')
          if (Number.isFinite(previewValor) && Number(previewValor) > 50000)
            avisos.push('Valor acima de R$ 50.000 — verifique se há retenção obrigatória.')
          if (avisos.length === 0) return null
          return (
            <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
              <p className="text-xs font-semibold text-warning">Avisos de validação</p>
              {avisos.map(a => (
                <p key={a} className="text-xs text-warning/80 flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">⚠</span>{a}
                </p>
              ))}
            </div>
          )
        })()}

        <Card className={isModal ? 'border-primary/15 bg-gradient-to-b from-primary/[0.06] to-background shadow-none' : 'border-warning/30 bg-warning/5'}>
          <CardHeader>
            <CardTitle className="text-sm">{isModal ? 'Resumo da emissão' : 'Checklist antes da emissão'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <span className="text-muted-foreground">Ambiente:</span>{' '}
              {ambienteEmissao === 'producao'
                ? <span className="font-medium text-destructive">Produção — a nota sai de verdade, com valor fiscal</span>
                : ambienteEmissao === 'homologacao'
                  ? 'Homologação (teste, sem valor fiscal)'
                  : 'Definido na configuração fiscal do cliente'}
            </div>
            <div>
              <span className="text-muted-foreground">Emissão por:</span>{' '}
              {provedorEmissao === 'nacional'
                ? 'Ambiente Nacional (Sefin Nacional)'
                : provedorEmissao === 'municipio'
                  ? 'Prefeitura (conector legado)'
                  : 'Definido na configuração fiscal do cliente'}
            </div>
            <div><span className="text-muted-foreground">Prestador:</span> {previewCliente?.razaoSocial ?? 'Selecione o cliente'}</div>
            <div>
              <span className="text-muted-foreground">Competência:</span> {previewCompetenciaNota ? formatarCompetencia(previewCompetenciaNota) : 'Informe o mês/ano'}
              {previewCompetencia ? ' (vinculada ao fechamento)' : ''}
            </div>
            <div><span className="text-muted-foreground">Serviço:</span> {previewCodigo || 'Informe o código'}</div>
            <div><span className="text-muted-foreground">Valor:</span> {Number.isFinite(previewValor) ? formatCurrency(Number(previewValor)) : 'Informe o valor'}</div>
            <div><span className="text-muted-foreground">Alíquota:</span> {Number.isFinite(previewAliquota) ? `${Number(previewAliquota)}%` : 'Padrão da configuração'}</div>
            <div><span className="text-muted-foreground">ISS retido:</span> {previewIssRetido ? 'Sim' : 'Não'}</div>
            <div><span className="text-muted-foreground">Credencial/certificado:</span> Validado pela Cloud Function fiscal</div>
          </CardContent>
        </Card>

        <Card className={cardClassByLayout[layout]}>
          <CardHeader>
            <CardTitle className="text-sm">Ações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showResume && allFieldsFilled && (
              <Button type="button" className="w-full justify-center" onClick={handleShowResume}>
                <ChevronRight className="w-4 h-4 mr-2" />
                Revisar antes de emitir
              </Button>
            )}
            {showResume && (
              <Button type="button" className="w-full justify-center" disabled={isLoading || Boolean(bloqueioEmissao)} onClick={handleSubmit(solicitarEmissao, onEmissaoInvalida)}>
                {emitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Emitir NFS-e
              </Button>
            )}
            <Button type="button" variant="outline" className="w-full justify-center" disabled={isLoading || loadingRascunho} onClick={handleSubmit(handleSaveRascunho)}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isEditingRascunho ? 'Liberar para lote' : 'Salvar rascunho'}
            </Button>
            {selectedClienteId && fiscalDoCliente && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                disabled={isLoading || salvandoModelo || !previewTomadorNome}
                onClick={salvarModeloPadrao}
                title="Guarda tomador, serviço, valor e descrição (com variáveis) como ponto de partida das próximas notas deste cliente"
              >
                {salvandoModelo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileStack className="w-4 h-4 mr-2" />}
                {valoresDoModelo(fiscalDoCliente.modeloNfse) ? 'Atualizar modelo padrão' : 'Salvar como modelo padrão'}
              </Button>
            )}
            <Button type="button" variant="ghost" className="w-full justify-center" disabled={isLoading} onClick={cancelFlow}>
              Cancelar
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(emissaoPendente)}
        onOpenChange={(open) => {
          if (!open && !emitting) setEmissaoPendente(null)
        }}
        title="Confirmar emissão de NFS-e?"
        description={
          emissaoPendente
            ? (
                <div className="space-y-4">
                  <div className="grid gap-3 rounded-lg border border-border bg-muted/25 p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cliente</p>
                      <p className="mt-1 text-sm font-medium">
                        {clientes.find((c) => c.id === emissaoPendente.clienteId)?.razaoSocial ?? emissaoPendente.clienteId}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tomador</p>
                      <p className="mt-1 text-sm font-medium">{emissaoPendente.tomadorNome}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CPF / CNPJ</p>
                      <p className="mt-1 font-mono text-sm">{emissaoPendente.tomadorCpfCnpj}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Código do serviço</p>
                      <p className="mt-1 text-sm font-medium">{emissaoPendente.codigoServico}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Valor</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">
                        {formatCurrency(Number(emissaoPendente.valorServico))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ISS retido</p>
                      <p className="mt-1 text-sm font-medium">{emissaoPendente.issRetido ? 'Sim' : 'Não'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Competência</p>
                      <p className="mt-1 text-sm font-medium">{formatarCompetencia(lerCompetencia(emissaoPendente.competencia))}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Descrição</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{descricaoFinal(emissaoPendente)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Após confirmar, a solicitação será enviada para a prefeitura e poderá gerar documento fiscal.
                  </p>
                </div>
              )
            : undefined
        }
        confirmLabel="Emitir NFS-e"
        cancelLabel="Revisar dados"
        onConfirm={confirmarEmissao}
      />
    </form>
  )
}
