'use client'

import { usePathname } from 'next/navigation'

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clientes': 'Clientes',
  '/servicos': 'Serviços',
  '/competencias': 'Competências',
  '/tarefas': 'Tarefas',
  '/ir': 'Imposto de Renda',
  '/financeiro': 'Financeiro',
  '/fiscal': 'Fiscal / NFS-e',
  '/documentos': 'Documentos',
  '/admin': 'Administração',
  '/admin/usuarios': 'Usuários',
  '/admin/servicos': 'Tipos de Serviço',
}

function getLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  // Tenta matching parcial
  const segments = pathname.split('/').filter(Boolean)
  for (let i = segments.length; i > 0; i--) {
    const partial = '/' + segments.slice(0, i).join('/')
    if (ROUTE_LABELS[partial]) return ROUTE_LABELS[partial]
  }
  return 'TTRD Contábil'
}

export function Header() {
  const pathname = usePathname()
  const label = getLabel(pathname)

  return (
    <header className="h-14 border-b border-border flex items-center px-6 bg-background shrink-0">
      <h1 className="text-base font-semibold text-foreground">{label}</h1>
    </header>
  )
}
