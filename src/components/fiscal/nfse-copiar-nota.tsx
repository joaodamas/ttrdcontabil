'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Copy, FileStack, History, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCpfCnpj, formatCurrency } from '@/lib/utils'
import {
  dataEmissaoDe,
  formatarCompetencia,
  lerCompetencia,
  type Competencia,
  type NotaEmitidaParaCopia,
} from '@/lib/nfse-modelo'

interface Props {
  notas: NotaEmitidaParaCopia[]
  loading: boolean
  temModelo: boolean
  /** competenciaId → mês/ano, para notas antigas sem dataCompetencia gravada. */
  competenciasPorId: Record<string, Competencia>
  onUsarNota: (nota: NotaEmitidaParaCopia) => void
  onUsarModelo: () => void
}

function competenciaDaNota(nota: NotaEmitidaParaCopia, porId: Record<string, Competencia>): string {
  const c = lerCompetencia(nota.dataCompetencia) ?? (nota.competenciaId ? porId[nota.competenciaId] : undefined)
  return c ? formatarCompetencia(c) : '—'
}

function resumo(nota: NotaEmitidaParaCopia, porId: Record<string, Competencia>) {
  return {
    numero: nota.numeroNfse ? `nº ${nota.numeroNfse}` : 'sem número',
    competencia: competenciaDaNota(nota, porId),
    tomador: nota.tomadorNome || (nota.tomadorCpfCnpj ? formatCpfCnpj(nota.tomadorCpfCnpj) : 'Tomador não informado'),
    valor: typeof nota.valorServico === 'number' ? formatCurrency(nota.valorServico) : '—',
    emissao: dataEmissaoDe(nota)?.toLocaleDateString('pt-BR') ?? null,
  }
}

/**
 * "Copiar de nota anterior": a última NFS-e do prestador, o histórico recente
 * e o modelo padrão do cliente. Só escolhe — quem aplica no formulário é o
 * NfseEmissaoForm (ver valoresDaNotaEmitida em src/lib/nfse-modelo.ts).
 */
export function NfseCopiarNota({ notas, loading, temModelo, competenciasPorId, onUsarNota, onUsarModelo }: Props) {
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const ultima = notas[0]

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Buscando as notas emitidas deste cliente…
      </div>
    )
  }

  if (!ultima && !temModelo) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        Nenhuma NFS-e emitida pela plataforma para este cliente ainda — preencha abaixo. Depois da primeira, dá para
        copiar dela ou salvar um modelo padrão.
      </p>
    )
  }

  const r = ultima ? resumo(ultima, competenciasPorId) : null

  return (
    <div className="space-y-2.5 rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Copy className="h-3.5 w-3.5 text-primary" />
        Copiar de nota anterior
      </p>
      {r && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Última nota:</span>{' '}
          {r.numero} — competência {r.competencia} — {r.tomador} — <span className="tabular-nums">{r.valor}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {ultima && (
          <Button type="button" size="sm" onClick={() => onUsarNota(ultima)}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Usar esta nota como base
          </Button>
        )}
        {notas.length > 1 && (
          <Button type="button" size="sm" variant="outline" onClick={() => setHistoricoAberto((v) => !v)} aria-expanded={historicoAberto}>
            <History className="mr-1.5 h-3.5 w-3.5" />
            Escolher outra do histórico
            {historicoAberto ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
          </Button>
        )}
        {temModelo && (
          <Button type="button" size="sm" variant="outline" onClick={onUsarModelo}>
            <FileStack className="mr-1.5 h-3.5 w-3.5" />
            Usar modelo padrão do cliente
          </Button>
        )}
      </div>
      {historicoAberto && notas.length > 1 && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border bg-background" aria-label="Notas emitidas deste cliente">
          {notas.map((nota) => {
            const n = resumo(nota, competenciasPorId)
            return (
              <li key={nota.id}>
                <button
                  type="button"
                  onClick={() => { onUsarNota(nota); setHistoricoAberto(false) }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                >
                  <span className="font-medium text-foreground">
                    {n.numero} · competência {n.competencia} · <span className="tabular-nums">{n.valor}</span>
                  </span>
                  <span className="line-clamp-1 text-muted-foreground">
                    {n.tomador}{n.emissao ? ` · emitida em ${n.emissao}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
