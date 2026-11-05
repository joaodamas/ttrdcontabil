'use client'

import { forwardRef, useState } from 'react'
import { Input } from './input'
import { formatBRL, parseBRL, sanitizeBRLInput } from '@/lib/currency-input'

interface CurrencyInputProps
  extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value' | 'type' | 'defaultValue'> {
  value?: number | null
  /** Emite o valor numérico (null quando o campo está vazio ou inválido). */
  onChange?: (value: number | null) => void
}

/**
 * Campo monetário em BRL no padrão pt-BR ("1.234,56").
 * Digita-se com vírgula decimal; ao sair do campo o valor é formatado.
 * Não altera o valor com a roda do mouse (é type="text").
 * Compatível com react-hook-form via Controller:
 *
 * @example
 * <Controller name="valor" control={control} render={({ field }) => (
 *   <CurrencyInput id="valor" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
 * )} />
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput({ value, onChange, onFocus, onBlur, placeholder = '0,00', ...props }, ref) {
    const [focused, setFocused] = useState(false)
    const [text, setText] = useState(() => formatBRL(value))

    const display = focused ? text : formatBRL(value)

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={display}
        onFocus={(e) => {
          setText(formatBRL(value))
          setFocused(true)
          onFocus?.(e)
        }}
        onChange={(e) => {
          const limpo = sanitizeBRLInput(e.target.value)
          setText(limpo)
          onChange?.(parseBRL(limpo))
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
      />
    )
  }
)
