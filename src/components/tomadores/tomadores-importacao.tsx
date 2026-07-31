'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, FileDown, Loader2, Upload, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getErrorMessage } from '@/lib/error-message'

import {
  gerarTemplateTomadoresXlsx,
  mapearParesDaPlanilha,
  parseTomadoresWorkbook,
  validarTomadorRow,
  type TomadorImportRow,
} from '@/features/tomadores/importacao'
import {
  COLECAO_TOMADORES,
  fetchCarteiraExistente,
  fetchPrestadoresPorDocumento,
} from '@/features/tomadores/services'
import { useInvalidateTomadores } from '@/features/tomadores/queries'
import { createDocument } from '@/lib/firestore-client'

type Etapa = 'inicio' | 'preview' | 'importando' | 'concluido'

interface Resultado {
  criados: number
  falhas: string[]
}

interface TomadoresImportacaoProps {
  /** Cliente de onde a importação foi aberta — usado só para orientar a leitura. */
  clienteId: string
  podeEditar: boolean
}

export function TomadoresImportacao({ clienteId, podeEditar }: TomadoresImportacaoProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const invalidarTomadores = useInvalidateTomadores()

  const [etapa, setEtapa] = useState<Etapa>('inicio')
  const [carregando, setCarregando] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<TomadorImportRow[]>([])
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const validas = useMemo(() => linhas.filter((l) => l.erros.length === 0), [linhas])
  const invalidas = useMemo(() => linhas.filter((l) => l.erros.length > 0), [linhas])
  const deOutrosClientes = useMemo(
    () => validas.filter((l) => l.clienteId && l.clienteId !== clienteId).length,
    [validas, clienteId]
  )

  async function handleArquivo(file: File) {
    setCarregando(true)
    setErroLeitura(null)
    try {
      const rows = await parseTomadoresWorkbook(file)

      // Os dois mapas são lidos AQUI, antes de validar: duplicata só existe em
      // relação ao que já está gravado, e o preview precisa dizer isso antes de
      // qualquer escrita.
      const [prestadoresPorDocumento, carteiraExistente] = await Promise.all([
        fetchPrestadoresPorDocumento(),
        fetchCarteiraExistente(),
      ])

      const paresNaPlanilha = mapearParesDaPlanilha(rows, prestadoresPorDocumento)
      const validadas = rows.map((row, i) =>
        validarTomadorRow(row, i + 1, { prestadoresPorDocumento, carteiraExistente, paresNaPlanilha })
      )

      setLinhas(validadas)
      setEtapa('preview')
    } catch (err) {
      const mensagem = getErrorMessage(err, 'Não foi possível ler a planilha.')
      setErroLeitura(mensagem)
      toast.error(mensagem)
    } finally {
      setCarregando(false)
    }
  }

  async function importar() {
    setEtapa('importando')
    setProgresso(0)
    const falhas: string[] = []
    let criados = 0
    let feitos = 0

    for (const linha of validas) {
      try {
        if (!linha.clienteId) throw new Error('prestador não resolvido')
        await createDocument(COLECAO_TOMADORES, {
          clienteId: linha.clienteId,
          ...linha.payload,
        })
        criados += 1
      } catch (err) {
        falhas.push(
          `Linha ${linha.linha} (${linha.raw.razaoSocial || linha.raw.cpfCnpj}): ${getErrorMessage(err, 'erro ao criar tomador')}`
        )
      }
      feitos += 1
      setProgresso(Math.round((feitos / validas.length) * 100))
    }

    invalidarTomadores()
    setResultado({ criados, falhas })
    setEtapa('concluido')
  }

  if (!podeEditar) {
    return (
      <InlineAlert
        tone="warning"
        title="Você não pode importar tomadores"
        description="A importação grava cadastro fiscal e é liberada para os perfis administrador e fiscal. Peça a quem tem o perfil, ou consulte a carteira somente leitura."
      />
    )
  }

  return (
    <div className="space-y-6">
      {etapa === 'inicio' && (
        <Card>
          <CardHeader>
            <CardTitle>1. Baixe o modelo, preencha e envie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InlineAlert
              tone="info"
              title="Prestador e tomador são pessoas diferentes"
              description="O prestador é o seu cliente (quem emite a nota). O tomador é o cliente DELE (quem recebe e paga). Linha com os dois documentos iguais é recusada no preview."
            />

            {erroLeitura && (
              <InlineAlert
                tone="danger"
                title="A planilha não foi lida"
                description={erroLeitura}
              />
            )}

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => gerarTemplateTomadoresXlsx()}>
                <FileDown className="h-4 w-4" />
                Baixar modelo (Excel)
              </Button>
              <Button onClick={() => inputRef.current?.click()} disabled={carregando}>
                {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Enviar planilha preenchida
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleArquivo(file)
                  e.target.value = ''
                }}
              />
            </div>

            <p className="text-sm text-muted-foreground">
              Uma linha por tomador, identificado pelo CNPJ do prestador — dá para subir a carteira de
              vários clientes na mesma planilha. Nada é gravado até você confirmar no preview.
            </p>
          </CardContent>
        </Card>
      )}

      {etapa === 'preview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card size="sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Tomadores prontos</p>
                <p className="text-2xl font-semibold text-success">{validas.length}</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Linhas com erro</p>
                <p className="text-2xl font-semibold text-destructive">{invalidas.length}</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Linhas lidas</p>
                <p className="text-2xl font-semibold">{linhas.length}</p>
              </CardContent>
            </Card>
          </div>

          {invalidas.length > 0 && (
            <InlineAlert
              tone="danger"
              title={`${invalidas.length} linha(s) não serão importadas`}
              description="Corrija na planilha e envie de novo, ou siga em frente só com as válidas — o erro de cada linha está na tabela abaixo."
            />
          )}

          {deOutrosClientes > 0 && (
            <InlineAlert
              tone="info"
              title={`${deOutrosClientes} linha(s) pertencem a outros clientes`}
              description="Elas serão criadas na carteira do prestador indicado em cada linha, não na deste cliente. É o comportamento esperado de uma planilha com vários prestadores."
            />
          )}

          <Card>
            <CardHeader><CardTitle>Pré-visualização</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Prestador</TableHead>
                      <TableHead>Tomador</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Município</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((linha) => (
                      <TableRow key={linha.linha}>
                        <TableCell>{linha.linha}</TableCell>
                        <TableCell>{linha.clienteNome ?? linha.raw.cpfCnpjPrestador ?? '—'}</TableCell>
                        <TableCell>{linha.raw.razaoSocial || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{linha.raw.cpfCnpj || '—'}</TableCell>
                        <TableCell>
                          {[linha.raw.municipio, linha.raw.uf].filter(Boolean).join(' / ') || '—'}
                        </TableCell>
                        <TableCell>
                          {linha.erros.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Pronto
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-start gap-1 text-xs text-destructive"
                              title={linha.erros.join('; ')}
                            >
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{linha.erros.join('; ')}</span>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setEtapa('inicio'); setLinhas([]) }}>
              Voltar
            </Button>
            <Button onClick={importar} disabled={validas.length === 0}>
              Importar {validas.length} tomador(es)
            </Button>
          </div>
        </div>
      )}

      {etapa === 'importando' && (
        <Card>
          <CardContent className="space-y-4 py-8">
            <p className="text-sm font-medium">Importando… não feche esta página.</p>
            <Progress value={progresso} />
            <p className="text-xs text-muted-foreground">{progresso}%</p>
          </CardContent>
        </Card>
      )}

      {etapa === 'concluido' && resultado && (
        <div className="space-y-4">
          <InlineAlert
            tone={resultado.falhas.length === 0 ? 'success' : 'warning'}
            title={`${resultado.criados} tomador(es) importado(s)`}
            description={
              resultado.falhas.length > 0
                ? `${resultado.falhas.length} linha(s) falharam na gravação — veja o detalhe abaixo.`
                : 'Tudo certo.'
            }
          />

          {resultado.falhas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Falhas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {resultado.falhas.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => { setEtapa('inicio'); setLinhas([]); setResultado(null) }}
            >
              Importar outra planilha
            </Button>
            <Link href={`/clientes/${clienteId}/tomadores`}>
              <Button>Ver a carteira</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
