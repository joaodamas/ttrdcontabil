'use client'

import { Suspense, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

import { getPathSegmentAfter } from '@/lib/route-params'
import { FichaCliente, ehAbaFicha } from '@/components/clientes/ficha/ficha-cliente'

/**
 * /clientes/<id> — a MESMA ficha do painel lateral (FichaCliente), em página
 * inteira. `?aba=` abre direto numa aba (é o que o "Expandir" do painel usa).
 */
function ClienteDetalhe() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const id = useMemo(() => getPathSegmentAfter(pathname, 'clientes'), [pathname])
  const aba = searchParams.get('aba')
  if (!id) return null
  return <FichaCliente key={id} clienteId={id} modo="pagina" abaInicial={ehAbaFicha(aba) ? aba : undefined} />
}

export default function ClienteDetailPage() {
  return (
    <Suspense fallback={null}>
      <ClienteDetalhe />
    </Suspense>
  )
}
