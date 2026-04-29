'use client'

import { forwardRef, useState, useCallback } from 'react'
import { Input } from './input'
import { cn, validateCpf, validateCnpj } from '@/lib/utils'
import { CheckCircle2, AlertCircle } from 'lucide-react'

type TipoPessoa = 'pf' | 'pj' | 'auto'

interface CpfCnpjInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> {
  /** Controla qual máscara aplicar. 'auto' detecta pelo comprimento. Padrão: 'auto'. */
  tipoPessoa?: TipoPessoa
  value?: string
  onChange?: (value: string, valid: boolean) => void
  /** Se true, exibe ícone de validação no lado direito. Padrão: true. */
  showValidation?: boolean
}

function maskCpfCnpj(raw: string, tipo: TipoPessoa): string {
  const digits = raw.replace(/\D/g, '')
  if (tipo === 'pf' || (tipo === 'auto' && digits.length <= 11)) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function validateValue(digits: string, tipo: TipoPessoa): boolean | null {
  if (tipo === 'pf' || (tipo === 'auto' && digits.length === 11)) {
    return digits.length === 11 ? validateCpf(digits) : null
  }
  if (tipo === 'pj' || (tipo === 'auto' && digits.length === 14)) {
    return digits.length === 14 ? validateCnpj(digits) : null
  }
  return null
}

/**
 * Input de CPF/CNPJ com máscara automática e validação visual em tempo real.
 * Compatível com react-hook-form (usa forwardRef).
 *
 * @example
 * <CpfCnpjInput
 *   tipoPessoa={watch('tipoPessoa')}
 *   value={field.value}
 *   onChange={(val, valid) => { field.onChange(val); setIsValid(valid) }}
 * />
 */
export const CpfCnpjInput = forwardRef<HTMLInputElement, CpfCnpjInputProps>(
  function CpfCnpjInput(
    { tipoPessoa = 'auto', value = '', onChange, showValidation = true, className, ...props },
    ref
  ) {
    const [touched, setTouched] = useState(false)

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const maxLen = tipoPessoa === 'pf' ? 14 : tipoPessoa === 'pj' ? 18 : 18
        const masked = maskCpfCnpj(e.target.value, tipoPessoa).slice(0, maxLen)
        const digits = masked.replace(/\D/g, '')
        const valid  = validateValue(digits, tipoPessoa)
        onChange?.(masked, valid ?? false)
      },
      [tipoPessoa, onChange]
    )

    const digits    = value.replace(/\D/g, '')
    const validity  = touched ? validateValue(digits, tipoPessoa) : null
    const isValid   = validity === true
    const isInvalid = validity === false && digits.length > 0

    return (
      <div className="relative">
        <Input
          ref={ref}
          {...props}
          value={maskCpfCnpj(value, tipoPessoa)}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          className={cn(
            'pr-8',
            isInvalid && 'border-destructive focus-visible:ring-destructive/30',
            className
          )}
          maxLength={tipoPessoa === 'pf' ? 14 : 18}
        />
        {showValidation && touched && (isValid || isInvalid) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            {isValid   && <CheckCircle2 className="w-4 h-4 text-success" />}
            {isInvalid && <AlertCircle  className="w-4 h-4 text-destructive" />}
          </div>
        )}
      </div>
    )
  }
)
