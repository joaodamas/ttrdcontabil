'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { MapPinOff } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { rotaConhecida } from '@/lib/rotas-conhecidas'

export function PaginaNaoEncontrada() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" data-pagina-nao-encontrada="">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <MapPinOff className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-semibold">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        O endereço não corresponde a nenhuma tela do sistema. Confira o link ou volte para o início.
      </p>
      <Link href="/hoje" className={buttonVariants({ size: 'cta' })}>
        Ir para Hoje
      </Link>
    </div>
  )
}

/**
 * Mostra "Página não encontrada" quando o endereço real do navegador não é
 * uma tela do app. No Firebase Hosting o rewrite `**` serve /dashboard.html
 * para qualquer caminho desconhecido — sem isto, um link quebrado abria o
 * Painel como se estivesse certo. Lê window.location (o usePathname do static
 * export reflete a página servida, não o endereço) depois de montar, para não
 * divergir da hidratação.
 */
export function GuardaRotaInexistente({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [caminhoReal, setCaminhoReal] = useState<string | null>(null)

  useEffect(() => {
    queueMicrotask(() => setCaminhoReal(window.location.pathname))
  }, [pathname])

  if (caminhoReal !== null && !rotaConhecida(caminhoReal)) return <PaginaNaoEncontrada />
  return <>{children}</>
}
