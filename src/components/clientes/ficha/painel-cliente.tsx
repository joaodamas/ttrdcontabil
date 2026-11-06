'use client'

import { useCallback, useEffect, useState, type ComponentProps, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { useAuth } from '@/contexts/auth-context'
import { canAccessTela } from '@/lib/permissions'
import { temHistoricoInterno } from '@/lib/historico-interno'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { FichaCliente } from './ficha-cliente'

/*
 * Ficha do cliente em painel lateral, controlada pela URL (?cliente=<id>) em
 * QUALQUER tela do painel: o Voltar do navegador fecha o painel em vez de sair
 * da tela, e o link pode ser compartilhado. Aberto por nós (clique numa lista),
 * fechar = voltar no histórico; aberto por link direto, fechar = tirar o
 * parâmetro da URL (voltar sairia do sistema).
 */

const PARAM = 'cliente'
let abertoPeloApp = false
const nomesProvisorios = new Map<string, string>()

function urlSemCliente(pathname: string): string {
  const p = new URLSearchParams(window.location.search)
  p.delete(PARAM)
  const q = p.toString()
  return q ? `${pathname}?${q}` : pathname
}

/** Abre/fecha o painel do cliente na tela atual. */
export function useFichaClientePainel() {
  const router = useRouter()
  const pathname = usePathname()

  const abrirCliente = useCallback((clienteId: string, nome?: string) => {
    if (nome) nomesProvisorios.set(clienteId, nome)
    const p = new URLSearchParams(window.location.search)
    p.set(PARAM, clienteId)
    abertoPeloApp = true
    router.push(`${pathname}?${p.toString()}`, { scroll: false })
  }, [pathname, router])

  const fecharCliente = useCallback(() => {
    if (abertoPeloApp && temHistoricoInterno()) {
      abertoPeloApp = false
      router.back()
      return
    }
    abertoPeloApp = false
    router.replace(urlSemCliente(pathname), { scroll: false })
  }, [pathname, router])

  return { abrirCliente, fecharCliente }
}

/**
 * Nome do cliente que abre o painel (clique) — Ctrl/⌘+clique e botão do meio
 * abrem a página /clientes/<id> em nova aba, como um link comum. Sem acesso a
 * Clientes, fica só o texto.
 */
export function LinkFichaCliente({
  clienteId, nome, children, className, ...rest
}: Omit<ComponentProps<typeof Link>, 'href' | 'onClick'> & { clienteId: string; nome?: string }) {
  const { usuario } = useAuth()
  const { abrirCliente } = useFichaClientePainel()
  if (!canAccessTela(usuario, 'clientes')) return <span className={className}>{children}</span>
  return (
    <Link
      href={`/clientes/${encodeURIComponent(clienteId)}`}
      className={className}
      title="Abrir ficha do cliente"
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        abrirCliente(clienteId, nome)
      }}
    >
      {children}
    </Link>
  )
}

/** Painel montado uma vez no layout do painel (dentro de Suspense). */
export function PainelClienteUrl() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { usuario } = useAuth()
  const { fecharCliente } = useFichaClientePainel()
  const clienteId = searchParams.get(PARAM)
  // Na própria página do cliente a ficha já está aberta, em modo página.
  const naPaginaDoCliente = /^\/clientes\/[^/]+\/?$/.test(pathname) && !pathname.startsWith('/clientes/novo') && !pathname.startsWith('/clientes/importar')
  const aberto = !!clienteId && !naPaginaDoCliente && canAccessTela(usuario, 'clientes')

  // Mantém o último cliente montado enquanto o painel desliza para fora.
  const [ultimoId, setUltimoId] = useState<string | null>(clienteId)
  if (clienteId && clienteId !== ultimoId) setUltimoId(clienteId)

  useEffect(() => {
    if (!clienteId) abertoPeloApp = false
  }, [clienteId])

  return (
    <Sheet open={aberto} onOpenChange={(v) => { if (!v) fecharCliente() }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-testid="painel-cliente"
        // Tamanho FIXO: largura fixa no desktop, tela cheia no celular, altura
        // da viewport. Cabeçalho e abas fixos; só o conteúdo da aba rola.
        className="gap-0 overflow-hidden p-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:max-w-full data-[side=right]:sm:w-[min(920px,calc(100vw-3rem))] data-[side=right]:sm:max-w-none"
      >
        {ultimoId ? (
          <FichaCliente
            key={ultimoId}
            clienteId={ultimoId}
            modo="painel"
            nomeProvisorio={nomesProvisorios.get(ultimoId)}
            onFechar={fecharCliente}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
