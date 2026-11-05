'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { montarFichaCliente } from '@/lib/cliente-ficha'
import type { CredenciaisCliente } from '@/lib/clientes-credenciais'
import { podeVerCredenciais } from '@/lib/permissions'
import { carregarCredenciaisCliente } from '@/features/clientes/credenciais'
import { cn, formatCpfCnpj } from '@/lib/utils'

/**
 * Ficha de cadastro completa do cliente — todos os campos do formulário,
 * agrupados nas mesmas seções, com o que está preenchido e o que está em
 * branco. Senhas ficam ocultas; administrador e fiscal podem revelar uma a uma
 * — só então elas são lidas de clientes_credenciais. Os demais perfis veem só
 * se cada senha está preenchida (clientes.credenciaisPreenchidas).
 */
export function ClienteFichaCompleta({ cliente, clienteId }: { cliente: Record<string, unknown>; clienteId: string }) {
  const { usuario } = useAuth()
  const podeRevelar = podeVerCredenciais(usuario)
  const [reveladas, setReveladas] = useState<Set<string>>(new Set())
  const [credenciais, setCredenciais] = useState<CredenciaisCliente | null>(null)
  const [carregando, setCarregando] = useState(false)
  const ficha = montarFichaCliente(cliente, credenciais)
  const pct = Math.round((ficha.preenchidos / ficha.total) * 100)

  async function alternar(key: string) {
    if (!credenciais) {
      setCarregando(true)
      try {
        setCredenciais(await carregarCredenciaisCliente(clienteId, cliente))
      } catch (err) {
        console.error('[ficha] credenciais', err)
        toast.error('Não foi possível carregar as senhas deste cliente.')
        return
      } finally {
        setCarregando(false)
      }
    }
    setReveladas((prev) => {
      const prox = new Set(prev)
      if (prox.has(key)) prox.delete(key)
      else prox.add(key)
      return prox
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{ficha.preenchidos}</strong> de {ficha.total} campos preenchidos ({pct}%)
        </p>
        <Link href={`/clientes/${clienteId}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Pencil className="h-3.5 w-3.5" />
          Editar cadastro
        </Link>
      </div>

      {ficha.secoes.map((secao) => (
        <section key={secao.titulo} className="rounded-xl border border-border/70">
          <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{secao.titulo}</h3>
            <Badge variant={secao.preenchidos === secao.campos.length ? 'success' : secao.preenchidos === 0 ? 'secondary' : 'warning'}>
              {secao.preenchidos}/{secao.campos.length}
            </Badge>
          </header>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {secao.campos.map((campo) => {
              const vazio = !campo.preenchido
              const oculto = campo.credencial && !reveladas.has(campo.key)
              const valor = campo.key === 'cpfCnpj' || campo.key === 'responsavelCpf' ? formatCpfCnpj(campo.valor) : campo.valor
              return (
                <div key={campo.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{campo.label}</dt>
                  <dd className={cn('mt-0.5 flex items-center gap-1.5 break-words font-medium', vazio && 'font-normal italic text-muted-foreground/70')}>
                    {vazio ? 'em branco' : oculto ? '••••••••' : valor}
                    {campo.credencial && !vazio && podeRevelar && (
                      <button
                        type="button"
                        disabled={carregando}
                        onClick={() => void alternar(campo.key)}
                        aria-label={oculto ? `Mostrar ${campo.label}` : `Ocultar ${campo.label}`}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : oculto ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
    </div>
  )
}
