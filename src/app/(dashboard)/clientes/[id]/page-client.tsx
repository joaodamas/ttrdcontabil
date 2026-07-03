'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { where, orderBy, limit } from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'

import { getDocument, listDocuments, updateDocument, createDocument, softDeleteDocument } from '@/lib/firestore-client'
import { formatCpfCnpj, formatDate, formatCurrency, formatMesAno, tsToDate, cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/error-message'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Timeline, type TimelineEvent, type TimelineEventType } from '@/components/clientes/timeline'
import { ClienteServicoDialog } from '@/components/clientes/cliente-servico-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ArrowLeft, Mail, MapPin, Pencil, ShieldCheck, ShieldAlert, ShieldOff,
  AlertTriangle, Plus, Receipt, Wallet, AlertCircle, Bell, FileDown,
  CheckSquare, DollarSign, BookOpen, Loader2, Save, Send, MessageSquarePlus, Trash2,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfigFiscalForm, MUNICIPIOS, MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { CertificadoUpload, type CertInfo } from '@/components/fiscal/certificado-upload'
import { EmitirNfseModal } from '@/components/fiscal/emitir-nfse-modal'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela } from '@/lib/permissions'
import { getPathSegmentAfter } from '@/lib/route-params'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo:     { label: 'Ativo',     variant: 'default' },
  inativo:   { label: 'Inativo',   variant: 'secondary' },
  suspenso:  { label: 'Suspenso',  variant: 'destructive' },
}

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento',
}

const REGIME_MAP: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento / Imune',
}

const EMPRESA_GERAL_FIELDS = [
  ['razaoSocial', 'Razão Social'],
  ['nomeFantasia', 'Nome Fantasia'],
  ['cpfCnpj', 'CNPJ / CPF'],
  ['email', 'E-mail'],
  ['telefone', 'Telefone'],
  ['celular', 'Celular'],
  ['regimeTributario', 'Regime Tributário'],
  ['status', 'Status'],
] as const

const EMPRESA_ENDERECO_FIELDS = [
  ['logradouro', 'Endereço'],
  ['numero', 'Número'],
  ['complemento', 'Complemento'],
  ['bairro', 'Bairro'],
  ['cidade', 'Cidade'],
  ['uf', 'Estado'],
  ['cep', 'CEP'],
] as const

const EMPRESA_CADASTRO_FIELDS = [
  ['inscricaoEstadual', 'Inscrição Estadual'],
  ['inscricaoMunicipal', 'Inscrição Municipal'],
  ['nire', 'NIRE'],
  ['capitalSocial', 'Capital social'],
  ['porteEmpresa', 'Porte'],
  ['cadastroImovelIptu', 'Cadastro IPTU'],
  ['cnaePrincipal', 'CNAE principal'],
  ['cnaeSecundario', 'CNAE secundário'],
  ['codSimplesNacional', 'Cód. Simples Nacional'],
  ['mensalidade', 'Mensalidade'],
  ['vencimento', 'Vencimento'],
] as const

const EMPRESA_CREDENCIAIS_FIELDS = [
  ['loginPrefeitura', 'Login Prefeitura'],
  ['senhaWebPrefeitura', 'Senha WEB Prefeitura'],
  ['senhaPinCertificadoDigitalECnpj', 'Senha PIN e-CNPJ'],
  ['loginPostoFiscal', 'Login posto fiscal'],
  ['senhaPostoFiscal', 'Senha posto fiscal'],
] as const

const REPRESENTANTE_FIELDS = [
  ['responsavelNome', 'Nome'],
  ['responsavelEmail', 'E-mail'],
  ['responsavelTelefone', 'Telefone'],
  ['responsavelCelular', 'Celular'],
  ['responsavelCpf', 'CPF'],
  ['responsavelCnh', 'CNH'],
  ['responsavelDataEmissao', 'Data de emissão'],
  ['responsavelRg', 'RG'],
  ['responsavelDataNascimento', 'Data de nascimento'],
  ['responsavelOrgaoEmissor', 'Órgão emissor'],
  ['responsavelLocalNascimento', 'Local de nascimento'],
  ['responsavelNomePai', 'Nome do pai'],
  ['responsavelNomeMae', 'Nome da mãe'],
  ['responsavelPis', 'PIS'],
  ['responsavelEstadoCivil', 'Estado civil'],
  ['responsavelComunhaoBens', 'Comunhão de bens'],
  ['responsavelEscolaridade', 'Escolaridade'],
  ['responsavelFormacaoSuperior', 'Formação superior'],
  ['responsavelTituloEleitor', 'Título de eleitor'],
] as const

const REPRESENTANTE_ENDERECO_FIELDS = [
  ['responsavelEndereco', 'Endereço'],
  ['responsavelNumero', 'Número'],
  ['responsavelComplemento', 'Complemento'],
  ['responsavelBairro', 'Bairro'],
  ['responsavelCep', 'CEP'],
] as const

const REPRESENTANTE_CREDENCIAIS_FIELDS = [
  ['responsavelSenhaMeuGov', 'Senha MEU GOV'],
  ['responsavelSenhaEcacPf', 'Senha e-CAC PF'],
  ['responsavelSenhaWebPrefeitura', 'Senha WEB Prefeitura'],
  ['responsavelSenhaPinCertificadoDigitalCpf', 'Senha PIN CPF'],
] as const

function fieldValue(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value : '—'
}

function passwordValue(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? '********' : '—'
}

function printableValue(data: Record<string, unknown>, key: string) {
  const value = data[key]
  if (value == null || value === '') return '—'
  if (key === 'cpfCnpj' || key === 'responsavelCpf') return formatCpfCnpj(String(value))
  if (key === 'regimeTributario') return REGIME_LABELS[String(value)] ?? String(value)
  if (key === 'status') return STATUS_LABELS[String(value)]?.label ?? String(value)
  return String(value)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function fichaRows(data: Record<string, unknown>, fields: readonly (readonly [string, string])[]) {
  return fields.map(([key, label]) => `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${escapeHtml(printableValue(data, key))}</td>
    </tr>
  `).join('')
}

function fichaSection(title: string, rows: string) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `
}

function exportFichaCadastralPdf(cliente: Record<string, unknown>) {
  const nome = printableValue(cliente, 'razaoSocial')
  const now = new Date()
  const printWindow = window.open('', '_blank', 'width=960,height=1200')

  if (!printWindow) {
    toast.error('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.')
    return
  }

  printWindow.opener = null
  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Ficha cadastral - ${escapeHtml(nome)}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #111827;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            line-height: 1.35;
          }
          header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #111827;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          h1 {
            margin: 0;
            font-size: 18px;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          .meta {
            text-align: right;
            color: #4b5563;
            white-space: nowrap;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          section {
            break-inside: avoid;
            border: 1px solid #d1d5db;
            margin-bottom: 10px;
          }
          h2 {
            margin: 0;
            padding: 6px 8px;
            background: #f3f4f6;
            border-bottom: 1px solid #d1d5db;
            font-size: 12px;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 5px 8px;
            vertical-align: top;
            border-bottom: 1px solid #e5e7eb;
          }
          tr:last-child th, tr:last-child td { border-bottom: 0; }
          th {
            width: 42%;
            text-align: left;
            font-weight: 700;
            color: #111827;
          }
          td {
            color: #1f2937;
            word-break: break-word;
          }
          .full { grid-column: 1 / -1; }
          .notice {
            margin-top: 4px;
            color: #6b7280;
            font-size: 10px;
          }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Ficha cadastral</h1>
            <div>${escapeHtml(nome)}</div>
          </div>
          <div class="meta">
            <div>Emitido em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div>Documento interno</div>
          </div>
        </header>
        <main class="grid">
          ${fichaSection('Dados da empresa', fichaRows(cliente, EMPRESA_GERAL_FIELDS))}
          ${fichaSection('Endereço da empresa', fichaRows(cliente, EMPRESA_ENDERECO_FIELDS))}
          <div class="full">
            ${fichaSection('Dados cadastrais e fiscais', fichaRows(cliente, EMPRESA_CADASTRO_FIELDS))}
          </div>
          ${fichaSection('Credenciais da empresa', fichaRows(cliente, EMPRESA_CREDENCIAIS_FIELDS))}
          ${fichaSection('Dados do representante', fichaRows(cliente, REPRESENTANTE_FIELDS))}
          ${fichaSection('Endereço do representante', fichaRows(cliente, REPRESENTANTE_ENDERECO_FIELDS) + `
            <tr><th>Cidade / UF</th><td>${escapeHtml([cliente.responsavelCidade, cliente.responsavelUf].filter(Boolean).join(' / ') || '—')}</td></tr>
          `)}
          <div class="full">
            ${fichaSection('Credenciais do representante', fichaRows(cliente, REPRESENTANTE_CREDENCIAIS_FIELDS))}
            <p class="notice">As credenciais são incluídas porque fazem parte da ficha cadastral exportada. Trate este PDF como documento confidencial.</p>
          </div>
        </main>
        <script>
          window.addEventListener('load', () => {
            window.focus();
            setTimeout(() => window.print(), 200);
          });
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

function DataList({ data, fields, sensitive = false }: {
  data: Record<string, unknown>
  fields: readonly (readonly [string, string])[]
  sensitive?: boolean
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([key, label]) => (
        <div key={key} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 truncate font-medium">{sensitive ? passwordValue(data, key) : fieldValue(data, key)}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function ClienteDetailPage() {
  const pathname = usePathname()
  const id = useMemo(() => getPathSegmentAfter(pathname, 'clientes'), [pathname])
  const router  = useRouter()
  const { usuario } = useAuth()
  const podeAcessarFiscal = canAccessTela(usuario, 'fiscal')
  const isAdmin = usuario?.perfil === 'admin'

  const [cliente,      setCliente]      = useState<Record<string, unknown> | null>(null)
  const [servicos,     setServicos]     = useState<Array<Record<string, unknown>>>([])
  const [competencias, setCompetencias] = useState<Array<Record<string, unknown>>>([])
  const [lancamentos,  setLancamentos]  = useState<Array<Record<string, unknown>>>([])
  const [tarefas,      setTarefas]      = useState<Array<Record<string, unknown>>>([])
  const [rascunhos,    setRascunhos]    = useState<Array<Record<string, unknown>>>([])
  const [fiscal,       setFiscal]       = useState<Record<string, unknown> | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [configOpen,   setConfigOpen]   = useState(false)
  const [servicoDialogOpen, setServicoDialogOpen] = useState(false)
  const [comentarios,  setComentarios]  = useState<Array<Record<string, unknown>>>([])
  const [commentText,  setCommentText]  = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [emitirOpen, setEmitirOpen] = useState(false)
  const [timelineFilter, setTimelineFilter] = useState<TimelineEventType | 'todos'>('todos')
  const [deleteOpen, setDeleteOpen] = useState(false)

  // POP — Procedimento Operacional do Cliente
  const [popDocId, setPopDocId] = useState<string | null>(null)
  const [popFiscal,      setPopFiscal]      = useState('')
  const [popFinanceiro,  setPopFinanceiro]  = useState('')
  const [popOperacional, setPopOperacional] = useState('')
  const [popGeral,       setPopGeral]       = useState('')
  const [popSaving,      setPopSaving]      = useState(false)
  const [popDirty,       setPopDirty]       = useState(false)
  const [popNotas,       setPopNotas]       = useState<Array<Record<string, unknown>>>([])
  const [notaTexto,      setNotaTexto]      = useState('')
  const [notaSaving,     setNotaSaving]     = useState(false)

  const loadClienteContext = useCallback(() => {
    if (!id) return Promise.resolve()
    function get<T>(p: Promise<T>): Promise<T | null> { return p.catch(() => null) }
    setLoading(true)
    return Promise.all([
      get(getDocument('clientes', id)),
      get(listDocuments('clientes_servicos', [where('clienteId', '==', id), limit(50)])),
      get(listDocuments('competencias', [where('clienteId', '==', id), orderBy('ano', 'desc'), orderBy('mes', 'desc'), limit(20)])),
      get(listDocuments('lancamentos', [where('clienteId', '==', id), orderBy('dataVencimento', 'desc'), limit(20)])),
      get(listDocuments('tarefas', [where('clienteId', '==', id), limit(30)])),
      get(listDocuments('nfse_rascunhos', [where('clienteId', '==', id), limit(20)])),
      get(listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)])),
      get(listDocuments('clientes_pop', [where('clienteId', '==', id), limit(1)])),
      get(listDocuments('clientes_comentarios', [where('clienteId', '==', id), orderBy('criadoEm', 'desc'), limit(30)])),
      get(listDocuments('clientes_pop_notas', [where('clienteId', '==', id), orderBy('criadoEm', 'desc'), limit(50)])),
    ]).then(([clienteData, servicosData, competenciasData, lancamentosData, tarefasData, rascunhosData, fiscalData, popData, comentariosData, popNotasData]) => {
      if (!clienteData) { router.push('/clientes'); return }
      setCliente(clienteData as Record<string, unknown>)
      setServicos(((servicosData ?? []) as Array<Record<string, unknown>>).sort((a, b) => {
        const aDate = tsToDate(a.dataInicio)?.getTime() ?? 0
        const bDate = tsToDate(b.dataInicio)?.getTime() ?? 0
        return bDate - aDate
      }))
      setCompetencias((competenciasData ?? []) as Array<Record<string, unknown>>)
      setLancamentos((lancamentosData ?? []) as Array<Record<string, unknown>>)
      setTarefas((tarefasData ?? []) as Array<Record<string, unknown>>)
      setRascunhos((rascunhosData ?? []) as Array<Record<string, unknown>>)
      setFiscal(fiscalData && fiscalData.length > 0 ? fiscalData[0] as Record<string, unknown> : null)
      const pop = popData && popData.length > 0 ? popData[0] as Record<string, unknown> : null
      if (pop) {
        setPopDocId(pop.id as string)
        setPopFiscal((pop.fiscal as string) ?? '')
        setPopFinanceiro((pop.financeiro as string) ?? '')
        setPopOperacional((pop.operacional as string) ?? '')
        setPopGeral((pop.geral as string) ?? '')
      }
      setComentarios((comentariosData ?? []) as Array<Record<string, unknown>>)
      setPopNotas((popNotasData ?? []) as Array<Record<string, unknown>>)
      setPopDirty(false)
    }).finally(() => setLoading(false))
  }, [id, router])

  async function savePop() {
    if (!id) return
    setPopSaving(true)
    try {
      const payload = { clienteId: id, fiscal: popFiscal, financeiro: popFinanceiro, operacional: popOperacional, geral: popGeral }
      if (popDocId) {
        await updateDocument('clientes_pop', popDocId, payload)
      } else {
        const newId = await createDocument('clientes_pop', payload)
        setPopDocId(newId as string)
      }
      setPopDirty(false)
      toast.success('POP salvo.')
    } catch { toast.error('Não foi possível salvar o POP.') }
    finally { setPopSaving(false) }
  }

  async function saveComment() {
    if (!id || !commentText.trim()) return
    setCommentSaving(true)
    try {
      const payload = {
        clienteId: id,
        texto: commentText.trim(),
        autorNome: usuario?.nome ?? usuario?.email ?? 'Sistema',
        autorId: usuario?.uid ?? '',
        criadoEm: new Date(),
      }
      const newId = await createDocument('clientes_comentarios', payload)
      setComentarios(prev => [{ id: newId as string, ...payload } as Record<string, unknown>, ...prev])
      setCommentText('')
      toast.success('Comentário adicionado.')
    } catch { toast.error('Não foi possível salvar o comentário.') }
    finally { setCommentSaving(false) }
  }

  async function saveNota() {
    if (!id || !notaTexto.trim()) return
    setNotaSaving(true)
    try {
      const payload = {
        clienteId: id,
        texto: notaTexto.trim(),
        autorNome: usuario?.nome ?? usuario?.email ?? 'Sistema',
        autorId: usuario?.uid ?? '',
        criadoEm: new Date(),
      }
      const newId = await createDocument('clientes_pop_notas', payload)
      setPopNotas(prev => [{ id: newId as string, ...payload } as Record<string, unknown>, ...prev])
      setNotaTexto('')
      toast.success('Nota interna registrada.')
    } catch { toast.error('Não foi possível salvar a nota.') }
    finally { setNotaSaving(false) }
  }

  async function handleDeleteCliente() {
    if (!id) return
    try {
      await softDeleteDocument('clientes', id)
      toast.success('Cliente inativado com sucesso.')
      router.push('/clientes')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível inativar o cliente.'))
    }
  }

  function loadFiscal() {
    if (!id) return
    listDocuments('clientes_fiscal', [where('clienteId', '==', id), limit(1)])
      .then(data => setFiscal(data.length > 0 ? data[0] as Record<string, unknown> : null))
      .catch(() => null)
  }

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => { void loadClienteContext() })
  }, [id, loadClienteContext])

  /* ── timeline events ──────────────────────────────────── */
  const timelineEventsAll = useMemo((): TimelineEvent[] => {
    const hoje = new Date()
    const events: TimelineEvent[] = []

    for (const c of competencias) {
      const ts = tsToDate((c.updatedAt ?? c.createdAt) as Timestamp | undefined) ?? new Date()
      const status = c.status as string
      events.push({
        id:          `comp-${c.id as string}`,
        type:        'competencia',
        title:       `Competência ${formatMesAno(c.mes as number, c.ano as number)}`,
        description: c.servicoNome as string | undefined,
        timestamp:   ts,
        variant:     status === 'concluida' ? 'success' : status === 'aberta' ? 'warning' : 'neutral',
        href:        `/competencias/${c.id as string}`,
        metadata:    status,
      })
    }
    for (const l of lancamentos) {
      const ts = tsToDate(l.dataVencimento as Timestamp | undefined) ?? new Date()
      const status = l.status as string
      const vencido = ts < hoje && status === 'pendente'
      events.push({
        id:        `lanc-${l.id as string}`,
        type:      'lancamento',
        title:     (l.descricao as string) ?? 'Lançamento',
        timestamp: ts,
        variant:   status === 'pago' ? 'success' : vencido ? 'destructive' : status === 'pendente' ? 'warning' : 'neutral',
        metadata:  formatCurrency(l.valor as number),
      })
    }
    for (const t of tarefas) {
      const ts = tsToDate((t.updatedAt ?? t.createdAt) as Timestamp | undefined) ?? new Date()
      const status = t.status as string
      const prazo = tsToDate(t.dataPrazo as Timestamp | undefined)
      const vencida = prazo ? prazo < hoje && ['pendente', 'em_andamento'].includes(status) : false
      events.push({
        id:          `tarefa-${t.id as string}`,
        type:        'tarefa',
        title:       (t.titulo as string) ?? 'Tarefa',
        description: t.responsavelNome as string | undefined,
        timestamp:   ts,
        variant:     status === 'concluida' ? 'success' : vencida ? 'destructive' : status === 'em_andamento' ? 'default' : 'neutral',
        href:        `/tarefas/${t.id as string}`,
        metadata:    status,
      })
    }
    // WhatsApp: sintetizar evento a partir dos lançamentos com cobrança enviada
    for (const l of lancamentos) {
      const ultimoEnvio = tsToDate(l.ultimoEnvioWhatsappEm as Timestamp | undefined)
      if (!ultimoEnvio) continue
      const whatsStatus = (l.statusWhatsappCobranca as string | undefined) ?? ''
      events.push({
        id:          `wa-${l.id as string}`,
        type:        'comentario',
        title:       `Cobrança WhatsApp — ${(l.descricao as string) ?? 'lançamento'}`,
        description: `Status: ${whatsStatus || 'enviado'}`,
        timestamp:   ultimoEnvio,
        variant:     whatsStatus === 'lido' || whatsStatus === 'respondido' ? 'success' : whatsStatus === 'falhou' ? 'destructive' : 'neutral',
        metadata:    whatsStatus || undefined,
        source:      'auto',
      })
    }
    // Comentários manuais
    for (const c of comentarios) {
      const ts = tsToDate(c.criadoEm as Timestamp | undefined) ?? new Date()
      events.push({
        id:          `comentario-${c.id as string}`,
        type:        'comentario',
        title:       (c.texto as string) ?? 'Comentário',
        description: `por ${(c.autorNome as string) ?? 'usuário'}`,
        timestamp:   ts,
        variant:     'neutral',
        source:      'manual',
      })
    }
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }, [competencias, lancamentos, tarefas, comentarios])

  const timelineEvents = useMemo(() =>
    (timelineFilter === 'todos' ? timelineEventsAll : timelineEventsAll.filter(e => e.type === timelineFilter)).slice(0, 20),
    [timelineEventsAll, timelineFilter]
  )

  const fiscalCredenciais = useMemo(
    () => (fiscal?.credenciais ?? {}) as Record<string, unknown>,
    [fiscal]
  )
  const fiscalIbge = fiscal?.municipioIbge as string | undefined
  const fiscalTipo = fiscalIbge ? MUNICIPIO_TIPO[fiscalIbge] : undefined

  /* ── proximosPassos ───────────────────────────────────── */
  const proximosPassos = useMemo(() => {
    const hoje = new Date()
    const list: Array<{ id: string; titulo: string; descricao: string; severidade: 'danger' | 'warning'; href?: string }> = []
    if (servicos.length === 0) list.push({ id: 'servico-ausente', titulo: 'Sem serviço contratado', descricao: 'Vincule pelo menos um serviço para gerar competências, tarefas e honorários.', severidade: 'danger' })
    const competenciaAberta = competencias.find(c => (c.status as string) === 'aberta')
    if (competenciaAberta) list.push({ id: 'comp-aberta', titulo: 'Competência em aberto', descricao: `Pendente em ${formatMesAno(competenciaAberta.mes as number, competenciaAberta.ano as number)}.`, severidade: 'warning', href: `/competencias/${competenciaAberta.id as string}` })
    const tarefaAtrasada = tarefas.find(t => { if (!['pendente', 'em_andamento'].includes((t.status as string) ?? '')) return false; const v = tsToDate(t.dataPrazo); return !!v && v < hoje })
    if (tarefaAtrasada) list.push({ id: 'tarefa-atrasada', titulo: 'Tarefa atrasada', descricao: (tarefaAtrasada.titulo as string | undefined) ?? 'Tarefa pendente com prazo vencido.', severidade: 'danger', href: `/tarefas/${tarefaAtrasada.id as string}` })
    const lancAtrasado = lancamentos.find(l => { if ((l.status as string) !== 'pendente') return false; const v = tsToDate(l.dataVencimento); return !!v && v < hoje })
    if (lancAtrasado) list.push({ id: 'lanc-atrasado', titulo: 'Cobrança em atraso', descricao: `Lançamento vencido: ${(lancAtrasado.descricao as string) ?? 'sem descrição'}.`, severidade: 'danger', href: '/financeiro' })
    if (!fiscal) list.push({ id: 'fiscal-config', titulo: 'Configuração fiscal pendente', descricao: 'Cliente sem configuração NFS-e.', severidade: 'warning' })
    const certVencimento = fiscalCredenciais.certVencimento as string | undefined
    if (fiscal && !certVencimento && (fiscalTipo === 'abrasf_a1' || fiscalTipo === 'geisweb_a1')) list.push({ id: 'cert-ausente', titulo: 'Certificado A1 ausente', descricao: 'Envie o certificado para liberar integração fiscal A1.', severidade: 'warning' })
    if (certVencimento) {
      const venc = new Date(certVencimento)
      const em30Dias = new Date(hoje); em30Dias.setDate(hoje.getDate() + 30)
      if (venc <= em30Dias) list.push({ id: 'cert-vencendo', titulo: 'Certificado vencido ou vencendo', descricao: `Validade: ${venc.toLocaleDateString('pt-BR')}.`, severidade: venc < hoje ? 'danger' : 'warning' })
    }
    const rascunhoPendente = rascunhos.find(r => ['rascunho', 'pronto_para_emitir', 'aguardando_emissao', 'erro_integracao'].includes((r.status as string) ?? ''))
    if (rascunhoPendente) list.push({ id: 'nfse-rascunho', titulo: 'Rascunho NFS-e pendente', descricao: `Status: ${(rascunhoPendente.status as string) ?? 'rascunho'}.`, severidade: 'warning', href: '/fiscal' })
    return list
  }, [competencias, fiscal, fiscalCredenciais, fiscalTipo, lancamentos, rascunhos, servicos.length, tarefas])

  const competenciaAberta   = competencias.find(c => (c.status as string) === 'aberta')
  const lancamentoAtrasado  = lancamentos.find(l => { const v = tsToDate(l.dataVencimento); return (l.status as string) === 'pendente' && !!v && v < new Date() })
  const tarefaAtrasada      = tarefas.find(t => { if (!['pendente', 'em_andamento'].includes((t.status as string) ?? '')) return false; const v = tsToDate(t.dataPrazo); return !!v && v < new Date() })
  const rascunhoCritico     = rascunhos.find(r => ['erro_integracao', 'aguardando_emissao'].includes((r.status as string) ?? ''))

  const HEALTH_DIMS = 6
  const healthScore = (servicos.length > 0 ? 1 : 0) + (fiscal ? 1 : 0) + (!competenciaAberta ? 1 : 0) + (!lancamentoAtrasado ? 1 : 0) + (!tarefaAtrasada ? 1 : 0) + (!rascunhoCritico ? 1 : 0)
  const healthPct   = Math.round((healthScore / HEALTH_DIMS) * 100)
  const healthTone  = healthPct >= 83 ? 'text-success' : healthPct >= 50 ? 'text-warning' : 'text-destructive'

  /* ── financial KPIs (right panel) ────────────────────── */
  const hoje2 = new Date()
  const receitaTotal   = lancamentos.filter(l => (l.tipo as string) === 'receita' || l.tipo == null).reduce((s, l) => s + ((l.valor as number) ?? 0), 0)
  const receitaAtrasada = lancamentos.filter(l => { if ((l.status as string) !== 'pendente') return false; const v = tsToDate(l.dataVencimento); return !!v && v < hoje2 }).reduce((s, l) => s + ((l.valor as number) ?? 0), 0)
  const tarefasAbertas = tarefas.filter(t => ['pendente', 'em_andamento'].includes((t.status as string) ?? '')).length

  // Alerta de emissão NFS-e
  const diaEmissaoNFSe = cliente ? (cliente.diaEmissaoNFSe as number | undefined) : undefined

  /* ── insights automáticos ─────────────────────────── */
  const insightsCliente = useMemo(() => {
    const agora = new Date()
    const list: Array<{ tipo: 'success' | 'warning' | 'info'; texto: string }> = []
    const totalComp = competencias.length
    const concluidasComp = competencias.filter(c => (c.status as string) === 'concluida').length
    if (totalComp >= 3) {
      const pct = Math.round((concluidasComp / totalComp) * 100)
      if (pct >= 80) list.push({ tipo: 'success', texto: `${pct}% das competências concluídas no histórico.` })
      else if (pct < 50) list.push({ tipo: 'warning', texto: `Apenas ${pct}% das competências concluídas — possível gargalo.` })
    }
    const semPrazo = tarefas.filter(t => !t.dataPrazo && ['pendente', 'em_andamento'].includes((t.status as string) ?? '')).length
    if (semPrazo > 0) list.push({ tipo: 'warning', texto: `${semPrazo} tarefa${semPrazo !== 1 ? 's' : ''} sem prazo definido.` })
    const atrasosCount = lancamentos.filter(l => { const v = tsToDate(l.dataVencimento); return (l.status as string) === 'pendente' && !!v && v < agora }).length
    if (atrasosCount >= 2) list.push({ tipo: 'warning', texto: `${atrasosCount} cobranças vencidas — padrão de inadimplência.` })
    if (diaEmissaoNFSe != null) list.push({ tipo: 'info', texto: `Emite NFS-e todo dia ${diaEmissaoNFSe} do mês.` })
    return list
  }, [competencias, tarefas, lancamentos, diaEmissaoNFSe])
  const nfseAlerta = diaEmissaoNFSe != null ? (() => {
    const hoje = new Date()
    const diasRestantes = diaEmissaoNFSe - hoje.getDate()
    if (diasRestantes < -2) return null  // já passou e excedeu carência
    if (diasRestantes < 0) return { texto: `Dia ${diaEmissaoNFSe} — atrasada`, urgente: true }
    if (diasRestantes === 0) return { texto: `Hoje (dia ${diaEmissaoNFSe})`, urgente: true }
    if (diasRestantes <= 5) return { texto: `em ${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''} (dia ${diaEmissaoNFSe})`, urgente: false }
    return null
  })() : null

  /* ── loading skeleton ─────────────────────────────────── */
  if (loading) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-2"><Skeleton className="h-5 w-56" /><Skeleton className="h-3 w-36" /></div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )

  if (!cliente) return null

  const statusInfo = STATUS_LABELS[cliente.status as string] ?? { label: String(cliente.status), variant: 'outline' as const }
  const creds      = fiscalCredenciais
  const ibge       = fiscalIbge
  const tipo       = fiscalTipo
  const municipioNome = MUNICIPIOS.find(m => m.ibge === ibge)?.nome ?? ibge ?? '—'
  const certInfo: CertInfo | null = creds.certTitular
    ? { titular: creds.certTitular as string, vencimento: creds.certVencimento as string, valido: creds.certValido as boolean, storagePath: creds.certificadoStoragePath as string }
    : null

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Link href="/clientes">
          <Button variant="ghost" size="icon" className="h-9 w-9 mt-0.5"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold truncate">{cliente.razaoSocial as string}</h1>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          {(cliente.nomeFantasia as string | undefined) && <p className="text-sm text-muted-foreground truncate">{cliente.nomeFantasia as string}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <span className="font-mono text-xs text-muted-foreground">{formatCpfCnpj(cliente.cpfCnpj as string)}</span>
            {(cliente.regimeTributario as string | undefined) && <span className="text-xs text-muted-foreground">{REGIME_LABELS[cliente.regimeTributario as string] ?? String(cliente.regimeTributario)}</span>}
            {(cliente.email as string | undefined) && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{cliente.email as string}</span>}
            {((cliente.cidade as string | undefined) || (cliente.uf as string | undefined)) && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{[cliente.cidade, cliente.uf].filter(Boolean).join(' / ')}</span>}
          </div>
        </div>
        <Link href={`/clientes/${id}/editar`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          Editar
        </Link>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir cliente
          </Button>
        )}
      </div>

      {/* ── 70/30 grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px] items-start">

        {/* ── Left: Tabs ──────────────────────────────────── */}
        <Tabs defaultValue="atividade">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-4 gap-1">
            {(['atividade','cadastro','competencias','servicos'] as const).map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted data-[state=active]:font-semibold"
              >
                {tab === 'atividade' ? 'Atividade' : tab === 'cadastro' ? 'Cadastro' : tab === 'competencias' ? 'Competências' : 'Serviços'}
              </TabsTrigger>
            ))}
            {podeAcessarFiscal && (
              <TabsTrigger value="fiscal" className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted data-[state=active]:font-semibold">
                Fiscal
              </TabsTrigger>
            )}
            <TabsTrigger value="pop" className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted data-[state=active]:font-semibold">
              <BookOpen className="h-3.5 w-3.5 mr-1.5" />POP
            </TabsTrigger>
          </TabsList>

          {/* Atividade */}
          <TabsContent value="atividade">
            {/* Quick comment input */}
            <div className="mb-4 flex gap-2 items-end">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveComment() } }}
                placeholder="Adicionar comentário rápido… (Enter para salvar)"
                rows={2}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!commentText.trim() || commentSaving}
                onClick={() => void saveComment()}
                className="shrink-0"
              >
                {commentSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {([
                ['todos',       'Todos'],
                ['tarefa',      'Tarefas'],
                ['competencia', 'Competências'],
                ['lancamento',  'Financeiro'],
                ['comentario',  'Comentários'],
              ] as const).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTimelineFilter(f)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    timelineFilter === f
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Timeline events={timelineEvents} />
          </TabsContent>

          {/* Cadastro */}
          <TabsContent value="cadastro" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm">Dados cadastrais da empresa</CardTitle>
                <Button size="sm" variant="outline" onClick={() => exportFichaCadastralPdf(cliente)}>
                  <FileDown className="h-3.5 w-3.5" />
                  Exportar PDF
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-5">
                <DataList data={cliente} fields={EMPRESA_CADASTRO_FIELDS} />
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credenciais da empresa</h3>
                  <DataList data={cliente} fields={EMPRESA_CREDENCIAIS_FIELDS} sensitive />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Dados do representante</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-5">
                <DataList data={cliente} fields={REPRESENTANTE_FIELDS} />
                <DataList data={cliente} fields={REPRESENTANTE_ENDERECO_FIELDS} />
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Cidade / UF</dt>
                    <dd className="mt-0.5 truncate font-medium">{[cliente.responsavelCidade, cliente.responsavelUf].filter(Boolean).join(' / ') || '—'}</dd>
                  </div>
                </dl>
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credenciais do representante</h3>
                  <DataList data={cliente} fields={REPRESENTANTE_CREDENCIAIS_FIELDS} sensitive />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Competências */}
          <TabsContent value="competencias">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm">Competências</CardTitle>
                <div className="flex gap-2">
                  <Link href={`/competencias?clienteId=${id}`} className={buttonVariants({ size: 'xs', variant: 'ghost' })}>Ver todas</Link>
                  <Link href={`/competencias/nova?clienteId=${id}`} className={buttonVariants({ size: 'xs' })}><Plus className="h-3 w-3" />Nova</Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {competencias.length === 0
                  ? <EmptyState size="sm" title="Nenhuma competência" description="Crie uma competência para este cliente." action={{ label: 'Nova competência', href: `/competencias/nova?clienteId=${id}` }} />
                  : <div className="divide-y">
                      {competencias.map(c => (
                        <Link key={c.id as string} href={`/competencias/${c.id as string}`}
                          className="flex items-center justify-between py-2.5 hover:bg-muted/30 px-2 -mx-2 rounded transition-colors">
                          <div>
                            <p className="text-sm font-medium">{formatMesAno(c.mes as number, c.ano as number)}</p>
                            {(c.servicoNome as string | undefined) && <p className="text-xs text-muted-foreground">{c.servicoNome as string}</p>}
                          </div>
                          <Badge variant={(c.status as string) === 'concluida' ? 'success' : (c.status as string) === 'aberta' ? 'warning' : 'neutral'}>
                            {c.status as string}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                }
              </CardContent>
            </Card>
          </TabsContent>

          {/* Serviços */}
          <TabsContent value="servicos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm">Serviços Vinculados</CardTitle>
                <Button size="xs" onClick={() => setServicoDialogOpen(true)}><Plus className="h-3 w-3" />Serviço</Button>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {servicos.length === 0
                  ? <EmptyState size="sm" title="Nenhum serviço vinculado" description="Vincule um serviço para gerar competências e honorários." action={{ label: 'Vincular serviço', onClick: () => setServicoDialogOpen(true) }} />
                  : <div className="divide-y">
                      {servicos.map(s => (
                        <div key={s.id as string} className="flex items-center justify-between py-2.5">
                          <div>
                            <p className="text-sm font-medium">{s.servicoNome as string}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(s.valor as number)} • {s.dataInicio ? formatDate(tsToDate(s.dataInicio)) : '—'}
                            </p>
                          </div>
                          <Badge variant={s.status === 'ativo' ? 'default' : 'secondary'}>{s.status as string}</Badge>
                        </div>
                      ))}
                    </div>
                }
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fiscal */}
          <TabsContent value="fiscal" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle className="text-sm">Configuração NFS-e</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />{fiscal ? 'Editar' : 'Configurar'}
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {!fiscal
                  ? <div className="text-center py-6 space-y-3">
                      <EmptyState size="sm" title="Sem configuração fiscal" description="Configure os dados de NFS-e deste cliente." />
                      <Button size="sm" onClick={() => setConfigOpen(true)}>Configurar NFS-e</Button>
                    </div>
                  : <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                      <div><dt className="text-xs text-muted-foreground">Município</dt><dd className="font-medium">{municipioNome}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Ambiente</dt><dd><Badge variant={fiscal.ambienteEmissao === 'producao' ? 'default' : 'secondary'}>{fiscal.ambienteEmissao === 'producao' ? 'Produção' : 'Homologação'}</Badge></dd></div>
                      <div><dt className="text-xs text-muted-foreground">Insc. Municipal</dt><dd className="font-medium">{(fiscal.inscricaoMunicipal as string) ?? '—'}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Regime</dt><dd className="font-medium">{REGIME_MAP[fiscal.regimeTributario as string] ?? '—'}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Optante Simples</dt><dd className="font-medium">{fiscal.optanteSimples ? 'Sim' : 'Não'}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Alíquota ISS</dt><dd className="font-medium">{fiscal.aliquotaPadrao != null ? `${fiscal.aliquotaPadrao}%` : '—'}</dd></div>
                    </dl>
                }
              </CardContent>
            </Card>

            {fiscal && (tipo === 'abrasf_a1' || tipo === 'geisweb_a1') && (
              <Card>
                <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                  {certInfo ? certInfo.valido ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-destructive" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
                  <CardTitle className="text-sm">Certificado Digital A1</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <CertificadoUpload clienteId={id} certInfo={certInfo} onUploaded={() => loadFiscal()} />
                </CardContent>
              </Card>
            )}

            {fiscal && podeAcessarFiscal && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setEmitirOpen(true)}><Receipt className="h-3.5 w-3.5" />Emitir NFS-e</Button>
              </div>
            )}
          </TabsContent>

          {/* POP — Procedimento Operacional */}
          <TabsContent value="pop" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Procedimento Operacional do Cliente</CardTitle>
                </div>
                <Button size="sm" onClick={() => void savePop()} disabled={popSaving || !popDirty}>
                  {popSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {popSaving ? 'Salvando…' : 'Salvar'}
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <p className="text-xs text-muted-foreground">Notas operacionais internas — visíveis apenas pela equipe. Não são enviadas ao cliente.</p>
                {([
                  ['fiscal',      'Procedimento Fiscal',      'Ex: Emitir NFS-e todo dia 5. Código de serviço: 1401. ISS retido na fonte.'],
                  ['financeiro',  'Procedimento Financeiro',  'Ex: Boleto enviado automaticamente. Responsável: João. Aceita PIX.'],
                  ['operacional', 'Procedimento Operacional', 'Ex: Extrato enviado pelo portal X até o dia 3. Contato: Maria (11 9xxxx).'],
                  ['geral',       'Notas Gerais',             'Ex: Cliente prefere contato por e-mail. Reunião mensal toda última terça.'],
                ] as const).map(([field, label, placeholder]) => {
                  const value = field === 'fiscal' ? popFiscal : field === 'financeiro' ? popFinanceiro : field === 'operacional' ? popOperacional : popGeral
                  const setter = field === 'fiscal' ? setPopFiscal : field === 'financeiro' ? setPopFinanceiro : field === 'operacional' ? setPopOperacional : setPopGeral
                  return (
                    <div key={field} className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
                      <textarea
                        className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60"
                        placeholder={placeholder}
                        value={value}
                        onChange={e => { setter(e.target.value); setPopDirty(true) }}
                      />
                    </div>
                  )
                })}
                {popDirty && (
                  <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Alterações não salvas — clique em Salvar para confirmar.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notas internas versionadas */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Notas internas</CardTitle>
                <span className="ml-auto text-xs text-muted-foreground">append-only · histórico completo</span>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={notaTexto}
                    onChange={e => setNotaTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveNota() } }}
                    placeholder="Registrar nota interna… (Enter para salvar)"
                    rows={2}
                    className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button size="sm" variant="outline" disabled={!notaTexto.trim() || notaSaving} onClick={() => void saveNota()} className="shrink-0">
                    {notaSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {popNotas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma nota registrada.</p>
                ) : (
                  <ol className="space-y-2 max-h-64 overflow-y-auto">
                    {popNotas.map(n => (
                      <li key={n.id as string} className="rounded-md border border-border/60 bg-muted/25 px-3 py-2">
                        <p className="text-sm whitespace-pre-wrap">{n.texto as string}</p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                          <span>{n.autorNome as string}</span>
                          <span>·</span>
                          <span>{tsToDate(n.criadoEm as Parameters<typeof tsToDate>[0])?.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) ?? '—'}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Right: sticky aside ─────────────────────────── */}
        <div className="sticky top-20 space-y-4">

          {/* Resumo executivo */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Resumo Executivo</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {[
                ['Serviços ativos',       String(servicos.filter(s => (s.status as string) === 'ativo').length),         ''],
                ['Competências (hist.)',  String(competencias.length),                                                    ''],
                ['Tarefas abertas',       String(tarefasAbertas),                                                        tarefasAbertas > 0 ? 'text-warning font-semibold' : ''],
                ['Atraso financeiro',     formatCurrency(receitaAtrasada),                                               receitaAtrasada > 0 ? 'text-destructive font-semibold' : ''],
                ...(diaEmissaoNFSe != null ? [['Dia emissão NFS-e', `Dia ${diaEmissaoNFSe}`, 'text-primary']] : []),
              ].map(([label, value, cls]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={cn('text-xs tabular-nums', cls)}>{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tendência histórica de competências */}
          {competencias.length >= 3 && (() => {
            const sorted = [...competencias].sort((a, b) => {
              const aDate = (a.ano as number) * 100 + (a.mes as number)
              const bDate = (b.ano as number) * 100 + (b.mes as number)
              return aDate - bDate
            }).slice(-6)
            const W = 220, H = 48, PAD = 4
            const total = sorted.length
            return (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Tendência (últ. 6 meses)</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-1">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
                    {sorted.map((c, i) => {
                      const status = c.status as string
                      const x = PAD + (i / Math.max(total - 1, 1)) * (W - PAD * 2)
                      const y = H - PAD - (status === 'concluida' ? H - PAD * 2 : status === 'em_andamento' ? (H - PAD * 2) * 0.5 : (H - PAD * 2) * 0.15)
                      const color = status === 'concluida' ? '#22c55e' : status === 'em_andamento' ? '#f59e0b' : '#ef4444'
                      return <circle key={c.id as string} cx={x} cy={y} r="4" fill={color} />
                    })}
                    {sorted.length > 1 && sorted.slice(0, -1).map((c, i) => {
                      const s1 = c.status as string, s2 = sorted[i + 1].status as string
                      const x1 = PAD + (i / Math.max(total - 1, 1)) * (W - PAD * 2)
                      const x2 = PAD + ((i + 1) / Math.max(total - 1, 1)) * (W - PAD * 2)
                      const y1 = H - PAD - (s1 === 'concluida' ? H - PAD * 2 : s1 === 'em_andamento' ? (H - PAD * 2) * 0.5 : (H - PAD * 2) * 0.15)
                      const y2 = H - PAD - (s2 === 'concluida' ? H - PAD * 2 : s2 === 'em_andamento' ? (H - PAD * 2) * 0.5 : (H - PAD * 2) * 0.15)
                      return <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e2e8f0" strokeWidth="1.5" />
                    })}
                  </svg>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{formatMesAno(sorted[0].mes as number, sorted[0].ano as number)}</span>
                    <span>{formatMesAno(sorted[sorted.length - 1].mes as number, sorted[sorted.length - 1].ano as number)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    {[['concluida', '#22c55e', 'Concluída'], ['em_andamento', '#f59e0b', 'Em andamento'], ['aberta', '#ef4444', 'Aberta']].map(([s, c, l]) => (
                      <span key={s} className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full inline-block" style={{ background: c }} />
                        {l}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* Insights automáticos */}
          {insightsCliente.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Insights</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {insightsCliente.map((ins, i) => (
                  <div key={i} className={cn(
                    'flex items-start gap-2 rounded-md px-2.5 py-2 text-xs',
                    ins.tipo === 'success' ? 'bg-success/8 text-success' :
                    ins.tipo === 'warning' ? 'bg-warning/8 text-warning' :
                    'bg-primary/8 text-primary'
                  )}>
                    <span className="mt-0.5 shrink-0">
                      {ins.tipo === 'success' ? '✓' : ins.tipo === 'warning' ? '⚠' : 'ℹ'}
                    </span>
                    <span>{ins.texto}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* KPIs executivos */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Honorários</p>
              <p className="mt-1 text-base font-bold tabular-nums">{formatCurrency(receitaTotal)}</p>
            </div>
            <div className={cn('rounded-lg border px-3 py-2.5 text-center', receitaAtrasada > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card')}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Atraso</p>
              <p className={cn('mt-1 text-base font-bold tabular-nums', receitaAtrasada > 0 ? 'text-destructive' : 'text-muted-foreground')}>{formatCurrency(receitaAtrasada)}</p>
            </div>
            <div className={cn('rounded-lg border px-3 py-2.5 text-center', tarefasAbertas > 0 ? 'border-warning/30 bg-warning/5' : 'border-border bg-card')}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tarefas</p>
              <p className={cn('mt-1 text-base font-bold tabular-nums', tarefasAbertas > 0 ? 'text-warning' : 'text-muted-foreground')}>{tarefasAbertas}</p>
            </div>
          </div>

          {/* Saúde do cliente — 6 dimensões */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Saúde do Cliente</CardTitle>
                <span className={cn('text-sm font-bold tabular-nums', healthTone)}>{healthPct}%</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><Plus className="h-3.5 w-3.5 text-muted-foreground" />Serviços</span>
                <Badge variant={servicos.length > 0 ? 'success' : 'destructive'}>{servicos.length > 0 ? 'Vinculado' : 'Pendente'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><Receipt className="h-3.5 w-3.5 text-muted-foreground" />Fiscal NFS-e</span>
                <Badge variant={fiscal ? 'success' : 'destructive'}>{fiscal ? 'Configurado' : 'Pendente'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />Competências</span>
                <Badge variant={competenciaAberta ? 'warning' : 'success'}>{competenciaAberta ? 'Em aberto' : 'Em dia'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><Wallet className="h-3.5 w-3.5 text-muted-foreground" />Financeiro</span>
                <Badge variant={lancamentoAtrasado ? 'destructive' : 'success'}>{lancamentoAtrasado ? 'Inadimplente' : 'Em dia'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />Tarefas</span>
                <Badge variant={tarefaAtrasada ? 'destructive' : 'success'}>{tarefaAtrasada ? 'Atrasada' : 'Em dia'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" />NFS-e rascunho</span>
                <Badge variant={rascunhoCritico ? 'warning' : 'success'}>{rascunhoCritico ? 'Pendente' : 'OK'}</Badge>
              </div>
              {/* Alerta emissão NFS-e */}
              {nfseAlerta && (
                <div className={cn(
                  'flex items-center justify-between rounded-md px-2.5 py-2 border',
                  nfseAlerta.urgente
                    ? 'bg-destructive/6 border-destructive/20'
                    : 'bg-warning/6 border-warning/20'
                )}>
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Bell className={cn('h-3 w-3 shrink-0', nfseAlerta.urgente ? 'text-destructive' : 'text-warning')} />
                    NFS-e
                  </span>
                  <span className={cn('text-xs font-semibold', nfseAlerta.urgente ? 'text-destructive' : 'text-amber-800 dark:text-warning')}>
                    {nfseAlerta.texto}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Saúde geral</span>
                  <span className="text-xs font-semibold tabular-nums">{healthScore}/{HEALTH_DIMS}</span>
                </div>
                <Progress value={healthPct} className="h-1.5" />
              </div>
            </CardContent>
          </Card>

          {/* Próximos passos */}
          {proximosPassos.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Alertas</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {proximosPassos.map(item => {
                  const row = (
                    <div className={cn('flex items-start gap-2 rounded-md border-l-2 px-3 py-2', item.severidade === 'danger' ? 'border-destructive bg-destructive/4' : 'border-warning bg-warning/4')}>
                      <AlertTriangle className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', item.severidade === 'danger' ? 'text-destructive' : 'text-warning')} />
                      <div>
                        <p className="text-xs font-medium">{item.titulo}</p>
                        <p className="text-xs text-muted-foreground">{item.descricao}</p>
                      </div>
                    </div>
                  )
                  return item.href
                    ? <Link key={item.id} href={item.href} className="block hover:opacity-90 transition-opacity">{row}</Link>
                    : <div key={item.id}>{row}</div>
                })}
              </CardContent>
            </Card>
          )}

          {/* Ações rápidas */}
          <Card>
            <CardHeader className="py-3 px-4"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Ações Rápidas</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 min-[280px]:grid-cols-2 gap-2">
                <Link href={`/competencias/nova?clienteId=${id}`} className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                  <Plus className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium leading-tight">Nova Competência</span>
                </Link>
                {fiscal && podeAcessarFiscal && (
                  <button type="button" onClick={() => setEmitirOpen(true)} className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                    <Receipt className="h-5 w-5 text-primary" />
                    <span className="text-xs font-medium leading-tight">Emitir NFS-e</span>
                  </button>
                )}
                <Link href={`/financeiro?clienteId=${id}`} className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium leading-tight">Financeiro</span>
                </Link>
                <Link href={`/clientes/${id}/editar`} className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background dark:bg-card hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors p-3 text-center">
                  <Pencil className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium leading-tight">Editar</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── ConfigFiscalForm modal ───────────────────────── */}
      <ConfigFiscalForm
        open={configOpen}
        onOpenChange={setConfigOpen}
        clienteId={id}
        docId={fiscal?.id as string | undefined}
        defaultValues={fiscal ? {
          municipioIbge:        fiscal.municipioIbge       as string,
          inscricaoMunicipal:   fiscal.inscricaoMunicipal  as string,
          inscricaoEstadual:    fiscal.inscricaoEstadual   as string,
          ambienteEmissao:      (fiscal.ambienteEmissao    as 'homologacao' | 'producao') ?? 'homologacao',
          regimeTributario:     fiscal.regimeTributario    as string,
          optanteSimples:       (fiscal.optanteSimples     as boolean) ?? true,
          incentivadorCultural: (fiscal.incentivadorCultural as boolean) ?? false,
          naturezaOperacao:     (fiscal.naturezaOperacao   as string) ?? '1',
          codigoServicoPadrao:  fiscal.codigoServicoPadrao as string,
          descricaoServicoPadrao: fiscal.descricaoServicoPadrao as string,
          itemListaServico:     fiscal.itemListaServico    as string,
          cnae:                 fiscal.cnae                as string,
          aliquotaPadrao:       fiscal.aliquotaPadrao      as number,
          issRetidoPadrao:      (fiscal.issRetidoPadrao    as boolean) ?? false,
          credenciais:          (fiscal.credenciais        as Record<string, unknown>) ?? {},
        } : undefined}
        onSaved={() => { void loadClienteContext() }}
      />
      <ClienteServicoDialog
        open={servicoDialogOpen}
        onOpenChange={setServicoDialogOpen}
        clienteId={id}
        onSaved={() => { void loadClienteContext() }}
      />
      <EmitirNfseModal
        open={emitirOpen}
        onOpenChange={setEmitirOpen}
        clienteId={id}
        onFinished={async () => {
          setEmitirOpen(false)
          await loadClienteContext()
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Excluir cliente?"
        description="O cliente será inativado e seus serviços encerrados. Não serão geradas novas competências, cobranças nem NFS-e. As competências já existentes são preservadas. Esta ação pode ser revertida por um admin."
        confirmLabel="Excluir"
        destructive
        onConfirm={handleDeleteCliente}
      />
    </div>
  )
}
