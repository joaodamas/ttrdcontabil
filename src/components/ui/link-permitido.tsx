'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'

import { useAuth } from '@/contexts/auth-context'
import { podeAbrirRota } from '@/lib/permissions'

type LinkPermitidoProps = ComponentProps<typeof Link> & {
  href: string
  /**
   * Sem acesso: `texto` (padrão) mantém o conteúdo como informação, sem link —
   * o número do cartão continua valendo; `ocultar` some com o elemento (botões
   * de ação, ex.: "Novo cliente").
   */
  semAcesso?: 'texto' | 'ocultar'
}

/**
 * Link que só vira link quando o perfil pode usar o destino (podeAbrirRota).
 * Antes o Painel e o Hoje ofereciam atalhos para módulos sem acesso: o clique
 * só redirecionava de volta, sem explicação.
 */
export function LinkPermitido({ href, semAcesso = 'texto', className, children, ...rest }: LinkPermitidoProps) {
  const { usuario } = useAuth()
  if (podeAbrirRota(usuario, href)) {
    return <Link href={href} className={className} {...rest}>{children}</Link>
  }
  if (semAcesso === 'ocultar') return null
  return (
    <div className={className} data-sem-acesso="">
      {children as React.ReactNode}
    </div>
  )
}
