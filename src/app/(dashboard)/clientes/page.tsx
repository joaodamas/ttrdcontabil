'use client'

import { useState, useMemo, useRef, Suspense, Fragment } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { toast } from 'sonner'
import { formatCpfCnpj, formatCurrency } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ClienteStatusBadge } from '@/components/ui/status-badge'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { TableEmptyState } from '@/components/ui/empty-state'
import { DataTableShell } from '@/components/ui/data-table-shell'
import { PageHeader } from '@/components/layout/page-header'
import { ClientesFiltros } from '@/components/clientes/clientes-filtros'
import { ClienteModal } from '@/components/clientes/cliente-modal'
import { FilterBtn } from '@/components/ui/filter-btn'
import { FilterSheet, FilterSheetTrigger } from '@/components/ui/filter-sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Users, MoreHorizontal, CheckSquare, Layers, Receipt, Pencil,
  ShieldCheck, ShieldAlert, AlertTriangle, MessageCircle, FileDown, Upload, FileSpreadsheet, Loader2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useClientesList, useClientesRisco } from '@/features/clientes/hooks'
import { useCarteira } from '@/features/carteira/hooks'
import { clientesFiltroSchema } from '@/features/clientes/schemas'
import type { ClienteRecord } from '@/features/clientes/types'
import { limit } from 'firebase/firestore'
import { listDocuments, registrarExportacaoSensivel } from '@/lib/firestore-client'
import { listarCredenciaisClientes } from '@/features/clientes/credenciais'
import { baixarRelatorioClientesXlsx } from '@/lib/clientes-relatorio'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela, podeEscreverEm, podeOperarNfse } from '@/lib/permissions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useLinhaClicavel, PararLinha } from '@/components/ui/linha-clicavel'
import { FiltrosAtivos } from '@/components/ui/filtros-ativos'
import { hrefSemFiltro } from '@/lib/url-filtros'

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples',
  lucro_presumido: 'L. Presumido',
  lucro_real: 'L. Real',
  mei: 'MEI',
  isento: 'Isento',
}

const REGIME_BADGE: Record<string, string> = {
  simples_nacional: 'bg-success/10 text-success border-success/25',
  lucro_presumido:  'bg-info/10 text-info border-info/25',
  lucro_real:       'bg-primary/10 text-foreground/70 border-primary/20',
  mei:              'bg-warning/10 text-warning border-warning/25',
  isento:           'bg-muted text-muted-foreground border-border',
}

// Tipo de documento fiscal que o cliente emite, derivado do CNAE (categoriaFiscal —
// preenchido pelo script scripts/classificar-clientes-fiscal.mjs). Ausente até o
// backfill rodar; a coluna mostra "—" nesse meio tempo, sem quebrar nada.
const DOC_FISCAL_LABEL: Record<string, string> = {
  servico: 'NFS-e',
  produto: 'NF-e',
  transporte: 'CT-e',
}
/** Filtro rápido de regime (barra e painel de filtros) — inclui "Isento", que existe no cadastro. */
const REGIMES_FILTRO = [
  ['', 'Todos'],
  ['simples_nacional', 'Simples'],
  ['lucro_presumido', 'L. Presumido'],
  ['lucro_real', 'L. Real'],
  ['mei', 'MEI'],
  ['isento', 'Isento'],
] as const

const DOC_FISCAL_BADGE: Record<string, string> = {
  servico: 'bg-info/10 text-info border-info/20',
  produto: 'bg-primary/10 text-foreground/70 border-primary/20',
  transporte: 'bg-warning/10 text-warning border-warning/25',
}

function clientesFilterHref(params: { busca: string; status: string; regime?: string }) {
  const search = new URLSearchParams()
  if (params.busca) search.set('busca', params.busca)
  if (params.status) search.set('status', params.status)
  if (params.regime) search.set('regime', params.regime)
  return `/clientes?${search.toString()}`
}

function clienteInitials(razaoSocial: string): string {
  const words = razaoSocial.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

type SaudeNivel = 'critica' | 'atencao' | 'estavel'

// Saúde reflete risco operacional real (cobrança vencida, tarefa atrasada — mesmo
// critério do "Clientes em risco" do Painel), não o status administrativo — esse já
// tem sua própria coluna. Duas colunas mostrando a mesma coisa é ruído, não sinal.
function saudeCliente(motivosRisco: string[]): { nivel: SaudeNivel; motivo: string } {
  if (motivosRisco.length === 0) return { nivel: 'estavel', motivo: 'Sem alertas' }
  return { nivel: motivosRisco.length > 1 ? 'critica' : 'atencao', motivo: motivosRisco.join(' · ') }
}

// Alguns lançamentos antigos gravaram `clienteId` como o CNPJ em vez do id do
// documento (achado testando esta tela) — cruza pelos dois pra não perder o sinal.
function motivosRiscoDoCliente(c: ClienteRecord, riscoMap: Map<string, string[]>): string[] {
  const porId = riscoMap.get(c.id as string)
  if (porId) return porId
  const cnpjDigits = String(c.cpfCnpj ?? '').replace(/\D/g, '')
  return (cnpjDigits && riscoMap.get(cnpjDigits)) || []
}

function SaudeBadge({ nivel, motivo }: { nivel: SaudeNivel; motivo: string }) {
  if (nivel === 'critica') return (
    <span title={motivo} className="inline-flex max-w-[160px] items-center gap-1 whitespace-nowrap rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
      <AlertTriangle className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{motivo}</span>
    </span>
  )
  if (nivel === 'atencao') return (
    <span title={motivo} className="inline-flex max-w-[160px] items-center gap-1 whitespace-nowrap rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
      <ShieldAlert className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{motivo}</span>
    </span>
  )
  return (
    <span title={motivo} className="inline-flex max-w-[160px] items-center gap-1 whitespace-nowrap rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
      <ShieldCheck className="h-2.5 w-2.5" />Estável
    </span>
  )
}

const STATUS_LABELS_PDF: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  suspenso: 'Suspenso',
}

function escapeHtmlPdf(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Mensalidade exibida = MRR dos contratos vigentes (clientes_servicos), a mesma
// conta da /relatorios/carteira. O campo `mensalidade` do cadastro é só o
// fallback de quem ainda não tem contrato — sem isso a lista mostrava "—" para
// cliente que paga honorário todo mês.
type MensalidadeResolver = (c: ClienteRecord) => number | undefined

function useMensalidadeResolver(): MensalidadeResolver {
  const carteira = useCarteira()
  const mrrPorCliente = useMemo(
    () => new Map((carteira.data?.ranking ?? []).map((r) => [r.clienteId, r.mrr])),
    [carteira.data],
  )
  return (c) => {
    const mrr = mrrPorCliente.get(c.id as string)
    if (mrr != null && mrr > 0) return mrr
    const cadastro = c.mensalidade as number | undefined
    return cadastro != null && cadastro > 0 ? cadastro : undefined
  }
}

function exportClientesListaPdf(clientes: ClienteRecord[], mensalidadeDe: MensalidadeResolver) {
  const now = new Date()
  const printWindow = window.open('', '_blank', 'width=1100,height=1400')

  if (!printWindow) {
    toast.error('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.')
    return
  }

  printWindow.opener = null

  const linhas = clientes.map((c) => {
    const nome = escapeHtmlPdf((c.razaoSocial as string) ?? '—')
    const fantasia = c.nomeFantasia ? escapeHtmlPdf(c.nomeFantasia as string) : ''
    const documento = c.cpfCnpj ? escapeHtmlPdf(formatCpfCnpj(c.cpfCnpj as string)) : '—'
    const regimeLabel = c.regimeTributario ? (REGIME_LABELS[c.regimeTributario as string] ?? String(c.regimeTributario)) : '—'
    const valorMensal = mensalidadeDe(c)
    const mensalidade = valorMensal != null ? formatCurrency(valorMensal) : '—'
    const statusLabel = STATUS_LABELS_PDF[(c.status as string) ?? ''] ?? String(c.status ?? '—')
    return `
      <tr>
        <td>${nome}${fantasia ? `<div class="sub">${fantasia}</div>` : ''}</td>
        <td>${documento}</td>
        <td>${escapeHtmlPdf(regimeLabel)}</td>
        <td class="num">${escapeHtmlPdf(mensalidade)}</td>
        <td>${escapeHtmlPdf(statusLabel)}</td>
      </tr>
    `
  }).join('')

  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Lista de clientes</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
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
          h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.02em; }
          .meta { text-align: right; color: #4b5563; white-space: nowrap; }
          table { width: 100%; border-collapse: collapse; }
          thead th {
            text-align: left;
            padding: 6px 8px;
            background: #f3f4f6;
            border-bottom: 1px solid #d1d5db;
            font-size: 10px;
            text-transform: uppercase;
          }
          tbody td {
            padding: 5px 8px;
            vertical-align: top;
            border-bottom: 1px solid #e5e7eb;
          }
          tbody tr:nth-child(even) { background: #fafafa; }
          .sub { color: #6b7280; font-size: 10px; }
          .num { text-align: right; white-space: nowrap; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Lista de clientes</h1>
            <div>${clientes.length} cliente${clientes.length !== 1 ? 's' : ''}</div>
          </div>
          <div class="meta">
            <div>Emitido em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div>Documento interno</div>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Nome / Razão Social</th>
              <th>CPF / CNPJ</th>
              <th>Regime</th>
              <th class="num">Mensalidade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
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

function ClientesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const result = clientesFiltroSchema.safeParse({
    busca: searchParams.get('busca') ?? '',
    status: searchParams.get('status') ?? '',
  })
  const { busca, status } = result.success
    ? result.data
    : { busca: '', status: '' }
  const regime = searchParams.get('regime') ?? ''
  const { filteredClientes, isLoading, isError } = useClientesList({ busca, status })
  const riscoMap = useClientesRisco()
  const mensalidadeDe = useMensalidadeResolver()
  // Ficha do cliente aberta fica na URL (?cliente=<id>): o Voltar do navegador
  // fecha a ficha em vez de sair da tela, e o link pode ser compartilhado.
  const modalClienteId = searchParams.get('cliente')
  const [modalClienteNome, setModalClienteNome] = useState('')
  const abriuFichaAqui = useRef(false)
  const abrirCliente = (c: Record<string, unknown>) => {
    setModalClienteNome((c.razaoSocial as string) ?? '')
    const p = new URLSearchParams(searchParams.toString())
    p.set('cliente', c.id as string)
    abriuFichaAqui.current = true
    router.push(`/clientes?${p.toString()}`, { scroll: false })
  }
  const fecharCliente = () => {
    if (abriuFichaAqui.current) {
      abriuFichaAqui.current = false
      router.back()
      return
    }
    const p = new URLSearchParams(searchParams.toString())
    p.delete('cliente')
    const q = p.toString()
    router.replace(q ? `/clientes?${q}` : '/clientes', { scroll: false })
  }
  const [filterSheetOpen,  setFilterSheetOpen]  = useState(false)
  const linha = useLinhaClicavel()

  const clientesFiltrados = regime
    ? filteredClientes.filter(c => (c.regimeTributario as string | undefined) === regime)
    : filteredClientes

  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const [confirmarSenhas, setConfirmarSenhas] = useState(false)
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfil === 'admin'
  // Ações oferecidas na lista seguem o que o perfil pode fazer de fato (regras
  // do Firestore / Cloud Functions) — antes o menu ⋯ mostrava tudo para todos.
  const podeEditarCliente = podeEscreverEm(usuario, 'clientes')
  const podeCriarTarefa = podeEscreverEm(usuario, 'tarefas')
  const podeCriarCompetencia = podeEscreverEm(usuario, 'competencias')
  const podeEmitirNfse = canAccessTela(usuario, 'fiscal') && podeOperarNfse(usuario)
  const temAcaoSecundaria = podeCriarTarefa || podeCriarCompetencia || podeEmitirNfse

  // Relatório de TODOS os clientes ativos (não só a página/filtro da tela), com
  // cada campo da ficha e o que está em branco, mais a situação fiscal. Com
  // senhas visíveis só para administrador, com confirmação e log de auditoria.
  async function exportarFichaCompleta(incluirSenhas = false) {
    setGerandoRelatorio(true)
    try {
      const [todos, fiscais] = await Promise.all([
        listDocuments<Record<string, unknown>>('clientes', [limit(2000)]),
        listDocuments<Record<string, unknown>>('clientes_fiscal', [limit(2000)]).catch(() => []),
      ])
      const comSenhas = incluirSenhas && ehAdmin
      // As senhas moram em clientes_credenciais: só são lidas neste caso.
      const credenciais = comSenhas ? await listarCredenciaisClientes() : undefined
      if (comSenhas) {
        await registrarExportacaoSensivel('clientes', {
          relatorio: 'ficha_completa_com_senhas',
          clientes: todos.length,
        })
      }
      baixarRelatorioClientesXlsx({ clientes: todos, fiscais, incluirSenhas: comSenhas, credenciais })
    } catch (err) {
      console.error('[clientes] relatório da ficha completa falhou', err)
      toast.error('Não foi possível gerar o relatório. Tente novamente.')
    } finally {
      setGerandoRelatorio(false)
    }
  }

  return (
    <div>
      <ConfirmDialog
        open={confirmarSenhas}
        onOpenChange={setConfirmarSenhas}
        title="Baixar relatório com senhas visíveis?"
        description="O arquivo terá, em texto aberto, as senhas de todos os clientes ativos (prefeitura, posto fiscal, PIN do certificado, Meu Gov, e-CAC). Guarde em local seguro, não envie por e-mail e apague depois de usar. A exportação fica registrada no log de auditoria."
        confirmLabel="Baixar com senhas"
        destructive
        onConfirm={() => exportarFichaCompleta(true)}
      />
      <PageHeader
        title="Clientes"
        description={isLoading ? undefined : `${clientesFiltrados.length} cliente${clientesFiltrados.length !== 1 ? 's' : ''} encontrado${clientesFiltrados.length !== 1 ? 's' : ''}`}
        action={
          <>
            <FilterSheetTrigger
              onClick={() => setFilterSheetOpen(true)}
              activeCount={(status ? 1 : 0) + (regime ? 1 : 0)}
            />
            {/* Exportar PDF, ficha completa e importar ficam num menu "Mais":
                eram 5 botões no topo, que no celular quebravam em 3 linhas. */}
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', size: 'cta' })} disabled={gerandoRelatorio}>
                {gerandoRelatorio ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                Mais
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  disabled={isLoading || clientesFiltrados.length === 0}
                  onClick={() => exportClientesListaPdf(clientesFiltrados, mensalidadeDe)}
                >
                  <FileDown className="h-3.5 w-3.5 mr-2" />Exportar lista (PDF)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportarFichaCompleta(false)}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Ficha completa (Excel)
                </DropdownMenuItem>
                {ehAdmin && (
                  <DropdownMenuItem onClick={() => setConfirmarSenhas(true)}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Ficha completa com senhas…
                  </DropdownMenuItem>
                )}
                {podeEditarCliente && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/clientes/importar')}>
                      <Upload className="h-3.5 w-3.5 mr-2" />Importar planilha
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {podeEditarCliente && (
              <Link href="/clientes/novo" className={buttonVariants({ size: 'cta' })}>
                <Plus />
                Novo cliente
              </Link>
            )}
          </>
        }
      />

      <FilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={(status ? 1 : 0) + (regime ? 1 : 0)}
        onReset={() => router.push('/clientes')}
      >
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-2">
            {(['', 'ativo', 'inativo', 'suspenso'] as const).map(s => (
              <FilterBtn key={s} href={clientesFilterHref({ busca, status: s, regime })} active={status === s}>
                {s === '' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
              </FilterBtn>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regime tributário</p>
          <div className="flex flex-wrap gap-2">
            {REGIMES_FILTRO.map(([val, label]) => (
              <FilterBtn key={val} href={clientesFilterHref({ busca, status, regime: val })} active={regime === val}>
                {label}
              </FilterBtn>
            ))}
          </div>
        </div>
      </FilterSheet>

      {/* Busca sempre visível (também no celular); status e regime ficam no
          painel de filtros no celular. */}
      <div className="surface-subtle border px-3 py-2.5 space-y-2.5">
        <Suspense>
          <ClientesFiltros busca={busca} status={status} />
        </Suspense>
        {/* Filtros rápidos de regime */}
        <div className="hidden sm:flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Regime:</span>
          {REGIMES_FILTRO.map(([val, label]) => (
            <FilterBtn
              key={val}
              href={clientesFilterHref({ busca, status, regime: val })}
              active={regime === val}
            >
              {label}
            </FilterBtn>
          ))}
        </div>
      </div>

      <FiltrosAtivos
        className="mt-3"
        chips={[
          busca && { chave: 'busca', rotulo: 'Busca', valor: `“${busca}”`, removerHref: hrefSemFiltro('/clientes', searchParams, ['busca', 'cliente']) },
          status && { chave: 'status', rotulo: 'Status', valor: status.charAt(0).toUpperCase() + status.slice(1), removerHref: hrefSemFiltro('/clientes', searchParams, ['status', 'cliente']) },
          regime && { chave: 'regime', rotulo: 'Regime', valor: REGIME_LABELS[regime] ?? regime, removerHref: hrefSemFiltro('/clientes', searchParams, ['regime', 'cliente']) },
        ]}
        limparHref="/clientes"
      />

      <DataTableShell className="mt-4" density="compact">
        <table className="w-full table-fixed text-sm sm:table-auto sm:min-w-[900px]">
          <thead className="hidden border-b bg-muted/50 sm:table-header-group">
            <tr>
              <th className="text-left px-3 py-2.5 section-label">Nome / Razão Social</th>
              <th className="text-left px-3 py-2.5 section-label hidden sm:table-cell whitespace-nowrap">CPF / CNPJ</th>
              <th className="text-left px-3 py-2.5 section-label hidden lg:table-cell">Cidade</th>
              <th className="text-left px-3 py-2.5 section-label hidden md:table-cell">Regime</th>
              <th className="text-left px-3 py-2.5 section-label hidden 2xl:table-cell">Documento</th>
              <th className="text-right px-3 py-2.5 section-label hidden lg:table-cell">Mensalidade</th>
              <th className="text-left px-3 py-2.5 section-label">Status</th>
              <th className="text-left px-3 py-2.5 section-label">Saúde</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <TableRowSkeleton cols={9} rows={8} />
            ) : isError ? (
              <TableEmptyState
                colSpan={9}
                icon={Users}
                title="Não foi possível carregar clientes"
                description="Atualize a página. Se o problema continuar, fale com o administrador do sistema."
              />
            ) : clientesFiltrados.length === 0 ? (
              <TableEmptyState
                colSpan={9}
                icon={Users}
                title={busca || status || regime ? 'Nenhum cliente encontrado' : 'Ainda não há clientes'}
                description={busca || status || regime
                  ? 'Tente ajustar os filtros de busca.'
                  : podeEditarCliente ? 'Clique em "Novo cliente" para começar.' : 'Os clientes cadastrados pelo escritório aparecem aqui.'}
                action={podeEditarCliente && !busca && !status && !regime ? { label: 'Novo cliente', href: '/clientes/novo' } : undefined}
              />
            ) : (
              clientesFiltrados.map((c) => {
                const saude = saudeCliente(motivosRiscoDoCliente(c, riscoMap))
                const temWhatsApp = !!(c.whatsapp ?? c.whatsappFinanceiro ?? c.aceiteWhatsAppCobranca)
                const mensalidade = mensalidadeDe(c)
                const vencimento = c.vencimento as string | undefined
                return (
                <Fragment key={c.id as string}>
                <tr {...linha(() => abrirCliente(c), { className: 'group transition-colors hover:bg-muted/35 hidden sm:table-row' })}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/10">
                        <span className="text-xs font-bold text-primary">
                          {clienteInitials((c.razaoSocial as string) || '?')}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate leading-tight">{c.razaoSocial as string}</p>
                          {temWhatsApp && (
                            <span title="WhatsApp ativo"><MessageCircle className="h-3 w-3 shrink-0 text-success" /></span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.nomeFantasia
                            ? <p className="text-xs text-muted-foreground truncate">{c.nomeFantasia as string}</p>
                            : null}
                          {vencimento && <span className="text-[10px] text-muted-foreground/70">dia {vencimento}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs whitespace-nowrap hidden sm:table-cell">
                    {formatCpfCnpj(c.cpfCnpj as string)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap hidden lg:table-cell">
                    {c.cidade && c.uf ? `${c.cidade as string} · ${c.uf as string}` : c.cidade ? (c.cidade as string) : '—'}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {c.regimeTributario ? (
                      <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold border ${REGIME_BADGE[c.regimeTributario as string] ?? REGIME_BADGE.isento}`}>
                        {REGIME_LABELS[c.regimeTributario as string] ?? (c.regimeTributario as string)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 hidden 2xl:table-cell">
                    {c.categoriaFiscal && DOC_FISCAL_LABEL[c.categoriaFiscal as string] ? (
                      <span title="Derivado do CNAE" className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${DOC_FISCAL_BADGE[c.categoriaFiscal as string]}`}>
                        {DOC_FISCAL_LABEL[c.categoriaFiscal as string]}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right hidden lg:table-cell">
                    {mensalidade != null && mensalidade > 0
                      ? <span className="text-sm font-semibold tabular-nums">{formatCurrency(mensalidade)}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <ClienteStatusBadge status={c.status as string} />
                  </td>
                  <td className="px-3 py-2">
                    <SaudeBadge nivel={saude.nivel} motivo={saude.motivo} />
                  </td>
                  <td className="px-3 py-2">
                    <PararLinha>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                        onClick={e => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => router.push(`/clientes/${c.id as string}`)}>
                          <Users className="h-3.5 w-3.5 mr-2" />Abrir cliente
                        </DropdownMenuItem>
                        {podeEditarCliente && (
                          <DropdownMenuItem onClick={() => router.push(`/clientes/${c.id as string}/editar`)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />Editar
                          </DropdownMenuItem>
                        )}
                        {temAcaoSecundaria && <DropdownMenuSeparator />}
                        {podeCriarTarefa && (
                          <DropdownMenuItem onClick={() => router.push(`/tarefas/nova?clienteId=${c.id as string}`)}>
                            <CheckSquare className="h-3.5 w-3.5 mr-2" />Nova tarefa
                          </DropdownMenuItem>
                        )}
                        {podeCriarCompetencia && (
                          <DropdownMenuItem onClick={() => router.push(`/competencias/nova?clienteId=${c.id as string}`)}>
                            <Layers className="h-3.5 w-3.5 mr-2" />Nova competência
                          </DropdownMenuItem>
                        )}
                        {podeEmitirNfse && (
                          <DropdownMenuItem onClick={() => router.push(`/fiscal?emitir=1&clienteId=${c.id as string}`)}>
                            <Receipt className="h-3.5 w-3.5 mr-2" />Emitir NFS-e
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </PararLinha>
                  </td>
                </tr>
                <tr {...linha(() => abrirCliente(c), { className: 'sm:hidden active:bg-muted/40' })}>

                  <td colSpan={9} className="px-3 py-2 sm:hidden">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/10">
                        <span className="text-xs font-bold text-primary">
                          {clienteInitials((c.razaoSocial as string) || '?')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{c.razaoSocial as string}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.nomeFantasia
                            ? (c.nomeFantasia as string)
                            : (c.cidade && c.uf)
                              ? `${c.cidade as string} · ${c.uf as string}`
                              : ''}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <ClienteStatusBadge status={c.status as string} />
                          {c.regimeTributario && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${REGIME_BADGE[c.regimeTributario as string] ?? REGIME_BADGE.isento}`}>
                              {REGIME_LABELS[c.regimeTributario as string] ?? (c.regimeTributario as string)}
                            </span>
                          )}
                          <SaudeBadge nivel={saude.nivel} motivo={saude.motivo} />
                        </div>
                      </div>
                      {mensalidade != null && mensalidade > 0 && (
                        <span className="text-sm font-bold tabular-nums shrink-0">{formatCurrency(mensalidade)}</span>
                      )}
                      <button
                        className="text-xs text-primary shrink-0 font-medium"
                        onClick={() => abrirCliente(c)}
                      >
                        Abrir
                      </button>
                    </div>
                  </td>
                </tr>
                </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </DataTableShell>

      {modalClienteId && (
        <ClienteModal
          clienteId={modalClienteId}
          clienteNome={modalClienteNome || ((filteredClientes.find((x) => x.id === modalClienteId)?.razaoSocial as string | undefined) ?? '')}
          open={!!modalClienteId}
          onOpenChange={(v) => { if (!v) fecharCliente() }}
        />
      )}
    </div>
  )
}

export default function ClientesPage() {
  return (
    <Suspense>
      <ClientesContent />
    </Suspense>
  )
}
