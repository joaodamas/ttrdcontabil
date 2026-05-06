'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Briefcase, Plug, SlidersHorizontal } from 'lucide-react'

export default function AdminPage() {
  const links = [
    {
      href: '/admin/usuarios',
      icon: Users,
      title: 'Usuários',
      desc: 'Gerenciar usuários do sistema',
    },
    {
      href: '/admin/servicos',
      icon: Briefcase,
      title: 'Tipos de Serviço',
      desc: 'Gerenciar tipos de serviços contábeis',
    },
    {
      href: '/admin/conectores',
      icon: Plug,
      title: 'Conectores Fiscais',
      desc: 'Homologação, capacidades e liberação de produção',
    },
    {
      href: '/admin/parametros',
      icon: SlidersHorizontal,
      title: 'Parâmetros',
      desc: 'Dados do escritório, alertas e ambiente fiscal padrão',
    },
  ]

  return (
    <div className="stack-6">
      <div className="surface-subtle border px-4 py-4 sm:px-5">
        <h2 className="text-title">Administração</h2>
        <p className="text-subtle">Configurações e gerenciamento do sistema.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}>
            <Card className="h-full cursor-pointer border-border/65 bg-card/95 transition-all duration-200 card-shadow hover:-translate-y-0.5 hover:border-primary/25 hover:card-shadow-hover">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
