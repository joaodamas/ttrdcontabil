"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSoapEnvelope = buildSoapEnvelope;
exports.soapCall = soapCall;
exports.extractSoapBody = extractSoapBody;
exports.extractTag = extractTag;
exports.checkSoapFault = checkSoapFault;
/**
 * Cliente SOAP simples para comunicação com WebServices de NFS-e.
 * Evita dependência do node-soap (pesado) — usa axios com XML raw.
 */
const axios_1 = __importDefault(require("axios"));
/**
 * Envolve o body XML em um envelope SOAP 1.1.
 */
function buildSoapEnvelope(body, xmlns) {
    const nsDecl = xmlns
        ? Object.entries(xmlns).map(([k, v]) => `xmlns:${k}="${v}"`).join(' ')
        : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  ${nsDecl}>
  <soapenv:Header/>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}
/**
 * Executa uma chamada SOAP e retorna o XML de resposta.
 */
async function soapCall(opts, bodyXml) {
    const config = {
        method: 'POST',
        url: opts.endpoint,
        data: bodyXml,
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            ...(opts.action ? { SOAPAction: `"${opts.action}"` } : {}),
        },
        timeout: opts.timeoutMs ?? 30000,
        responseType: 'text',
    };
    const resp = await (0, axios_1.default)(config);
    return resp.data;
}
/**
 * Extrai o conteúdo do elemento <Body> de uma resposta SOAP.
 */
function extractSoapBody(soapXml) {
    const bodyMatch = soapXml.match(/<(?:[^:]+:)?Body[^>]*>([\s\S]*?)<\/(?:[^:]+:)?Body>/i);
    return bodyMatch ? bodyMatch[1].trim() : soapXml;
}
/**
 * Extrai o valor de texto de uma tag XML (primeiro match).
 */
function extractTag(xml, tag) {
    const re = new RegExp(`<(?:[^:]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:]+:)?${tag}>`, 'i');
    return xml.match(re)?.[1]?.trim();
}
/**
 * Verifica se a resposta SOAP contém erro de faults.
 */
function checkSoapFault(xml) {
    const fault = extractTag(xml, 'faultstring') ?? extractTag(xml, 'Mensagem') ?? extractTag(xml, 'MensagemRetorno');
    if (fault && xml.toLowerCase().includes('fault'))
        return fault;
    return null;
}
//# sourceMappingURL=soap.js.map