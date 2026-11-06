'use client'

import { useCallback, type ComponentProps, type KeyboardEvent, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/contexts/auth-context'
import { podeAbrirRota } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/**
 * Para onde a linha leva: um endereço do app (respeita podeAbrirRota) ou uma
 * ação (abrir ficha/modal). `null`/`undefined` = linha não clicável.
 */
export type AlvoLinha = string | (() => void) | null | undefined

/**
 * Elementos que têm ação própria dentro da linha: clicar neles não abre a
 * linha. `data-parar-linha` serve para qualquer outro (ex.: uma célula inteira).
 */
const SELETOR_INTERATIVO = [
  'a', 'button', 'input', 'select', 'textarea', 'label', 'summary',
  '[role="button"]', '[role="menuitem"]', '[role="checkbox"]', '[role="switch"]', '[role="combobox"]',
  '[data-parar-linha]',
].join(',')

export const CLASSES_LINHA_CLICAVEL =
  'cursor-pointer outline-none focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'

/**
 * O clique veio de algo que não deve abrir a linha? Cobre botões/links/menus
 * dentro da linha e também eventos que chegam por portal (menu ⋯, diálogos
 * renderizados dentro da linha): no React eles sobem pela árvore de
 * componentes, mas o alvo não está dentro da <tr> no DOM.
 */
export function deveIgnorarClique(evento: { target: EventTarget | null; currentTarget: EventTarget | null }): boolean {
  const linha = evento.currentTarget as Element | null
  const alvo = evento.target as Element | null
  if (!linha || !alvo || typeof (alvo as Element).closest !== 'function') return true
  if (!linha.contains(alvo)) return true
  const interativo = alvo.closest(SELETOR_INTERATIVO)
  return !!interativo && interativo !== linha && linha.contains(interativo)
}

function haTextoSelecionado(): boolean {
  if (typeof window === 'undefined') return false
  return (window.getSelection?.()?.toString() ?? '').length > 0
}

/**
 * Props para tornar uma linha de lista clicável inteira, com Enter/Espaço e
 * foco visível — o padrão da lista de Clientes. Ctrl/⌘+clique e botão do meio
 * abrem em nova aba quando o alvo é um endereço. Sem permissão para o destino,
 * a linha fica como estava (sem cursor nem foco).
 */
export function useLinhaClicavel() {
  const router = useRouter()
  const { usuario } = useAuth()

  return useCallback(
    (alvo: AlvoLinha, opcoes?: { className?: string }) => {
      const href = typeof alvo === 'string' ? alvo : null
      const permitido = typeof alvo === 'function' || (href !== null && podeAbrirRota(usuario, href))
      if (!permitido) return { className: opcoes?.className }

      const abrir = (novaAba: boolean) => {
        if (href) {
          if (novaAba) window.open(href, '_blank', 'noopener')
          else router.push(href)
        } else if (typeof alvo === 'function') {
          alvo()
        }
      }

      return {
        tabIndex: 0,
        'data-linha-clicavel': '',
        ...(href ? { 'data-href': href } : {}),
        className: cn(CLASSES_LINHA_CLICAVEL, opcoes?.className),
        onClick: (e: MouseEvent<HTMLElement>) => {
          if (deveIgnorarClique(e) || haTextoSelecionado()) return
          abrir(!!href && (e.metaKey || e.ctrlKey))
        },
        onAuxClick: (e: MouseEvent<HTMLElement>) => {
          if (e.button !== 1 || !href || deveIgnorarClique(e)) return
          e.preventDefault()
          abrir(true)
        },
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            abrir(false)
          }
        },
      }
    },
    [router, usuario],
  )
}

type LinhaClicavelProps = Omit<ComponentProps<'tr'>, 'onClick' | 'onKeyDown'> & { alvo: AlvoLinha }

/** `<tr>` clicável inteira (ver useLinhaClicavel). */
export function LinhaClicavel({ alvo, className, children, ...rest }: LinhaClicavelProps) {
  const linha = useLinhaClicavel()
  return (
    <tr {...rest} {...linha(alvo, { className })}>
      {children}
    </tr>
  )
}

/** Envolve botões/menus dentro de uma linha clicável para não abrir a linha. */
export function PararLinha({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div data-parar-linha="" className={className} {...rest}>
      {children}
    </div>
  )
}
