'use client'

import { useMemo, useState, type ElementType } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle, BookOpen, Briefcase, CalendarDays, ChevronRight, DollarSign, FileDown, History, IdCard,
  Maximize2, MoreHorizontal, Pencil, Receipt, Trash2, X,
} from 'lucide-react'

import { softDeleteDocument } from '@/lib/firestore-client'
import { getErrorMessage } from '@/lib/error-message'
import { cn, formatCpfCnpj } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { podeEscreverEm, podeOperarNfse, podeVerCredenciais } from '@/lib/permissions'
import { clientesKeys } from '@/features/clientes/queries'
import { Button, buttonVariants } from '@/components/ui/button'
import { ClienteStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineAlert } from '@/components/ui/inline-alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LinkPermitido } from '@/components/ui/link-permitido'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfigFiscalForm, defaultsDaConfigFiscal } from '@/components/fiscal/config-fiscal-form'
import { EmitirNfseModal } from '@/components/fiscal/emitir-nfse-modal'
import { ClienteServicoDialog } from '@/components/clientes/cliente-servico-dialog'
import { ClienteFichaCompleta } from '@/components/clientes/cliente-ficha-completa'
import { useFichaCliente, type Registro } from './use-ficha-cliente'
import { ContadorAba, EsqueletoAba, rotuloRegime } from './ficha-comum'
import { exportFichaCadastralPdf } from './ficha-pdf'
import { AbaAtividade } from './aba-atividade'
import { AbaCompetencias, AbaFinanceiro, AbaServicos } from './aba-listas'
import { AbaFiscal } from './aba-fiscal'
import { AbaPop } from './aba-pop'
import { ResumoCliente } from './resumo-cliente'

export const ABAS_FICHA = ['cadastro', 'atividade', 'competencias', 'servicos', 'financeiro', 'fiscal', 'pop'] as const
export type AbaFicha = (typeof ABAS_FICHA)[number]

export const ehAbaFicha = (v: unknown): v is AbaFicha => typeof v === 'string' && (ABAS_FICHA as readonly string[]).includes(v)

const ROTULO_ABA: Record<AbaFicha, { rotulo: string; icone: typeof IdCard }> = {
  cadastro:     { rotulo: 'Cadastro',     icone: IdCard },
  atividade:    { rotulo: 'Atividade',    icone: History },
  competencias: { rotulo: 'Competências', icone: CalendarDays },
  servicos:     { rotulo: 'Serviços',     icone: Briefcase },
  financeiro:   { rotulo: 'Financeiro',   icone: DollarSign },
  fiscal:       { rotulo: 'Fiscal',       icone: Receipt },
  pop:          { rotulo: 'POP',          icone: BookOpen },
}

interface FichaClienteProps {
  clienteId: string
  /** `painel`: Sheet de tamanho fixo (só o conteúdo da aba rola). `pagina`: /clientes/<id>. */
  modo: 'painel' | 'pagina'
  /** Nome já conhecido pela lista (mostrado enquanto o cadastro carrega). */
  nomeProvisorio?: string
  abaInicial?: AbaFicha
  /** Painel: fechar (volta no histórico quando foi aberto por um clique). */
  onFechar?: () => void
  /** Elemento do nome — no painel, o título do diálogo (acessibilidade). */
  tituloComo?: ElementType
}

/**
 * Ficha ÚNICA do cliente — a mesma no painel lateral (?cliente=<id>) e na
 * página /clientes/<id>: mesmas abas, mesmas ações, mesmas permissões
 * (canAccessTela por aba; "Sem acesso a este módulo" quando as regras negam;
 * ações fiscais só admin/fiscal; senhas de portal reveladas por clique pelo
 * callable lerCredenciaisCliente).
 */
export function FichaCliente({ clienteId, modo, nomeProvisorio, abaInicial, onFechar, tituloComo: Titulo = 'h1' }: FichaClienteProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const ficha = useFichaCliente(clienteId)
  const { acesso, cliente, falhas, carregando, recarregar, setDados } = ficha
  const podeEditar = podeEscreverEm(usuario, 'clientes')
  const podeOperarFiscal = podeOperarNfse(usuario)
  const isAdmin = usuario?.perfil === 'admin'
  const painel = modo === 'painel'

  const abas = useMemo(() => ABAS_FICHA.filter((a) =>
    a === 'competencias' ? acesso.competencias
      : a === 'financeiro' ? acesso.financeiro
      : a === 'fiscal' ? acesso.fiscal
      : true,
  ), [acesso])
  const [abaEscolhida, setAba] = useState<AbaFicha>(abaInicial ?? 'cadastro')
  const aba = abas.includes(abaEscolhida) ? abaEscolhida : 'cadastro'

  const [configAberta, setConfigAberta] = useState(false)
  const [servicoAberto, setServicoAberto] = useState(false)
  const [emitirAberto, setEmitirAberto] = useState(false)
  const [excluirAberto, setExcluirAberto] = useState(false)

  const categoria = (cliente?.categoriaFiscal as string) ?? 'servico'
  const podeEmitir = podeOperarFiscal && acesso.fiscal && !!ficha.fiscal && categoria === 'servico'
  const contagem: Partial<Record<AbaFicha, number>> = {
    competencias: ficha.competencias.length,
    servicos: ficha.servicos.length,
    financeiro: ficha.lancamentos.length,
    fiscal: ficha.nfses.length,
  }

  async function sincronizar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: clientesKeys.all }),
      queryClient.invalidateQueries({ queryKey: clientesKeys.detail(clienteId) }),
    ])
    await recarregar()
  }

  async function excluir() {
    try {
      await softDeleteDocument('clientes', clienteId)
      toast.success('Cliente inativado com sucesso.')
      await queryClient.invalidateQueries({ queryKey: clientesKeys.all })
      if (painel) onFechar?.()
      else router.push('/clientes')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível inativar o cliente.'))
    }
  }

  const acrescentar = (chave: 'comentarios' | 'popNotas') => (r: Registro) =>
    setDados((d) => ({ ...d, [chave]: [r, ...d[chave]] }))

  const nome = (cliente?.razaoSocial as string | undefined) ?? nomeProvisorio
  const semCliente = !carregando && !cliente

  /* ── cabeçalho ─────────────────────────────────────────────── */
  const cabecalho = (
    <header className={cn('shrink-0', painel ? 'border-b px-4 pt-3 pb-3 sm:px-5' : 'surface-subtle border px-4 py-4 sm:px-5')}>
      {!painel ? (
        <nav className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/clientes" className="hover:text-foreground">Clientes</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate">{nome ?? 'Cliente'}</span>
        </nav>
      ) : null}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Titulo className={cn('min-w-0 truncate font-semibold tracking-tight', painel ? 'text-base' : 'text-xl')}>
              {nome ?? (carregando ? <span className="inline-block h-5 w-56 animate-pulse rounded-md bg-muted align-middle" aria-label="Carregando" /> : 'Cliente indisponível')}
            </Titulo>
            {cliente?.status ? <ClienteStatusBadge status={cliente.status as string} /> : null}
          </div>
          {/* Altura reservada: a linha existe (vazia) enquanto carrega. */}
          <div className="mt-1 flex min-h-4 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {cliente ? (
              <>
                <span className="font-mono">{formatCpfCnpj(cliente.cpfCnpj as string)}</span>
                <span>{rotuloRegime(cliente.regimeTributario)}</span>
                {cliente.cidade || cliente.uf ? <span>{[cliente.cidade, cliente.uf].filter(Boolean).join(' / ')}</span> : null}
                {cliente.nomeFantasia ? <span className="truncate">{cliente.nomeFantasia as string}</span> : null}
              </>
            ) : carregando ? <Skeleton className="h-3 w-64" /> : null}
          </div>
        </div>
        {painel ? (
          <Button size="icon-sm" variant="ghost" aria-label="Fechar" title="Fechar (Esc)" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <div className="mt-2.5 flex min-h-8 flex-wrap items-center gap-2" data-testid="acoes-ficha">
        {cliente ? (
          <>
            {podeEditar ? (
              <LinkPermitido semAcesso="ocultar" href={`/clientes/${clienteId}/editar`} className={buttonVariants({ size: 'sm', variant: 'outline', className: 'h-8' })}>
                <Pencil className="h-3.5 w-3.5" />Editar
              </LinkPermitido>
            ) : null}
            {podeEmitir ? (
              <Button size="sm" className="h-8" onClick={() => setEmitirAberto(true)}>
                <Receipt className="h-3.5 w-3.5" />Emitir NFS-e
              </Button>
            ) : null}
            {painel ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                title="Abrir a ficha em página inteira"
                onClick={() => router.push(`/clientes/${encodeURIComponent(clienteId)}${aba !== 'cadastro' ? `?aba=${aba}` : ''}`)}
              >
                <Maximize2 className="h-3.5 w-3.5" />Expandir
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 w-8 p-0' })} aria-label="Mais ações do cliente" title="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => { void exportFichaCadastralPdf(cliente, podeVerCredenciais(usuario), clienteId) }}>
                  <FileDown className="mr-2 h-3.5 w-3.5" />Exportar ficha (PDF)
                </DropdownMenuItem>
                {isAdmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setExcluirAberto(true)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir cliente
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : carregando ? (
          <>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
          </>
        ) : null}
      </div>
    </header>
  )

  /* ── conteúdo das abas ──────────────────────────────────────── */
  function conteudo(a: AbaFicha) {
    if (!cliente) return <EsqueletoAba />
    switch (a) {
      case 'cadastro':
        return <ClienteFichaCompleta cliente={cliente} clienteId={clienteId} />
      case 'atividade':
        return (
          <AbaAtividade
            clienteId={clienteId}
            competencias={ficha.competencias}
            lancamentos={ficha.lancamentos}
            tarefas={ficha.tarefas}
            comentarios={ficha.comentarios}
            onComentarioCriado={acrescentar('comentarios')}
          />
        )
      case 'competencias':
        return <AbaCompetencias clienteId={clienteId} competencias={ficha.competencias} falha={falhas.competencias} onRecarregar={() => void recarregar()} />
      case 'servicos':
        return <AbaServicos servicos={ficha.servicos} falha={falhas.servicos} podeEditar={podeEditar} onVincular={() => setServicoAberto(true)} onRecarregar={() => void recarregar()} />
      case 'financeiro':
        return <AbaFinanceiro clienteId={clienteId} lancamentos={ficha.lancamentos} falha={falhas.lancamentos} onRecarregar={() => void recarregar()} />
      case 'fiscal':
        return (
          <AbaFiscal
            clienteId={clienteId}
            cliente={cliente}
            fiscal={ficha.fiscal}
            nfses={ficha.nfses}
            falhaFiscal={falhas.fiscal}
            falhaNfses={falhas.nfses}
            podeOperar={podeOperarFiscal}
            onConfigurar={() => setConfigAberta(true)}
            onEmitir={() => setEmitirAberto(true)}
            onRecarregar={() => void sincronizar()}
          />
        )
      case 'pop':
        return (
          <AbaPop
            clienteId={clienteId}
            pop={ficha.pop}
            popNotas={ficha.popNotas}
            falhaPop={falhas.pop}
            onRecarregar={() => void recarregar()}
            onNotaCriada={acrescentar('popNotas')}
            onPopSalvo={(pop) => setDados((d) => ({ ...d, pop }))}
          />
        )
    }
  }

  const indisponivel = semCliente ? (
    ficha.erroCliente ? (
      <InlineAlert
        tone="danger"
        title="Não foi possível carregar o cliente."
        description={getErrorMessage(ficha.erroCliente, 'Ocorreu um erro ao buscar o cadastro. Tente novamente.')}
        action={{ label: 'Tentar novamente', onClick: () => { void recarregar() } }}
      />
    ) : (
      <EmptyState
        icon={AlertTriangle}
        title="Cliente não encontrado"
        description="O cadastro não existe mais ou você não tem acesso a ele."
        action={{ label: 'Voltar para clientes', href: '/clientes' }}
      />
    )
  ) : null

  const algumaFalha = cliente && Object.values(falhas).some((f) => f === 'erro')

  const barraAbas = (
    <TabsList
      variant="line"
      aria-label="Seções da ficha do cliente"
      className={cn(
        'h-10 w-full shrink-0 justify-start gap-0 overflow-x-auto overflow-y-hidden rounded-none border-b p-0 [scrollbar-width:none]',
        painel ? 'px-2 sm:px-3' : '',
      )}
    >
      {abas.map((a) => {
        const { rotulo, icone: Icone } = ROTULO_ABA[a]
        return (
          <TabsTrigger
            key={a}
            value={a}
            className="h-10 flex-none gap-1.5 rounded-none px-3 text-sm group-data-horizontal/tabs:after:bottom-0"
          >
            <Icone className="h-3.5 w-3.5" />
            <span>{rotulo}</span>
            {a in contagem ? <ContadorAba n={contagem[a]} /> : null}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )

  const paineis = abas.map((a) => (
    <TabsContent key={a} value={a} className="outline-none">
      {conteudo(a)}
    </TabsContent>
  ))

  return (
    <div
      className={cn(painel ? 'flex h-full min-h-0 flex-col' : 'space-y-4')}
      data-testid="ficha-cliente"
      data-modo={modo}
    >
      {cabecalho}

      {indisponivel ? (
        <div className={cn(painel ? 'min-h-0 flex-1 overflow-y-auto p-5' : '')}>{indisponivel}</div>
      ) : (
        <Tabs
          value={aba}
          onValueChange={(v) => { if (ehAbaFicha(v)) setAba(v) }}
          className={cn('gap-0', painel ? 'min-h-0 flex-1' : '')}
        >
          {painel ? (
            <>
              {barraAbas}
              {/* Só isto rola; scrollbar-gutter fixo: a largura útil não muda entre abas. */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] sm:px-5" data-testid="ficha-conteudo">
                {algumaFalha ? <ParteNaoCarregada onRetry={() => void recarregar()} /> : null}
                {paineis}
              </div>
            </>
          ) : (
            <>
            {barraAbas}
            <div className="mt-4 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
                {algumaFalha ? <ParteNaoCarregada onRetry={() => void recarregar()} /> : null}
                <div data-testid="ficha-conteudo">{paineis}</div>
              </div>
              <aside className="lg:sticky lg:top-4">
                {cliente ? <ResumoCliente dados={ficha} acesso={acesso} clienteId={clienteId} /> : <Skeleton className="h-64 rounded-xl" />}
              </aside>
            </div>
            </>
          )}
        </Tabs>
      )}

      {cliente ? (
        <>
          <ClienteServicoDialog open={servicoAberto} onOpenChange={setServicoAberto} clienteId={clienteId} onSaved={() => { void sincronizar() }} />
          {podeOperarFiscal && acesso.configFiscal ? (
            <ConfigFiscalForm
              open={configAberta}
              onOpenChange={setConfigAberta}
              clienteId={clienteId}
              docId={ficha.fiscal?.id as string | undefined}
              defaultValues={defaultsDaConfigFiscal(ficha.fiscal)}
              onSaved={() => { void sincronizar() }}
            />
          ) : null}
          {podeOperarFiscal ? (
            <EmitirNfseModal
              open={emitirAberto}
              onOpenChange={setEmitirAberto}
              clienteId={clienteId}
              onFinished={async () => {
                setEmitirAberto(false)
                await sincronizar()
              }}
            />
          ) : null}
          {isAdmin ? (
            <ConfirmDialog
              open={excluirAberto}
              onOpenChange={setExcluirAberto}
              title="Excluir cliente?"
              description="O cliente será inativado e seus serviços encerrados. Não serão geradas novas competências, cobranças nem NFS-e. As competências já existentes são preservadas. Esta ação pode ser revertida por um admin."
              confirmLabel="Excluir"
              destructive
              onConfirm={excluir}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ParteNaoCarregada({ onRetry }: { onRetry: () => void }) {
  return (
    <InlineAlert
      className="mb-3"
      tone="warning"
      title="Parte dos dados deste cliente não foi carregada."
      description="As seções marcadas não puderam ser lidas — não considere a ficha completa."
      action={{ label: 'Tentar novamente', onClick: onRetry }}
    />
  )
}
