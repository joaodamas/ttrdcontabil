'use client'

import { useState, Suspense, Fragment } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { toast } from 'sonner'
import { formatCpfCnpj, formatCurrency } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
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
  ShieldCheck, ShieldAlert, AlertTriangle, MessageCircle, FileDown, Upload,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useClientesList, useClientesRisco } from '@/features/clientes/hooks'
import { clientesFiltroSchema } from '@/features/clientes/schemas'
import type { ClienteRecord } from '@/features/clientes/types'

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
    <span title={motivo} className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
      <AlertTriangle className="h-2.5 w-2.5" />{motivo}
    </span>
  )
  if (nivel === 'atencao') return (
    <span title={motivo} className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
      <ShieldAlert className="h-2.5 w-2.5" />{motivo}
    </span>
  )
  return (
    <span title={motivo} className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
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

function exportClientesListaPdf(clientes: ClienteRecord[]) {
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
    const mensalidade = c.mensalidade != null ? formatCurrency(c.mensalidade as number) : '—'
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
  const [modalClienteId,   setModalClienteId]   = useState<string | null>(null)
  const [modalClienteNome, setModalClienteNome] = useState('')
  const [filterSheetOpen,  setFilterSheetOpen]  = useState(false)

  const clientesFiltrados = regime
    ? filteredClientes.filter(c => (c.regimeTributario as string | undefined) === regime)
    : filteredClientes

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={isLoading ? undefined : `${clientesFiltrados.length} cliente${clientesFiltrados.length !== 1 ? 's' : ''} encontrado${clientesFiltrados.length !== 1 ? 's' : ''}`}
        action={
          <div className="flex items-center gap-2">
            <FilterSheetTrigger
              onClick={() => setFilterSheetOpen(true)}
              activeCount={(status ? 1 : 0) + (regime ? 1 : 0)}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl"
              disabled={isLoading || clientesFiltrados.length === 0}
              onClick={() => exportClientesListaPdf(clientesFiltrados)}
            >
              <FileDown className="w-4 h-4" />
              Exportar PDF
            </Button>
            <Link href="/clientes/importar" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-10 rounded-xl' })}>
              <Upload className="w-4 h-4" />
              Importar
            </Link>
            <Link href="/clientes/novo" className={buttonVariants({ size: 'sm', className: 'h-10 rounded-xl' })}>
              <Plus className="w-4 h-4" />
              Novo Cliente
            </Link>
          </div>
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
            {([
              ['', 'Todos'],
              ['simples_nacional', 'Simples'],
              ['lucro_presumido',  'L. Presumido'],
              ['lucro_real',       'L. Real'],
              ['mei',              'MEI'],
            ] as const).map(([val, label]) => (
              <FilterBtn key={val} href={clientesFilterHref({ busca, status, regime: val })} active={regime === val}>
                {label}
              </FilterBtn>
            ))}
          </div>
        </div>
      </FilterSheet>

      <div className="surface-subtle border px-3 py-2.5 space-y-2.5 hidden sm:block">
        <Suspense>
          <ClientesFiltros busca={busca} status={status} />
        </Suspense>
        {/* Filtros rápidos de regime */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Regime:</span>
          {([
            ['', 'Todos'],
            ['simples_nacional', 'Simples'],
            ['lucro_presumido',  'L. Presumido'],
            ['lucro_real',       'L. Real'],
            ['mei',              'MEI'],
          ] as const).map(([val, label]) => (
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

      <DataTableShell className="mt-4" density="compact">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2.5 section-label">Nome / Razão Social</th>
              <th className="text-left px-3 py-2.5 section-label hidden sm:table-cell">CPF / CNPJ</th>
              <th className="text-left px-3 py-2.5 section-label hidden lg:table-cell">Cidade</th>
              <th className="text-left px-3 py-2.5 section-label hidden md:table-cell">Regime</th>
              <th className="text-right px-3 py-2.5 section-label hidden lg:table-cell">Mensalidade</th>
              <th className="text-left px-3 py-2.5 section-label">Status</th>
              <th className="text-left px-3 py-2.5 section-label">Saúde</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <TableRowSkeleton cols={8} rows={8} />
            ) : isError ? (
              <TableEmptyState
                colSpan={8}
                icon={Users}
                title="Não foi possível carregar clientes"
                description="Atualize a página. Se continuar, valide regras e índices do Firestore."
              />
            ) : clientesFiltrados.length === 0 ? (
              <TableEmptyState
                colSpan={8}
                icon={Users}
                title={busca || status || regime ? 'Nenhum cliente encontrado' : 'Ainda não há clientes'}
                description={busca || status || regime
                  ? 'Tente ajustar os filtros de busca.'
                  : 'Clique em "Novo Cliente" para começar.'}
                action={!busca && !status && !regime ? { label: 'Novo Cliente', href: '/clientes/novo' } : undefined}
              />
            ) : (
              clientesFiltrados.map((c) => {
                const saude = saudeCliente(motivosRiscoDoCliente(c, riscoMap))
                const temWhatsApp = !!(c.whatsapp ?? c.whatsappFinanceiro ?? c.aceiteWhatsAppCobranca)
                const mensalidade = c.mensalidade as number | undefined
                const vencimento = c.vencimento as string | undefined
                return (
                <Fragment key={c.id as string}>
                <tr
                  className="group cursor-pointer transition-colors hover:bg-muted/35 hidden sm:table-row"
                  onClick={() => { setModalClienteId(c.id as string); setModalClienteNome((c.razaoSocial as string) ?? '') }}
                >
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
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                    {formatCpfCnpj(c.cpfCnpj as string)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs hidden lg:table-cell">
                    {c.cidade && c.uf ? `${c.cidade as string} · ${c.uf as string}` : c.cidade ? (c.cidade as string) : '—'}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {c.regimeTributario ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${REGIME_BADGE[c.regimeTributario as string] ?? REGIME_BADGE.isento}`}>
                        {REGIME_LABELS[c.regimeTributario as string] ?? (c.regimeTributario as string)}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                        onClick={e => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => router.push(`/clientes/${c.id as string}`)}>
                          <Users className="h-3.5 w-3.5 mr-2" />Abrir cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/clientes/${c.id as string}/editar`)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push(`/tarefas/nova?clienteId=${c.id as string}`)}>
                          <CheckSquare className="h-3.5 w-3.5 mr-2" />Nova tarefa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/competencias/nova?clienteId=${c.id as string}`)}>
                          <Layers className="h-3.5 w-3.5 mr-2" />Nova competência
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/fiscal?emitir=1&clienteId=${c.id as string}`)}>
                          <Receipt className="h-3.5 w-3.5 mr-2" />Emitir NFS-e
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
                <tr className="sm:hidden">
                  <td colSpan={7} className="px-3 py-2 sm:hidden">
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
                        onClick={() => { setModalClienteId(c.id as string); setModalClienteNome((c.razaoSocial as string) ?? '') }}
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
          clienteNome={modalClienteNome}
          open={!!modalClienteId}
          onOpenChange={(v) => { if (!v) setModalClienteId(null) }}
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
