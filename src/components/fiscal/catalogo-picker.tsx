'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { buscarOpcoes, type OpcaoCatalogo } from '@/lib/nfse-dominios'
import { cn } from '@/lib/utils'

interface CatalogoPickerProps {
  opcoes: OpcaoCatalogo[]
  value?: string | null
  onChange: (codigo: string | null) => void
  placeholder?: string
  buscaPlaceholder?: string
  disabled?: boolean
  permitirLimpar?: boolean
  className?: string
}

/**
 * Seletor com busca para as listas oficiais da NFS-e Nacional (código de
 * tributação nacional, NBS, municípios, países, campos codificados do XSD).
 * Busca por código (com ou sem pontuação) ou descrição, sem acento.
 */
export function CatalogoPicker({
  opcoes, value, onChange, placeholder = 'Selecione', buscaPlaceholder = 'Buscar por código ou descrição...',
  disabled, permitirLimpar, className,
}: CatalogoPickerProps) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const selecionado = value ? opcoes.find((o) => o.codigo === value) : undefined
  const resultado = useMemo(() => buscarOpcoes(opcoes, busca, 80), [opcoes, busca])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          !selecionado && 'text-muted-foreground',
          className,
        )}
      >
        <span className="truncate text-left">
          {selecionado ? `${selecionado.rotulo} — ${selecionado.descricao}` : value || placeholder}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[min(560px,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={buscaPlaceholder} value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-[min(360px,50vh)]">
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandGroup>
              {permitirLimpar && value && (
                <CommandItem value="__limpar__" onSelect={() => { onChange(null); setOpen(false) }}>
                  <span className="text-muted-foreground">Limpar seleção</span>
                </CommandItem>
              )}
              {resultado.map((o) => (
                <CommandItem key={o.codigo} value={o.codigo} onSelect={() => { onChange(o.codigo); setOpen(false) }} className="items-start">
                  <Check className={cn('mt-0.5 size-3.5 shrink-0', o.codigo === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-semibold">{o.rotulo}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">{o.descricao}</span>
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
