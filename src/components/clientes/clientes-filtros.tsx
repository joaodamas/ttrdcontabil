'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

export function ClientesFiltros({
  busca,
  status,
}: {
  busca: string
  status: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const buscaTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => { if (buscaTimeoutRef.current) clearTimeout(buscaTimeoutRef.current) }
  }, [])

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      params.delete('page')
      startTransition(() => {
        router.push(`/clientes?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const limpar = () => {
    startTransition(() => {
      router.push('/clientes')
    })
  }

  const temFiltros = busca || status

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CNPJ..."
          defaultValue={busca}
          className="pl-9"
          onChange={(e) => {
            const val = e.target.value
            if (buscaTimeoutRef.current) clearTimeout(buscaTimeoutRef.current)
            buscaTimeoutRef.current = setTimeout(() => update('busca', val), 400)
          }}
        />
      </div>

      <Select defaultValue={status || 'all'} onValueChange={(v) => update('status', v === 'all' ? '' : (v ?? ''))}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="ativo">Ativo</SelectItem>
          <SelectItem value="inativo">Inativo</SelectItem>
          <SelectItem value="suspenso">Suspenso</SelectItem>
        </SelectContent>
      </Select>

      {temFiltros && (
        <Button variant="ghost" size="sm" onClick={limpar} disabled={isPending}>
          <X className="w-4 h-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  )
}
