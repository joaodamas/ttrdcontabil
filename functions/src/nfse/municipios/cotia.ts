/**
 * Conector Cotia — GIAP / "Nota Fiscal Cotiana" (Oracle APEX)
 * Portal: https://nfse.cotia.sp.gov.br/
 * Autenticação: login + senha do portal (token de sessão)
 * Não possui ambiente de homologação separado.
 */
import axios from 'axios'
import { ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'

function fmt(n: number) { return n.toFixed(2) }

export class CotiaConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const login = config.credenciais?.giaplogin
      const senha = config.credenciais?.giapSenha
      if (!login || !senha) {
        return { sucesso: false, erro: 'Login e senha do portal Cotia não configurados.' }
      }

      const baseUrl = 'https://nfse.cotia.sp.gov.br/ords/cotia'

      // 1. Autenticar e obter token de sessão
      const authResp = await axios.post(`${baseUrl}/auth/login`, { login, senha }, {
        timeout: 15_000,
      })
      const sessionToken = (authResp.data as Record<string, string>).token
      if (!sessionToken) return { sucesso: false, erro: 'Falha na autenticação no portal de Cotia.' }

      // 2. Emitir NFS-e
      const payload = {
        prestador: {
          inscricaoMunicipal: prestador.inscricaoMunicipal,
          cnpj: prestador.cnpj.replace(/\D/g, ''),
        },
        tomador: {
          cpfCnpj:     input.tomador.cpfCnpj.replace(/\D/g, ''),
          razaoSocial: input.tomador.razaoSocial,
          email:       input.tomador.email ?? '',
        },
        servico: {
          discriminacao: input.servico.discriminacao,
          codigoServico: input.servico.codigoServico,
          valorServico:  fmt(input.servico.valorServico),
          aliquota:      fmt(input.servico.aliquota ?? config.aliquotaPadrao ?? 0),
          issRetido:     input.servico.issRetido,
        },
        optanteSimplesNacional: config.optanteSimples,
      }

      const emitResp = await axios.post(`${baseUrl}/nfse/emitir`, payload, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        timeout: 30_000,
      })

      const data = emitResp.data as Record<string, unknown>
      if (!data.sucesso && !data.numeroNfse) {
        return { sucesso: false, erro: String(data.mensagem ?? 'Erro na emissão em Cotia') }
      }

      return {
        sucesso:    true,
        numeroNfse: String(data.numeroNfse ?? data.numero ?? ''),
        xmlNfse:    data.xml as string | undefined,
      }
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
        : (err instanceof Error ? err.message : String(err))
      return { sucesso: false, erro: msg }
    }
  }
}
