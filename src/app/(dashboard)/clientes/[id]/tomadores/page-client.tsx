'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/auth-context'
import { canAccessTela } from '@/lib/permissions'
import { getPathSegmentAfter } from '@/lib/route-params'
import { getErrorMessage } from '@/lib/error-message'
import { formatCpfCnpj } from '@/lib/utils'

import { TomadoresLista } from '@/components/tomadores/tomadores-lista'
import { NfseRecorrentesLista } from '@/components/tomadores/nfse-recorrentes-lista'
import { useCarteiraTomadores, usePrestador } from '@/features/tomadores/hooks'
import { useContratosRecorrentes } from '@/features/nfse-recorrentes/hooks'

export default function CarteiraTomadoresPage() {
  const pathname = usePathname()
  const clienteId = getPathSegmentAfter(pathname, 'clientes')
  const { usuario } = useAuth()

  const podeVer = canAccessTela(usuario, 'fiscal')
  // ATENÇÃO: a ESCRITA em tomadores/nfse_recorrentes é liberada por PERFIL
  // (isFiscal() = admin|fiscal no firestore.rules), não pela tela. Um usuário
  // 'financeiro' — ou qualquer um com a tela 'fiscal' concedida no override —
  // LÊ a carteira, mas o write dele volta permission-denied. Gatear os botões
  // por canAccessTela deixaria esse usuário clicando em "Salvar" para receber
  // um erro que ele não tem como resolver.
  const podeEditar = usuario?.perfil === 'admin' || usuario?.perfil === 'fiscal'

  const [aba, setAba] = useState('tomadores')

  const prestadorQuery = usePrestador(clienteId)
  const prestador = prestadorQuery.data ?? null

  const { todos: tomadores } = useCarteiraTomadores({ clienteId, incluirInativos: true })
  const { todos: contratos } = useContratosRecorrentes({ clienteId, incluirEncerrados: true })

  // Contratos VIGENTES por tomador: é o número que decide se inativar o tomador
  // deixa nota sendo emitida por trás.
  const contratosVigentesPorTomador = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const contrato of contratos) {
      if (!contrato.vigente || !contrato.tomadorId) continue
      mapa.set(contrato.tomadorId, (mapa.get(contrato.tomadorId) ?? 0) + 1)
    }
    return mapa
  }, [contratos])

  if (!podeVer) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Carteira de tomadores"
          breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: 'Tomadores' }]}
        />
        <InlineAlert
          tone="warning"
          title="Você não tem acesso à carteira de tomadores"
          description="Estes são dados de emissão fiscal. Peça acesso à tela Fiscal para o administrador."
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Carteira de tomadores"
        description={
          prestador
            ? `A NFS-e sai em nome de ${prestador.razaoSocial} (${formatCpfCnpj(prestador.cpfCnpj)}) para os tomadores abaixo.`
            : 'Quem recebe as notas emitidas em nome deste cliente.'
        }
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: prestador?.razaoSocial ?? 'Cliente', href: `/clientes/${clienteId}` },
          { label: 'Tomadores' },
        ]}
      />

      {prestadorQuery.isError && (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar o cliente desta carteira"
          description={getErrorMessage(
            prestadorQuery.error,
            'Sem o cadastro do prestador não dá para validar o tomador contra ele — a tela fica bloqueada de propósito.'
          )}
          action={{ label: 'Tentar novamente', onClick: () => void prestadorQuery.refetch() }}
        />
      )}

      {prestadorQuery.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o cliente…
        </p>
      )}

      {prestador && (
        <Tabs value={aba} onValueChange={(v) => setAba(String(v))}>
          <TabsList>
            <TabsTrigger value="tomadores">Tomadores ({tomadores.length})</TabsTrigger>
            <TabsTrigger value="contratos">Contratos recorrentes ({contratos.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="tomadores" className="pt-4">
            <TomadoresLista
              clienteId={clienteId}
              prestador={prestador}
              podeEditar={podeEditar}
              contratosVigentesPorTomador={contratosVigentesPorTomador}
            />
          </TabsContent>

          <TabsContent value="contratos" className="pt-4">
            <NfseRecorrentesLista
              clienteId={clienteId}
              prestador={prestador}
              tomadores={tomadores}
              podeEditar={podeEditar}
              onIrParaTomadores={() => setAba('tomadores')}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
