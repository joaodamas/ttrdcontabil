'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, UserPlus } from 'lucide-react'

import { AppModal } from '@/components/ui/app-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { InlineAlert } from '@/components/ui/inline-alert'
import { CpfCnpjInput } from '@/components/ui/cpf-cnpj-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCep, formatCpfCnpj, formatPhone, UFS } from '@/lib/utils'
import { getErrorMessage } from '@/lib/error-message'
import { useViaCep } from '@/hooks/use-viacep'

import { limparEndereco } from '@/features/tomadores/endereco'
import { criarTomador, atualizarTomador } from '@/features/tomadores/services'
import type { PrestadorResumo, TomadorRecord } from '@/features/tomadores/types'
import {
  ERRO_TOMADOR_IGUAL_PRESTADOR,
  mesmoDocumento,
  somenteDigitos,
  validarTomador,
} from '@/features/tomadores/validacao'

interface TomadorFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prestador: PrestadorResumo
  /** Preenchido = edição. Vazio = cadastro novo. */
  tomador?: TomadorRecord | null
  /** Documento (dígitos) → id, para recusar o mesmo CNPJ duas vezes na carteira. */
  documentosDaCarteira: ReadonlyMap<string, string>
  onSaved: (info: { contratosSincronizados: number }) => void
}

type Campos = {
  cpfCnpj: string
  razaoSocial: string
  email: string
  telefone: string
  inscricaoMunicipal: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  municipioIbge: string
  uf: string
  ativo: boolean
}

const VAZIO: Campos = {
  cpfCnpj: '', razaoSocial: '', email: '', telefone: '', inscricaoMunicipal: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '',
  municipio: '', municipioIbge: '', uf: '', ativo: true,
}

function camposDoTomador(tomador?: TomadorRecord | null): Campos {
  if (!tomador) return VAZIO
  const e = tomador.endereco ?? {}
  return {
    cpfCnpj: tomador.cpfCnpj ?? '',
    razaoSocial: tomador.razaoSocial ?? '',
    email: tomador.email ?? '',
    telefone: tomador.telefone ?? '',
    inscricaoMunicipal: tomador.inscricaoMunicipal ?? '',
    cep: e.cep ?? '',
    logradouro: e.logradouro ?? '',
    numero: e.numero ?? '',
    complemento: e.complemento ?? '',
    bairro: e.bairro ?? '',
    municipio: e.municipio ?? '',
    municipioIbge: e.municipioIbge ?? '',
    uf: e.uf ?? '',
    ativo: tomador.ativo !== false,
  }
}

export function TomadorForm({
  open, onOpenChange, prestador, tomador, documentosDaCarteira, onSaved,
}: TomadorFormProps) {
  const editando = !!tomador
  // `key` no AppModal remonta o formulário a cada troca de tomador — sem isso o
  // estado do último editado vazaria para o próximo.
  const [campos, setCampos] = useState<Campos>(() => camposDoTomador(tomador))
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [tentouSalvar, setTentouSalvar] = useState(false)
  const { buscar: buscarCep, loading: buscandoCep, error: erroCep } = useViaCep()

  function set<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((atual) => ({ ...atual, [campo]: valor }))
  }

  const erros = useMemo(
    () =>
      validarTomador({
        cpfCnpj: campos.cpfCnpj,
        razaoSocial: campos.razaoSocial,
        email: campos.email,
        municipioIbge: campos.municipioIbge,
        prestadorCpfCnpj: prestador.cpfCnpj,
        documentosDaCarteira,
        idAtual: tomador?.id ?? null,
      }),
    [campos, prestador.cpfCnpj, documentosDaCarteira, tomador?.id]
  )

  // O conflito de documento é mostrado assim que o CPF/CNPJ fica completo, sem
  // esperar o submit: descobrir que "o tomador é o próprio cliente" só depois de
  // preencher o endereço inteiro é o tipo de erro que faz o contador desistir da
  // tela. O resto das mensagens só aparece quando ele tenta salvar.
  const documentoDigits = somenteDigitos(campos.cpfCnpj)
  const documentoCompleto = documentoDigits.length === 11 || documentoDigits.length === 14
  const idDuplicado = documentoCompleto ? documentosDaCarteira.get(documentoDigits) : undefined
  const conflitoDocumento = !documentoCompleto
    ? null
    : mesmoDocumento(documentoDigits, prestador.cpfCnpj)
      ? ERRO_TOMADOR_IGUAL_PRESTADOR
      : idDuplicado && idDuplicado !== tomador?.id
        ? 'Este CPF/CNPJ já está na carteira deste cliente.'
        : null

  async function preencherPeloCep(valorFormatado: string) {
    if (somenteDigitos(valorFormatado).length !== 8) return
    const resultado = await buscarCep(valorFormatado)
    if (!resultado) return

    setCampos((atual) => ({
      ...atual,
      logradouro: resultado.logradouro || atual.logradouro,
      bairro: resultado.bairro || atual.bairro,
      municipio: resultado.cidade || atual.municipio,
      uf: resultado.uf || atual.uf,
      // O ViaCEP devolve o código IBGE, mas o use-viacep ainda o descarta (o
      // patch do hook está registrado como dependência externa). A leitura
      // defensiva faz o campo passar a ser preenchido sozinho no dia em que o
      // hook expuser `ibge`, sem tocar neste arquivo — até lá, digita-se na mão.
      municipioIbge: (resultado as { ibge?: string }).ibge || atual.municipioIbge,
    }))
  }

  async function salvar() {
    setTentouSalvar(true)
    if (erros.length > 0) return

    setSalvando(true)
    setErroSalvar(null)
    try {
      const valores = {
        cpfCnpj: campos.cpfCnpj,
        razaoSocial: campos.razaoSocial,
        email: campos.email,
        telefone: campos.telefone,
        inscricaoMunicipal: campos.inscricaoMunicipal,
        endereco: limparEndereco({
          cep: campos.cep,
          logradouro: campos.logradouro,
          numero: campos.numero,
          complemento: campos.complemento,
          bairro: campos.bairro,
          municipio: campos.municipio,
          municipioIbge: somenteDigitos(campos.municipioIbge),
          uf: campos.uf,
        }),
        ativo: campos.ativo,
      }

      if (editando && tomador) {
        const { contratosSincronizados } = await atualizarTomador({
          id: tomador.id,
          valores,
          anterior: { razaoSocial: tomador.razaoSocial, cpfCnpj: tomador.cpfCnpj },
        })
        toast.success(
          contratosSincronizados > 0
            ? `Tomador atualizado. ${contratosSincronizados} contrato(s) recorrente(s) receberam o novo cadastro.`
            : 'Tomador atualizado.'
        )
        onSaved({ contratosSincronizados })
      } else {
        await criarTomador({ prestador, valores })
        toast.success('Tomador cadastrado na carteira.')
        onSaved({ contratosSincronizados: 0 })
      }
      onOpenChange(false)
    } catch (err) {
      // Estado de erro não vira sucesso silencioso: a mensagem fica na tela e o
      // modal continua aberto com o que foi digitado.
      setErroSalvar(getErrorMessage(err, 'Não foi possível salvar o tomador. Verifique os dados e suas permissões.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<UserPlus className="h-4 w-4" />}
      title={editando ? 'Editar tomador' : 'Novo tomador'}
      description={
        <>
          A nota sai de <strong>{prestador.razaoSocial}</strong>{' '}
          ({formatCpfCnpj(prestador.cpfCnpj)}) para o tomador cadastrado aqui.
        </>
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? 'Salvar alterações' : 'Cadastrar tomador'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {erroSalvar && (
          <InlineAlert
            tone="danger"
            title="O tomador não foi salvo"
            description={erroSalvar}
            action={{ label: 'Tentar de novo', onClick: () => void salvar() }}
          />
        )}

        {tentouSalvar && erros.length > 0 && (
          <InlineAlert
            tone="danger"
            title={erros.length === 1 ? 'Corrija antes de salvar' : `Corrija ${erros.length} itens antes de salvar`}
            description={erros.join(' ')}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tomador-cpfCnpj" required>CPF/CNPJ do tomador</Label>
            <CpfCnpjInput
              id="tomador-cpfCnpj"
              value={campos.cpfCnpj}
              onChange={(mascarado) => set('cpfCnpj', mascarado)}
              aria-invalid={conflitoDocumento ? true : undefined}
            />
            {conflitoDocumento ? (
              <p role="alert" className="text-xs font-medium text-destructive">{conflitoDocumento}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Quem recebe o serviço — o cliente do seu cliente.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tomador-razaoSocial" required>Nome / razão social</Label>
            <Input
              id="tomador-razaoSocial"
              value={campos.razaoSocial}
              onChange={(e) => set('razaoSocial', e.target.value)}
              placeholder="Como sai na nota"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tomador-email">E-mail</Label>
            <Input
              id="tomador-email"
              type="email"
              value={campos.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="Para onde a nota é enviada"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tomador-telefone">Telefone</Label>
            <Input
              id="tomador-telefone"
              value={campos.telefone}
              onChange={(e) => set('telefone', formatPhone(e.target.value))}
              placeholder="(11) 3333-4444"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Endereço</h3>
            <span className="text-xs text-muted-foreground">
              Opcional no cadastro, exigido por algumas prefeituras na emissão.
            </span>
          </div>

          {erroCep && <InlineAlert tone="warning" title="CEP não consultado" description={erroCep} />}

          <div className="grid gap-4 sm:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tomador-cep">CEP</Label>
              <div className="relative">
                <Input
                  id="tomador-cep"
                  value={campos.cep}
                  maxLength={9}
                  className="pr-8"
                  onChange={(e) => {
                    const formatado = formatCep(e.target.value)
                    set('cep', formatado)
                    void preencherPeloCep(formatado)
                  }}
                  placeholder="00000-000"
                />
                {buscandoCep && (
                  <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tomador-logradouro">Logradouro</Label>
              <Input id="tomador-logradouro" value={campos.logradouro} onChange={(e) => set('logradouro', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tomador-numero">Número</Label>
              <Input id="tomador-numero" value={campos.numero} onChange={(e) => set('numero', e.target.value)} />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tomador-bairro">Bairro</Label>
              <Input id="tomador-bairro" value={campos.bairro} onChange={(e) => set('bairro', e.target.value)} />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tomador-complemento">Complemento</Label>
              <Input id="tomador-complemento" value={campos.complemento} onChange={(e) => set('complemento', e.target.value)} />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tomador-municipio">Município</Label>
              <Input id="tomador-municipio" value={campos.municipio} onChange={(e) => set('municipio', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>UF</Label>
              <Select value={campos.uf} onValueChange={(v) => set('uf', String(v ?? ''))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tomador-ibge">Código IBGE do município</Label>
              <Input
                id="tomador-ibge"
                value={campos.municipioIbge}
                maxLength={7}
                onChange={(e) => set('municipioIbge', somenteDigitos(e.target.value))}
                placeholder="7 dígitos"
              />
              <p className="text-xs text-muted-foreground">
                Preenchido pelo CEP quando disponível. Prefeituras como Cajamar exigem este código para emitir.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tomador-im">Inscrição municipal</Label>
            <Input
              id="tomador-im"
              value={campos.inscricaoMunicipal}
              onChange={(e) => set('inscricaoMunicipal', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Só é cobrada quando o ISS é retido na fonte pelo tomador.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
            <Switch
              checked={campos.ativo}
              onCheckedChange={(v) => set('ativo', Boolean(v))}
              aria-label="Tomador ativo"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">Tomador ativo</p>
              <p className="text-xs text-muted-foreground">
                Inativo some das opções de contrato novo, mas continua no histórico das notas já emitidas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppModal>
  )
}
