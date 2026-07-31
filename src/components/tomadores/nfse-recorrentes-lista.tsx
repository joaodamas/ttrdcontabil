'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pause, Play, Pencil, Plus, Repeat, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { InlineAlert } from '@/components/ui/inline-alert'
import { DataTableShell } from '@/components/ui/data-table-shell'
import { TableEmptyState } from '@/components/ui/empty-state'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCpfCnpj, formatCurrency, formatDate, tsToDate } from '@/lib/utils'
import { getErrorMessage } from '@/lib/error-message'

import type { PrestadorResumo, TomadorRecord } from '@/features/tomadores/types'
import { useContratosRecorrentes } from '@/features/nfse-recorrentes/hooks'
import { useInvalidateContratosRecorrentes } from '@/features/nfse-recorrentes/queries'
import { definirContratoAtivo } from '@/features/nfse-recorrentes/services'
import type { NfseRecorrenteRecord } from '@/features/nfse-recorrentes/types'
import { NfseRecorrenteForm } from './nfse-recorrente-form'

/** Traço em vez de zero: zero é uma afirmação sobre o mundo, traço é ausência. */
const TRACO = '—'

interface NfseRecorrentesListaProps {
  clienteId: string
  prestador: PrestadorResumo
  /** Carteira completa — o contrato em edição pode apontar para um tomador inativo. */
  tomadores: TomadorRecord[]
  podeEditar: boolean
  onIrParaTomadores: () => void
}

export function NfseRecorrentesLista({
  clienteId, prestador, tomadores, podeEditar, onIrParaTomadores,
}: NfseRecorrentesListaProps) {
  const [busca, setBusca] = useState('')
  const [incluirEncerrados, setIncluirEncerrados] = useState(true)
  const [emEdicao, setEmEdicao] = useState<NfseRecorrenteRecord | null>(null)
  const [formAberto, setFormAberto] = useState(false)

  const invalidarContratos = useInvalidateContratosRecorrentes()
  const { todos, visiveis, totalMensal, vigentes, isLoading, isError, error, refetch, truncado } =
    useContratosRecorrentes({ clienteId, busca, incluirEncerrados })

  const tomadoresAtivos = useMemo(() => tomadores.filter((t) => t.ativo !== false), [tomadores])

  // Contrato existente pode apontar para tomador já inativado: sem ele na lista,
  // o Select abriria vazio e uma edição de valor trocaria o tomador sem querer.
  const tomadoresDoForm = useMemo(() => {
    if (!emEdicao) return tomadoresAtivos
    const atual = tomadores.find((t) => t.id === emEdicao.tomadorId)
    if (!atual || tomadoresAtivos.some((t) => t.id === atual.id)) return tomadoresAtivos
    return [atual, ...tomadoresAtivos]
  }, [emEdicao, tomadores, tomadoresAtivos])

  function abrirNovo() {
    setEmEdicao(null)
    setFormAberto(true)
  }

  function abrirEdicao(contrato: NfseRecorrenteRecord) {
    setEmEdicao(contrato)
    setFormAberto(true)
  }

  async function alternarAtivo(contrato: NfseRecorrenteRecord, ativo: boolean) {
    try {
      await definirContratoAtivo(contrato.id, ativo)
      toast.success(ativo ? 'Contrato retomado.' : 'Contrato suspenso — para de gerar nota.')
      invalidarContratos()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível alterar o contrato. Verifique suas permissões.'))
    }
  }

  return (
    <div className="space-y-4">
      {isError && (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar os contratos recorrentes"
          description={getErrorMessage(error, 'Não trate esta lista como vazia — ela não foi lida. Verifique a conexão e tente de novo.')}
          action={{ label: 'Tentar novamente', onClick: () => void refetch() }}
        />
      )}

      {truncado && (
        <InlineAlert
          tone="warning"
          title="Mais contratos do que o limite de leitura"
          description="A lista e o total abaixo estão incompletos — me avise para paginar a leitura."
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por tomador, documento ou descrição"
            className="pl-8"
            aria-label="Buscar contrato"
          />
        </div>
        <Button
          type="button"
          variant={incluirEncerrados ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIncluirEncerrados((v) => !v)}
        >
          {incluirEncerrados ? 'Mostrando encerrados' : 'Só vigentes'}
        </Button>
        {podeEditar && (
          <Button type="button" size="sm" onClick={abrirNovo}>
            <Plus className="h-3.5 w-3.5" />
            Novo contrato
          </Button>
        )}
      </div>

      <DataTableShell
        title="Contratos de emissão recorrente"
        description={
          isError
            ? 'Não foi possível ler os contratos.'
            : `${vigentes} vigente(s) somando ${formatCurrency(totalMensal)} por mês.`
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tomador</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-center">Dia</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Próxima emissão</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowSkeleton cols={7} rows={4} />
            ) : isError ? (
              <TableEmptyState
                colSpan={7}
                icon={Repeat}
                title="Contratos não carregados"
                description="A leitura falhou. Use “Tentar novamente” acima — a lista vazia aqui não significa ausência de contratos."
              />
            ) : visiveis.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={Repeat}
                title={
                  todos.length === 0
                    ? 'Nenhum faturamento recorrente configurado'
                    : 'Nenhum contrato encontrado com esse filtro'
                }
                description={
                  todos.length === 0
                    ? 'O contrato diz quem fatura quem, de quanto e em que dia — é o que faz a nota do mês sair sozinha para cada tomador da carteira.'
                    : 'Ajuste a busca ou volte a exibir os contratos encerrados.'
                }
                action={
                  todos.length === 0 && podeEditar
                    ? tomadoresAtivos.length > 0
                      ? { label: 'Criar contrato', onClick: abrirNovo }
                      : { label: 'Cadastrar tomador primeiro', onClick: onIrParaTomadores }
                    : undefined
                }
              />
            ) : (
              visiveis.map((contrato) => {
                const inicio = tsToDate(contrato.dataInicio)
                const fim = tsToDate(contrato.dataFim)
                return (
                  <TableRow key={contrato.id}>
                    <TableCell>
                      <p className="font-medium">{contrato.tomadorNome || TRACO}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatCpfCnpj(contrato.tomadorCpfCnpj)}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-72">
                      <p className="truncate" title={contrato.descricao}>{contrato.descricao || TRACO}</p>
                      {contrato.issRetido && (
                        <Badge variant="outline" className="mt-1 text-[10px]">ISS retido</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(contrato.valor ?? 0)}</TableCell>
                    <TableCell className="text-center tabular-nums">{contrato.diaEmissao ?? TRACO}</TableCell>
                    <TableCell className="text-xs">
                      {inicio ? formatDate(inicio) : TRACO}
                      {fim ? ` até ${formatDate(fim)}` : ' (sem fim)'}
                    </TableCell>
                    <TableCell>
                      {contrato.proxima ? (
                        <span className="tabular-nums">{formatDate(contrato.proxima)}</span>
                      ) : (
                        <Badge variant="secondary">
                          {contrato.ativo === false ? 'Suspenso' : 'Encerrado'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {podeEditar ? (
                        <div className="flex justify-end gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => abrirEdicao(contrato)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                          {contrato.ativo === false ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => void alternarAtivo(contrato, true)}
                            >
                              <Play className="h-3.5 w-3.5" />
                              Retomar
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void alternarAtivo(contrato, false)}
                            >
                              <Pause className="h-3.5 w-3.5" />
                              Suspender
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Somente leitura</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </DataTableShell>

      {formAberto && (
        <NfseRecorrenteForm
          key={emEdicao?.id ?? 'novo'}
          open={formAberto}
          onOpenChange={(aberto) => {
            setFormAberto(aberto)
            if (!aberto) setEmEdicao(null)
          }}
          prestador={prestador}
          tomadores={tomadoresDoForm}
          contrato={emEdicao}
          onSaved={invalidarContratos}
        />
      )}
    </div>
  )
}
