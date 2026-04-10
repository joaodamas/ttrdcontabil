"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extrairChaveDoPfx = extrairChaveDoPfx;
exports.assinarXml = assinarXml;
exports.assinarRpsELote = assinarRpsELote;
exports.validarCertificado = validarCertificado;
/**
 * Assinatura digital XML (xmldsig) para NFS-e brasileira.
 * Utiliza RSA-SHA1 com canonicalização C14N exclusiva — padrão ABRASF.
 */
const forge = __importStar(require("node-forge"));
const xml_crypto_1 = require("xml-crypto");
/**
 * Extrai chave privada e certificado de um arquivo PFX (base64).
 */
function extrairChaveDoPfx(pfxBase64, senha) {
    const pfxDer = forge.util.decode64(pfxBase64);
    const pfxAsn1 = forge.asn1.fromDer(pfxDer);
    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha);
    // Extrai chave privada
    const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key)
        throw new Error('Chave privada não encontrada no certificado');
    const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
    // Extrai certificado
    const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert)
        throw new Error('Certificado não encontrado no PFX');
    const certPem = forge.pki.certificateToPem(certBag.cert);
    return { privateKeyPem, certPem };
}
/**
 * Assina um elemento XML identificado pelo atributo Id.
 * Retorna o XML com a assinatura embutida (enveloped).
 *
 * @param xmlStr  - XML completo como string
 * @param refId   - valor do atributo Id do elemento a assinar (sem #)
 * @param chave   - chave privada e certificado
 */
function assinarXml(xmlStr, refId, chave) {
    const sig = new xml_crypto_1.SignedXml({
        privateKey: chave.privateKeyPem,
        publicCert: chave.certPem,
    });
    sig.addReference({
        xpath: `//*[@Id='${refId}']`,
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    });
    sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
    sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha1';
    sig.computeSignature(xmlStr, {
        location: {
            reference: `//*[@Id='${refId}']`,
            action: 'append',
        },
        existingPrefixes: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
    });
    return sig.getSignedXml();
}
/**
 * Assina dois elementos em sequência: primeiro o RPS (InfRps), depois o Lote (InfLoteRps).
 * Padrão ABRASF — o lote engloba os RPS já assinados.
 */
function assinarRpsELote(xmlStr, infRpsId, infLoteId, chave) {
    const xmlComRps = assinarXml(xmlStr, infRpsId, chave);
    const xmlComLote = assinarXml(xmlComRps, infLoteId, chave);
    return xmlComLote;
}
/**
 * Valida validade do certificado (data).
 */
function validarCertificado(pfxBase64, senha) {
    const pfxDer = forge.util.decode64(pfxBase64);
    const pfxAsn1 = forge.asn1.fromDer(pfxDer);
    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha);
    const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert)
        throw new Error('Certificado inválido');
    const cert = certBag.cert;
    const vencimento = cert.validity.notAfter;
    const valido = vencimento > new Date();
    const cn = cert.subject.getField('CN');
    const titular = cn ? cn.value : 'Desconhecido';
    return { valido, vencimento, titular };
}
//# sourceMappingURL=signer.js.map