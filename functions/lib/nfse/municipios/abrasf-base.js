"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbrasfConector = void 0;
/**
 * Conector base para municípios que seguem o padrão ABRASF 2.x.
 * Subclasses sobrescrevem apenas endpoint, versão e quirks específicos.
 */
const builder_1 = require("../xml/builder");
const signer_1 = require("../xml/signer");
const soap_1 = require("../xml/soap");
class AbrasfConector {
    async emitir(input, config, cert, prestador) {
        try {
            const isHom = config.ambienteEmissao === 'homologacao';
            const cfg = this.getConfig(isHom);
            const chave = (0, signer_1.extrairChaveDoPfx)(cert.pfxBase64, cert.senha);
            const numero = input.numeroRps ?? String(Date.now());
            const serie = input.serieRps ?? 'RPS';
            const numeroLote = String(Date.now());
            const infRpsId = `rps${numero}`;
            const infLoteId = `lote${numeroLote}`;
            // 1. Constrói InfRps
            const infRpsXml = (0, builder_1.buildInfRpsXml)({
                numero,
                serie,
                naturezaOperacao: config.naturezaOperacao ?? '1',
                optanteSimples: config.optanteSimples,
                incentivadorCultural: config.incentivadorCultural,
                prestador,
                tomador: input.tomador,
                servico: {
                    ...input.servico,
                    itemListaServico: input.servico.itemListaServico ?? config.itemListaServico ?? input.servico.codigoServico,
                    cnae: input.servico.cnae ?? config.cnae,
                    aliquota: input.servico.aliquota ?? config.aliquotaPadrao,
                    municipioPrestacao: prestador.municipioIbge,
                },
                regimeTributario: config.regimeTributario,
                infRpsId,
            });
            // 2. Assina o InfRps
            const xmlComInfRps = `<Rps>${infRpsXml}</Rps>`;
            const xmlInfRpsAssinado = (0, signer_1.assinarXml)(xmlComInfRps, infRpsId, chave);
            // 3. Constrói InfLoteRps
            const infLoteXml = (0, builder_1.buildLoteRpsXml)({
                numeroLote,
                cnpjPrestador: prestador.cnpj,
                inscricaoMunicipal: prestador.inscricaoMunicipal,
                rpsListXml: xmlInfRpsAssinado,
                quantidadeRps: 1,
                infLoteId,
            });
            // 4. Assina o lote
            const xmlLoteWrapper = `<EnviarLoteRpsEnvio>${infLoteXml}</EnviarLoteRpsEnvio>`;
            const xmlLoteAssinado = (0, signer_1.assinarXml)(xmlLoteWrapper, infLoteId, chave);
            // 5. Monta envelope SOAP
            const xmlns = cfg.xmlns ?? 'http://www.abrasf.org.br/nfse.xsd';
            const soapBody = (0, soap_1.buildSoapEnvelope)(xmlLoteAssinado, { nfse: xmlns });
            // 6. Envia
            const respXml = await (0, soap_1.soapCall)({ endpoint: cfg.endpoint, action: cfg.soapAction }, soapBody);
            const bodyXml = (0, soap_1.extractSoapBody)(respXml);
            // 7. Verifica erro
            const fault = (0, soap_1.checkSoapFault)(bodyXml);
            if (fault)
                return { sucesso: false, erro: fault };
            const msgErro = (0, soap_1.extractTag)(bodyXml, 'Mensagem') ?? (0, soap_1.extractTag)(bodyXml, 'MensagemRetorno');
            const codErro = (0, soap_1.extractTag)(bodyXml, 'Codigo');
            if (msgErro && codErro !== '100') {
                return { sucesso: false, erro: msgErro, codigoErro: codErro, detalhes: bodyXml };
            }
            // 8. Extrai resultado
            const numeroNfse = (0, soap_1.extractTag)(bodyXml, 'Numero');
            const codVerif = (0, soap_1.extractTag)(bodyXml, 'CodigoVerificacao');
            const xmlNfse = (0, soap_1.extractTag)(bodyXml, 'NfseXml') ?? bodyXml;
            return {
                sucesso: true,
                numeroNfse: numeroNfse,
                codigoVerificacao: codVerif,
                xmlNfse,
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { sucesso: false, erro: msg };
        }
    }
}
exports.AbrasfConector = AbrasfConector;
//# sourceMappingURL=abrasf-base.js.map