'use client'

import { AlertTriangle, ArrowRight, Package, Pencil, Receipt, Settings, Truck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { AmbienteBadge, NfseStatusBadge } from '@/components/ui/status-badge'
import { LinkPermitido } from '@/components/ui/link-permitido'
import { useLinhaClicavel } from '@/components/ui/linha-clicavel'
import { MUNICIPIOS, MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { AcoesNota } from '@/components/fiscal/acoes-nota'
import { CertificadoStatusCard } from '@/components/fiscal/certificado-status-card'
import { exigeCertificadoA1, nomeMunicipio } from '@/lib/nfse-dominios'
import { cn, formatCurrency, formatDate, tsToDate } from '@/lib/utils'
import { CARD_FICHA, CARD_FICHA_CONTENT, CARD_FICHA_HEADER, SecaoIndisponivel, rotuloRegime } from './ficha-comum'
import type { FalhaSecao, Registro } from './use-ficha-cliente'

interface AbaFiscalProps {
  clienteId: string
  cliente: Registro
  fiscal: Registro | null
  nfses: Registro[]
  falhaFiscal?: FalhaSecao
  falhaNfses?: FalhaSecao
  /** admin/fiscal: configurar, certificado, emitir, consultar, cancelar. */
  podeOperar: boolean
  onConfigurar: () => void
  onEmitir: () => void
  onRecarregar: () => void
}

function HistoricoNfse({ clienteId, nfses, falha, podeEmitir, onEmitir, onRecarregar }: {
  clienteId: string; nfses: Registro[]; falha?: FalhaSecao; podeEmitir: boolean; onEmitir: () => void; onRecarregar: () => void
}) {
  const linha = useLinhaClicavel()
  return (
    <Card className={CARD_FICHA} data-testid="historico-nfse-cliente">
      <CardHeader className={CARD_FICHA_HEADER}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          Histórico NFS-e
          {nfses.length > 0 ? <span className="text-xs font-normal text-muted-foreground">({nfses.length} mais recentes)</span> : null}
        </CardTitle>
        <div className="flex items-center gap-2">
          <LinkPermitido
            href={`/fiscal/historico?clienteId=${encodeURIComponent(clienteId)}`}
            className={buttonVariants({ size: 'sm', variant: 'ghost', className: 'h-8' })}
          >
            Ver todas<ArrowRight className="h-3.5 w-3.5" />
          </LinkPermitido>
          {podeEmitir ? (
            <Button size="sm" className="h-8" onClick={onEmitir}>
              <Receipt className="h-3.5 w-3.5" />Emitir
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="@container px-0 pb-2">
        {falha ? (
          <div className="px-4 pb-2"><SecaoIndisponivel falha={falha} onRetry={onRecarregar} /></div>
        ) : nfses.length === 0 ? (
          <div className="px-4 pb-2">
            <EmptyState
              size="sm"
              icon={Receipt}
              title="Nenhuma NFS-e emitida"
              {...(podeEmitir ? { action: { label: 'Emitir NFS-e', onClick: onEmitir } } : {})}
            />
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="hidden border-b text-xs text-muted-foreground @2xl:table-header-group">
              <tr>
                <th className="w-[72px] px-4 py-2 text-left font-medium">Nº</th>
                <th className="w-[92px] px-2 py-2 text-left font-medium">Emissão</th>
                <th className="px-2 py-2 text-left font-medium">Tomador</th>
                <th className="w-[104px] px-2 py-2 text-right font-medium">Valor</th>
                <th className="w-[112px] px-2 py-2 text-left font-medium">Status</th>
                <th className="w-[204px] px-3 py-2 text-right font-medium"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {nfses.map((n) => {
                const href = `/fiscal/${n.id as string}`
                const comErro = n.status === 'rejeitada' || n.status === 'erro_integracao'
                const emissao = n.dataEmissao ? formatDate(tsToDate(n.dataEmissao)) : '—'
                const valor = formatCurrency(Number(n.valorServico ?? n.valorTotal ?? 0))
                const acoes = <AcoesNota nota={n} rotulos onAtualizar={onRecarregar} />
                return (
                  <tr
                    key={n.id as string}
                    data-testid="linha-nfse"
                    {...linha(href, { className: cn('align-middle hover:bg-muted/35', comErro && 'bg-destructive/[0.03]') })}
                  >
                    {/* Largo: colunas. Estreito (celular, página com a coluna de resumo): a mesma linha vira cartão — pela largura do cartão, não da tela. */}
                    <td className="hidden px-4 py-2.5 font-mono text-xs @2xl:table-cell">{(n.numeroNfse as string) ?? '—'}</td>
                    <td className="hidden px-2 py-2.5 text-muted-foreground @2xl:table-cell">{emissao}</td>
                    <td className="hidden truncate px-2 py-2.5 text-xs text-muted-foreground @2xl:table-cell" title={(n.tomadorNome as string) ?? ''}>{(n.tomadorNome as string) ?? '—'}</td>
                    <td className="hidden px-2 py-2.5 text-right font-medium tabular-nums @2xl:table-cell">{valor}</td>
                    <td className="hidden px-2 py-2.5 @2xl:table-cell"><NfseStatusBadge status={n.status as string} /></td>
                    <td className="hidden px-3 py-2 @2xl:table-cell">{acoes}</td>
                    <td className="px-4 py-2.5 @2xl:hidden" colSpan={6}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">NFS-e <span className="font-mono">{(n.numeroNfse as string) ?? '—'}</span> · {emissao}</p>
                          <p className="truncate text-xs text-muted-foreground">{(n.tomadorNome as string) ?? '—'}</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">{valor}</p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <NfseStatusBadge status={n.status as string} />
                        {acoes}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Aba Fiscal da ficha: histórico de NFS-e (com PDF/XML por nota e o detalhe
 * ao clicar na linha), configuração NFS-e e o STATUS do certificado A1.
 */
export function AbaFiscal({
  clienteId, cliente, fiscal, nfses, falhaFiscal, falhaNfses, podeOperar, onConfigurar, onEmitir, onRecarregar,
}: AbaFiscalProps) {
  // categoriaFiscal vem do CNAE (scripts/classificar-clientes-fiscal.mjs):
  // clientes de produto emitem NF-e e de transporte CT-e — fora da plataforma.
  const categoria = (cliente.categoriaFiscal as string) ?? 'servico'
  if (categoria === 'produto' || categoria === 'transporte') {
    const produto = categoria === 'produto'
    const Icone = produto ? Package : Truck
    return (
      <div className="space-y-3">
        <Card className={CARD_FICHA}>
          <CardHeader className="flex flex-row items-center gap-2 px-4 py-3">
            <Icone className={cn('h-4 w-4', produto ? 'text-primary' : 'text-warning')} />
            <CardTitle className="text-sm">{produto ? 'NF-e (produto)' : 'CT-e (transporte)'}</CardTitle>
          </CardHeader>
          <CardContent className={CARD_FICHA_CONTENT}>
            <p className="text-sm text-muted-foreground">
              {produto
                ? <>Este cliente foi classificado pelo CNAE como emissor de <strong>NF-e</strong> (nota fiscal de produto/mercadoria). A plataforma não emite NF-e — a emissão é direta, sem integrador, e hoje cobre só NFS-e. Este cliente emite a NF-e por fora da plataforma.</>
                : <>Este cliente foi classificado pelo CNAE como emissor de <strong>CT-e</strong> (conhecimento de transporte). A plataforma não emite CT-e — este cliente autoemite por fora dela.</>}
            </p>
          </CardContent>
        </Card>
        {nfses.length > 0 ? (
          <HistoricoNfse clienteId={clienteId} nfses={nfses} falha={falhaNfses} podeEmitir={false} onEmitir={onEmitir} onRecarregar={onRecarregar} />
        ) : null}
      </div>
    )
  }

  const ibge = fiscal?.municipioIbge as string | undefined
  const tipo = ibge ? MUNICIPIO_TIPO[ibge] : undefined
  const municipioNome = MUNICIPIOS.find((m) => m.ibge === ibge)?.nome ?? nomeMunicipio(ibge) ?? ibge ?? '—'
  const podeEmitir = podeOperar && !!fiscal

  return (
    <div className="space-y-3">
      <HistoricoNfse clienteId={clienteId} nfses={nfses} falha={falhaNfses} podeEmitir={podeEmitir} onEmitir={onEmitir} onRecarregar={onRecarregar} />

      <Card className={CARD_FICHA}>
        <CardHeader className={CARD_FICHA_HEADER}>
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Configuração NFS-e
            </CardTitle>
            {fiscal?.emissaoAutomatica === true ? (
              <Badge variant="destructive" className="gap-1 text-[10px]" title="Emite sem revisão humana, sozinho, no dia configurado">
                <AlertTriangle className="h-2.5 w-2.5" /> Emissão automática
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!falhaFiscal ? (
              <LinkPermitido href={`/clientes/${clienteId}/tomadores`} className={buttonVariants({ size: 'sm', variant: 'ghost', className: 'h-8' })}>
                Tomadores
              </LinkPermitido>
            ) : null}
            {/* Configurar é admin/fiscal — e nunca por cima de uma configuração que não foi lida. */}
            {podeOperar && !falhaFiscal ? (
              <Button size="sm" variant="outline" className="h-8" onClick={onConfigurar}>
                <Pencil className="h-3.5 w-3.5" />{fiscal ? 'Editar' : 'Configurar'}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className={CARD_FICHA_CONTENT}>
          {falhaFiscal ? (
            <SecaoIndisponivel
              falha={falhaFiscal}
              onRetry={onRecarregar}
              descricaoErro="Não configure de novo por cima: o dado existente pode estar lá e não ter sido lido."
            />
          ) : !fiscal ? (
            <EmptyState
              size="sm"
              title="Sem configuração fiscal"
              description={podeOperar ? 'Configure o município e as credenciais para emitir NFS-e.' : 'A equipe fiscal ainda não configurou a emissão deste cliente.'}
              {...(podeOperar ? { action: { label: 'Configurar NFS-e', onClick: onConfigurar } } : {})}
            />
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Município</dt><dd className="font-medium">{municipioNome}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Ambiente</dt><dd><AmbienteBadge ambiente={fiscal.ambienteEmissao === 'producao' ? 'producao' : 'homologacao'} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">Insc. municipal</dt><dd className="font-medium">{(fiscal.inscricaoMunicipal as string) || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Regime</dt><dd className="font-medium">{rotuloRegime(fiscal.regimeTributario)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Optante Simples</dt><dd className="font-medium">{fiscal.optanteSimples ? 'Sim' : 'Não'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Alíquota ISS</dt><dd className="font-medium">{fiscal.aliquotaPadrao != null ? `${fiscal.aliquotaPadrao}%` : '—'}</dd></div>
            </dl>
          )}
        </CardContent>
      </Card>

      {fiscal && exigeCertificadoA1(fiscal.provedorNfse, tipo) ? (
        <CertificadoStatusCard
          clienteId={clienteId}
          credenciais={fiscal.credenciais as Record<string, unknown> | undefined}
          cnpjCliente={cliente.cpfCnpj}
          podeEnviar={podeOperar}
          onEnviado={onRecarregar}
        />
      ) : null}

    </div>
  )
}
