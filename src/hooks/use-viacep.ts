'use client'

import { useState, useCallback } from 'react'

export interface ViaCepResult {
  logradouro: string
  bairro:     string
  cidade:     string
  uf:         string
  cep:        string
}

interface UseViaCepReturn {
  /** Busca o endereço para o CEP informado. Retorna null se não encontrado. */
  buscar:   (cep: string) => Promise<ViaCepResult | null>
  loading:  boolean
  error:    string | null
}

/**
 * Hook para consulta de endereço via ViaCEP.
 * Dispara automaticamente ao receber um CEP completo (8 dígitos).
 *
 * @example
 * const { buscar, loading } = useViaCep()
 *
 * // No onChange do input de CEP:
 * const resultado = await buscar(cepDigitado)
 * if (resultado) {
 *   setValue('logradouro', resultado.logradouro)
 *   setValue('cidade',     resultado.cidade)
 *   setValue('uf',         resultado.uf)
 * }
 */
export function useViaCep(): UseViaCepReturn {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const buscar = useCallback(async (cepRaw: string): Promise<ViaCepResult | null> => {
    const digits = cepRaw.replace(/\D/g, '')
    if (digits.length !== 8) return null

    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json() as Record<string, string>

      if (data.erro) {
        setError('CEP não encontrado.')
        return null
      }

      return {
        logradouro: data.logradouro ?? '',
        bairro:     data.bairro     ?? '',
        cidade:     data.localidade ?? '',
        uf:         data.uf         ?? '',
        cep:        data.cep        ?? '',
      }
    } catch {
      setError('Erro ao consultar o CEP. Verifique sua conexão.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { buscar, loading, error }
}
