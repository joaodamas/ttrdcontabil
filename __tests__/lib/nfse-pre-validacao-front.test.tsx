/**
 * Lado do navegador da pré-validação: entrada montada do formulário/rascunho,
 * distribuição dos achados pelos campos e o painel de bloqueio.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { PainelPreValidacao, AchadosDoCampo } from '@/components/fiscal/pre-validacao-painel'
import { CatalogoPicker } from '@/components/fiscal/catalogo-picker'
import { INDICADOR_OPERACAO, NBS } from '@/lib/nfse-dominios'
import {
  CAMPO_FORMULARIO_CONFIG, CAMPO_FORMULARIO_EMISSAO, achadosDoCampo, bloqueiamSalvarConfig, bloqueiosDe,
  entradaDoFormulario, nbsSugeridas, preValidarNfse, preValidarRascunho,
} from '@/lib/nfse-pre-validacao'

const HOJE = '2026-11-06'
const fiscal: Record<string, unknown> = {
  municipioEmissor: 'Barueri', municipioIbge: '3505708', inscricaoMunicipal: '12345', regimeTributario: 'simples_nacional',
  optanteSimples: true, itemListaServico: '17.19', codigoServicoPadrao: '1719', aliquotaPadrao: 2, ambienteEmissao: 'producao',
  provedorNfse: 'nacional', ibsCbsCst: '000', ibsCbsClassTrib: '000001', ibsCbsIndOp: '100301', codigoNbs: '1.1302.21.00',
  credenciais: { certificadoStoragePath: 'certificados/c1.pfx.b64', certTitular: 'X:11222333000181', certVencimento: '2027-01-01', certValido: true },
}
const cliente = { cpfCnpj: '11.222.333/0001-81', razaoSocial: 'Prestador Teste Ltda' }
const formulario = {
  competencia: '2026-10', tomadorNome: 'Tomador Ltda', tomadorCpfCnpj: '11.444.777/0001-61', tomadorEmail: '',
  tomadorEndereco: { cep: '', logradouro: '', numero: '', bairro: '', municipioIbge: '' },
  descricaoFinal: 'Serviços contábeis de outubro', codigoServico: '1719', itemListaServico: '17.19',
  codigoNbs: '', valorServico: 1000, aliquota: Number.NaN, issRetido: false,
}

describe('entradaDoFormulario', () => {
  it('formulário completo herdando os padrões do cliente passa', () => {
    expect(bloqueiosDe(preValidarNfse(entradaDoFormulario(formulario, fiscal, cliente, HOJE)))).toEqual([])
  })
  it('cIndOp de imóvel digitado na nota bloqueia e cai no campo ibsCbsIndOp', () => {
    const achados = preValidarNfse(entradaDoFormulario({ ...formulario, ibsCbsIndOp: '020101' }, fiscal, cliente, HOJE))
    const doCampo = achadosDoCampo(achados, CAMPO_FORMULARIO_EMISSAO, 'ibsCbsIndOp')
    expect(doCampo.map((a) => a.codigoSefin)).toEqual(['E0932'])
  })
  it('endereço em branco não conta como endereço parcial', () => {
    const achados = preValidarNfse(entradaDoFormulario(formulario, fiscal, cliente, HOJE))
    expect(achados.some((a) => a.regra === 'tomador_endereco_parcial')).toBe(false)
  })
})

describe('preValidarRascunho (lote)', () => {
  it('usa o normalizador do servidor (formato plano do rascunho)', () => {
    const dados = { tomadorNome: 'Tomador Ltda', tomadorCpfCnpj: '11444777000161', descricaoServico: 'Serviços contábeis', codigoServico: '1719', valorServico: 1000, issRetido: false, ibsCbsIndOp: '020101', dataCompetencia: '2026-10-01' }
    const b = bloqueiosDe(preValidarRascunho({ id: 'r1', clienteId: 'c1', dados }, fiscal, cliente, HOJE))
    expect(b.map((x) => x.regra)).toEqual(['cindop_imovel'])
  })
})

describe('configuração fiscal', () => {
  it('município fora do Emissor Nacional não impede salvar; NBS incompatível impede', () => {
    const achados = preValidarNfse(entradaDoFormulario({ ...formulario, codigoNbs: '1.0101.11.00' }, { ...fiscal, municipioIbge: '3525904' }, cliente, HOJE))
    const regras = bloqueiamSalvarConfig(achados).map((a) => a.regra)
    expect(regras).toContain('nbs_incompativel')
    expect(regras).not.toContain('municipio_sem_emissor_nacional')
    expect(CAMPO_FORMULARIO_CONFIG['servico.codigoNbs']).toBe('codigoNbs')
  })
  it('NBS sugeridas vêm formatadas como no seletor', () => {
    expect(nbsSugeridas('171901')).toEqual(['1.1302.21.00', '1.1302.22.00', '1.1302.23.00'])
    expect(nbsSugeridas(undefined)).toEqual([])
  })
})

describe('PainelPreValidacao', () => {
  it('mostra bloqueios com o código evitado e avisos separados', () => {
    const achados = preValidarNfse(entradaDoFormulario({ ...formulario, ibsCbsIndOp: '020101', competencia: '2025-09' }, { ...fiscal, ibsCbsCst: '', ibsCbsClassTrib: '' }, cliente, HOJE))
    render(<PainelPreValidacao achados={achados} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Emissão bloqueada/)
    expect(screen.getByRole('alert')).toHaveTextContent(/IBS\/CBS pela metade/)
  })
  it('nada a mostrar = não renderiza', () => {
    const { container } = render(<PainelPreValidacao achados={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('AchadosDoCampo marca bloqueio e aviso', () => {
    render(<AchadosDoCampo achados={[
      { regra: 'x', campo: 'servico.codigoNbs', severidade: 'bloqueio', mensagem: 'NBS errado para o serviço', codigoSefin: 'E0322' },
      { regra: 'y', campo: 'servico.codigoNbs', severidade: 'aviso', mensagem: 'Confira o NBS escolhido' },
    ]} />)
    expect(screen.getByText(/Bloqueia a emissão: NBS errado/)).toHaveAttribute('data-severidade', 'bloqueio')
    expect(screen.getByText(/Atenção: Confira/)).toHaveAttribute('data-severidade', 'aviso')
  })
})

describe('CatalogoPicker — não facilita escolher o 1º item por engano', () => {
  // cmdk/popover usam ResizeObserver e scrollIntoView, ausentes no jsdom.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= () => undefined

  it('sem busca mostra só as sugeridas', async () => {
    const sugeridas = NBS.filter((o) => o.codigo === '1.1302.21.00')
    render(<CatalogoPicker opcoes={NBS} onChange={() => undefined} placeholder="Busque o NBS pela descrição do serviço" buscaMinima={3} sugeridas={sugeridas} />)
    await userEvent.click(screen.getByText('Busque o NBS pela descrição do serviço'))
    expect(await screen.findByText('1.1302.21.00')).toBeInTheDocument()
    // O 1º NBS da tabela (construção de edificações) não aparece sem digitar.
    expect(screen.queryByText('1.0101.11.00')).not.toBeInTheDocument()
  })
  it('sem sugeridas e sem busca, não lista nada e pede para digitar', async () => {
    render(<CatalogoPicker opcoes={INDICADOR_OPERACAO} onChange={() => undefined} placeholder="Busque pela descrição da operação" buscaMinima={3} />)
    await userEvent.click(screen.getByText('Busque pela descrição da operação'))
    expect(await screen.findByText(/Digite parte da descrição/)).toBeInTheDocument()
    expect(screen.queryByText('100301')).not.toBeInTheDocument()
  })
})
