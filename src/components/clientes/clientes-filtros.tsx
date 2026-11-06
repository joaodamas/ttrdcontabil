'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

/**
 * Busca e status da lista de clientes, controlados pela URL. Antes eram
 * `defaultValue`: "Limpar", o chip de filtro ou o Voltar mudavam a URL e a
 * lista, mas o campo continuava mostrando o texto antigo.
 */
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

  // Texto digitado; acompanha a URL quando ela muda por fora (Limpar, chip,
  // Voltar). O valor que este campo acabou de mandar não sobrescreve o que o
  // usuário continuou digitando enquanto a navegação acontecia.
  const [texto, setTexto] = useState(busca)
  const [buscaVista, setBuscaVista] = useState(busca)
  const [ultimoEnviado, setUltimoEnviado] = useState<string | null>(null)
  if (busca !== buscaVista) {
    setBuscaVista(busca)
    if (busca === ultimoEnviado) setUltimoEnviado(null)
    else setTexto(busca)
  }

  useEffect(() => {
    return () => { if (buscaTimeoutRef.current) clearTimeout(buscaTimeoutRef.current) }
  }, [])

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      params.delete('page')
      if (key === 'busca') setUltimoEnviado(value)
      const q = params.toString()
      const href = q ? `/clientes?${q}` : '/clientes'
      startTransition(() => {
        // Digitar na busca não empilha uma entrada de histórico por termo.
        if (key === 'busca') router.replace(href)
        else router.push(href)
      })
    },
    [router, searchParams]
  )

  const limpar = () => {
    if (buscaTimeoutRef.current) clearTimeout(buscaTimeoutRef.current)
    setUltimoEnviado(null)
    setTexto('')
    startTransition(() => {
      router.push('/clientes')
    })
  }

  const temFiltros = busca || status || texto

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar por nome ou CNPJ..."
          aria-label="Buscar clientes por nome ou CNPJ"
          value={texto}
          className="pl-9"
          onChange={(e) => {
            const val = e.target.value
            setTexto(val)
            if (buscaTimeoutRef.current) clearTimeout(buscaTimeoutRef.current)
            buscaTimeoutRef.current = setTimeout(() => update('busca', val), 400)
          }}
        />
      </div>

      <Select value={status || 'all'} onValueChange={(v) => update('status', v === 'all' ? '' : (v ?? ''))}>
        <SelectTrigger className="hidden w-40 sm:flex" aria-label="Status do cliente">
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
