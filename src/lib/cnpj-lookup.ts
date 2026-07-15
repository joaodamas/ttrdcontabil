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
}

export async function buscarDadosCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const digits = onlyDigits(cnpj)
  if (digits.length !== 14) {
    throw new Error('CNPJ do cliente inválido ou não cadastrado — não é possível buscar.')
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
  }
}
