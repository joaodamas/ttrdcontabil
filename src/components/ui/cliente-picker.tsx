'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn, formatCpfCnpj } from '@/lib/utils'
import { filtrarCliente, termosBuscaCliente, type ClienteOpcao } from '@/lib/cliente-busca'

interface ClientePickerProps {
  clientes: ClienteOpcao[]
  value?: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  /** Rótulo da opção "vazia" (ex.: "Nenhum", "Todos os clientes"). Ausente = sem opção vazia. */
  opcaoVazia?: string
  className?: string
  id?: string
}

/**
 * Seletor de cliente com busca por razão social, nome fantasia ou CNPJ/CPF
 * (com ou sem pontuação). Substitui o <Select> simples: com 100+ clientes a
 * lista ficava presa na largura do botão, cortando os nomes, e sem filtro.
 */
export function ClientePicker({
  clientes,
  value,
  onChange,
  placeholder = 'Selecione o cliente',
  loading,
  disabled,
  opcaoVazia,
  className,
  id,
}: ClientePickerProps) {
  const [open, setOpen] = useState(false)
  const selecionado = value ? clientes.find((c) => c.id === value) : undefined
  const rotulo = selecionado?.razaoSocial ?? (loading ? 'Carregando...' : value ? '—' : opcaoVazia ?? placeholder)

  function escolher(novo: string | null) {
    onChange(novo)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled || loading}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          !selecionado && 'text-muted-foreground',
          className,
        )}
      >
        <span className="truncate text-left">{rotulo}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[min(520px,calc(100vw-2rem))] p-0" align="start">
        <Command filter={filtrarCliente}>
          <CommandInput placeholder="Buscar por nome ou CNPJ..." />
          <CommandList className="max-h-[min(360px,50vh)]">
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {opcaoVazia && (
                <CommandItem value={`__vazio__ ${opcaoVazia}`} onSelect={() => escolher(null)}>
                  <Check className={cn('size-3.5', value ? 'opacity-0' : 'opacity-100')} />
                  <span className="text-muted-foreground">{opcaoVazia}</span>
                </CommandItem>
              )}
              {clientes.map((c) => (
                <CommandItem key={c.id} value={termosBuscaCliente(c)} onSelect={() => escolher(c.id)} className="items-start">
                  <Check className={cn('mt-0.5 size-3.5 shrink-0', c.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0">
                    <span className="block text-sm leading-snug">{c.razaoSocial}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[c.cpfCnpj ? formatCpfCnpj(c.cpfCnpj) : null, c.nomeFantasia && c.nomeFantasia !== c.razaoSocial ? c.nomeFantasia : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
