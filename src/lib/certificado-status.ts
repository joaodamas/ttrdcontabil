/**
 * Situação do certificado A1 do cliente para o cartão da ficha — a partir de
 * `clientes_fiscal.credenciais` (certTitular, certVencimento, certValido,
 * certificadoStoragePath), gravados só pelo servidor (uploadCertificado).
 * O CNPJ sai do titular pelo MESMO código da pré-validação fiscal.
 */
import { cnpjDoTitularCertificado, soDigitos } from '../../functions/src/nfse/pre-validacao/documentos'

export type SituacaoCertificado = 'ausente' | 'invalido' | 'vencido' | 'vencendo' | 'valido'

export interface StatusCertificado {
  situacao: SituacaoCertificado
  titular?: string
  /** CNPJ (14 dígitos) do titular, quando dá para ler. */
  cnpj?: string
  vencimento?: Date
  /** Dias até o vencimento (negativo = vencido há tantos dias). */
  diasRestantes?: number
  /** O certificado é de outro CNPJ (só quando os dois são conhecidos). */
  outroCnpj: boolean
}

/** A partir de quantos dias o cartão alerta "vence em breve". */
export const DIAS_ALERTA_VENCIMENTO = 30

const DIA_MS = 86_400_000

function inicioDoDia(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

export function statusCertificado(
  credenciais: Record<string, unknown> | null | undefined,
  cnpjCliente?: unknown,
  hoje: Date = new Date(),
): StatusCertificado {
  const c = credenciais ?? {}
  const titular = typeof c.certTitular === 'string' && c.certTitular.trim() ? c.certTitular.trim() : undefined
  const temArquivo = typeof c.certificadoStoragePath === 'string' && c.certificadoStoragePath.trim().length > 0
  if (!titular && !temArquivo) return { situacao: 'ausente', outroCnpj: false }

  const cnpj = cnpjDoTitularCertificado(titular)
  const doCliente = soDigitos(cnpjCliente)
  const outroCnpj = !!cnpj && doCliente.length === 14 && cnpj !== doCliente

  const bruto = typeof c.certVencimento === 'string' ? new Date(c.certVencimento) : undefined
  const vencimento = bruto && !Number.isNaN(bruto.getTime()) ? bruto : undefined
  const diasRestantes = vencimento
    ? Math.round((inicioDoDia(vencimento) - inicioDoDia(hoje)) / DIA_MS)
    : undefined

  const base = { titular, cnpj, vencimento, diasRestantes, outroCnpj }
  if (c.certValido === false) return { situacao: 'invalido', ...base }
  if (diasRestantes !== undefined && diasRestantes < 0) return { situacao: 'vencido', ...base }
  if (diasRestantes !== undefined && diasRestantes <= DIAS_ALERTA_VENCIMENTO) return { situacao: 'vencendo', ...base }
  return { situacao: 'valido', ...base }
}
