'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

interface UseActionOptions {
  /** Mensagem exibida no toast em caso de sucesso. */
  successMessage?: string
  /** Mensagem exibida no toast em caso de erro. Se não fornecida, usa a mensagem do erro. */
  errorMessage?: string
  /** Callback executado após sucesso. */
  onSuccess?: () => void | Promise<void>
}

/**
 * Hook para encapsular ações assíncronas com loading state e feedback via toast.
 *
 * @example
 * const { run, loading } = useAction({
 *   successMessage: 'Cliente salvo!',
 *   onSuccess: () => router.push('/clientes'),
 * })
 *
 * <Button disabled={loading} onClick={() => run(() => saveCliente(data))}>
 *   {loading ? <Loader2 className="animate-spin" /> : 'Salvar'}
 * </Button>
 */
export function useAction(options: UseActionOptions = {}) {
  const [loading, setLoading] = useState(false)

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setLoading(true)
      try {
        await fn()
        if (options.successMessage) {
          toast.success(options.successMessage)
        }
        if (options.onSuccess) {
          await options.onSuccess()
        }
      } catch (err) {
        const msg =
          options.errorMessage ??
          (err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.')
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.successMessage, options.errorMessage, options.onSuccess]
  )

  return { run, loading }
}
