"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaboaoSerraConector = void 0;
/**
 * Conector Taboão da Serra — Etransparencia/Conam (REST proprietário)
 * Portal: https://nfe.etransparencia.com.br/sp.taboaodaserra/nfe
 * Autenticação: código de usuário + código do contribuinte (token)
 */
const axios_1 = __importDefault(require("axios"));
function fmt(n) { return n.toFixed(2); }
class TaboaoSerraConector {
    async emitir(input, config, prestador) {
        try {
            const codigoUsuario = config.credenciais?.conamCodigoUsuario;
            const codigoContribuinte = config.credenciais?.conamCodigoContribuinte;
            if (!codigoUsuario || !codigoContribuinte) {
                return { sucesso: false, erro: 'Código de usuário e contribuinte Conam não configurados.' };
            }
            const isHom = config.ambienteEmissao === 'homologacao';
            const baseUrl = isHom
                ? 'https://nfehomo.etransparencia.com.br/sp.taboaodaserra/nfe'
                : 'https://nfe.etransparencia.com.br/sp.taboaodaserra/nfe';
            // Conam usa XML proprietário via REST
            const xmlRps = `<?xml version="1.0" encoding="UTF-8"?>
<RecepcionarLoteRps>
  <cabecalho versao="3">
    <codigoUsuario>${codigoUsuario}</codigoUsuario>
    <codigoContribuinte>${codigoContribuinte}</codigoContribuinte>
  </cabecalho>
  <loteRps>
    <rps>
      <assinatura>${input.numeroRps ?? Date.now()}</assinatura>
      <chaveRps>
        <inscricaoPrestador>${prestador.inscricaoMunicipal}</inscricaoPrestador>
        <serieRps>${input.serieRps ?? 'RPS'}</serieRps>
        <numeroRps>${input.numeroRps ?? Date.now()}</numeroRps>
      </chaveRps>
      <tipoRps>RPS</tipoRps>
      <dataEmissaoRps>${new Date().toISOString().split('T')[0]}</dataEmissaoRps>
      <naturezaOperacao>1</naturezaOperacao>
      <optanteSimplesNacional>${config.optanteSimples ? 'S' : 'N'}</optanteSimplesNacional>
      <incentivoFiscal>N</incentivoFiscal>
      <statusRps>N</statusRps>
      <valorServicos>${fmt(input.servico.valorServico)}</valorServicos>
      <valorDeducoes>0.00</valorDeducoes>
      <codigoServico>${input.servico.codigoServico}</codigoServico>
      <aliquotaServicos>${fmt(input.servico.aliquota ?? config.aliquotaPadrao ?? 0)}</aliquotaServicos>
      <issRetido>${input.servico.issRetido ? 'S' : 'N'}</issRetido>
      <cpfCnpjTomador>${input.tomador.cpfCnpj.replace(/\D/g, '')}</cpfCnpjTomador>
      <razaoSocialTomador>${input.tomador.razaoSocial}</razaoSocialTomador>
      ${input.tomador.email ? `<emailTomador>${input.tomador.email}</emailTomador>` : ''}
      <discriminacao>${input.servico.discriminacao}</discriminacao>
    </rps>
  </loteRps>
</RecepcionarLoteRps>`;
            const resp = await axios_1.default.post(`${baseUrl}/RecepcionarLoteRps`, xmlRps, {
                headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
                timeout: 30000,
                responseType: 'text',
            });
            const body = resp.data;
            const erro = body.match(/<mensagem[^>]*>(.*?)<\/mensagem>/i)?.[1];
            if (erro && !body.includes('numeroNfe')) {
                return { sucesso: false, erro, detalhes: body };
            }
            const numNfse = body.match(/<numeroNfe[^>]*>(.*?)<\/numeroNfe>/i)?.[1]
                ?? body.match(/<Numero[^>]*>(.*?)<\/Numero>/i)?.[1];
            return { sucesso: true, numeroNfse: numNfse, xmlNfse: body };
        }
        catch (err) {
            const msg = axios_1.default.isAxiosError(err)
                ? `HTTP ${err.response?.status}: ${err.response?.data}`
                : (err instanceof Error ? err.message : String(err));
            return { sucesso: false, erro: msg };
        }
    }
}
exports.TaboaoSerraConector = TaboaoSerraConector;
//# sourceMappingURL=taboao-serra.js.map