/**
 * Conector Santana de Parnaíba — SimplissWeb (layout nacional, REST)
 * Migrou de NfEletronica para SimplissWeb em agosto/2025.
 * Portal: https://santanadeparnaiba.simplissweb.com.br/
 * Autenticação: Token gerado no portal municipal
 */
import axios from 'axios'
import { ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'
import { lerCredencial, stringifyErroHttp } from './credenciais'

function fmt(n: number) { return n.toFixed(2) }

export class SantanaParnaibhaConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const tokenSalvo = config.credenciais?.simplissToken
      if (!tokenSalvo) return { sucesso: false, erro: 'Token SimplissWeb não configurado. Configure nas credenciais do cliente.' }

      const tokenCred = lerCredencial(tokenSalvo, 'Token SimplissWeb')
      if (!tokenCred.valor) return { sucesso: false, codigoErro: tokenCred.codigoErro, erro: tokenCred.erro ?? 'Token SimplissWeb inválido.' }

      const isHom   = config.ambienteEmissao === 'homologacao'
      const baseUrl = isHom
        ? 'https://producaorestrita.simplissweb.com.br'
        : 'https://santanadeparnaiba.simplissweb.com.br'
      const endpoint = `${baseUrl}/nfse`

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

      console.log('[SantanaParnaiba/SimplissWeb] emitindo NFS-e', {
        ambiente: config.ambienteEmissao,
        endpoint,
        tokenCriptografado: tokenCred.criptografada,
        prestadorCnpjFinal: prestador.cnpj.replace(/\D/g, '').slice(-4),
        tomadorDocumentoFinal: input.tomador.cpfCnpj.replace(/\D/g, '').slice(-4),
      })

      const resp = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${tokenCred.valor}`,
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
      // axios.isAxiosError pode falhar em bundling ESM/CJS; verificar response diretamente
      const anyErr = err as {
        isAxiosError?: boolean
        code?: string
        message?: string
        response?: { status?: number; data?: unknown }
        request?: unknown
        config?: { url?: string; method?: string; timeout?: number }
      }
      if (anyErr?.response != null) {
        const status = anyErr.response.status
        const body = stringifyErroHttp(anyErr.response.data)
        console.error('[SantanaParnaiba/SimplissWeb] resposta HTTP de erro', {
          status,
          body,
          url: anyErr.config?.url,
        })
        return { sucesso: false, codigoErro: `SIMPLISS_HTTP_${status ?? 'UNKNOWN'}`, erro: `SimplissWeb HTTP ${status}: ${body}` }
      }

      const message = err instanceof Error ? err.message : String(err)
      console.error('[SantanaParnaiba/SimplissWeb] falha sem resposta HTTP', {
        code: anyErr?.code,
        message,
        url: anyErr?.config?.url,
        method: anyErr?.config?.method,
        timeout: anyErr?.config?.timeout,
        hasRequest: anyErr?.request != null,
        isAxiosError: anyErr?.isAxiosError,
      })
      const code = anyErr?.code ? ` (${anyErr.code})` : ''
      const url = anyErr?.config?.url ? ` URL: ${anyErr.config.url}.` : ''
      return {
        sucesso: false,
        codigoErro: anyErr?.code ?? 'SIMPLISS_NETWORK_ERROR',
        erro: `SimplissWeb falhou sem resposta HTTP${code}: ${message}.${url}`,
      }
    }
  }
}
