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
  /**
   * Só lista opções depois de digitar este número de caracteres. Evita
   * escolher o primeiro item da lista por engano (aconteceu com NBS e
   * indicador de operação: a nota saiu com o 1º NBS — construção — para um
   * serviço de TI). As `sugeridas` aparecem mesmo sem digitar.
   */
  buscaMinima?: number
  /** Opções recomendadas (ex.: NBS da correlação oficial do serviço), mostradas primeiro. */
  sugeridas?: OpcaoCatalogo[]
  rotuloSugeridas?: string
}

/**
 * Seletor com busca para as listas oficiais da NFS-e Nacional (código de
 * tributação nacional, NBS, municípios, países, campos codificados do XSD).
 * Busca por código (com ou sem pontuação) ou descrição, sem acento.
 */
export function CatalogoPicker({
  opcoes, value, onChange, placeholder = 'Selecione', buscaPlaceholder = 'Buscar por código ou descrição...',
  disabled, permitirLimpar, className, buscaMinima = 0, sugeridas, rotuloSugeridas = 'Sugeridas para este serviço',
}: CatalogoPickerProps) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  // Valores antigos podem vir sem pontuação (ex.: NBS '115011000' copiado do XML).
  const digitos = (v: string) => v.replace(/[^0-9A-Za-z]/g, '')
  const selecionado = value ? opcoes.find((o) => o.codigo === value || digitos(o.codigo) === digitos(value)) : undefined
  const buscaCurta = busca.trim().length < buscaMinima
  const resultado = useMemo(() => (buscaCurta ? [] : buscarOpcoes(opcoes, busca, 80)), [opcoes, busca, buscaCurta])
  const sugeridasVisiveis = useMemo(
    () => (sugeridas && sugeridas.length > 0 ? (busca.trim() ? buscarOpcoes(sugeridas, busca, 20) : sugeridas) : []),
    [sugeridas, busca],
  )
  const codigosSugeridos = new Set(sugeridasVisiveis.map((o) => o.codigo))
  const demais = resultado.filter((o) => !codigosSugeridos.has(o.codigo))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        title={selecionado ? `${selecionado.rotulo} — ${selecionado.descricao}` : undefined}
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
            {buscaCurta && sugeridasVisiveis.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Digite parte da descrição (ou o código) para ver as opções.
              </p>
            ) : (
              <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            )}
            {permitirLimpar && value && (
              <CommandGroup>
                <CommandItem value="__limpar__" onSelect={() => { onChange(null); setOpen(false) }}>
                  <span className="text-muted-foreground">Limpar seleção</span>
                </CommandItem>
              </CommandGroup>
            )}
            {sugeridasVisiveis.length > 0 && (
              <CommandGroup heading={rotuloSugeridas}>
                {sugeridasVisiveis.map((o) => (
                  <ItemCatalogo key={`s-${o.codigo}`} opcao={o} marcado={o.codigo === selecionado?.codigo} onSelect={() => { onChange(o.codigo); setOpen(false) }} />
                ))}
              </CommandGroup>
            )}
            {demais.length > 0 && (
              <CommandGroup heading={sugeridasVisiveis.length > 0 ? 'Outras opções' : undefined}>
                {demais.map((o) => (
                  <ItemCatalogo key={o.codigo} opcao={o} marcado={o.codigo === selecionado?.codigo} onSelect={() => { onChange(o.codigo); setOpen(false) }} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ItemCatalogo({ opcao: o, marcado, onSelect }: { opcao: OpcaoCatalogo; marcado: boolean; onSelect: () => void }) {
  return (
    <CommandItem value={o.codigo} onSelect={onSelect} className="items-start">
      <Check className={cn('mt-0.5 size-3.5 shrink-0', marcado ? 'opacity-100' : 'opacity-0')} />
      <span className="min-w-0">
        <span className="block font-mono text-xs font-semibold">{o.rotulo}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{o.descricao}</span>
      </span>
    </CommandItem>
  )
}
