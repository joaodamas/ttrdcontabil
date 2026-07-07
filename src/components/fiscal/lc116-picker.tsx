'use client'

import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { LC116_ITENS } from '@/lib/lc116'
import { cn } from '@/lib/utils'

interface Lc116PickerProps {
  value?: string | null
  onChange: (codigo: string) => void
  placeholder?: string
}

export function Lc116Picker({ value, onChange, placeholder = 'Buscar item (código ou palavra-chave)' }: Lc116PickerProps) {
  const [open, setOpen] = useState(false)
  const selecionado = LC116_ITENS.find((i) => i.codigo === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none',
          !selecionado && 'text-muted-foreground'
        )}
      >
        <span className="truncate text-left">
          {selecionado ? `${selecionado.codigo} — ${selecionado.descricao}` : value || placeholder}
        </span>
        <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite o código (ex: 17.19) ou uma palavra-chave..." />
          <CommandList>
            <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
            <CommandGroup>
              {LC116_ITENS.map((item) => (
                <CommandItem
                  key={item.codigo}
                  value={`${item.codigo} ${item.descricao} ${item.grupo}`}
                  onSelect={() => {
                    onChange(item.codigo)
                    setOpen(false)
                  }}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-mono text-xs font-semibold">{item.codigo}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{item.descricao}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
