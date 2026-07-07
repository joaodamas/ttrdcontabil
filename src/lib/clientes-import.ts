import * as XLSX from 'xlsx'
import { validateCpf, validateCnpj } from '@/lib/utils'

export const REGIMES_VALIDOS = ['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei', 'isento'] as const
export const STATUS_VALIDOS = ['ativo', 'inativo', 'suspenso'] as const

export interface ClienteImportColumn {
  key: string
  label: string
  obrigatorio?: boolean
  exemplo?: string
}

// Só dados cadastrais — nenhum campo de credencial/senha entra aqui de propósito.
export const CLIENTE_COLUMNS: ClienteImportColumn[] = [
  { key: 'cpfCnpj', label: 'CPF/CNPJ', obrigatorio: true, exemplo: '12.345.678/0001-90' },
  { key: 'tipoPessoa', label: 'Tipo Pessoa (pf/pj)', exemplo: 'pj' },
  { key: 'razaoSocial', label: 'Razão Social / Nome', obrigatorio: true, exemplo: 'ACME CONTABILIDADE LTDA' },
  { key: 'nomeFantasia', label: 'Nome Fantasia', exemplo: 'Acme' },
  { key: 'status', label: 'Status (ativo/inativo/suspenso)', exemplo: 'ativo' },
  { key: 'regimeTributario', label: 'Regime (simples_nacional/lucro_presumido/lucro_real/mei/isento)', exemplo: 'simples_nacional' },
  { key: 'email', label: 'E-mail', exemplo: 'contato@acme.com.br' },
  { key: 'telefone', label: 'Telefone', exemplo: '(11) 3333-4444' },
  { key: 'celular', label: 'Celular', exemplo: '(11) 98888-7777' },
  { key: 'whatsapp', label: 'WhatsApp principal', exemplo: '(11) 98888-7777' },
  { key: 'whatsappFinanceiro', label: 'WhatsApp financeiro', exemplo: '(11) 97777-6666' },
  { key: 'cep', label: 'CEP', exemplo: '01310-100' },
  { key: 'logradouro', label: 'Logradouro', exemplo: 'Av. Paulista' },
  { key: 'numero', label: 'Número', exemplo: '1000' },
  { key: 'complemento', label: 'Complemento', exemplo: 'Sala 10' },
  { key: 'bairro', label: 'Bairro', exemplo: 'Bela Vista' },
  { key: 'cidade', label: 'Cidade', exemplo: 'São Paulo' },
  { key: 'uf', label: 'UF', exemplo: 'SP' },
  { key: 'inscricaoEstadual', label: 'Inscrição Estadual' },
  { key: 'inscricaoMunicipal', label: 'Inscrição Municipal' },
  { key: 'nire', label: 'NIRE' },
  { key: 'capitalSocial', label: 'Capital Social' },
  { key: 'porteEmpresa', label: 'Porte da Empresa' },
  { key: 'cadastroImovelIptu', label: 'Cadastro do Imóvel (IPTU)' },
  { key: 'cnaePrincipal', label: 'CNAE Principal' },
  { key: 'cnaeSecundario', label: 'CNAE Secundário' },
  { key: 'codSimplesNacional', label: 'Código do Simples Nacional' },
  { key: 'mensalidade', label: 'Mensalidade (R$)', exemplo: '250' },
  { key: 'vencimento', label: 'Dia de Vencimento', exemplo: '10' },
  { key: 'diaEmissaoNFSe', label: 'Dia de Emissão NFS-e (1-31)', exemplo: '5' },
  { key: 'responsavelNome', label: 'Responsável — Nome' },
  { key: 'responsavelEmail', label: 'Responsável — E-mail' },
  { key: 'responsavelTelefone', label: 'Responsável — Telefone' },
  { key: 'responsavelCelular', label: 'Responsável — Celular' },
  { key: 'responsavelCpf', label: 'Responsável — CPF' },
  { key: 'responsavelRg', label: 'Responsável — RG' },
  { key: 'responsavelDataNascimento', label: 'Responsável — Data Nascimento' },
  { key: 'responsavelEstadoCivil', label: 'Responsável — Estado Civil' },
  { key: 'responsavelFinanceiroNome', label: 'Financeiro — Nome' },
  { key: 'responsavelFinanceiroCargo', label: 'Financeiro — Cargo' },
  { key: 'responsavelFinanceiroEmail', label: 'Financeiro — E-mail' },
  { key: 'responsavelFinanceiroTelefone', label: 'Financeiro — Telefone' },
  { key: 'observacoes', label: 'Observações' },
]

export interface ServicoImportColumn {
  key: string
  label: string
  obrigatorio?: boolean
  exemplo?: string
}

export const SERVICO_COLUMNS: ServicoImportColumn[] = [
  { key: 'cpfCnpjCliente', label: 'CPF/CNPJ do Cliente', obrigatorio: true, exemplo: '12.345.678/0001-90' },
  { key: 'servico', label: 'Código do Serviço (ver Configurações → Tipos de Serviço)', obrigatorio: true, exemplo: 'COB04' },
  { key: 'valor', label: 'Valor (R$)', obrigatorio: true, exemplo: '250' },
  { key: 'diaVencimento', label: 'Dia de Vencimento (1-31)', exemplo: '10' },
  { key: 'dataInicio', label: 'Data de Início (dd/mm/aaaa)', exemplo: '01/07/2026' },
  { key: 'observacoes', label: 'Observações' },
]

const SHEET_CLIENTES = 'Clientes'
const SHEET_SERVICOS = 'Serviços'
const SHEET_INSTRUCOES = 'Instruções'

export function gerarTemplateClientesXlsx() {
  const wb = XLSX.utils.book_new()

  const instrucoes = [
    ['Como preencher esta planilha'],
    [''],
    ['1. Preencha a aba "Clientes" — uma linha por cliente. CPF/CNPJ e Razão Social são obrigatórios.'],
    ['2. Preencha a aba "Serviços" — uma linha por serviço vinculado a um cliente (um cliente pode ter várias linhas). O CPF/CNPJ precisa bater com uma linha da aba Clientes.'],
    ['3. O campo "Código do Serviço" precisa ser o código exato (ex: COB04) de um serviço já cadastrado em Configurações → Tipos de Serviço — não o nome, porque vários serviços podem ter o mesmo nome com códigos e valores diferentes.'],
    ['4. Não inclua senhas, certificados ou credenciais em nenhuma aba — isso é feito depois, individualmente, pela tela de cada cliente.'],
    ['5. Salve o arquivo e suba pela tela Clientes → Importar. O sistema mostra um preview com o que vai ser criado e o que tem erro antes de gravar qualquer coisa.'],
    [''],
    ['Valores aceitos'],
    ['Tipo Pessoa: pf ou pj'],
    ['Status: ativo, inativo ou suspenso (padrão: ativo)'],
    ['Regime: simples_nacional, lucro_presumido, lucro_real, mei ou isento'],
  ]
  const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes)
  wsInstrucoes['!cols'] = [{ wch: 100 }]
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, SHEET_INSTRUCOES)

  const clienteHeader = CLIENTE_COLUMNS.map((c) => c.label)
  const clienteExemplo = CLIENTE_COLUMNS.map((c) => c.exemplo ?? '')
  const wsClientes = XLSX.utils.aoa_to_sheet([clienteHeader, clienteExemplo])
  wsClientes['!cols'] = CLIENTE_COLUMNS.map((c) => ({ wch: Math.max(18, c.label.length) }))
  XLSX.utils.book_append_sheet(wb, wsClientes, SHEET_CLIENTES)

  const servicoHeader = SERVICO_COLUMNS.map((c) => c.label)
  const servicoExemplo = SERVICO_COLUMNS.map((c) => c.exemplo ?? '')
  const wsServicos = XLSX.utils.aoa_to_sheet([servicoHeader, servicoExemplo])
  wsServicos['!cols'] = SERVICO_COLUMNS.map((c) => ({ wch: Math.max(18, c.label.length) }))
  XLSX.utils.book_append_sheet(wb, wsServicos, SHEET_SERVICOS)

  XLSX.writeFile(wb, 'modelo-importacao-clientes.xlsx')
}

export type RawRow = Record<string, string>

function sheetToRows(ws: XLSX.WorkSheet, columns: { key: string; label: string }[]): RawRow[] {
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  const labelToKey = new Map(columns.map((c) => [c.label, c.key]))
  return data
    .map((row) => {
      const out: RawRow = {}
      for (const [label, value] of Object.entries(row)) {
        const key = labelToKey.get(label)
        if (key) out[key] = String(value ?? '').trim()
      }
      return out
    })
    // ignora a linha de exemplo (repete o texto do exemplo da razão social) e linhas totalmente vazias
    .filter((row) => Object.values(row).some((v) => v !== ''))
}

export async function parseClientesWorkbook(file: File): Promise<{ clientes: RawRow[]; servicos: RawRow[] }> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const wsClientes = wb.Sheets[SHEET_CLIENTES]
  const wsServicos = wb.Sheets[SHEET_SERVICOS]
  if (!wsClientes) throw new Error('A planilha precisa ter uma aba chamada "Clientes".')

  const clientes = sheetToRows(wsClientes, CLIENTE_COLUMNS)
  const servicos = wsServicos ? sheetToRows(wsServicos, SERVICO_COLUMNS) : []
  return { clientes, servicos }
}

export interface ClienteValidado {
  linha: number
  raw: RawRow
  cpfCnpjDigits: string
  erros: string[]
  payload: Record<string, unknown>
}

export function validarClienteRow(row: RawRow, linha: number, cnpjsExistentes: Set<string>, cnpjsNaPlanilha: Map<string, number>): ClienteValidado {
  const erros: string[] = []
  const cpfCnpjDigits = (row.cpfCnpj ?? '').replace(/\D/g, '')

  if (!row.razaoSocial) erros.push('Razão Social é obrigatória')
  if (!cpfCnpjDigits) {
    erros.push('CPF/CNPJ é obrigatório')
  } else if (cpfCnpjDigits.length === 11 ? !validateCpf(cpfCnpjDigits) : cpfCnpjDigits.length === 14 ? !validateCnpj(cpfCnpjDigits) : true) {
    erros.push('CPF/CNPJ inválido — confira os dígitos')
  } else {
    if (cnpjsExistentes.has(cpfCnpjDigits)) erros.push('Já existe um cliente cadastrado com este CPF/CNPJ')
    const primeiraLinha = cnpjsNaPlanilha.get(cpfCnpjDigits)
    if (primeiraLinha !== undefined && primeiraLinha !== linha) erros.push(`CPF/CNPJ duplicado na planilha (linha ${primeiraLinha})`)
  }

  const tipoPessoa = row.tipoPessoa?.toLowerCase() || (cpfCnpjDigits.length === 11 ? 'pf' : 'pj')
  if (!['pf', 'pj'].includes(tipoPessoa)) erros.push('Tipo Pessoa precisa ser "pf" ou "pj"')

  const status = row.status?.toLowerCase() || 'ativo'
  if (!STATUS_VALIDOS.includes(status as typeof STATUS_VALIDOS[number])) erros.push('Status inválido — use ativo, inativo ou suspenso')

  const regimeTributario = row.regimeTributario?.toLowerCase() || undefined
  if (regimeTributario && !REGIMES_VALIDOS.includes(regimeTributario as typeof REGIMES_VALIDOS[number])) {
    erros.push('Regime tributário inválido')
  }

  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) erros.push('E-mail inválido')
  if (row.responsavelFinanceiroEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.responsavelFinanceiroEmail)) erros.push('E-mail financeiro inválido')

  let diaEmissaoNFSe: number | undefined
  if (row.diaEmissaoNFSe) {
    const n = Number(row.diaEmissaoNFSe)
    if (!Number.isInteger(n) || n < 1 || n > 31) erros.push('Dia de Emissão NFS-e precisa ser um número entre 1 e 31')
    else diaEmissaoNFSe = n
  }

  const payload: Record<string, unknown> = {
    tipoPessoa,
    razaoSocial: row.razaoSocial,
    nomeFantasia: row.nomeFantasia || undefined,
    cpfCnpj: row.cpfCnpj,
    status,
    regimeTributario,
    email: row.email || undefined,
    telefone: row.telefone || undefined,
    celular: row.celular || undefined,
    whatsapp: row.whatsapp || undefined,
    whatsappFinanceiro: row.whatsappFinanceiro || undefined,
    cep: row.cep || undefined,
    logradouro: row.logradouro || undefined,
    numero: row.numero || undefined,
    complemento: row.complemento || undefined,
    bairro: row.bairro || undefined,
    cidade: row.cidade || undefined,
    uf: row.uf || undefined,
    inscricaoEstadual: row.inscricaoEstadual || undefined,
    inscricaoMunicipal: row.inscricaoMunicipal || undefined,
    nire: row.nire || undefined,
    capitalSocial: row.capitalSocial || undefined,
    porteEmpresa: row.porteEmpresa || undefined,
    cadastroImovelIptu: row.cadastroImovelIptu || undefined,
    cnaePrincipal: row.cnaePrincipal || undefined,
    cnaeSecundario: row.cnaeSecundario || undefined,
    codSimplesNacional: row.codSimplesNacional || undefined,
    mensalidade: row.mensalidade || undefined,
    vencimento: row.vencimento || undefined,
    diaEmissaoNFSe,
    responsavelNome: row.responsavelNome || undefined,
    responsavelEmail: row.responsavelEmail || undefined,
    responsavelTelefone: row.responsavelTelefone || undefined,
    responsavelCelular: row.responsavelCelular || undefined,
    responsavelCpf: row.responsavelCpf || undefined,
    responsavelRg: row.responsavelRg || undefined,
    responsavelDataNascimento: row.responsavelDataNascimento || undefined,
    responsavelEstadoCivil: row.responsavelEstadoCivil || undefined,
    responsavelFinanceiroNome: row.responsavelFinanceiroNome || undefined,
    responsavelFinanceiroCargo: row.responsavelFinanceiroCargo || undefined,
    responsavelFinanceiroEmail: row.responsavelFinanceiroEmail || undefined,
    responsavelFinanceiroTelefone: row.responsavelFinanceiroTelefone || undefined,
    observacoes: row.observacoes || undefined,
  }

  return { linha, raw: row, cpfCnpjDigits, erros, payload }
}

export interface ServicoValidado {
  linha: number
  raw: RawRow
  erros: string[]
  cpfCnpjDigits: string
  payload: Record<string, unknown>
}

export function validarServicoRow(
  row: RawRow,
  linha: number,
  cnpjsValidosDaImportacaoOuExistentes: Set<string>,
  servicosDisponiveis: Map<string, { id: string; nome: string; codigo: string }>
): ServicoValidado {
  const erros: string[] = []
  const cpfCnpjDigits = (row.cpfCnpjCliente ?? '').replace(/\D/g, '')

  if (!cpfCnpjDigits) erros.push('CPF/CNPJ do Cliente é obrigatório')
  else if (!cnpjsValidosDaImportacaoOuExistentes.has(cpfCnpjDigits)) erros.push('CPF/CNPJ não corresponde a nenhum cliente válido (nem na planilha, nem já cadastrado)')

  // Chave é o CÓDIGO, não o nome — vários "Tipos de Serviço" podem ter nome idêntico
  // (ex: 7 planos "Contabilidade Mensal" com códigos/valores diferentes).
  const servicoKey = (row.servico ?? '').trim().toUpperCase()
  const servico = servicosDisponiveis.get(servicoKey)
  if (!row.servico) erros.push('Código do Serviço é obrigatório')
  else if (!servico) erros.push(`Código de Serviço "${row.servico}" não encontrado em Configurações → Tipos de Serviço`)

  const valor = Number((row.valor ?? '').replace(',', '.'))
  if (!row.valor || !Number.isFinite(valor) || valor <= 0) erros.push('Valor precisa ser um número maior que zero')

  let diaVencimento: number | undefined
  if (row.diaVencimento) {
    const n = Number(row.diaVencimento)
    if (!Number.isInteger(n) || n < 1 || n > 31) erros.push('Dia de Vencimento precisa ser um número entre 1 e 31')
    else diaVencimento = n
  }

  return {
    linha,
    raw: row,
    erros,
    cpfCnpjDigits,
    payload: {
      servicoId: servico?.id,
      servicoNome: servico?.nome,
      valor,
      diaVencimento,
      dataInicio: row.dataInicio || undefined,
      observacoes: row.observacoes || undefined,
    },
  }
}
