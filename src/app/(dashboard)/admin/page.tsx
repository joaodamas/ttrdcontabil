export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Briefcase, Plug } from 'lucide-react'

export default async function AdminPage() {
  await requireAdmin()

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
      desc: 'Configurar integrações de NFS-e',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Administração</h2>
        <p className="text-sm text-muted-foreground">Configurações e gerenciamento do sistema.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
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
