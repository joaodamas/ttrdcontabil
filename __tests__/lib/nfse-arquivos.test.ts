import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  baixarXmlNfse,
  chaveAcessoDaNota,
  nomeArquivoXmlNfse,
  pdfProntoDaNota,
  podeObterDanfse,
  temXmlNfse,
  urlConsultaPublicaNfse,
} from '@/features/fiscal/nfse-arquivos'

const xml = readFileSync(path.resolve(__dirname, '../fixtures/nfse/nfse-nacional-homologacao.xml'), 'utf8')
const CHAVE = '35503082211222333000181000000000000126114347282284'

describe('chave de acesso e consulta pública', () => {
  it('usa chaveAcesso, depois codigoVerificacao, depois o Id do XML', () => {
    expect(chaveAcessoDaNota({ chaveAcesso: CHAVE })).toBe(CHAVE)
    expect(chaveAcessoDaNota({ codigoVerificacao: CHAVE })).toBe(CHAVE)
    expect(chaveAcessoDaNota({ codigoVerificacao: 'ABC123', xmlNfse: xml })).toBe(CHAVE)
    expect(chaveAcessoDaNota({ codigoVerificacao: 'ABC123' })).toBeNull()
  })

  it('monta o link oficial da consulta pública com a chave', () => {
    expect(urlConsultaPublicaNfse(CHAVE)).toBe(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${CHAVE}`)
  })
})

describe('XML da NFS-e', () => {
  it('nome do arquivo NFSe-<numero>-<chave>.xml', () => {
    expect(nomeArquivoXmlNfse({ numeroNfse: '1', xmlNfse: xml })).toBe(`NFSe-1-${CHAVE}.xml`)
    expect(nomeArquivoXmlNfse({ id: 'abc', numeroNfse: null })).toBe('NFSe-sem-numero-abc.xml')
  })

  it('temXmlNfse ignora vazio/ausente', () => {
    expect(temXmlNfse({ xmlNfse: xml })).toBe(true)
    expect(temXmlNfse({ xmlNfse: '  ' })).toBe(false)
    expect(temXmlNfse({ xmlNfse: null })).toBe(false)
  })

  afterEach(() => vi.restoreAllMocks())

  it('baixa como Blob UTF-8 com o nome certo', async () => {
    const criar = vi.fn((blob: Blob) => { void blob; return 'blob:fake' })
    Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() })
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let baixado = ''
    clique.mockImplementation(function (this: HTMLAnchorElement) { baixado = this.download })

    baixarXmlNfse({ numeroNfse: '1', xmlNfse: xml })

    expect(baixado).toBe(`NFSe-1-${CHAVE}.xml`)
    const blob = criar.mock.calls[0][0]
    expect(blob.type).toBe('application/xml;charset=utf-8')
    expect(await blob.text()).toContain('São Paulo')
  })

  it('recusa nota sem XML', () => {
    expect(() => baixarXmlNfse({})).toThrow(/XML/)
  })
})

describe('DANFSe pronto', () => {
  it('reaproveita só o PDF do provedor; o da plataforma é sempre pedido ao servidor (URL curta)', () => {
    expect(pdfProntoDaNota({ pdfUrl: 'https://x/a.pdf', status: 'emitida', pdfOrigem: 'plataforma' })).toBeNull()
    expect(pdfProntoDaNota({ pdfUrl: 'https://x/a.pdf', status: 'cancelada', pdfOrigem: 'plataforma', pdfCancelada: true })).toBeNull()
    // Link antigo com token do Storage, mesmo sem pdfOrigem: ignorado.
    expect(pdfProntoDaNota({
      pdfUrl: 'https://firebasestorage.googleapis.com/v0/b/b/o/nfse%2Fc%2Fx.pdf?alt=media&token=abc',
    })).toBeNull()
    expect(pdfProntoDaNota({ pdfUrl: 'https://prefeitura/a.pdf', status: 'cancelada' })).toBe('https://prefeitura/a.pdf')
    expect(pdfProntoDaNota({ pdfUrl: null })).toBeNull()
  })

  it('podeObterDanfse quando há PDF ou XML', () => {
    expect(podeObterDanfse({ xmlNfse: xml })).toBe(true)
    expect(podeObterDanfse({ pdfUrl: 'https://x/a.pdf' })).toBe(true)
    expect(podeObterDanfse({ pdfUrl: 'https://x/a.pdf', pdfOrigem: 'plataforma' })).toBe(false)
    expect(podeObterDanfse({})).toBe(false)
  })
})
