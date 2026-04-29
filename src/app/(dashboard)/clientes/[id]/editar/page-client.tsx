'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getDocument } from '@/lib/firestore-client'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { Loader2 } from 'lucide-react'

export default function Page() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<(Record<string, unknown> & { id: string }) | null>(null)

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => {
      void getDocument<Record<string, unknown>>('clientes', id).then((doc) => {
        if (doc) setData(doc as Record<string, unknown> & { id: string })
      })
    })
  }, [id])

  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }
  return <ClienteForm initialData={data} />
}
