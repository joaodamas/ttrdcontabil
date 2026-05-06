/**
 * Conector Cotia — GIAP / "Nota Fiscal Cotiana" (Oracle APEX)
 * Portal: https://nfse.cotia.sp.gov.br/
 * Autenticação: login + senha do portal (token de sessão)
 * Não possui ambiente de homologação separado.
 */
import axios from 'axios'
import { ConfigFiscalCliente, EmitirNfseInput, Prestador, ResultadoEmissao } from '../types'
import { lerCredencial, stringifyErroHttp } from './credenciais'

function fmt(n: number) { return n.toFixed(2) }

export class CotiaConector {
  async emitir(
    input: EmitirNfseInput,
    config: ConfigFiscalCliente,
    prestador: Prestador,
  ): Promise<ResultadoEmissao> {
    try {
      const login = lerCredencial(config.credenciais?.giaplogin, 'Login GIAP/Cotia')
      const senha = lerCredencial(config.credenciais?.giapSenha, 'Senha GIAP/Cotia')
      if (!login.valor || !senha.valor) {
        const erroCredencial = login.erro ?? senha.erro
        if (erroCredencial) return { sucesso: false, codigoErro: login.codigoErro ?? senha.codigoErro, erro: erroCredencial }
        return { sucesso: false, erro: 'Login e senha do portal Cotia não configurados.' }
      }

      const baseUrl = 'https://nfse.cotia.sp.gov.br/ords/cotia'

      // 1. Autenticar e obter token de sessão
      console.log('[Cotia/GIAP] autenticando para emissão NFS-e', {
        endpoint: `${baseUrl}/auth/login`,
        loginCriptografado: login.criptografada,
        senhaCriptografada: senha.criptografada,
        prestadorCnpjFinal: prestador.cnpj.replace(/\D/g, '').slice(-4),
      })

      const authResp = await axios.post(`${baseUrl}/auth/login`, { login: login.valor, senha: senha.valor }, {
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
        ? `Cotia/GIAP HTTP ${err.response?.status ?? 'sem_status'}: ${stringifyErroHttp(err.response?.data ?? err.message)}`
        : (err instanceof Error ? err.message : String(err))
      return { sucesso: false, erro: msg }
    }
  }
}
