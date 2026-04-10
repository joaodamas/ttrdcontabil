/**
 * Conector Santana de Parnaíba — SimplissWeb (layout nacional, REST)
 * Migrou de NfEletronica para SimplissWeb em agosto/2025.
 * Portal: https://santanadeparnaiba.simplissweb.com.br/
 * Autenticação: Token gerado no portal municipal
 */
import axios from 'axios'
import { ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'

function fmt(n: number) { return n.toFixed(2) }

export class SantanaParnaibhaConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const token = config.credenciais?.simplissToken
      if (!token) return { sucesso: false, erro: 'Token SimplissWeb não configurado. Configure nas credenciais do cliente.' }

      const isHom   = config.ambienteEmissao === 'homologacao'
      const baseUrl = isHom
        ? 'https://homologacaoabrasf.simplissweb.com.br/api'
        : 'https://santanadeparnaiba.simplissweb.com.br/api'

      // SimplissWeb aceita JSON no layout nacional
      const payload = {
        prestador: {
          cnpj:               prestador.cnpj.replace(/\D/g, ''),
          inscricaoMunicipal: prestador.inscricaoMunicipal,
        },
        tomador: {
          cpfCnpj:      input.tomador.cpfCnpj.replace(/\D/g, ''),
          razaoSocial:  input.tomador.razaoSocial,
          email:        input.tomador.email ?? '',
        },
        servico: {
          discriminacao:    input.servico.discriminacao,
          codigoServico:    input.servico.codigoServico,
          itemListaServico: input.servico.itemListaServico ?? config.itemListaServico ?? input.servico.codigoServico,
          cnae:             input.servico.cnae ?? config.cnae ?? '',
          valorServicos:    fmt(input.servico.valorServico),
          aliquota:         fmt(input.servico.aliquota ?? config.aliquotaPadrao ?? 0),
          issRetido:        input.servico.issRetido ? '1' : '2',
          codigoMunicipio:  prestador.municipioIbge,
        },
        optanteSimplesNacional: config.optanteSimples ? '1' : '2',
        naturezaOperacao:       config.naturezaOperacao ?? '1',
        regimeEspecialTributacao: config.regimeTributario === 'simples_nacional' ? '1' : '0',
      }

      const resp = await axios.post(`${baseUrl}/nfse/emitir`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      })

      const data = resp.data as Record<string, unknown>
      if (data.erro || resp.status >= 400) {
        return { sucesso: false, erro: String(data.mensagem ?? data.erro ?? 'Erro desconhecido') }
      }

      return {
        sucesso:           true,
        numeroNfse:        String(data.numeroNfse ?? data.numero ?? ''),
        codigoVerificacao: String(data.codigoVerificacao ?? ''),
        xmlNfse:           data.xmlNfse as string | undefined,
      }
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
        : (err instanceof Error ? err.message : String(err))
      return { sucesso: false, erro: msg }
    }
  }
}
