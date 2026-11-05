/**
 * Importação de carteiras de tomadores por planilha.
 *
 * Mesmo desenho de src/lib/clientes-import.ts: template com uma aba de
 * instruções, leitura por RÓTULO da coluna e validação linha a linha que devolve
 * erros em vez de gravar — o contador sobe a carteira inteira de um cliente de
 * uma vez, e uma linha errada no meio não pode contaminar as outras.
 *
 * `validarTomadorRow` é puro (recebe os mapas prontos) justamente para ser
 * testado: é onde mora a recusa de prestador == tomador em massa.
 */
import * as XLSX from 'xlsx'
import { UFS } from '@/lib/utils'
import type { PrestadorResumo } from './types'
import { limparEndereco } from './endereco'
import {
  ERRO_TOMADOR_IGUAL_PRESTADOR,
  documentoValido,
  emailValido,
  ibgeValido,
  mesmoDocumento,
  somenteDigitos,
  MAX_RAZAO_SOCIAL,
} from './validacao'

export interface TomadorImportColumn {
  key: string
  label: string
  obrigatorio?: boolean
  exemplo?: string
}

// A ordem das colunas é a ordem em que o contador preenche: primeiro de quem é
// a carteira, depois quem é o tomador, depois o endereço.
export const TOMADOR_COLUMNS: TomadorImportColumn[] = [
  { key: 'cpfCnpjPrestador', label: 'CNPJ do Prestador (cliente do escritório)', obrigatorio: true, exemplo: '12.345.678/0001-90' },
  { key: 'cpfCnpj', label: 'CPF/CNPJ do Tomador', obrigatorio: true, exemplo: '98.765.432/0001-10' },
  { key: 'razaoSocial', label: 'Nome / Razão Social do Tomador', obrigatorio: true, exemplo: 'PADARIA CENTRAL LTDA' },
  { key: 'cep', label: 'CEP', exemplo: '01310-100' },
  { key: 'logradouro', label: 'Logradouro', exemplo: 'Av. Paulista' },
  { key: 'numero', label: 'Número', exemplo: '1000' },
  { key: 'bairro', label: 'Bairro', exemplo: 'Bela Vista' },
  { key: 'municipio', label: 'Município', exemplo: 'São Paulo' },
  { key: 'uf', label: 'UF', exemplo: 'SP' },
  { key: 'complemento', label: 'Complemento', exemplo: 'Sala 10' },
  { key: 'email', label: 'E-mail', exemplo: 'financeiro@padaria.com.br' },
  { key: 'telefone', label: 'Telefone', exemplo: '(11) 3333-4444' },
  { key: 'inscricaoMunicipal', label: 'Inscrição Municipal', exemplo: '1234567' },
  // Opcional e por último de propósito: quase ninguém tem o código à mão, mas
  // quem tem evita a viagem ao ViaCEP tomador a tomador. É o campo que a
  // prefeitura de Cajamar exige na emissão (<Cidade> do tomador).
  { key: 'municipioIbge', label: 'Código IBGE do Município (opcional)', exemplo: '3550308' },
]

const SHEET_TOMADORES = 'Tomadores'
const SHEET_INSTRUCOES = 'Instruções'

export function gerarTemplateTomadoresXlsx() {
  const wb = XLSX.utils.book_new()

  const instrucoes = [
    ['Como preencher a carteira de tomadores'],
    [''],
    ['1. O PRESTADOR é o seu cliente — quem emite a nota. O TOMADOR é o cliente DELE, quem recebe o serviço e paga.'],
    ['2. Uma linha por tomador. O mesmo prestador se repete em quantas linhas forem necessárias.'],
    ['3. O CNPJ do prestador precisa ser de um cliente já cadastrado no sistema.'],
    ['4. O CPF/CNPJ do tomador NÃO pode ser igual ao do prestador: a nota sai do prestador para o tomador, e ninguém emite nota para si mesmo.'],
    ['5. Endereço é opcional no cadastro, mas algumas prefeituras exigem na hora de emitir. Preencha o que tiver.'],
    ['6. Depois de enviar, você vê um preview com o que vai ser criado e o que tem erro. Nada é gravado antes da sua confirmação.'],
    [''],
    ['Observações'],
    ['CPF/CNPJ pode ser enviado com ou sem máscara — o sistema guarda só os dígitos.'],
    ['O Código IBGE é opcional aqui; quando em branco, preencha depois pelo formulário do tomador (o CEP traz o código automaticamente).'],
  ]
  const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes)
  wsInstrucoes['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, SHEET_INSTRUCOES)

  const header = TOMADOR_COLUMNS.map((c) => c.label)
  const exemplo = TOMADOR_COLUMNS.map((c) => c.exemplo ?? '')
  const ws = XLSX.utils.aoa_to_sheet([header, exemplo])
  ws['!cols'] = TOMADOR_COLUMNS.map((c) => ({ wch: Math.max(18, c.label.length) }))
  XLSX.utils.book_append_sheet(wb, ws, SHEET_TOMADORES)

  XLSX.writeFile(wb, 'modelo-importacao-tomadores.xlsx')
}

export type RawRow = Record<string, string>

function sheetToRows(ws: XLSX.WorkSheet, columns: TomadorImportColumn[]): RawRow[] {
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
    .filter((row) => Object.values(row).some((v) => v !== ''))
}

export async function parseTomadoresWorkbook(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[SHEET_TOMADORES]
  if (!ws) throw new Error(`A planilha precisa ter uma aba chamada "${SHEET_TOMADORES}".`)
  return sheetToRows(ws, TOMADOR_COLUMNS)
}

/** Chave de carteira: o mesmo CNPJ pode ser tomador de dois prestadores diferentes. */
export function chaveCarteira(clienteId: string, cpfCnpjDigits: string): string {
  return `${clienteId}:${cpfCnpjDigits}`
}

export interface ContextoImportacaoTomadores {
  /** Documento (só dígitos) do prestador → cliente do escritório. */
  prestadoresPorDocumento: ReadonlyMap<string, PrestadorResumo>
  /** `chaveCarteira()` → id do tomador que já existe na carteira. */
  carteiraExistente: ReadonlyMap<string, string>
  /** `chaveCarteira()` → primeira linha da planilha onde o par apareceu. */
  paresNaPlanilha: ReadonlyMap<string, number>
}

export interface TomadorImportRow {
  linha: number
  raw: RawRow
  erros: string[]
  /** Preenchido só quando o prestador foi encontrado. */
  clienteId?: string
  clienteNome?: string
  cpfCnpjDigits: string
  payload: Record<string, unknown>
}

/** Monta o mapa de pares para detectar duplicata dentro da própria planilha. */
export function mapearParesDaPlanilha(
  rows: RawRow[],
  prestadoresPorDocumento: ReadonlyMap<string, PrestadorResumo>,
): Map<string, number> {
  const pares = new Map<string, number>()
  rows.forEach((row, i) => {
    const prestador = prestadoresPorDocumento.get(somenteDigitos(row.cpfCnpjPrestador))
    const tomador = somenteDigitos(row.cpfCnpj)
    if (!prestador || !tomador) return
    const chave = chaveCarteira(prestador.id, tomador)
    if (!pares.has(chave)) pares.set(chave, i + 1)
  })
  return pares
}

export function validarTomadorRow(
  row: RawRow,
  linha: number,
  ctx: ContextoImportacaoTomadores,
): TomadorImportRow {
  const erros: string[] = []
  const prestadorDigits = somenteDigitos(row.cpfCnpjPrestador)
  const cpfCnpjDigits = somenteDigitos(row.cpfCnpj)
  const prestador = prestadorDigits ? ctx.prestadoresPorDocumento.get(prestadorDigits) : undefined

  if (!prestadorDigits) {
    erros.push('CNPJ do prestador é obrigatório')
  } else if (!prestador) {
    erros.push('CNPJ do prestador não corresponde a nenhum cliente cadastrado')
  }

  const razaoSocial = (row.razaoSocial ?? '').trim()
  if (!razaoSocial) erros.push('Nome / razão social do tomador é obrigatório')
  else if (razaoSocial.length > MAX_RAZAO_SOCIAL) erros.push(`Nome / razão social passa de ${MAX_RAZAO_SOCIAL} caracteres`)

  if (!cpfCnpjDigits) {
    erros.push('CPF/CNPJ do tomador é obrigatório')
  } else if (!documentoValido(cpfCnpjDigits)) {
    erros.push('CPF/CNPJ do tomador inválido — confira os dígitos')
  } else if (mesmoDocumento(cpfCnpjDigits, prestadorDigits)) {
    // A linha inteira é recusada: importar isso reproduziria em massa a nota do
    // cliente para ele mesmo, que é o bug que este módulo veio corrigir.
    erros.push(ERRO_TOMADOR_IGUAL_PRESTADOR)
  } else if (prestador) {
    const chave = chaveCarteira(prestador.id, cpfCnpjDigits)
    if (ctx.carteiraExistente.has(chave)) {
      erros.push('Este tomador já está na carteira deste prestador')
    }
    const primeira = ctx.paresNaPlanilha.get(chave)
    if (primeira !== undefined && primeira !== linha) {
      erros.push(`Tomador repetido na planilha (linha ${primeira})`)
    }
  }

  if (!emailValido(row.email)) erros.push('E-mail inválido')

  const uf = (row.uf ?? '').trim().toUpperCase()
  if (uf && !UFS.includes(uf)) erros.push(`UF "${row.uf}" não existe`)

  const ibge = somenteDigitos(row.municipioIbge)
  if (row.municipioIbge && !ibgeValido(ibge)) erros.push('Código IBGE precisa ter 7 dígitos')

  const endereco = limparEndereco({
    cep: row.cep || undefined,
    logradouro: row.logradouro || undefined,
    numero: row.numero || undefined,
    complemento: row.complemento || undefined,
    bairro: row.bairro || undefined,
    municipio: row.municipio || undefined,
    municipioIbge: ibge || undefined,
    uf: uf || undefined,
  })

  return {
    linha,
    raw: row,
    erros,
    clienteId: prestador?.id,
    clienteNome: prestador?.razaoSocial,
    cpfCnpjDigits,
    payload: {
      // Dígitos, nunca a máscara: é o formato que as regras exigem e o que todo
      // conector envia à prefeitura.
      cpfCnpj: cpfCnpjDigits,
      razaoSocial,
      email: row.email || undefined,
      telefone: row.telefone || undefined,
      inscricaoMunicipal: row.inscricaoMunicipal || undefined,
      endereco,
      ativo: true,
    },
  }
}
