import { CAMPOS_CREDENCIAL, CLIENTE_COLUMNS } from '@/lib/clientes-import'

/**
 * Ficha completa do cliente agrupada nas mesmas seções do formulário de
 * cadastro (cliente-form.tsx). Usa CLIENTE_COLUMNS — a mesma lista da planilha
 * de importação e do relatório — para que tela, planilha e relatório tenham
 * exatamente os mesmos campos.
 */
export interface CampoFicha {
  key: string
  label: string
  valor: string
  credencial: boolean
}

export interface SecaoFicha {
  titulo: string
  campos: CampoFicha[]
  preenchidos: number
}

const SECOES: { titulo: string; pertence: (key: string) => boolean }[] = [
  { titulo: 'Dados gerais', pertence: (k) => ['cpfCnpj', 'tipoPessoa', 'razaoSocial', 'nomeFantasia', 'status', 'regimeTributario', 'email', 'telefone', 'celular'].includes(k) },
  { titulo: 'Cobrança por WhatsApp', pertence: (k) => ['whatsapp', 'whatsappFinanceiro', 'aceiteWhatsAppCobranca'].includes(k) },
  { titulo: 'Endereço', pertence: (k) => ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].includes(k) },
  { titulo: 'Credenciais da empresa', pertence: (k) => CAMPOS_CREDENCIAL.has(k) && !k.startsWith('responsavel') },
  { titulo: 'Dados cadastrais da empresa', pertence: (k) => ['inscricaoEstadual', 'inscricaoMunicipal', 'nire', 'capitalSocial', 'porteEmpresa', 'cadastroImovelIptu', 'cnaePrincipal', 'cnaeSecundario', 'codSimplesNacional', 'mensalidade', 'vencimento', 'diaEmissaoNFSe'].includes(k) },
  { titulo: 'Credenciais do representante', pertence: (k) => CAMPOS_CREDENCIAL.has(k) && k.startsWith('responsavel') },
  { titulo: 'Endereço do representante', pertence: (k) => ['responsavelCep', 'responsavelEndereco', 'responsavelNumero', 'responsavelComplemento', 'responsavelBairro', 'responsavelCidade', 'responsavelUf'].includes(k) },
  { titulo: 'Representante', pertence: (k) => k.startsWith('responsavel') && !k.startsWith('responsavelFinanceiro') },
  { titulo: 'Financeiro', pertence: (k) => k.startsWith('responsavelFinanceiro') },
  { titulo: 'Observações', pertence: (k) => k === 'observacoes' },
]

// Ordem de exibição (a de cima é a ordem de classificação: o primeiro que casa ganha).
const ORDEM = ['Dados gerais', 'Cobrança por WhatsApp', 'Endereço', 'Dados cadastrais da empresa', 'Credenciais da empresa',
  'Representante', 'Endereço do representante', 'Credenciais do representante', 'Financeiro', 'Observações']

function texto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'object' && 'toDate' in (v as object)) {
    const d = (v as { toDate: () => Date }).toDate()
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  return String(v).trim()
}

/** Rótulo sem o prefixo "Responsável — " / "Credencial — " (a seção já diz). */
function rotulo(label: string) {
  return label.replace(/^(Responsável|Credencial|Financeiro) — /, '')
}

export function montarFichaCliente(cliente: Record<string, unknown>) {
  const grupos = new Map<string, CampoFicha[]>()
  for (const col of CLIENTE_COLUMNS) {
    const secao = SECOES.find((s) => s.pertence(col.key))?.titulo ?? 'Outros'
    const lista = grupos.get(secao) ?? []
    lista.push({ key: col.key, label: rotulo(col.label), valor: texto(cliente[col.key]), credencial: CAMPOS_CREDENCIAL.has(col.key) })
    grupos.set(secao, lista)
  }
  const secoes: SecaoFicha[] = [...ORDEM, 'Outros']
    .filter((t) => grupos.has(t))
    .map((titulo) => {
      const campos = grupos.get(titulo)!
      return { titulo, campos, preenchidos: campos.filter((c) => c.valor).length }
    })
  const total = secoes.reduce((n, s) => n + s.campos.length, 0)
  const preenchidos = secoes.reduce((n, s) => n + s.preenchidos, 0)
  return { secoes, total, preenchidos }
}
