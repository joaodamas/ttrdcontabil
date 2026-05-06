'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getDocument } from '@/lib/firestore-client'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { buttonVariants } from '@/components/ui/button'
import { Loader2, AlertTriangle } from 'lucide-react'

export default function Page() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<(Record<string, unknown> & { id: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    setErro(null)
    queueMicrotask(() => {
      void getDocument<Record<string, unknown>>('clientes', id)
        .then((doc) => {
          if (!active) return
          if (doc) {
            setData(doc as Record<string, unknown> & { id: string })
          } else {
            setData(null)
            setErro('Cliente não encontrado ou sem permissão de acesso.')
          }
        })
        .catch(() => {
          if (!active) return
          setData(null)
          setErro('Não foi possível carregar o cliente para edição.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    })
    return () => { active = false }
  }, [id])

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
        <AlertTriangle className="h-6 w-6 text-warning" />
        <div>
          <h1 className="text-base font-semibold">Cliente indisponível</h1>
          <p className="mt-1 text-sm text-muted-foreground">{erro ?? 'Não foi possível carregar este cliente.'}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/clientes" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Voltar para clientes
          </Link>
          <Link href={`/clientes/${id}`} className={buttonVariants({ size: 'sm' })}>
            Ver completo
          </Link>
        </div>
      </div>
    )
  }

  return <ClienteForm initialData={data} />
}
