'use client'

import { useMemo } from 'react'
import { AlertCircle, AlertTriangle, Bell, CheckSquare, DollarSign, Plus, Receipt, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { LinkPermitido } from '@/components/ui/link-permitido'
import { MUNICIPIO_TIPO } from '@/components/fiscal/config-fiscal-form'
import { exigeCertificadoA1 } from '@/lib/nfse-dominios'
import { cn, formatCurrency, formatMesAno, tsToDate } from '@/lib/utils'
import type { DadosFicha, Registro } from './use-ficha-cliente'

type Acesso = { competencias: boolean; tarefas: boolean; financeiro: boolean; fiscal: boolean; configFiscal: boolean }

const aberta = (t: Registro) => ['pendente', 'em_andamento'].includes((t.status as string) ?? '')
const atrasada = (data: unknown, hoje: Date) => { const v = tsToDate(data); return !!v && v < hoje }

/**
 * Coluna de resumo da ficha em modo página (no painel o espaço é das abas):
 * saúde do cliente, alertas e indicadores. Bloco que não foi lido (erro ou
 * módulo sem acesso) mostra "—"/"Sem dado" — nunca "Em dia" em cima de erro.
 */
export function ResumoCliente({ dados, acesso, clienteId }: { dados: DadosFicha; acesso: Acesso; clienteId: string }) {
  const { cliente, servicos, competencias, lancamentos, tarefas, rascunhos, fiscal, falhas } = dados
  const semServicos = !!falhas.servicos
  const semCompetencias = !!falhas.competencias || !acesso.competencias
  const semLancamentos = !!falhas.lancamentos || !acesso.financeiro
  const semTarefas = !!falhas.tarefas || !acesso.tarefas
  const semRascunhos = !!falhas.rascunhos || !acesso.fiscal
  const semFiscal = !!falhas.fiscal || !acesso.configFiscal

  const hoje = useMemo(() => new Date(), [])
  const competenciaAberta = competencias.find((c) => c.status === 'aberta')
  const lancamentoAtrasado = lancamentos.find((l) => l.status === 'pendente' && atrasada(l.dataVencimento, hoje))
  const tarefaAtrasada = tarefas.find((t) => aberta(t) && atrasada(t.dataPrazo, hoje))
  const rascunhoCritico = rascunhos.find((r) => ['erro_integracao', 'aguardando_emissao'].includes((r.status as string) ?? ''))
  const tarefasAbertas = tarefas.filter(aberta).length
  const receitaTotal = lancamentos.filter((l) => l.tipo === 'receita' || l.tipo == null).reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const receitaAtrasada = lancamentos.filter((l) => l.status === 'pendente' && atrasada(l.dataVencimento, hoje)).reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const diaEmissao = cliente?.diaEmissaoNFSe as number | undefined

  const DIMS = 6
  const score = (servicos.length > 0 ? 1 : 0) + (fiscal ? 1 : 0) + (!competenciaAberta ? 1 : 0) + (!lancamentoAtrasado ? 1 : 0) + (!tarefaAtrasada ? 1 : 0) + (!rascunhoCritico ? 1 : 0)
  const pct = Math.round((score / DIMS) * 100)
  // Dimensão não lida pontuaria como saudável: sem as 6 confiáveis, sem percentual.
  const confiavel = !semServicos && !semFiscal && !semCompetencias && !semLancamentos && !semTarefas && !semRascunhos
  const tom = !confiavel ? 'text-muted-foreground' : pct >= 83 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-destructive'

  const alertas = useMemo(() => {
    const list: Array<{ id: string; titulo: string; descricao: string; severidade: 'danger' | 'warning'; href?: string }> = []
    if (!semServicos && servicos.length === 0) list.push({ id: 'servico', titulo: 'Sem serviço contratado', descricao: 'Vincule pelo menos um serviço para gerar competências, tarefas e honorários.', severidade: 'danger' })
    if (competenciaAberta) list.push({ id: 'comp', titulo: 'Competência em aberto', descricao: `Pendente em ${formatMesAno(competenciaAberta.mes as number, competenciaAberta.ano as number)}.`, severidade: 'warning', href: `/competencias/${competenciaAberta.id as string}` })
    if (tarefaAtrasada) list.push({ id: 'tarefa', titulo: 'Tarefa atrasada', descricao: (tarefaAtrasada.titulo as string | undefined) ?? 'Tarefa pendente com prazo vencido.', severidade: 'danger', href: `/tarefas/${tarefaAtrasada.id as string}` })
    if (lancamentoAtrasado) list.push({ id: 'lanc', titulo: 'Cobrança em atraso', descricao: `Lançamento vencido: ${(lancamentoAtrasado.descricao as string) ?? 'sem descrição'}.`, severidade: 'danger', href: `/financeiro?clienteId=${clienteId}` })
    if (!semFiscal && !fiscal) list.push({ id: 'fiscal', titulo: 'Configuração fiscal pendente', descricao: 'Cliente sem configuração NFS-e.', severidade: 'warning' })
    const creds = (fiscal?.credenciais ?? {}) as Record<string, unknown>
    const ibge = fiscal?.municipioIbge as string | undefined
    const certVenc = creds.certVencimento as string | undefined
    if (fiscal && !certVenc && exigeCertificadoA1(fiscal.provedorNfse, ibge ? MUNICIPIO_TIPO[ibge] : undefined)) {
      list.push({ id: 'cert-ausente', titulo: 'Certificado A1 ausente', descricao: 'Envie o certificado A1 do cliente: sem ele a NFS-e não é emitida.', severidade: 'warning' })
    }
    if (certVenc) {
      const venc = new Date(certVenc)
      const limite = new Date(hoje); limite.setDate(hoje.getDate() + 30)
      if (venc <= limite) list.push({ id: 'cert-venc', titulo: 'Certificado vencido ou vencendo', descricao: `Validade: ${venc.toLocaleDateString('pt-BR')}.`, severidade: venc < hoje ? 'danger' : 'warning' })
    }
    const rascunho = rascunhos.find((r) => ['rascunho', 'pronto_para_emitir', 'aguardando_emissao', 'erro_integracao'].includes((r.status as string) ?? ''))
    if (rascunho) list.push({ id: 'rascunho', titulo: 'Rascunho NFS-e pendente', descricao: `Status: ${(rascunho.status as string) ?? 'rascunho'}.`, severidade: 'warning', href: '/fiscal' })
    return list
  }, [clienteId, competenciaAberta, fiscal, hoje, lancamentoAtrasado, rascunhos, semFiscal, semServicos, servicos.length, tarefaAtrasada])

  const nfseAlerta = (() => {
    if (diaEmissao == null) return null
    const dias = diaEmissao - hoje.getDate()
    if (dias < -2) return null
    if (dias < 0) return { texto: `Dia ${diaEmissao} — atrasada`, urgente: true }
    if (dias === 0) return { texto: `Hoje (dia ${diaEmissao})`, urgente: true }
    if (dias <= 5) return { texto: `em ${dias} dia${dias !== 1 ? 's' : ''} (dia ${diaEmissao})`, urgente: false }
    return null
  })()

  const dimensoes: Array<{ icone: typeof Plus; rotulo: string; sem: boolean; ok: boolean; okTxt: string; ruimTxt: string; ruim: 'destructive' | 'warning' }> = [
    { icone: Plus, rotulo: 'Serviços', sem: semServicos, ok: servicos.length > 0, okTxt: 'Vinculado', ruimTxt: 'Pendente', ruim: 'destructive' },
    { icone: Receipt, rotulo: 'Fiscal NFS-e', sem: semFiscal, ok: !!fiscal, okTxt: 'Configurado', ruimTxt: 'Pendente', ruim: 'destructive' },
    { icone: AlertCircle, rotulo: 'Competências', sem: semCompetencias, ok: !competenciaAberta, okTxt: 'Em dia', ruimTxt: 'Em aberto', ruim: 'warning' },
    { icone: Wallet, rotulo: 'Financeiro', sem: semLancamentos, ok: !lancamentoAtrasado, okTxt: 'Em dia', ruimTxt: 'Inadimplente', ruim: 'destructive' },
    { icone: CheckSquare, rotulo: 'Tarefas', sem: semTarefas, ok: !tarefaAtrasada, okTxt: 'Em dia', ruimTxt: 'Atrasada', ruim: 'destructive' },
    { icone: DollarSign, rotulo: 'NFS-e rascunho', sem: semRascunhos, ok: !rascunhoCritico, okTxt: 'OK', ruimTxt: 'Pendente', ruim: 'warning' },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4">
          {[
            ['Serviços ativos', semServicos ? '—' : String(servicos.filter((s) => s.status === 'ativo').length), ''],
            ['Competências (hist.)', semCompetencias ? '—' : String(competencias.length), ''],
            ['Tarefas abertas', semTarefas ? '—' : String(tarefasAbertas), !semTarefas && tarefasAbertas > 0 ? 'text-warning font-semibold' : ''],
            ['Honorários (recentes)', semLancamentos ? '—' : formatCurrency(receitaTotal), ''],
            ['Atraso financeiro', semLancamentos ? '—' : formatCurrency(receitaAtrasada), !semLancamentos && receitaAtrasada > 0 ? 'text-destructive font-semibold' : ''],
            ...(diaEmissao != null ? [['Dia emissão NFS-e', `Dia ${diaEmissao}`, 'text-primary']] : []),
          ].map(([label, value, cls]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className={cn('text-xs tabular-nums', cls)}>{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saúde do cliente</CardTitle>
            <span className={cn('text-sm font-bold tabular-nums', tom)}>{confiavel ? `${pct}%` : '—'}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5 px-4 pb-4">
          {dimensoes.map((d) => (
            <div key={d.rotulo} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm"><d.icone className="h-3.5 w-3.5 text-muted-foreground" />{d.rotulo}</span>
              {d.sem
                ? <Badge variant="neutral">Sem dado</Badge>
                : <Badge variant={d.ok ? 'success' : d.ruim}>{d.ok ? d.okTxt : d.ruimTxt}</Badge>}
            </div>
          ))}
          {nfseAlerta ? (
            <div className={cn('flex items-center justify-between rounded-md border px-2.5 py-2', nfseAlerta.urgente ? 'border-destructive/20 bg-destructive/6' : 'border-warning/20 bg-warning/6')}>
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Bell className={cn('h-3 w-3 shrink-0', nfseAlerta.urgente ? 'text-destructive' : 'text-warning')} />NFS-e
              </span>
              <span className={cn('text-xs font-semibold', nfseAlerta.urgente ? 'text-destructive' : 'text-amber-800 dark:text-warning')}>{nfseAlerta.texto}</span>
            </div>
          ) : null}
          <div className="border-t border-border/50 pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Saúde geral</span>
              <span className="text-xs font-semibold tabular-nums">{confiavel ? `${score}/${DIMS}` : `— / ${DIMS}`}</span>
            </div>
            <Progress value={confiavel ? pct : 0} className="h-1.5" />
          </div>
        </CardContent>
      </Card>

      {alertas.length > 0 ? (
        <Card>
          <CardHeader className="px-4 py-3"><CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alertas</CardTitle></CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {alertas.map((item) => {
              const row = (
                <div className={cn('flex items-start gap-2 rounded-md border-l-2 px-3 py-2', item.severidade === 'danger' ? 'border-destructive bg-destructive/4' : 'border-warning bg-warning/4')}>
                  <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', item.severidade === 'danger' ? 'text-destructive' : 'text-warning')} />
                  <div>
                    <p className="text-xs font-medium">{item.titulo}</p>
                    <p className="text-xs text-muted-foreground">{item.descricao}</p>
                  </div>
                </div>
              )
              return item.href
                ? <LinkPermitido key={item.id} href={item.href} className="block transition-opacity hover:opacity-90">{row}</LinkPermitido>
                : <div key={item.id}>{row}</div>
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
