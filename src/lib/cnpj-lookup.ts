// Consulta pública da Receita Federal via BrasilAPI — mesmo endpoint e campos já
// usados em scripts/exportar-clientes-cnpj.mjs (leitura, sem custo, sem chave).
const onlyDigits = (v: string) => v.replace(/\D/g, '')

export type CnpjLookupResult = {
  regimeTributario: 'mei' | 'simples_nacional' | null
  optanteSimples: boolean
  cnae: string | null
  cnaeDescricao: string | null
  municipioIbge: string | null
  municipio: string | null
  uf: string | null
  situacao: string | null
  /** Dados cadastrais — usados para preencher o TOMADOR na emissão. */
  razaoSocial: string | null
  email: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** BrasilAPI às vezes separa o tipo ("RUA") do nome ("DAS FLORES"); sem duplicar quando já vem junto. */
function montarLogradouro(tipo: string | null, nome: string | null): string | null {
  if (!nome) return null
  if (!tipo || nome.toUpperCase().startsWith(`${tipo.toUpperCase()} `)) return nome
  return `${tipo} ${nome}`
}

export async function buscarDadosCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const digits = onlyDigits(cnpj)
  if (digits.length !== 14) {
    throw new Error('CNPJ inválido ou não informado — não é possível buscar.')
  }
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'CNPJ não encontrado na Receita Federal.' : `Falha ao consultar a Receita (HTTP ${res.status}).`)
  }
  const d = await res.json()

  return {
    regimeTributario: d?.opcao_pelo_mei ? 'mei' : d?.opcao_pelo_simples ? 'simples_nacional' : null,
    optanteSimples: Boolean(d?.opcao_pelo_simples),
    cnae: d?.cnae_fiscal ? String(d.cnae_fiscal) : null,
    cnaeDescricao: d?.cnae_fiscal_descricao ?? null,
    municipioIbge: d?.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : null,
    municipio: d?.municipio ?? null,
    uf: d?.uf ?? null,
    situacao: d?.descricao_situacao_cadastral ?? null,
    razaoSocial: texto(d?.razao_social),
    email: texto(d?.email)?.toLowerCase() ?? null,
    cep: texto(d?.cep)?.replace(/\D/g, '') ?? null,
    // BrasilAPI separa o tipo ("RUA") do nome ("DAS FLORES") em alguns cadastros.
    logradouro: montarLogradouro(texto(d?.descricao_tipo_de_logradouro), texto(d?.logradouro)),
    numero: texto(d?.numero),
    complemento: texto(d?.complemento),
    bairro: texto(d?.bairro),
  }
}
