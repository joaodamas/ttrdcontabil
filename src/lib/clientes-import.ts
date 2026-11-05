import * as XLSX from 'xlsx'
import { validateCpf, validateCnpj } from '@/lib/utils'
import { CAMPOS_CREDENCIAL_LISTA } from '../../functions/src/clientes/credenciais-campos'
import { credenciaisPreenchidasDe } from '@/lib/clientes-credenciais'

export const REGIMES_VALIDOS = ['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei', 'isento'] as const
export const STATUS_VALIDOS = ['ativo', 'inativo', 'suspenso'] as const

export interface ClienteImportColumn {
  key: string
  label: string
  obrigatorio?: boolean
  exemplo?: string
}

// Os campos da ficha de cadastro do cliente (cliente-form.tsx), na mesma ordem
// das seções, inclusive logins e senhas (pedido do dono, 2026-11-05: o cliente
// preenche tudo numa planilha só). Nos EXEMPLOS, credencial nunca sai com valor —
// só "✔ preenchida na plataforma" (ver CAMPOS_CREDENCIAL).
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
  { key: 'aceiteWhatsAppCobranca', label: 'Aceite de cobrança por WhatsApp (sim/não)', exemplo: 'sim' },
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
  { key: 'loginPrefeitura', label: 'Credencial — Login Prefeitura' },
  { key: 'senhaWebPrefeitura', label: 'Credencial — Senha WEB Prefeitura' },
  { key: 'senhaPinCertificadoDigitalECnpj', label: 'Credencial — Senha PIN do Certificado Digital e-CNPJ' },
  { key: 'loginPostoFiscal', label: 'Credencial — Login do posto fiscal' },
  { key: 'senhaPostoFiscal', label: 'Credencial — Senha posto fiscal' },
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
  { key: 'responsavelComunhaoBens', label: 'Responsável — Comunhão de bens' },
  { key: 'responsavelCnh', label: 'Responsável — CNH' },
  { key: 'responsavelDataEmissao', label: 'Responsável — Data de emissão do documento (dd/mm/aaaa)' },
  { key: 'responsavelOrgaoEmissor', label: 'Responsável — Órgão emissor' },
  { key: 'responsavelLocalNascimento', label: 'Responsável — Local de nascimento' },
  { key: 'responsavelNomePai', label: 'Responsável — Nome do pai' },
  { key: 'responsavelNomeMae', label: 'Responsável — Nome da mãe' },
  { key: 'responsavelPis', label: 'Responsável — PIS' },
  { key: 'responsavelTituloEleitor', label: 'Responsável — Título de eleitor' },
  { key: 'responsavelEscolaridade', label: 'Responsável — Escolaridade' },
  { key: 'responsavelFormacaoSuperior', label: 'Responsável — Formação superior' },
  { key: 'responsavelCep', label: 'Responsável — CEP' },
  { key: 'responsavelEndereco', label: 'Responsável — Logradouro' },
  { key: 'responsavelNumero', label: 'Responsável — Número' },
  { key: 'responsavelComplemento', label: 'Responsável — Complemento' },
  { key: 'responsavelBairro', label: 'Responsável — Bairro' },
  { key: 'responsavelCidade', label: 'Responsável — Cidade' },
  { key: 'responsavelUf', label: 'Responsável — UF' },
  { key: 'responsavelSenhaMeuGov', label: 'Responsável — Senha MEU GOV' },
  { key: 'responsavelSenhaEcacPf', label: 'Responsável — Senha e-CAC PF' },
  { key: 'responsavelSenhaWebPrefeitura', label: 'Responsável — Senha WEB Prefeitura' },
  { key: 'responsavelSenhaPinCertificadoDigitalCpf', label: 'Responsável — Senha PIN do Certificado Digital CPF' },
  { key: 'responsavelFinanceiroNome', label: 'Financeiro — Nome' },
  { key: 'responsavelFinanceiroCargo', label: 'Financeiro — Cargo' },
  { key: 'responsavelFinanceiroEmail', label: 'Financeiro — E-mail' },
  { key: 'responsavelFinanceiroTelefone', label: 'Financeiro — Telefone' },
  { key: 'responsavelFinanceiroWhatsapp', label: 'Financeiro — WhatsApp' },
  { key: 'responsavelFinanceiroPreferencial', label: 'Financeiro — Contato preferencial da cobrança (sim/não)' },
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

// ─── Modelo de importação com exemplos reais ─────────────────────────────────
// O modelo é gerado pela plataforma com os dados do próprio escritório: as abas
// "Clientes" e "Serviços" vêm vazias (prontas para importar), e abas extras —
// ignoradas pela importação — mostram clientes já cadastrados como referência e
// os códigos de serviço válidos.

type Registro = Record<string, unknown>

export interface DadosModeloClientes {
  clientes: Registro[]
  servicosDosClientes: Registro[]
  tiposServico: Registro[]
}

// Credenciais nunca saem com valor no exemplo — só se estão preenchidas. Senha do
// Meu Gov/e-CAC vazada dá acesso aos dados fiscais da empresa na Receita.
// A lista mora em functions/src/clientes/credenciais-campos.ts (fonte única com
// o trigger e as regras); desde 2026-11-05 os valores ficam em
// clientes_credenciais, não em `clientes` — ver src/lib/clientes-credenciais.ts.
export const CAMPOS_CREDENCIAL: ReadonlySet<string> = new Set<string>(CAMPOS_CREDENCIAL_LISTA)
export const CREDENCIAL_PREENCHIDA = '✔ preenchida na plataforma'

// Dados pessoais do responsável não vão no exemplo: a planilha circula fora da
// plataforma. Mostra só o formato esperado.
const CAMPOS_MASCARADOS: Record<string, string> = {
  responsavelCpf: '000.000.000-00',
  responsavelRg: '00.000.000-0',
  responsavelDataNascimento: 'dd/mm/aaaa',
  responsavelDataEmissao: 'dd/mm/aaaa',
  responsavelCnh: '00000000000',
  responsavelPis: '000.00000.00-0',
  responsavelTituloEleitor: '0000 0000 0000',
  responsavelNomePai: 'Nome completo do pai',
  responsavelNomeMae: 'Nome completo da mãe',
  responsavelLocalNascimento: 'Cidade/UF',
  responsavelEndereco: 'Rua/Avenida',
  responsavelNumero: '000',
  responsavelComplemento: 'Apto/Sala',
  responsavelCep: '00000-000',
}

function texto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object' && 'toDate' in (v as object)) {
    const d = (v as { toDate: () => Date }).toDate()
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  return String(v).trim()
}

function documentoFormatado(v: unknown): string {
  const d = texto(v).replace(/\D/g, '')
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return texto(v)
}

function preenchidos(c: Registro): number {
  return CLIENTE_COLUMNS.filter((col) => texto(c[col.key]) !== '').length
}

/** Os `quantidade` clientes de cadastro mais completo — melhores exemplos. */
export function escolherClientesExemplo(clientes: Registro[], quantidade = 3): Registro[] {
  return [...clientes]
    .filter((c) => !c.deletedAt && texto(c.razaoSocial))
    .sort((a, b) => preenchidos(b) - preenchidos(a))
    .slice(0, quantidade)
}

export function montarModeloClientes(dados: DadosModeloClientes) {
  const cabCliente = CLIENTE_COLUMNS.map((c) => c.label)
  const cabServico = SERVICO_COLUMNS.map((c) => c.label)

  const exemplosClientes = [cabCliente, ...dados.clientes.map((c) =>
    CLIENTE_COLUMNS.map((col) => {
      if (CAMPOS_CREDENCIAL.has(col.key)) return (credenciaisPreenchidasDe(c) as string[]).includes(col.key) ? CREDENCIAL_PREENCHIDA : ''
      if (col.key in CAMPOS_MASCARADOS && texto(c[col.key])) return CAMPOS_MASCARADOS[col.key]
      if (col.key === 'cpfCnpj') return documentoFormatado(c.cpfCnpj)
      if (typeof c[col.key] === 'boolean') return c[col.key] ? 'sim' : 'não'
      return texto(c[col.key])
    }),
  )]

  const tipoPorId = new Map(dados.tiposServico.map((t) => [String(t.id), t]))
  const docPorCliente = new Map(dados.clientes.map((c) => [String(c.id), documentoFormatado(c.cpfCnpj)]))
  const exemplosServicos = [cabServico, ...dados.servicosDosClientes
    .filter((s) => docPorCliente.has(String(s.clienteId)))
    .map((s) => [
      docPorCliente.get(String(s.clienteId)) ?? '',
      texto(tipoPorId.get(String(s.servicoId))?.codigo) || texto(s.servicoNome),
      texto(s.valor),
      texto(s.diaVencimento),
      texto(s.dataInicio),
      texto(s.observacoes),
    ])]

  const tiposServico = [['Código', 'Serviço', 'Valor padrão (R$)', 'Frequência'], ...dados.tiposServico
    .filter((t) => t.ativo !== false)
    .map((t) => [texto(t.codigo), texto(t.nome), texto(t.valorPadrao), texto(t.frequencia)])]

  return {
    clientes: [cabCliente],
    servicos: [cabServico],
    exemplosClientes,
    exemplosServicos,
    tiposServico,
  }
}

export function gerarTemplateClientesXlsx(dados?: DadosModeloClientes) {
  const wb = XLSX.utils.book_new()
  const modelo = montarModeloClientes(dados ?? { clientes: [], servicosDosClientes: [], tiposServico: [] })

  const instrucoes = [
    ['Como preencher esta planilha'],
    [''],
    ['1. Preencha a aba "Clientes" — uma linha por cliente novo. CPF/CNPJ e Razão Social são obrigatórios.'],
    ['2. Preencha a aba "Serviços" — uma linha por serviço contratado (um cliente pode ter várias linhas). O CPF/CNPJ precisa bater com uma linha da aba Clientes.'],
    ['3. Use as abas "Exemplo – Clientes" e "Exemplo – Serviços" como referência: são clientes já cadastrados na plataforma, preenchidos do jeito que a importação aceita. Elas NÃO são importadas.'],
    ['4. "Código do Serviço" precisa ser um dos códigos da aba "Tipos de Serviço" (ex: COB04) — não o nome.'],
    ['5. O arquivo do certificado digital (.pfx) não vai na planilha — é enviado depois, na configuração fiscal do cliente.'],
    ['6. Salve e suba pela tela Clientes → Importar. O sistema mostra uma prévia com o que vai ser criado e o que tem erro antes de gravar qualquer coisa.'],
    [''],
    ['Valores aceitos'],
    ['Tipo Pessoa: pf ou pj'],
    ['Status: ativo, inativo ou suspenso (padrão: ativo)'],
    ['Regime: simples_nacional, lucro_presumido, lucro_real, mei ou isento'],
    ['Aceite de cobrança por WhatsApp e Contato preferencial: sim ou não'],
    ['Datas: dd/mm/aaaa · Valores: só números, com vírgula ou ponto para centavos (ex: 450 ou 450,50)'],
    [''],
    ['Os campos são os mesmos da ficha de cadastro do cliente na plataforma, inclusive logins e senhas (prefeitura, posto fiscal, PIN do certificado, Meu Gov, e-CAC).'],
    ['Nos exemplos, as senhas aparecem só como "✔ preenchida na plataforma" — o valor nunca sai da plataforma.'],
    [''],
    ['ATENÇÃO — esta planilha, preenchida, contém senhas: envie e receba por canal protegido (arquivo com senha, link com acesso restrito) e apague as cópias depois de importar.'],
  ]
  const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes)
  wsInstrucoes['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, SHEET_INSTRUCOES)

  const larguraCliente = CLIENTE_COLUMNS.map((c) => ({ wch: Math.max(18, c.label.length) }))
  const larguraServico = SERVICO_COLUMNS.map((c) => ({ wch: Math.max(18, c.label.length) }))
  const aba = (linhas: string[][], cols: { wch: number }[], nome: string) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas)
    ws['!cols'] = cols
    XLSX.utils.book_append_sheet(wb, ws, nome)
  }
  aba(modelo.clientes, larguraCliente, SHEET_CLIENTES)
  aba(modelo.servicos, larguraServico, SHEET_SERVICOS)
  aba(modelo.exemplosClientes, larguraCliente, 'Exemplo – Clientes')
  aba(modelo.exemplosServicos, larguraServico, 'Exemplo – Serviços')
  aba(modelo.tiposServico, [{ wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 14 }], 'Tipos de Serviço')

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

  const simNao = (campo: string, rotulo: string): boolean | undefined => {
    const v = (row[campo] ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    if (!v) return undefined
    if (['sim', 's', 'x', 'yes', 'true', '1'].includes(v)) return true
    if (['nao', 'n', 'no', 'false', '0'].includes(v)) return false
    erros.push(`${rotulo}: use sim ou não`)
    return undefined
  }
  const aceiteWhatsAppCobranca = simNao('aceiteWhatsAppCobranca', 'Aceite de cobrança por WhatsApp')
  const responsavelFinanceiroPreferencial = simNao('responsavelFinanceiroPreferencial', 'Contato preferencial da cobrança')

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
    // Mesmos campos que a ficha grava. O texto do exemplo nunca é importado como senha.
    ...Object.fromEntries([...CAMPOS_CREDENCIAL].map((k) => [k, row[k] && row[k] !== CREDENCIAL_PREENCHIDA ? row[k] : undefined])),
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
    responsavelComunhaoBens: row.responsavelComunhaoBens || undefined,
    responsavelCnh: row.responsavelCnh || undefined,
    responsavelDataEmissao: row.responsavelDataEmissao || undefined,
    responsavelOrgaoEmissor: row.responsavelOrgaoEmissor || undefined,
    responsavelLocalNascimento: row.responsavelLocalNascimento || undefined,
    responsavelNomePai: row.responsavelNomePai || undefined,
    responsavelNomeMae: row.responsavelNomeMae || undefined,
    responsavelPis: row.responsavelPis || undefined,
    responsavelTituloEleitor: row.responsavelTituloEleitor || undefined,
    responsavelEscolaridade: row.responsavelEscolaridade || undefined,
    responsavelFormacaoSuperior: row.responsavelFormacaoSuperior || undefined,
    responsavelCep: row.responsavelCep || undefined,
    responsavelEndereco: row.responsavelEndereco || undefined,
    responsavelNumero: row.responsavelNumero || undefined,
    responsavelComplemento: row.responsavelComplemento || undefined,
    responsavelBairro: row.responsavelBairro || undefined,
    responsavelCidade: row.responsavelCidade || undefined,
    responsavelUf: row.responsavelUf || undefined,
    responsavelFinanceiroNome: row.responsavelFinanceiroNome || undefined,
    responsavelFinanceiroCargo: row.responsavelFinanceiroCargo || undefined,
    responsavelFinanceiroEmail: row.responsavelFinanceiroEmail || undefined,
    responsavelFinanceiroTelefone: row.responsavelFinanceiroTelefone || undefined,
    responsavelFinanceiroWhatsapp: row.responsavelFinanceiroWhatsapp || undefined,
    responsavelFinanceiroPreferencial,
    aceiteWhatsAppCobranca,
    // Mesmo registro que a ficha faz ao marcar o aceite: data e origem.
    aceiteWhatsAppCobrancaEm: aceiteWhatsAppCobranca ? new Date().toISOString() : undefined,
    aceiteWhatsAppCobrancaOrigem: aceiteWhatsAppCobranca ? 'Planilha de cadastro' : undefined,
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
