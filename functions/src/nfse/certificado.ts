import { HttpsError } from 'firebase-functions/v2/https'
import { VERSAO_ENVELOPE_ARQUIVO, arquivoCifrado, cifrarArquivo, decifrarArquivo } from './encrypt'

// Quem grava o certificado é o uploadCertificado (emitir.ts) e ele usa sempre o
// mesmo padrão. Centralizar aqui para que leitura e escrita nunca divirjam.
const PREFIXO_CERTIFICADO = 'certificados/'
const SUFIXO_CERTIFICADO = '.pfx.b64'

// Os ids de cliente são auto-ids do Firestore ([A-Za-z0-9_-]); o ponto entra só
// por tolerância a ids importados. O que não pode passar é '/', '\' ou '..':
// concatenados no caminho eles escapariam da pasta certificados/.
const CLIENTE_ID_SEGURO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * Deriva no servidor o caminho do certificado A1 a partir do clienteId.
 * É a única fonte de verdade do caminho — nada que venha do banco ou do
 * navegador pode escolher qual arquivo do bucket será baixado.
 */
export function resolverCaminhoCertificado(clienteId: string): string {
  const id = String(clienteId ?? '').trim()
  if (!CLIENTE_ID_SEGURO.test(id) || id.includes('..')) {
    throw new HttpsError('invalid-argument', 'clienteId inválido para localizar o certificado A1.')
  }
  return `${PREFIXO_CERTIFICADO}${id}${SUFIXO_CERTIFICADO}`
}

/**
 * Confere o certificadoStoragePath persistido contra o caminho derivado e
 * devolve SEMPRE o derivado. Divergiu, recusa.
 */
export function assertCaminhoCertificado(clienteId: string, caminhoPersistido: unknown): string {
  const esperado = resolverCaminhoCertificado(clienteId)
  const persistido = typeof caminhoPersistido === 'string' ? caminhoPersistido.trim() : ''

  if (!persistido) {
    throw new HttpsError(
      'failed-precondition',
      'Nenhum certificado A1 carregado para este cliente. Suba o certificado na ficha fiscal antes.',
    )
  }

  // Armadilha: certificadoStoragePath é um campo comum do Firestore, editável
  // fora do uploadCertificado. O download roda com Admin SDK, que ignora as
  // storage.rules — confiar no campo cru permitiria apontar para o certificado
  // de outro cliente ou para qualquer documento do bucket e vazá-lo para fora.
  // Por isso falha fechado: não "conserta" o caminho em silêncio, recusa.
  if (persistido !== esperado) {
    throw new HttpsError(
      'failed-precondition',
      'Caminho do certificado A1 fora do padrão da plataforma. Reenvie o certificado na ficha fiscal para regularizar.',
    )
  }

  return esperado
}

/**
 * Conteúdo gravado no Storage para um .pfx recebido em base64: o binário do
 * PKCS#12 dentro do envelope AES-256-GCM (CREDENTIAL_KEY). Antes de 2026-11-06
 * o arquivo ia em claro — só a senha era cifrada.
 */
export function conteudoCertificadoParaStorage(pfxBase64: string): { conteudo: Buffer; metadata: Record<string, string> } {
  return {
    conteudo: cifrarArquivo(Buffer.from(pfxBase64, 'base64')),
    metadata: { cifrado: VERSAO_ENVELOPE_ARQUIVO },
  }
}

/**
 * Lê o arquivo do certificado no Storage em qualquer formato: envelope cifrado
 * (atual) ou legado em claro (binário DER ou texto base64). Devolve o .pfx em
 * base64. Envelope que não decifra = erro claro (chave trocada/arquivo
 * corrompido), nunca tenta usar o envelope como se fosse o .pfx.
 */
export function pfxBase64DoArquivoStorage(buffer: Buffer): string {
  if (arquivoCifrado(buffer)) {
    try {
      return decifrarArquivo(buffer).toString('base64')
    } catch {
      throw new HttpsError(
        'failed-precondition',
        'Não foi possível decifrar o certificado A1 guardado. Verifique o secret CREDENTIAL_KEY ou reenvie o certificado.',
      )
    }
  }
  return pfxBase64FromStorageBuffer(buffer)
}

export function pfxBase64FromStorageBuffer(buffer: Buffer): string {
  const maybeBase64 = buffer.toString('utf8').trim()
  const normalized = maybeBase64.replace(/\s+/g, '')

  // Compatibilidade com certificados salvos anteriormente como texto base64.
  if (
    normalized.length > 100
    && normalized.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    return normalized
  }

  return buffer.toString('base64')
}
