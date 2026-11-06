'use client'

import { AlertTriangle, Ban } from 'lucide-react'
import type { AchadoFiscal } from '@/lib/nfse-pre-validacao'

function textoAchado(a: AchadoFiscal) {
  return a.codigoSefin ? `${a.mensagem} (evita a rejeição ${a.codigoSefin})` : a.mensagem
}

/**
 * Painel da pré-validação fiscal: bloqueios (impedem emitir/salvar) e avisos
 * (só alertam). Nada a mostrar = não renderiza.
 */
export function PainelPreValidacao({
  achados,
  tituloBloqueio = 'Emissão bloqueada — corrija antes de emitir',
  mostrarAvisos = true,
}: {
  achados: AchadoFiscal[]
  tituloBloqueio?: string
  mostrarAvisos?: boolean
}) {
  const bloqueios = achados.filter((a) => a.severidade === 'bloqueio')
  const avisos = mostrarAvisos ? achados.filter((a) => a.severidade === 'aviso') : []
  if (bloqueios.length === 0 && avisos.length === 0) return null
  return (
    <div className="space-y-2" data-testid="painel-pre-validacao">
      {bloqueios.length > 0 && (
        <div role="alert" className="space-y-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <Ban className="size-3.5 shrink-0" />
            {tituloBloqueio}
          </p>
          <ul className="space-y-1">
            {bloqueios.map((a) => (
              <li key={`${a.regra}-${a.mensagem}`} className="text-xs text-destructive/90">{textoAchado(a)}</li>
            ))}
          </ul>
        </div>
      )}
      {avisos.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <AlertTriangle className="size-3.5 shrink-0" />
            Avisos (não impedem a emissão)
          </p>
          <ul className="space-y-1">
            {avisos.map((a) => (
              <li key={`${a.regra}-${a.mensagem}`} className="text-xs text-warning/90">{textoAchado(a)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Mensagens do motor ao lado do campo (bloqueio em vermelho, aviso em amarelo). */
export function AchadosDoCampo({ achados }: { achados: AchadoFiscal[] }) {
  if (achados.length === 0) return null
  return (
    <>
      {achados.map((a) => (
        <p
          key={`${a.regra}-${a.mensagem}`}
          data-severidade={a.severidade}
          className={a.severidade === 'bloqueio' ? 'text-xs text-destructive' : 'text-xs text-warning'}
        >
          {a.severidade === 'bloqueio' ? 'Bloqueia a emissão: ' : 'Atenção: '}{textoAchado(a)}
        </p>
      ))}
    </>
  )
}
