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
 * Decodifica a resposta da prefeitura respeitando o charset. Vários provedores
 * municipais (ex.: Cajamar) respondem em ISO-8859-1; ler tudo como UTF-8
 * transformava "Usuário não liberado" em "Usu\uFFFDrio n\uFFFDo" na tela.
 * Ordem: charset do Content-Type → encoding da declaração XML → UTF-8, e
 * latin1 se o UTF-8 produzir caractere inválido.
 */
export function decodificarResposta(buf: Buffer, contentType?: string): string {
  const doCabecalho = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1]
  const doXml = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(buf.subarray(0, 200).toString('latin1'))?.[1]
  const charset = (doCabecalho ?? doXml ?? '').toLowerCase()
  if (['iso-8859-1', 'latin1', 'latin-1', 'windows-1252', 'cp1252'].includes(charset)) return buf.toString('latin1')
  const utf8 = buf.toString('utf8')
  if (!charset && utf8.includes('\uFFFD')) return buf.toString('latin1')
  return utf8
}

function corpoComoTexto(data: unknown, contentType?: string): string {
  if (Buffer.isBuffer(data)) return decodificarResposta(data, contentType)
  if (data instanceof ArrayBuffer) return decodificarResposta(Buffer.from(data), contentType)
  return typeof data === 'string' ? data : data != null ? JSON.stringify(data) : ''
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
    responseType: 'arraybuffer',
    ...(httpsAgent ? { httpsAgent } : {}),
  }

  try {
    const resp = await axios(config)
    return corpoComoTexto(resp.data, resp.headers?.['content-type'] as string | undefined)
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      const texto = corpoComoTexto(err.response?.data, err.response?.headers?.['content-type'] as string | undefined)
      const body = texto ? sanitizeAuditString(texto).slice(0, 500) : err.message
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
