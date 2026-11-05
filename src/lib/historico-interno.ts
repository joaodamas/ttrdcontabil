'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Quantas telas (rota + query) a aba já percorreu dentro da plataforma. Com mais
// de uma, `router.back()` volta para uma tela nossa; com uma só (link direto,
// recarregar a página), voltar sairia do sistema.
let navegacoes = 0

export const temHistoricoInterno = () => navegacoes > 1

/** Montado uma vez no layout do painel. */
export function RastreadorNavegacao() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  useEffect(() => { navegacoes += 1 }, [pathname, query])
  return null
}
