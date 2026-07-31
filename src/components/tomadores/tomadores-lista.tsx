'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Ban, FileSpreadsheet, Pencil, Plus, RotateCcw, Search, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { InlineAlert } from '@/components/ui/inline-alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DataTableShell } from '@/components/ui/data-table-shell'
import { TableEmptyState } from '@/components/ui/empty-state'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCpfCnpj } from '@/lib/utils'
import { getErrorMessage } from '@/lib/error-message'

import { useCarteiraTomadores } from '@/features/tomadores/hooks'
import { useInvalidateTomadores } from '@/features/tomadores/queries'
import { definirTomadorAtivo } from '@/features/tomadores/services'
import type { PrestadorResumo, TomadorRecord } from '@/features/tomadores/types'
import { somenteDigitos } from '@/features/tomadores/validacao'
import { useInvalidateContratosRecorrentes } from '@/features/nfse-recorrentes/queries'
import { TomadorForm } from './tomador-form'

/** Traço em vez de zero: zero é uma afirmação sobre o mundo, traço é ausência. */
const TRACO = '—'

interface TomadoresListaProps {
  clienteId: string
  prestador: PrestadorResumo
  /** Escrita segue o PERFIL (admin/fiscal), não a tela — ver comentário na página. */
  podeEditar: boolean
  /** Contratos vigentes por tomador, para avisar antes de inativar. */
  contratosVigentesPorTomador: ReadonlyMap<string, number>
}

export function TomadoresLista({
  clienteId, prestador, podeEditar, contratosVigentesPorTomador,
}: TomadoresListaProps) {
  const [busca, setBusca] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [emEdicao, setEmEdicao] = useState<TomadorRecord | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [paraInativar, setParaInativar] = useState<TomadorRecord | null>(null)

  const invalidarTomadores = useInvalidateTomadores()
  const invalidarContratos = useInvalidateContratosRecorrentes()

  const { todos, visiveis, isLoading, isError, error, refetch, truncado } = useCarteiraTomadores({
    clienteId, busca, incluirInativos,
  })

  const inativos = useMemo(() => todos.filter((t) => t.ativo === false).length, [todos])

  // Documento → id, para o formulário recusar o mesmo CNPJ duas vezes. Sai da
  // lista completa (inclusive inativos): tomador inativo continua ocupando o
  // documento na carteira, e cadastrar um clone criaria dois cadastros do mesmo
  // tomador sem ninguém perceber.
  const documentosDaCarteira = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const t of todos) {
      const digits = somenteDigitos(t.cpfCnpj)
      if (digits) mapa.set(digits, t.id)
    }
    return mapa
  }, [todos])

  function abrirNovo() {
    setEmEdicao(null)
    setFormAberto(true)
  }

  function abrirEdicao(tomador: TomadorRecord) {
    setEmEdicao(tomador)
    setFormAberto(true)
  }

  async function alternarAtivo(tomador: TomadorRecord, ativo: boolean) {
    try {
      await definirTomadorAtivo(tomador.id, ativo)
      toast.success(ativo ? 'Tomador reativado.' : 'Tomador inativado.')
      invalidarTomadores()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível alterar o tomador. Verifique suas permissões.'))
    }
  }

  const contratosDoAlvo = paraInativar ? (contratosVigentesPorTomador.get(paraInativar.id) ?? 0) : 0

  return (
    <div className="space-y-4">
      {isError && (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar a carteira de tomadores"
          description={getErrorMessage(error, 'Não trate esta lista como vazia — ela não foi lida. Verifique a conexão e tente de novo.')}
          action={{ label: 'Tentar novamente', onClick: () => void refetch() }}
        />
      )}

      {truncado && (
        <InlineAlert
          tone="warning"
          title="Carteira maior que o limite de leitura"
          description="A lista abaixo está incompleta — me avise para paginar a leitura antes de usar estes números."
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CPF/CNPJ"
            className="pl-8"
            aria-label="Buscar tomador"
          />
        </div>
        <Button
          type="button"
          variant={incluirInativos ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIncluirInativos((v) => !v)}
          disabled={inativos === 0 && !incluirInativos}
        >
          {incluirInativos ? 'Ocultar inativos' : `Mostrar inativos (${inativos})`}
        </Button>
        <Link
          href={`/clientes/${clienteId}/tomadores/importar`}
          className="inline-flex"
        >
          <Button type="button" variant="outline" size="sm">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Importar planilha
          </Button>
        </Link>
        {podeEditar && (
          <Button type="button" size="sm" onClick={abrirNovo}>
            <Plus className="h-3.5 w-3.5" />
            Novo tomador
          </Button>
        )}
      </div>

      <DataTableShell
        title="Carteira de tomadores"
        description={
          isError
            ? 'Não foi possível ler a carteira.'
            : `${visiveis.length} de ${todos.length} tomador(es) — quem recebe as notas emitidas por ${prestador.razaoSocial}.`
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / razão social</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Município</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="text-center">Contratos</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowSkeleton cols={7} rows={5} />
            ) : isError ? (
              <TableEmptyState
                colSpan={7}
                icon={Users}
                title="Carteira não carregada"
                description="A leitura falhou. Use “Tentar novamente” acima — a lista vazia aqui não significa carteira vazia."
              />
            ) : visiveis.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={Users}
                title={
                  todos.length === 0
                    ? 'Nenhum tomador nesta carteira ainda'
                    : 'Nenhum tomador encontrado com esse filtro'
                }
                description={
                  todos.length === 0
                    ? 'O tomador é o cliente do seu cliente: quem contrata o serviço e recebe a nota. Cadastre um a um, ou suba a carteira inteira por planilha.'
                    : 'Ajuste a busca ou mostre também os tomadores inativos.'
                }
                action={
                  todos.length === 0 && podeEditar
                    ? { label: 'Cadastrar tomador', onClick: abrirNovo }
                    : undefined
                }
                secondaryAction={
                  todos.length === 0
                    ? { label: 'Importar planilha', href: `/clientes/${clienteId}/tomadores/importar` }
                    : undefined
                }
              />
            ) : (
              visiveis.map((tomador) => {
                const contratos = contratosVigentesPorTomador.get(tomador.id) ?? 0
                const municipio = [tomador.endereco?.municipio, tomador.endereco?.uf]
                  .filter(Boolean)
                  .join(' / ')
                return (
                  <TableRow key={tomador.id}>
                    <TableCell className="font-medium">{tomador.razaoSocial || TRACO}</TableCell>
                    <TableCell className="font-mono text-xs">{formatCpfCnpj(tomador.cpfCnpj)}</TableCell>
                    <TableCell>{municipio || TRACO}</TableCell>
                    <TableCell className="max-w-56 truncate">{tomador.email || TRACO}</TableCell>
                    <TableCell className="text-center tabular-nums">{contratos > 0 ? contratos : TRACO}</TableCell>
                    <TableCell>
                      {tomador.ativo === false ? (
                        <Badge variant="secondary">Inativo</Badge>
                      ) : (
                        <Badge variant="success">Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {podeEditar ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => abrirEdicao(tomador)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                          {tomador.ativo === false ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => void alternarAtivo(tomador, true)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reativar
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setParaInativar(tomador)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Inativar
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
        <TomadorForm
          key={emEdicao?.id ?? 'novo'}
          open={formAberto}
          onOpenChange={(aberto) => {
            setFormAberto(aberto)
            if (!aberto) setEmEdicao(null)
          }}
          prestador={prestador}
          tomador={emEdicao}
          documentosDaCarteira={documentosDaCarteira}
          onSaved={({ contratosSincronizados }) => {
            invalidarTomadores()
            // O cadastro do tomador é denormalizado nos contratos: se algum foi
            // regravado, a lista de contratos na aba ao lado está velha.
            if (contratosSincronizados > 0) invalidarContratos()
          }}
        />
      )}

      <ConfirmDialog
        open={!!paraInativar}
        onOpenChange={(aberto) => { if (!aberto) setParaInativar(null) }}
        title="Inativar este tomador?"
        description={
          contratosDoAlvo > 0
            ? `${paraInativar?.razaoSocial} tem ${contratosDoAlvo} contrato(s) recorrente(s) vigente(s). Inativar o tomador NÃO suspende os contratos — suspenda cada um na aba de contratos, senão a nota continua sendo emitida.`
            : 'Ele sai das opções de contrato novo, mas continua no histórico das notas já emitidas. Dá para reativar depois.'
        }
        confirmLabel="Inativar"
        destructive
        onConfirm={async () => {
          if (paraInativar) await alternarAtivo(paraInativar, false)
          setParaInativar(null)
        }}
      />
    </div>
  )
}
