'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileDown, Upload, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { createDocument, getNextClienteCodigo, getServicos, listDocuments } from '@/lib/firestore-client'
import { clientesKeys } from '@/features/clientes/queries'
import {
  gerarTemplateClientesXlsx,
  parseClientesWorkbook,
  validarClienteRow,
  validarServicoRow,
  type ClienteValidado,
  type ServicoValidado,
} from '@/lib/clientes-import'

type Etapa = 'inicio' | 'preview' | 'importando' | 'concluido'

interface Resultado {
  clientesCriados: number
  servicosCriados: number
  falhas: string[]
}

export default function ImportarClientesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [etapa, setEtapa] = useState<Etapa>('inicio')
  const [carregando, setCarregando] = useState(false)
  const [clientes, setClientes] = useState<ClienteValidado[]>([])
  const [servicos, setServicos] = useState<ServicoValidado[]>([])
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function handleArquivo(file: File) {
    setCarregando(true)
    try {
      const { clientes: clientesRows, servicos: servicosRows } = await parseClientesWorkbook(file)

      const [clientesExistentes, servicosDisponiveis] = await Promise.all([
        listDocuments<{ cpfCnpj?: string }>('clientes'),
        getServicos(),
      ])

      const cnpjsExistentes = new Set(
        clientesExistentes.map((c) => (c.cpfCnpj ?? '').replace(/\D/g, '')).filter(Boolean)
      )
      const cnpjsNaPlanilha = new Map<string, number>()
      clientesRows.forEach((row, i) => {
        const digits = (row.cpfCnpj ?? '').replace(/\D/g, '')
        if (digits && !cnpjsNaPlanilha.has(digits)) cnpjsNaPlanilha.set(digits, i + 1)
      })

      const clientesValidados = clientesRows.map((row, i) =>
        validarClienteRow(row, i + 1, cnpjsExistentes, cnpjsNaPlanilha)
      )

      const cnpjsValidosParaServico = new Set<string>([
        ...cnpjsExistentes,
        ...clientesValidados.filter((c) => c.erros.length === 0).map((c) => c.cpfCnpjDigits),
      ])
      const servicosPorCodigo = new Map(
        servicosDisponiveis.map((s) => {
          const nome = String((s as Record<string, unknown>).nome ?? '')
          const codigo = String((s as Record<string, unknown>).codigo ?? '')
          return [codigo.toUpperCase(), { id: s.id, nome, codigo }]
        })
      )

      const servicosValidados = servicosRows.map((row, i) =>
        validarServicoRow(row, i + 1, cnpjsValidosParaServico, servicosPorCodigo)
      )

      setClientes(clientesValidados)
      setServicos(servicosValidados)
      setEtapa('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ler a planilha.')
    } finally {
      setCarregando(false)
    }
  }

  async function handleImportar() {
    setEtapa('importando')
    setProgresso(0)
    const falhas: string[] = []
    const idPorCnpj = new Map<string, string>()

    const clientesValidos = clientes.filter((c) => c.erros.length === 0)
    const servicosValidos = servicos.filter((s) => s.erros.length === 0)
    const total = clientesValidos.length + servicosValidos.length
    let feitos = 0

    let proximoCodigo = await getNextClienteCodigo()

    for (const cliente of clientesValidos) {
      try {
        const id = await createDocument('clientes', { ...cliente.payload, codigo: proximoCodigo })
        proximoCodigo += 1
        idPorCnpj.set(cliente.cpfCnpjDigits, id)
      } catch (err) {
        falhas.push(`Linha ${cliente.linha} (${cliente.raw.razaoSocial || cliente.raw.cpfCnpj}): ${err instanceof Error ? err.message : 'erro ao criar cliente'}`)
      }
      feitos += 1
      setProgresso(Math.round((feitos / total) * 100))
    }

    // Clientes que já existiam (não criados nesta importação) também podem receber serviço novo —
    // busca o id deles se ainda não estiver no mapa.
    const cnpjsFaltantes = [...new Set(servicosValidos.map((s) => s.cpfCnpjDigits))].filter((d) => !idPorCnpj.has(d))
    if (cnpjsFaltantes.length > 0) {
      const todosClientes = await listDocuments<{ cpfCnpj?: string }>('clientes')
      for (const c of todosClientes) {
        const digits = (c.cpfCnpj ?? '').replace(/\D/g, '')
        if (digits && cnpjsFaltantes.includes(digits)) idPorCnpj.set(digits, c.id)
      }
    }

    for (const servico of servicosValidos) {
      const clienteId = idPorCnpj.get(servico.cpfCnpjDigits)
      if (!clienteId) {
        falhas.push(`Serviço linha ${servico.linha}: cliente não encontrado (${servico.raw.cpfCnpjCliente})`)
        feitos += 1
        setProgresso(Math.round((feitos / total) * 100))
        continue
      }
      try {
        const hoje = new Date()
        const [dia, mes, ano] = (servico.payload.dataInicio as string | undefined)?.split('/') ?? []
        const dataInicio = dia && mes && ano ? new Date(Number(ano), Number(mes) - 1, Number(dia), 12) : hoje
        await createDocument('clientes_servicos', {
          clienteId,
          servicoId: servico.payload.servicoId,
          servicoNome: servico.payload.servicoNome,
          valor: servico.payload.valor,
          diaVencimento: servico.payload.diaVencimento,
          dataInicio,
          observacoes: servico.payload.observacoes,
          status: 'ativo',
        })
      } catch (err) {
        falhas.push(`Serviço linha ${servico.linha}: ${err instanceof Error ? err.message : 'erro ao vincular serviço'}`)
      }
      feitos += 1
      setProgresso(Math.round((feitos / total) * 100))
    }

    queryClient.invalidateQueries({ queryKey: clientesKeys.all })
    setResultado({ clientesCriados: idPorCnpj.size, servicosCriados: servicosValidos.length - falhas.filter((f) => f.startsWith('Serviço')).length, falhas })
    setEtapa('concluido')
  }

  const clientesValidos = clientes.filter((c) => c.erros.length === 0)
  const clientesInvalidos = clientes.filter((c) => c.erros.length > 0)
  const servicosValidos = servicos.filter((s) => s.erros.length === 0)
  const servicosInvalidos = servicos.filter((s) => s.erros.length > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar Clientes"
        description="Cadastre vários clientes e serviços de uma vez a partir de uma planilha Excel."
        breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: 'Importar' }]}
      />

      {etapa === 'inicio' && (
        <Card>
          <CardHeader>
            <CardTitle>1. Baixe o modelo, preencha e envie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InlineAlert
              tone="warning"
              title="Nunca inclua senhas ou certificados na planilha"
              description="Credenciais fiscais (prefeitura, certificado digital, Meu Gov, e-CAC) continuam sendo preenchidas individualmente, pela tela de cada cliente — não existe campo pra isso no modelo."
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => gerarTemplateClientesXlsx()}>
                <FileDown className="w-4 h-4" />
                Baixar modelo (Excel)
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={carregando}>
                {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Enviar planilha preenchida
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleArquivo(file)
                  e.target.value = ''
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              O modelo tem duas abas — <b>Clientes</b> (dados cadastrais) e <b>Serviços</b> (o que cada cliente paga todo mês, ligado pelo CPF/CNPJ). Depois de enviar, nada é gravado até você confirmar na tela seguinte.
            </p>
          </CardContent>
        </Card>
      )}

      {etapa === 'preview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card size="sm"><CardContent><p className="text-xs text-muted-foreground">Clientes prontos</p><p className="text-2xl font-semibold text-success">{clientesValidos.length}</p></CardContent></Card>
            <Card size="sm"><CardContent><p className="text-xs text-muted-foreground">Clientes com erro</p><p className="text-2xl font-semibold text-destructive">{clientesInvalidos.length}</p></CardContent></Card>
            <Card size="sm"><CardContent><p className="text-xs text-muted-foreground">Serviços prontos</p><p className="text-2xl font-semibold text-success">{servicosValidos.length}</p></CardContent></Card>
            <Card size="sm"><CardContent><p className="text-xs text-muted-foreground">Serviços com erro</p><p className="text-2xl font-semibold text-destructive">{servicosInvalidos.length}</p></CardContent></Card>
          </div>

          {clientesInvalidos.length > 0 && (
            <InlineAlert
              tone="danger"
              title={`${clientesInvalidos.length} linha(s) de cliente com erro — não serão importadas`}
              description="Corrija na planilha e envie de novo, ou siga em frente só com os válidos."
            />
          )}

          <Card>
            <CardHeader><CardTitle>Clientes</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Linha</TableHead><TableHead>Razão Social</TableHead><TableHead>CPF/CNPJ</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => (
                    <TableRow key={c.linha}>
                      <TableCell>{c.linha}</TableCell>
                      <TableCell>{c.raw.razaoSocial || '—'}</TableCell>
                      <TableCell>{c.raw.cpfCnpj || '—'}</TableCell>
                      <TableCell>
                        {c.erros.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Pronto</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs" title={c.erros.join('; ')}>
                            <XCircle className="w-3.5 h-3.5" /> {c.erros.join('; ')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {servicos.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Serviços</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Linha</TableHead><TableHead>Cliente (CPF/CNPJ)</TableHead><TableHead>Serviço</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {servicos.map((s) => (
                      <TableRow key={s.linha}>
                        <TableCell>{s.linha}</TableCell>
                        <TableCell>{s.raw.cpfCnpjCliente || '—'}</TableCell>
                        <TableCell>{s.raw.servico || '—'}</TableCell>
                        <TableCell>{s.raw.valor || '—'}</TableCell>
                        <TableCell>
                          {s.erros.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Pronto</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-destructive text-xs" title={s.erros.join('; ')}>
                              <XCircle className="w-3.5 h-3.5" /> {s.erros.join('; ')}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setEtapa('inicio')}>Voltar</Button>
            <Button onClick={handleImportar} disabled={clientesValidos.length === 0 && servicosValidos.length === 0}>
              Importar {clientesValidos.length} cliente(s) e {servicosValidos.length} serviço(s)
            </Button>
          </div>
        </div>
      )}

      {etapa === 'importando' && (
        <Card>
          <CardContent className="space-y-4 py-8">
            <p className="text-sm font-medium">Importando... não feche esta página.</p>
            <Progress value={progresso} />
            <p className="text-xs text-muted-foreground">{progresso}%</p>
          </CardContent>
        </Card>
      )}

      {etapa === 'concluido' && resultado && (
        <div className="space-y-4">
          <InlineAlert
            tone={resultado.falhas.length === 0 ? 'success' : 'warning'}
            title={`${resultado.clientesCriados} cliente(s) e ${resultado.servicosCriados} serviço(s) importados`}
            description={resultado.falhas.length > 0 ? `${resultado.falhas.length} falha(s) — veja o detalhe abaixo.` : 'Tudo certo.'}
          />
          {resultado.falhas.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" /> Falhas</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc pl-5">
                  {resultado.falhas.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setEtapa('inicio'); setClientes([]); setServicos([]); setResultado(null) }}>Importar outra planilha</Button>
            <Button onClick={() => router.push('/clientes')}>Ver clientes</Button>
          </div>
        </div>
      )}
    </div>
  )
}
