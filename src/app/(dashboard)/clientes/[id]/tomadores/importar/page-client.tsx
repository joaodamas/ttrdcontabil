'use client'

import { usePathname } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { InlineAlert } from '@/components/ui/inline-alert'
import { TomadoresImportacao } from '@/components/tomadores/tomadores-importacao'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela } from '@/lib/permissions'
import { getPathSegmentAfter } from '@/lib/route-params'

export default function ImportarTomadoresPage() {
  const pathname = usePathname()
  const clienteId = getPathSegmentAfter(pathname, 'clientes')
  const { usuario } = useAuth()

  const podeVer = canAccessTela(usuario, 'fiscal')
  // Escrita segue o PERFIL (isFiscal() no firestore.rules), não a tela — ver o
  // comentário da página da carteira.
  const podeEditar = usuario?.perfil === 'admin' || usuario?.perfil === 'fiscal'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Importar tomadores"
        description="Suba a carteira inteira de um ou vários clientes a partir de uma planilha."
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Tomadores', href: `/clientes/${clienteId}/tomadores` },
          { label: 'Importar' },
        ]}
      />

      {podeVer ? (
        <TomadoresImportacao clienteId={clienteId} podeEditar={podeEditar} />
      ) : (
        <InlineAlert
          tone="warning"
          title="Você não tem acesso à carteira de tomadores"
          description="Estes são dados de emissão fiscal. Peça acesso à tela Fiscal para o administrador."
        />
      )}
    </div>
  )
}
