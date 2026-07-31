'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Repeat } from 'lucide-react'

import { AppModal } from '@/components/ui/app-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCpfCnpj, formatDate, tsToDate } from '@/lib/utils'
import { getErrorMessage } from '@/lib/error-message'

import type { PrestadorResumo, TomadorRecord } from '@/features/tomadores/types'
import { proximaEmissao } from '@/features/nfse-recorrentes/calculo'
import { criarContratoRecorrente, atualizarContratoRecorrente } from '@/features/nfse-recorrentes/services'
import type { NfseRecorrenteRecord } from '@/features/nfse-recorrentes/types'
import { validarContratoRecorrente } from '@/features/nfse-recorrentes/validacao'

interface NfseRecorrenteFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prestador: PrestadorResumo
  /** Tomadores que podem receber contrato (ativos + o do contrato em edição). */
  tomadores: TomadorRecord[]
  contrato?: NfseRecorrenteRecord | null
  onSaved: () => void
}

type Campos = {
  tomadorId: string
  descricao: string
  valor: string
  diaEmissao: string
  dataInicio: string
  dataFim: string
  itemListaServico: string
  codigoServico: string
  aliquota: string
  issRetido: boolean
  ativo: boolean
}

/** `<input type="date">` fala ISO; o resto do app fala Date ao meio-dia. */
function paraInputDate(data: Date | null): string {
  if (!data) return ''
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

/**
 * Meio-dia de propósito: `new Date('2026-08-01')` é interpretado como UTC e, em
 * fuso negativo, volta como 31/07 — contrato nasceria com um dia de diferença.
 */
function deInputDate(valor: string): Date | null {
  if (!valor) return null
  const data = new Date(`${valor}T12:00:00`)
  return Number.isNaN(data.getTime()) ? null : data
}

function camposDoContrato(contrato?: NfseRecorrenteRecord | null): Campos {
  if (!contrato) {
    return {
      tomadorId: '', descricao: '', valor: '', diaEmissao: '',
      dataInicio: paraInputDate(new Date()), dataFim: '',
      itemListaServico: '', codigoServico: '', aliquota: '',
      issRetido: false, ativo: true,
    }
  }
  return {
    tomadorId: contrato.tomadorId ?? '',
    descricao: contrato.descricao ?? '',
    valor: contrato.valor != null ? String(contrato.valor) : '',
    diaEmissao: contrato.diaEmissao != null ? String(contrato.diaEmissao) : '',
    dataInicio: paraInputDate(tsToDate(contrato.dataInicio)),
    dataFim: paraInputDate(tsToDate(contrato.dataFim)),
    itemListaServico: contrato.itemListaServico ?? '',
    codigoServico: contrato.codigoServico ?? '',
    aliquota: contrato.aliquota != null ? String(contrato.aliquota) : '',
    issRetido: contrato.issRetido === true,
    ativo: contrato.ativo !== false,
  }
}

function numeroOuNulo(valor: string): number | null {
  const texto = valor.trim().replace(',', '.')
  if (texto === '') return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

export function NfseRecorrenteForm({
  open, onOpenChange, prestador, tomadores, contrato, onSaved,
}: NfseRecorrenteFormProps) {
  const editando = !!contrato
  const [campos, setCampos] = useState<Campos>(() => camposDoContrato(contrato))
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [tentouSalvar, setTentouSalvar] = useState(false)

  function set<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((atual) => ({ ...atual, [campo]: valor }))
  }

  const dataInicio = deInputDate(campos.dataInicio)
  const dataFim = deInputDate(campos.dataFim)
  const valor = numeroOuNulo(campos.valor)
  const diaEmissao = numeroOuNulo(campos.diaEmissao)
  const aliquota = numeroOuNulo(campos.aliquota)

  const erros = useMemo(
    () =>
      validarContratoRecorrente({
        tomadorId: campos.tomadorId,
        descricao: campos.descricao,
        valor,
        diaEmissao,
        dataInicio,
        dataFim,
        aliquota,
      }),
    [campos.tomadorId, campos.descricao, valor, diaEmissao, dataInicio, dataFim, aliquota]
  )

  const tomadorSelecionado = tomadores.find((t) => t.id === campos.tomadorId)

  // Prévia da próxima emissão: é como o contador confere que o dia 31 vira 28 em
  // fevereiro sem precisar esperar o mês virar.
  const previsao = useMemo(() => {
    if (erros.length > 0) return null
    return proximaEmissao(
      { ativo: campos.ativo, valor, diaEmissao, dataInicio, dataFim },
      new Date()
    )
  }, [erros.length, campos.ativo, valor, diaEmissao, dataInicio, dataFim])

  async function salvar() {
    setTentouSalvar(true)
    if (erros.length > 0 || !tomadorSelecionado || !dataInicio || valor == null || diaEmissao == null) return

    setSalvando(true)
    setErroSalvar(null)
    try {
      const valores = {
        tomadorId: tomadorSelecionado.id,
        descricao: campos.descricao,
        valor,
        diaEmissao: Math.trunc(diaEmissao),
        dataInicio,
        dataFim,
        itemListaServico: campos.itemListaServico,
        codigoServico: campos.codigoServico,
        aliquota,
        issRetido: campos.issRetido,
        ativo: campos.ativo,
      }
      const tomador = {
        id: tomadorSelecionado.id,
        razaoSocial: tomadorSelecionado.razaoSocial,
        cpfCnpj: tomadorSelecionado.cpfCnpj,
      }

      if (editando && contrato) {
        await atualizarContratoRecorrente({ id: contrato.id, tomador, valores })
        toast.success('Contrato atualizado.')
      } else {
        await criarContratoRecorrente({ prestador, tomador, valores })
        toast.success('Contrato de emissão recorrente criado.')
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setErroSalvar(getErrorMessage(err, 'Não foi possível salvar o contrato. Verifique os dados e suas permissões.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<Repeat className="h-4 w-4" />}
      title={editando ? 'Editar contrato recorrente' : 'Novo contrato recorrente'}
      description={
        <>
          Todo mês, <strong>{prestador.razaoSocial}</strong> emite esta nota para o tomador escolhido.
        </>
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando || tomadores.length === 0}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? 'Salvar alterações' : 'Criar contrato'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {erroSalvar && (
          <InlineAlert
            tone="danger"
            title="O contrato não foi salvo"
            description={erroSalvar}
            action={{ label: 'Tentar de novo', onClick: () => void salvar() }}
          />
        )}

        {tomadores.length === 0 && (
          <InlineAlert
            tone="warning"
            title="Nenhum tomador ativo na carteira"
            description="O contrato diz quem fatura quem — cadastre o tomador antes, na aba Tomadores."
          />
        )}

        {tentouSalvar && erros.length > 0 && (
          <InlineAlert
            tone="danger"
            title={erros.length === 1 ? 'Corrija antes de salvar' : `Corrija ${erros.length} itens antes de salvar`}
            description={erros.join(' ')}
          />
        )}

        <div className="space-y-1.5">
          <Label required>Tomador</Label>
          <Select
            value={campos.tomadorId}
            onValueChange={(v) => set('tomadorId', String(v ?? ''))}
            disabled={tomadores.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione quem recebe a nota" />
            </SelectTrigger>
            <SelectContent>
              {tomadores.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.razaoSocial} · {formatCpfCnpj(t.cpfCnpj)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contrato-descricao" required>Descrição que sai na nota</Label>
          <Textarea
            id="contrato-descricao"
            rows={3}
            value={campos.descricao}
            onChange={(e) => set('descricao', e.target.value)}
            placeholder="Ex.: Serviços de consultoria contábil prestados no mês de referência."
          />
          <p className="text-xs text-muted-foreground">
            É a discriminação do serviço — o texto vai literalmente para a NFS-e.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="contrato-valor" required>Valor (R$)</Label>
            <Input
              id="contrato-valor"
              type="number"
              step="0.01"
              min="0.01"
              value={campos.valor}
              onChange={(e) => set('valor', e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contrato-dia" required>Dia de emissão</Label>
            <Input
              id="contrato-dia"
              type="number"
              min="1"
              max="31"
              value={campos.diaEmissao}
              onChange={(e) => set('diaEmissao', e.target.value)}
              placeholder="Ex.: 5"
            />
            <p className="text-xs text-muted-foreground">Mês curto emite no último dia.</p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
            <Switch
              checked={campos.issRetido}
              onCheckedChange={(v) => set('issRetido', Boolean(v))}
              aria-label="ISS retido na fonte"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">ISS retido</p>
              <p className="text-xs text-muted-foreground">Quando o tomador recolhe o imposto.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="contrato-inicio" required>Início da vigência</Label>
            <Input
              id="contrato-inicio"
              type="date"
              value={campos.dataInicio}
              onChange={(e) => set('dataInicio', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contrato-fim">Fim da vigência</Label>
            <Input
              id="contrato-fim"
              type="date"
              value={campos.dataFim}
              onChange={(e) => set('dataFim', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Em branco, fatura até alguém suspender o contrato.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 p-4">
          <div>
            <h3 className="text-sm font-semibold">Campos fiscais (opcionais)</h3>
            <p className="text-xs text-muted-foreground">
              Em branco, cada um herda o padrão do cadastro fiscal deste cliente. Preencha só o
              contrato cujo serviço difere do padrão.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="contrato-item">Item da lista de serviço</Label>
              <Input
                id="contrato-item"
                value={campos.itemListaServico}
                onChange={(e) => set('itemListaServico', e.target.value)}
                placeholder="Herda do cliente"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contrato-codigo">Código do serviço</Label>
              <Input
                id="contrato-codigo"
                value={campos.codigoServico}
                onChange={(e) => set('codigoServico', e.target.value)}
                placeholder="Herda do cliente"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contrato-aliquota">Alíquota (%)</Label>
              <Input
                id="contrato-aliquota"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={campos.aliquota}
                onChange={(e) => set('aliquota', e.target.value)}
                placeholder="Herda do cliente"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
          <div className="flex items-start gap-3">
            <Switch
              checked={campos.ativo}
              onCheckedChange={(v) => set('ativo', Boolean(v))}
              aria-label="Contrato ativo"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">Contrato ativo</p>
              <p className="text-xs text-muted-foreground">Desligado, para de gerar nota sem perder o histórico.</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Próxima emissão:{' '}
            <strong className="text-foreground">
              {previsao ? formatDate(previsao) : '—'}
            </strong>
          </p>
        </div>
      </div>
    </AppModal>
  )
}
