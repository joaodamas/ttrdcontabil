/**
 * Assinatura digital XML (xmldsig) para NFS-e brasileira.
 * Utiliza RSA-SHA1 com canonicalização C14N exclusiva — padrão ABRASF.
 */
import * as forge from 'node-forge'
import { SignedXml } from 'xml-crypto'

export interface ChaveAssinatura {
  privateKeyPem: string
  certPem: string
}

/**
 * Extrai chave privada e certificado de um arquivo PFX (base64).
 */
export function extrairChaveDoPfx(pfxBase64: string, senha: string): ChaveAssinatura {
  const pfxDer = forge.util.decode64(pfxBase64)
  const pfxAsn1 = forge.asn1.fromDer(pfxDer)
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha)

  // Extrai chave privada
  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
  if (!keyBag?.key) throw new Error('Chave privada não encontrada no certificado')
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key)

  // Extrai certificado
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })
  const certBag = certBags[forge.pki.oids.certBag]?.[0]
  if (!certBag?.cert) throw new Error('Certificado não encontrado no PFX')
  const certPem = forge.pki.certificateToPem(certBag.cert)

  return { privateKeyPem, certPem }
}

/**
 * Assina um elemento XML identificado pelo atributo Id.
 * Retorna o XML com a assinatura embutida (enveloped).
 *
 * @param xmlStr  - XML completo como string
 * @param refId   - valor do atributo Id do elemento a assinar (sem #)
 * @param chave   - chave privada e certificado
 */
export function assinarXml(xmlStr: string, refId: string, chave: ChaveAssinatura): string {
  const sig = new SignedXml({
    privateKey: chave.privateKeyPem,
    publicCert: chave.certPem,
  })

  sig.addReference({
    xpath: `//*[@Id='${refId}']`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  })

  sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha1'

  sig.computeSignature(xmlStr, {
    location: {
      reference: `//*[@Id='${refId}']`,
      action: 'append',
    },
    existingPrefixes: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
  })

  return sig.getSignedXml()
}

/**
 * Assina dois elementos em sequência: primeiro o RPS (InfRps), depois o Lote (InfLoteRps).
 * Padrão ABRASF — o lote engloba os RPS já assinados.
 */
export function assinarRpsELote(
  xmlStr: string,
  infRpsId: string,
  infLoteId: string,
  chave: ChaveAssinatura
): string {
  const xmlComRps   = assinarXml(xmlStr, infRpsId,   chave)
  const xmlComLote  = assinarXml(xmlComRps, infLoteId, chave)
  return xmlComLote
}

/**
 * Valida validade do certificado (data).
 */
export function validarCertificado(pfxBase64: string, senha: string): { valido: boolean; vencimento: Date; titular: string } {
  const pfxDer  = forge.util.decode64(pfxBase64)
  const pfxAsn1 = forge.asn1.fromDer(pfxDer)
  const pfx     = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha)
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })
  const certBag  = certBags[forge.pki.oids.certBag]?.[0]
  if (!certBag?.cert) throw new Error('Certificado inválido')

  const cert       = certBag.cert
  const vencimento = cert.validity.notAfter
  const valido     = vencimento > new Date()
  const cn = cert.subject.getField('CN')
  const titular = cn ? (cn.value as string) : 'Desconhecido'

  return { valido, vencimento, titular }
}
