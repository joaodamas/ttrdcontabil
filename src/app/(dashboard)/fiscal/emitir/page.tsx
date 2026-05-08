'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function FiscalEmitirRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const next = new URLSearchParams()
    next.set('emitir', '1')

    const clienteId = searchParams.get('clienteId')
    const rascunhoId = searchParams.get('rascunhoId')

    if (clienteId) next.set('clienteId', clienteId)
    if (rascunhoId) next.set('rascunhoId', rascunhoId)

    router.replace(`/fiscal?${next.toString()}`)
  }, [router, searchParams])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Abrindo emissão assistida...
      </div>
    </div>
  )
}
