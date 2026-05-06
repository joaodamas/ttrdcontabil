'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { ClienteServicoForm } from '@/components/clientes/cliente-servico-form'
import { getCliente, getServicos } from '@/lib/firestore-client'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/error-message'

interface Servico {
  id: string
  nome: string
  codigo?: string | null
  valorPadrao: number | null
}

export default function Page() {
  const { id } = useParams<{ id: string }>()
  const [servicos, setServicos] = useState<Servico[]>([])
  const [clienteNome, setClienteNome] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getServicos(), getCliente(id).catch(() => null)])
      .then(([data, cliente]) => {
        setServicos(
          data.map((s) => ({
            id: s.id,
            nome: (s as Record<string, unknown>).nome as string,
            codigo: ((s as Record<string, unknown>).codigo as string | undefined) ?? null,
            valorPadrao: ((s as Record<string, unknown>).valorPadrao as number) ?? null,
          }))
        )
        setClienteNome(((cliente as Record<string, unknown> | null)?.razaoSocial as string | undefined) ?? undefined)
      })
      .catch((err) => {
        const message = getErrorMessage(err, 'Nao foi possivel carregar os servicos cadastrados.')
        setError(message)
        toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        {error}
      </div>
    )
  }

  return <ClienteServicoForm clienteId={id} clienteNome={clienteNome} servicos={servicos} />
}
