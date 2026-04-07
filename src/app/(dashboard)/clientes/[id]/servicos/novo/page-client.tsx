'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { ClienteServicoForm } from '@/components/clientes/cliente-servico-form'
import { getServicos } from '@/lib/firestore-client'
import { Loader2 } from 'lucide-react'

interface Servico {
  id: string
  nome: string
  valorPadrao: number | null
}

export default function Page() {
  const { id } = useParams<{ id: string }>()
  const [servicos, setServicos] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getServicos()
      .then((data) => {
        setServicos(
          data.map((s) => ({
            id: s.id,
            nome: (s as Record<string, unknown>).nome as string,
            valorPadrao: ((s as Record<string, unknown>).valorPadrao as number) ?? null,
          }))
        )
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return <ClienteServicoForm clienteId={id} servicos={servicos} />
}
