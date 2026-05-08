/**
 * Cliente SOAP simples para comunicação com WebServices de NFS-e.
 * Evita dependência do node-soap (pesado) — usa axios com XML raw.
 */
import axios, { AxiosRequestConfig } from 'axios'
import * as https from 'https'
import { sanitizeAuditString } from '../../audit'

export interface SoapOptions {
  endpoint: string
  action?: string          // SOAPAction header
  timeoutMs?: number
  // Certificado cliente para mTLS (alguns municípios exigem)
  certPem?: string
  keyPem?: string
}

/**
 * Envolve o body XML em um envelope SOAP 1.1.
 */
export function buildSoapEnvelope(body: string, xmlns?: Record<string, string>): string {
  const nsDecl = xmlns
    ? Object.entries(xmlns).map(([k, v]) => `xmlns:${k}="${v}"`).join(' ')
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  ${nsDecl}>
  <soapenv:Header/>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Executa uma chamada SOAP e retorna o XML de resposta.
 */
export async function soapCall(opts: SoapOptions, bodyXml: string): Promise<string> {
  const httpsAgent = opts.certPem && opts.keyPem
    ? new https.Agent({ cert: opts.certPem, key: opts.keyPem })
    : undefined

  const config: AxiosRequestConfig = {
    method: 'POST',
    url: opts.endpoint,
    data: bodyXml,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      ...(opts.action ? { SOAPAction: `"${opts.action}"` } : {}),
    },
    timeout: opts.timeoutMs ?? 30_000,
    responseType: 'text',
    ...(httpsAgent ? { httpsAgent } : {}),
  }

  try {
    const resp = await axios(config)
    return resp.data as string
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      const data = err.response?.data
      const body = typeof data === 'string'
        ? sanitizeAuditString(data).slice(0, 500)
        : data != null
          ? sanitizeAuditString(JSON.stringify(data)).slice(0, 500)
          : err.message
      throw new Error(`SOAP HTTP ${status ?? 'sem_status'} em provedor municipal: ${body}`)
    }
    throw err
  }
}

/**
 * Extrai o conteúdo do elemento <Body> de uma resposta SOAP.
 */
export function extractSoapBody(soapXml: string): string {
  const bodyMatch = soapXml.match(/<(?:[^:]+:)?Body[^>]*>([\s\S]*?)<\/(?:[^:]+:)?Body>/i)
  return bodyMatch ? bodyMatch[1].trim() : soapXml
}

/**
 * Extrai o valor de texto de uma tag XML (primeiro match).
 */
export function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<(?:[^:]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:]+:)?${tag}>`, 'i')
  return xml.match(re)?.[1]?.trim()
}

/**
 * Verifica se a resposta SOAP contém erro de faults.
 */
export function checkSoapFault(xml: string): string | null {
  const fault = extractTag(xml, 'faultstring') ?? extractTag(xml, 'Mensagem') ?? extractTag(xml, 'MensagemRetorno')
  if (fault && xml.toLowerCase().includes('fault')) return fault
  return null
}
