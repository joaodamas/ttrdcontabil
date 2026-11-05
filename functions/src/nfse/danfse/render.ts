/**
 * Renderização do DANFSe em PDF (pdfkit, sem navegador headless).
 *
 * Leiaute: NT 008/2026 SE/CGNFS-e "Especificações Técnicas do DANFSe", Anexo I
 * (modelo) e item 2.4.5 (posições/tamanhos, em cm). Seguimos as colunas
 * (0,30 / 5,41 / 10,51 / 15,62 cm, largura 5,09 cm), as alturas de linha, os
 * tamanhos de fonte (títulos de bloco 7 pt negrito caixa alta, títulos de campo
 * 6 pt negrito, conteúdo 7 pt, cabeçalho 9 pt), a borda de 1 pt, as divisórias
 * de 0,5 pt, o sombreamento cinza 5% e o QR Code de 1,52 cm em X 17,48 / Y 1,67.
 *
 * Desvios conscientes (ver CHANGELOG):
 *  - fontes: Helvetica (métrica equivalente à Arial) no lugar de Arial/Microsoft
 *    Sans Serif, que não podem ser embarcadas por licença;
 *  - logomarca: marca textual "NFS-e" no lugar da imagem oficial do gov.br;
 *  - canhoto (opcional, item 2.1.13) não é impresso; o espaço vai para
 *    "Informações Complementares" (item 2.3.3) e uma linha de rodapé informa
 *    que o documento foi gerado pela plataforma a partir do XML oficial.
 */
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

import type { Campo, DadosDanfse, PessoaDanfse } from './dados'

const CM = 72 / 2.54
const PAGINA = { largura: 595.28, altura: 841.89 }
const X0 = 0.3 * CM
const LARGURA = 20.4 * CM
const COL = [0.3, 5.41, 10.51, 15.62].map((c) => c * CM)
const LCOL = 5.09 * CM
const LCOL2 = 10.19 * CM
const TOPO = 0.3 * CM
const BASE = PAGINA.altura - 0.3 * CM
const LINHA = 0.63 * CM
const LINHA_ID = 0.67 * CM
const PAD = 2.5

const CINZA_5 = '#F2F2F2'
const PRETO = '#000000'
const VERMELHO = '#FF0000'
const CINZA_MARCA = '#A6A6A6' // K35

const FONTE = 'Helvetica'
const FONTE_NEGRITO = 'Helvetica-Bold'

export interface OpcoesDanfse {
  cancelada?: boolean
  substituida?: boolean
  /** Momento da geração, para o rodapé. */
  geradoEm?: Date
  /** Nome exibido no rodapé. */
  plataforma?: string
}

type Doc = PDFKit.PDFDocument

const v = (c: Campo): string => (c === undefined || c === '' ? '-' : c)

function texto(doc: Doc, conteudo: string, x: number, y: number, largura: number, opts: {
  tamanho?: number
  negrito?: boolean
  linhas?: number
  alinhamento?: 'left' | 'center' | 'right'
  cor?: string
} = {}) {
  const tamanho = opts.tamanho ?? 7
  doc.font(opts.negrito ? FONTE_NEGRITO : FONTE).fontSize(tamanho).fillColor(opts.cor ?? PRETO)
  const linhas = opts.linhas ?? 1
  doc.text(conteudo, x, y, {
    width: largura,
    height: linhas * tamanho * 1.18,
    ellipsis: true,
    align: opts.alinhamento ?? 'left',
    lineGap: 0,
  })
}

function sombrear(doc: Doc, x: number, y: number, w: number, h: number) {
  doc.save().rect(x, y, w, h).fill(CINZA_5).restore()
}

function divisoria(doc: Doc, y: number) {
  doc.save().lineWidth(0.5).strokeColor(PRETO).moveTo(X0, y).lineTo(X0 + LARGURA, y).stroke().restore()
}

/** Campo comum: título 6 pt negrito + conteúdo 7 pt. */
function campo(doc: Doc, x: number, y: number, largura: number, titulo: string, conteudo: Campo, linhas = 1) {
  texto(doc, titulo, x + PAD, y + 2, largura - 2 * PAD, { tamanho: 6, negrito: true })
  texto(doc, v(conteudo), x + PAD, y + 9, largura - 2 * PAD, { linhas })
}

/** Título do bloco (7 pt negrito caixa alta) com fundo cinza 5% na 1ª coluna. */
function tituloBloco(doc: Doc, y: number, titulo: string, altura = LINHA) {
  sombrear(doc, COL[0], y, LCOL, altura)
  texto(doc, titulo.toUpperCase(), COL[0] + PAD, y + 3, LCOL - 2 * PAD, { tamanho: 7, negrito: true })
}

/** Bloco reduzido (NT 008, itens 2.3.1/2.3.2): uma única linha com o aviso. */
function blocoReduzido(doc: Doc, y: number, aviso: string): number {
  const h = 0.32 * CM + 4
  divisoria(doc, y)
  texto(doc, aviso, X0 + PAD, y + 3, LARGURA - 2 * PAD, { tamanho: 7, negrito: true })
  return y + h
}

function blocoPessoa(doc: Doc, y: number, titulo: string, p: PessoaDanfse, comIm = true): number {
  divisoria(doc, y)
  tituloBloco(doc, y, titulo)
  campo(doc, COL[1], y, LCOL, 'CNPJ / CPF / NIF', p.documento)
  if (comIm) campo(doc, COL[2], y, LCOL, 'Indicador Municipal (Inscrição)', p.inscricaoMunicipal)
  campo(doc, COL[3], y, LCOL, 'Telefone', p.telefone)
  y += LINHA
  campo(doc, COL[0], y, LCOL2, 'Nome / Nome Empresarial', p.nome)
  campo(doc, COL[2], y, LCOL, 'Município / Sigla UF', p.municipioUf)
  campo(doc, COL[3], y, LCOL, 'Código IBGE / CEP', p.ibgeCep)
  y += LINHA
  campo(doc, COL[0], y, LCOL2, 'Endereço', p.endereco)
  campo(doc, COL[2], y, LCOL2, 'E-mail', p.email)
  return y + LINHA
}

function desenharQrCode(doc: Doc, conteudo: string, x: number, y: number, lado: number) {
  const qr = QRCode.create(conteudo, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const m = lado / n
  doc.save().fillColor(PRETO)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) doc.rect(x + c * m, y + r * m, m + 0.05, m + 0.05)
    }
  }
  doc.fill().restore()
}

function cabecalho(doc: Doc, d: DadosDanfse) {
  const h = 1.16 * CM
  sombrear(doc, X0, TOPO, LARGURA, h)
  // Marca textual no lugar da logomarca oficial (ver comentário do módulo).
  texto(doc, 'NFS-e', 0.49 * CM, TOPO + 6, 4 * CM, { tamanho: 16, negrito: true })
  texto(doc, 'Nota Fiscal de Serviço Eletrônica', 0.49 * CM, TOPO + 22, 4.5 * CM, { tamanho: 6 })

  const xc = 5.41 * CM
  const wc = 10.19 * CM
  const yc = d.homologacao ? TOPO + 3 : TOPO + 7
  texto(doc, 'DANFSe v2.0', xc, yc, wc, { tamanho: 9, negrito: true, alinhamento: 'center' })
  texto(doc, 'Documento Auxiliar da NFS-e', xc, yc + 10, wc, { tamanho: 9, negrito: true, alinhamento: 'center' })
  if (d.homologacao) {
    texto(doc, 'NFS-e SEM VALIDADE JURÍDICA', xc, yc + 20, wc, { tamanho: 9, negrito: true, alinhamento: 'center', cor: VERMELHO })
  }

  const xr = COL[3] + PAD
  const wr = LCOL - 2 * PAD
  texto(doc, `Município: ${v(d.cabecalho.municipio)}`, xr, TOPO + 4, wr, { tamanho: 8 })
  texto(doc, `Ambiente Gerador: ${v(d.cabecalho.ambienteGerador)}`, xr, TOPO + 15, wr, { tamanho: 6 })
  texto(doc, `Tipo de Ambiente: ${v(d.cabecalho.tipoAmbiente)}`, xr, TOPO + 23, wr, { tamanho: 6 })
  return TOPO + h
}

function campoIdentificacao(doc: Doc, x: number, y: number, largura: number, titulo: string, conteudo: Campo) {
  texto(doc, titulo, x + PAD, y + 2, largura - 2 * PAD, { tamanho: 7, negrito: true })
  texto(doc, v(conteudo), x + PAD, y + 10, largura - 2 * PAD, { tamanho: 7 })
}

function dadosNfse(doc: Doc, d: DadosDanfse, y: number): number {
  divisoria(doc, y)
  const id = d.identificacao
  campoIdentificacao(doc, COL[0], y, 15.3 * CM, 'CHAVE DE ACESSO DA NFS-E', d.chaveAcesso)
  let yl = y + 0.77 * CM
  campoIdentificacao(doc, COL[0], yl, LCOL, 'NÚMERO DA NFS-E', id.numeroNfse)
  campoIdentificacao(doc, COL[1], yl, LCOL, 'COMPETÊNCIA DA NFS-E', id.competencia)
  campoIdentificacao(doc, COL[2], yl, LCOL, 'DATA E HORA DA EMISSÃO DA NFS-E', id.dataHoraEmissaoNfse)
  yl += LINHA_ID
  campoIdentificacao(doc, COL[0], yl, LCOL, 'NÚMERO DA DPS', id.numeroDps)
  campoIdentificacao(doc, COL[1], yl, LCOL, 'SÉRIE DA DPS', id.serieDps)
  campoIdentificacao(doc, COL[2], yl, LCOL, 'DATA E HORA DA EMISSÃO DA DPS', id.dataHoraEmissaoDps)
  yl += LINHA_ID
  sombrear(doc, COL[0], yl, LCOL, LINHA_ID)
  campoIdentificacao(doc, COL[0], yl, LCOL, 'EMITENTE DA NFS-E', id.emitente)
  campoIdentificacao(doc, COL[1], yl, LCOL, 'SITUAÇÃO DA NFS-E', id.situacao)
  campoIdentificacao(doc, COL[2], yl, LCOL, 'FINALIDADE', id.finalidade)

  const lado = 1.52 * CM
  desenharQrCode(doc, d.urlConsulta, 17.48 * CM, 1.67 * CM, lado)
  doc.link(17.48 * CM, 1.67 * CM, lado, lado, d.urlConsulta)
  texto(
    doc,
    'A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e',
    15.8 * CM, 3.36 * CM, 4.72 * CM, { tamanho: 6, linhas: 3, alinhamento: 'center' },
  )
  return y + 2.86 * CM
}

function prestador(doc: Doc, d: DadosDanfse, y: number): number {
  y = blocoPessoa(doc, y, 'Prestador / Fornecedor', d.prestador)
  campo(doc, COL[0], y, LCOL, 'Simples Nacional na Data de Competência', d.prestador.simplesNacional)
  campo(doc, COL[1], y, 15.3 * CM, 'Regime de Apuração Tributária pelo SN', d.prestador.regimeApuracaoSn)
  return y + LINHA
}

function servico(doc: Doc, d: DadosDanfse, y: number, alturaDescricao: number): number {
  divisoria(doc, y)
  tituloBloco(doc, y, 'Serviço Prestado')
  campo(doc, COL[1], y, LCOL, 'Código de Tributação Nacional / Municipal', d.servico.codigoTributacao)
  campo(doc, COL[2], y, LCOL, 'Código da NBS', d.servico.codigoNbs)
  campo(doc, COL[3], y, LCOL, 'Local da Prestação / Sigla UF / País', d.servico.localPrestacao)
  y += LINHA
  // Sem título (NT 008, item 2.4.5).
  texto(doc, v(d.servico.descricaoCodigoTributacao), X0 + PAD, y + 2, LARGURA - 2 * PAD, { tamanho: 7 })
  y += 0.38 * CM
  texto(doc, 'Descrição do Serviço', X0 + PAD, y + 2, LARGURA - 2 * PAD, { tamanho: 6, negrito: true })
  const linhas = Math.max(1, Math.floor((alturaDescricao - 11) / (7 * 1.18)))
  texto(doc, v(d.servico.descricao), X0 + PAD, y + 9, LARGURA - 2 * PAD, { tamanho: 7, linhas })
  return y + alturaDescricao
}

function alturaDescricaoNecessaria(doc: Doc, d: DadosDanfse): number {
  doc.font(FONTE).fontSize(7)
  const h = doc.heightOfString(v(d.servico.descricao), { width: LARGURA - 2 * PAD, lineGap: 0 })
  return Math.max(LINHA, h + 13)
}

function tributacaoMunicipal(doc: Doc, d: DadosDanfse, y: number): number {
  const t = d.tributacaoMunicipal
  if (!t) return blocoReduzido(doc, y, 'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN')
  divisoria(doc, y)
  tituloBloco(doc, y, 'Tributação Municipal (ISSQN)')
  campo(doc, COL[1], y, LCOL, 'Tipo de Tributação do ISSQN', t.tipoTributacao)
  campo(doc, COL[2], y, LCOL2, 'Município / Sigla UF / País de Incidência do ISSQN', t.municipioIncidencia)
  y += LINHA
  // Linhas ** (nota 5): suprimidas quando todos os campos estão vazios.
  if (t.tipoImunidade || t.suspensaoExigibilidade || t.processoSuspensao || (t.regimeEspecial && t.regimeEspecial !== 'Nenhum')) {
    campo(doc, COL[0], y, LCOL, 'Regime Especial de Tributação do ISSQN', t.regimeEspecial)
    campo(doc, COL[1], y, LCOL, 'Tipo de Imunidade do ISSQN', t.tipoImunidade)
    campo(doc, COL[2], y, LCOL, 'Suspensão da Exigibilidade do ISSQN', t.suspensaoExigibilidade)
    campo(doc, COL[3], y, LCOL, 'Número Processo Suspensão', t.processoSuspensao)
    y += LINHA
  }
  if (t.beneficioMunicipal || t.calculoBm || t.totalDeducoesReducoes || t.descontoIncondicionado) {
    campo(doc, COL[0], y, LCOL, 'Benefício Municipal', t.beneficioMunicipal)
    campo(doc, COL[1], y, LCOL, 'Cálculo do BM', t.calculoBm)
    campo(doc, COL[2], y, LCOL, 'Total Deduções/Reduções', t.totalDeducoesReducoes)
    campo(doc, COL[3], y, LCOL, 'Desconto Incondicionado', t.descontoIncondicionado)
    y += LINHA
  }
  campo(doc, COL[0], y, LCOL, 'BC ISSQN', t.baseCalculo)
  campo(doc, COL[1], y, LCOL, 'Alíquota Aplicada', t.aliquota)
  campo(doc, COL[2], y, LCOL, 'Retenção do ISSQN', t.retencao)
  campo(doc, COL[3], y, LCOL, 'ISSQN Apurado', t.issqnApurado)
  return y + LINHA
}

function tributacaoFederal(doc: Doc, d: DadosDanfse, y: number): number {
  const t = d.tributacaoFederal
  divisoria(doc, y)
  tituloBloco(doc, y, 'Tributação Federal (Exceto CBS)')
  campo(doc, COL[1], y, LCOL, 'IRRF', t.irrf)
  campo(doc, COL[2], y, LCOL, 'Contribuição Previdenciária - Retida', t.contribuicaoPrevidenciaria)
  campo(doc, COL[3], y, LCOL, 'Contribuições Sociais - Retidas', t.contribuicoesSociais)
  y += LINHA
  if (t.exibirPisCofins) {
    campo(doc, COL[0], y, LCOL, 'PIS - Débito Apuração Própria', t.pis)
    campo(doc, COL[1], y, LCOL, 'COFINS - Débito Apuração Própria', t.cofins)
    campo(doc, COL[2], y, LCOL2, 'Descrição Contrib. Sociais - Retidas', t.descricaoContribuicoes)
    y += LINHA
  }
  return y
}

function ibsCbs(doc: Doc, d: DadosDanfse, y: number): number {
  const t = d.ibsCbs
  divisoria(doc, y)
  tituloBloco(doc, y, 'Tributação IBS / CBS')
  campo(doc, COL[1], y, LCOL, 'CST / cClassTrib', t.cstClassTrib)
  campo(doc, COL[2], y, LCOL2, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', t.indicadorOperacaoIncidencia)
  y += LINHA
  campo(doc, COL[0], y, LCOL, 'Exclusões e Reduções da Base de Cálculo', t.exclusoesReducoes)
  campo(doc, COL[1], y, LCOL, 'Base de Cálculo Após Exclusões e Reduções', t.baseCalculo)
  campo(doc, COL[2], y, LCOL, 'Red. Alíquota IBS / Red. Alíquota CBS', t.reducoesAliquota)
  campo(doc, COL[3], y, LCOL, 'Alíquota - IBS UF / IBS Mun', t.aliquotasIbs)
  y += LINHA
  campo(doc, COL[0], y, LCOL, 'Alíq. Efetiva Municipal - IBS', t.aliqEfetivaMunicipal)
  campo(doc, COL[1], y, LCOL, 'Valor Apurado Municipal - IBS', t.valorMunicipal)
  campo(doc, COL[2], y, LCOL, 'Alíq. Efetiva Estadual - IBS', t.aliqEfetivaEstadual)
  campo(doc, COL[3], y, LCOL, 'Valor Apurado Estadual - IBS', t.valorEstadual)
  y += LINHA
  campo(doc, COL[0], y, LCOL, 'Valor Total Apurado - IBS', t.valorTotalIbs)
  campo(doc, COL[1], y, LCOL, 'Alíquota - CBS', t.aliquotaCbs)
  campo(doc, COL[2], y, LCOL, 'Alíquota Efetiva - CBS', t.aliqEfetivaCbs)
  campo(doc, COL[3], y, LCOL, 'Valor Total Apurado - CBS', t.valorTotalCbs)
  return y + LINHA
}

function valorTotal(doc: Doc, d: DadosDanfse, y: number): number {
  const t = d.valorTotal
  divisoria(doc, y)
  tituloBloco(doc, y, 'Valor Total da NFS-e', LINHA_ID)
  const destaque = (x: number, yy: number, titulo: string, c: Campo) => {
    texto(doc, titulo, x + PAD, yy + 2, LCOL - 2 * PAD, { tamanho: 7, negrito: true })
    texto(doc, v(c), x + PAD, yy + 10, LCOL - 2 * PAD, { tamanho: 7, negrito: true })
  }
  destaque(COL[1], y, 'VALOR DA OPERAÇÃO / SERVIÇO', t.valorServico)
  campo(doc, COL[2], y, LCOL, 'Desconto Incondicionado', t.descontoIncondicionado)
  campo(doc, COL[3], y, LCOL, 'Desconto Condicionado', t.descontoCondicionado)
  y += LINHA_ID
  campo(doc, COL[0], y, LCOL, 'Total das Retenções (ISSQN / Federais)', t.totalRetencoes)
  destaque(COL[1], y, 'VALOR LÍQUIDO DA NFS-e', t.valorLiquido)
  campo(doc, COL[2], y, LCOL, 'Total do IBS/CBS', t.totalIbsCbs)
  sombrear(doc, COL[3], y, LCOL, LINHA_ID)
  destaque(COL[3], y, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS', t.valorLiquidoIbsCbs)
  return y + LINHA_ID
}

function informacoesComplementares(doc: Doc, d: DadosDanfse, y: number, rodape: string) {
  divisoria(doc, y)
  sombrear(doc, X0, y, LARGURA, 0.39 * CM)
  texto(doc, 'INFORMAÇÕES COMPLEMENTARES', X0 + PAD, y + 2.5, LARGURA - 2 * PAD, { tamanho: 7, negrito: true })
  y += 0.39 * CM + 2
  const yRodape = BASE - 12
  const linhaTotais = 7 * 1.18 + 2
  const espaco = yRodape - y - linhaTotais - 4
  const corpo = d.informacoesComplementares.join(' | ')
  if (corpo) {
    texto(doc, corpo, X0 + PAD, y, LARGURA - 2 * PAD, { tamanho: 7, linhas: Math.max(1, Math.floor(espaco / (7 * 1.18))) })
    doc.font(FONTE).fontSize(7)
    y += Math.min(espaco, doc.heightOfString(corpo, { width: LARGURA - 2 * PAD, lineGap: 0 })) + 2
  }
  // Linha fixa de totais aproximados (nota 10), nunca truncada pelo corpo.
  texto(doc, d.totaisAproximados, X0 + PAD, y, LARGURA - 2 * PAD, { tamanho: 7, linhas: 2 })

  divisoria(doc, yRodape - 2)
  texto(doc, rodape, X0 + PAD, yRodape + 1, LARGURA - 2 * PAD, { tamanho: 6, alinhamento: 'center' })
}

function marcaDagua(doc: Doc, rotulo: string) {
  const cx = PAGINA.largura / 2
  const cy = PAGINA.altura / 2
  doc.save()
  doc.rotate(-45, { origin: [cx, cy] })
  doc.font(FONTE).fontSize(96).fillColor(CINZA_MARCA).fillOpacity(0.55)
  const w = doc.widthOfString(rotulo)
  doc.text(rotulo, cx - w / 2, cy - 48, { lineBreak: false })
  doc.restore()
}

function formatarGeradoEm(data: Date): string {
  // Horário de Brasília, independente do fuso do servidor.
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(data).replace(',', '')
}

/** Desenha o DANFSe numa única página A4 retrato e devolve o PDF. */
export async function renderizarDanfsePdf(d: DadosDanfse, opcoes: OpcoesDanfse = {}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: 0,
    autoFirstPage: true,
    info: {
      Title: `DANFSe ${d.identificacao.numeroNfse ?? ''} - ${d.chaveAcesso}`.trim(),
      Subject: 'Documento Auxiliar da NFS-e',
      Creator: opcoes.plataforma ?? 'TTRD Contábil',
    },
  })
  const partes: Buffer[] = []
  const fim = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (p: Buffer) => partes.push(p))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)
  })

  let y = cabecalho(doc, d)
  y = dadosNfse(doc, d, y)
  y = prestador(doc, d, y)
  y = d.tomador
    ? blocoPessoa(doc, y, 'Tomador / Adquirente', d.tomador)
    : blocoReduzido(doc, y, 'TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e')
  if (d.destinatario === 'proprio-tomador') {
    y = blocoReduzido(doc, y, 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO')
  } else if (d.destinatario) {
    y = blocoPessoa(doc, y, 'Destinatário da Operação', d.destinatario, false)
  } else {
    y = blocoReduzido(doc, y, 'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e')
  }
  y = d.intermediario
    ? blocoPessoa(doc, y, 'Intermediário da Operação', d.intermediario)
    : blocoReduzido(doc, y, 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e')

  // Espaço restante da página dividido entre a descrição do serviço e as
  // informações complementares (NT 008, item 2.3.1: aumentar esses quadros).
  const alturaBlocosFixos = (() => {
    const t = d.tributacaoMunicipal
    let h = t ? LINHA * 2 : 0.32 * CM + 4
    if (t && (t.tipoImunidade || t.suspensaoExigibilidade || t.processoSuspensao || (t.regimeEspecial && t.regimeEspecial !== 'Nenhum'))) h += LINHA
    if (t && (t.beneficioMunicipal || t.calculoBm || t.totalDeducoesReducoes || t.descontoIncondicionado)) h += LINHA
    h += LINHA * (d.tributacaoFederal.exibirPisCofins ? 2 : 1)
    h += LINHA * 4 // IBS/CBS
    h += LINHA_ID * 2 // valor total
    h += LINHA + 0.38 * CM // cabeçalho do serviço + descrição do código
    return h
  })()
  const minimoInfo = 2.2 * CM
  const disponivelDescricao = BASE - y - alturaBlocosFixos - minimoInfo
  const alturaDescricao = Math.max(LINHA, Math.min(alturaDescricaoNecessaria(doc, d), disponivelDescricao))

  y = servico(doc, d, y, alturaDescricao)
  y = tributacaoMunicipal(doc, d, y)
  y = tributacaoFederal(doc, d, y)
  y = ibsCbs(doc, d, y)
  y = valorTotal(doc, d, y)
  const geradoEm = formatarGeradoEm(opcoes.geradoEm ?? new Date())
  informacoesComplementares(
    doc, d, y,
    `DANFSe gerado pela plataforma ${opcoes.plataforma ?? 'TTRD Contábil'} em ${geradoEm} a partir do XML oficial da NFS-e (Sistema Nacional NFS-e). Consulte a autenticidade pela chave de acesso em nfse.gov.br.`,
  )

  // Borda da página: 1 pt (NT 008, item 2.2.3).
  doc.save().lineWidth(1).strokeColor(PRETO).rect(X0, TOPO, LARGURA, BASE - TOPO).stroke().restore()

  if (opcoes.cancelada) marcaDagua(doc, 'CANCELADA')
  else if (opcoes.substituida) marcaDagua(doc, 'SUBSTITUÍDA')

  doc.end()
  return fim
}
