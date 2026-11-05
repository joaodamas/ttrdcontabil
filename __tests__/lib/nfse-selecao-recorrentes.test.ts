import { describe, expect, it } from 'vitest'
import {
  avaliarTomador,
  clampDia,
  diaBateNoFiltro,
  MAX_TENTATIVAS_AUTOMATICAS,
  resolverCamposFiscais,
  selecionarContrato,
  type ContratoNfseRecorrente,
} from '../../functions/src/nfse/selecao-recorrentes'

/** Ajuda a montar o formato que o Firestore entrega (Timestamp com toDate). */
const ts = (iso: string) => ({ toDate: () => new Date(iso) })

/** Contrato mínimo válido: o prestador cli-1 fatura o tomador tom-1 todo dia 10. */
const contrato = (over: Partial<ContratoNfseRecorrente> = {}): ContratoNfseRecorrente => ({
  id: 'ctr-1',
  clienteId: 'cli-1',
  tomadorId: 'tom-1',
  tomadorNome: 'Padaria do Zé LTDA',
  tomadorCpfCnpj: '11222333000181',
  descricao: 'Consultoria mensal',
  valor: 1500,
  diaEmissao: 10,
  issRetido: false,
  ativo: true,
  dataInicio: ts('2026-01-01T12:00:00'),
  ...over,
})

type ParamsSelecao = Parameters<typeof selecionarContrato>[0]

/** Cenário padrão: competência 07/2026, hoje é dia 10, cron diário. */
const selecionar = (over: Partial<ParamsSelecao> = {}) => selecionarContrato({
  contrato: contrato(),
  ano: 2026,
  mes: 7,
  hoje: new Date(2026, 6, 10, 9, 0, 0),
  filtroDia: 'somente_hoje',
  emissaoAutomatica: true,
  ...over,
})

describe('selecionarContrato — o tomador é o cliente DO cliente', () => {
  it('entra no dia contratado', () => {
    expect(selecionar()).toEqual({ entra: true, diaEfetivo: 10, reprocessar: false })
  })

  it('contrato sem nome de tomador não vira nota', () => {
    // O bug que este modelo veio corrigir: sem tomador de verdade, o gerador
    // antigo caía no próprio prestador e emitia a nota do cliente para ele mesmo.
    const r = selecionar({ contrato: contrato({ tomadorNome: '   ' }) })
    expect(r).toMatchObject({ entra: false, motivo: 'sem_tomador', silencioso: false })
  })

  it('CPF/CNPJ do tomador fora de 11 ou 14 dígitos não vira nota', () => {
    for (const doc of ['', '123', '1122233300018', undefined]) {
      expect(selecionar({ contrato: contrato({ tomadorCpfCnpj: doc }) }))
        .toMatchObject({ entra: false, motivo: 'sem_tomador' })
    }
  })

  it('aceita CPF e CNPJ mascarados — o dígito é o que importa', () => {
    expect(selecionar({ contrato: contrato({ tomadorCpfCnpj: '11.222.333/0001-81' }) }))
      .toMatchObject({ entra: true })
    expect(selecionar({ contrato: contrato({ tomadorCpfCnpj: '123.456.789-09' }) }))
      .toMatchObject({ entra: true })
  })

  it('um prestador com 40 tomadores gera 40 seleções no mesmo dia', () => {
    const contratos = Array.from({ length: 40 }, (_, i) => contrato({
      id: `ctr-${i}`,
      tomadorId: `tom-${i}`,
      tomadorNome: `Tomador ${i}`,
    }))
    const entram = contratos.filter((c) => selecionar({ contrato: c }).entra)
    expect(entram).toHaveLength(40)
  })
})

describe('selecionarContrato — o dia é do contrato', () => {
  it('o dia do contrato vence o do cadastro do cliente', () => {
    // Dois tomadores do mesmo prestador podem ser faturados em dias diferentes;
    // `clientes.diaEmissaoNFSe` virou só o padrão de quem não preencheu.
    const r = selecionar({
      contrato: contrato({ diaEmissao: 10 }),
      diaPadraoDoCliente: 25,
    })
    expect(r).toMatchObject({ entra: true, diaEfetivo: 10 })
  })

  it('sem dia no contrato, herda o do cliente', () => {
    const r = selecionar({
      contrato: contrato({ diaEmissao: undefined }),
      diaPadraoDoCliente: 10,
    })
    expect(r).toMatchObject({ entra: true, diaEfetivo: 10 })
  })

  it('sem dia em lugar nenhum, não emite — e diz por quê', () => {
    const r = selecionar({ contrato: contrato({ diaEmissao: null }) })
    expect(r).toMatchObject({ entra: false, motivo: 'sem_dia_emissao', silencioso: false })
  })

  it('dia 31 em mês curto cai no último dia, em vez de nunca acontecer', () => {
    const r = selecionarContrato({
      contrato: contrato({ diaEmissao: 31 }),
      ano: 2026,
      mes: 2,
      hoje: new Date(2026, 1, 28, 9, 0, 0),
      filtroDia: 'somente_hoje',
      emissaoAutomatica: true,
    })
    expect(r).toMatchObject({ entra: true, diaEfetivo: 28 })
  })
})

describe('selecionarContrato — filtroDia', () => {
  it("'somente_hoje' não antecipa quem é faturado dia 25", () => {
    // O bug que já foi corrigido e não pode voltar: no dia 1º, o cron emitia a
    // base inteira de uma vez.
    const r = selecionar({ contrato: contrato({ diaEmissao: 25 }) })
    expect(r).toMatchObject({ entra: false, motivo: 'fora_do_dia', silencioso: true })
  })

  it("'ate_hoje' pega quem já passou do dia e ignora quem ainda não chegou", () => {
    expect(selecionar({ contrato: contrato({ diaEmissao: 5 }), filtroDia: 'ate_hoje' }))
      .toMatchObject({ entra: true })
    expect(selecionar({ contrato: contrato({ diaEmissao: 25 }), filtroDia: 'ate_hoje' }))
      .toMatchObject({ entra: false, motivo: 'fora_do_dia' })
  })

  it("'todos' varre o mês inteiro (mês fechado, correção manual)", () => {
    expect(selecionar({ contrato: contrato({ diaEmissao: 25 }), filtroDia: 'todos' }))
      .toMatchObject({ entra: true, diaEfetivo: 25 })
  })

  it('mês que não é o corrente não sofre recorte de dia', () => {
    expect(diaBateNoFiltro({
      diaEfetivo: 25, ano: 2026, mes: 6, hoje: new Date(2026, 6, 10), filtroDia: 'ate_hoje',
    })).toBe(true)
    // ...mas 'somente_hoje' continua sendo só hoje: nunca em competência passada.
    expect(diaBateNoFiltro({
      diaEfetivo: 25, ano: 2026, mes: 6, hoje: new Date(2026, 6, 10), filtroDia: 'somente_hoje',
    })).toBe(false)
  })
})

describe('selecionarContrato — dedup por status, com teto', () => {
  const foraDoDia = { contrato: contrato({ diaEmissao: 25 }) }

  it('retoma rascunho pendente mesmo fora do dia de emissão', () => {
    // O cron que criou 40 rascunhos ontem e morreu no 13º precisa terminar o
    // serviço hoje — senão os 27 restantes nunca mais saem.
    const r = selecionar({
      ...foraDoDia,
      rascunhoExistente: { status: 'erro_integracao', tentativas: 1 },
    })
    expect(r).toEqual({ entra: true, diaEfetivo: 25, reprocessar: true })
  })

  it('nota já emitida não volta pra fila', () => {
    const r = selecionar({ rascunhoExistente: { status: 'emitida', tentativas: 1 } })
    expect(r).toMatchObject({ entra: false, motivo: 'ja_processado', silencioso: true })
  })

  it('rascunho sob o lock da emissão não é tocado', () => {
    const r = selecionar({ rascunhoExistente: { status: 'processando', tentativas: 1 } })
    expect(r).toMatchObject({ entra: false, motivo: 'ja_processado' })
  })

  it('estourado o teto de tentativas, sai da fila automática e AVISA', () => {
    // Sem teto, erro permanente (certificado errado) reemitiria todo dia, para
    // sempre. O motivo é ruidoso de propósito: alguém precisa olhar.
    const r = selecionar({
      rascunhoExistente: { status: 'erro_integracao', tentativas: MAX_TENTATIVAS_AUTOMATICAS },
    })
    expect(r).toMatchObject({ entra: false, motivo: 'teto_de_tentativas', silencioso: false })
  })

  it('cliente sem emissão automática não tem o rascunho recriado', () => {
    // Recriar apagaria o que o operador editou na tela.
    const r = selecionar({
      emissaoAutomatica: false,
      rascunhoExistente: { status: 'erro_integracao', tentativas: 0 },
    })
    expect(r).toMatchObject({ entra: false, motivo: 'aguardando_revisao', silencioso: true })
  })

  it('sem rascunho, cliente sem emissão automática entra normalmente (vira rascunho)', () => {
    expect(selecionar({ emissaoAutomatica: false })).toMatchObject({ entra: true, reprocessar: false })
  })
})

describe('selecionarContrato — vigência e valor', () => {
  it('contrato encerrado para de faturar', () => {
    const r = selecionar({ contrato: contrato({ dataFim: ts('2026-06-30T12:00:00') }) })
    expect(r).toMatchObject({ entra: false, motivo: 'fora_de_vigencia' })
  })

  it('contrato encerrado não é ressuscitado por rascunho pendente', () => {
    // A vigência é checada ANTES da retomada de propósito: rascunho que sobrou
    // de um contrato encerrado é lixo, não trabalho pendente.
    const r = selecionar({
      contrato: contrato({ dataFim: ts('2026-06-30T12:00:00') }),
      rascunhoExistente: { status: 'erro_integracao', tentativas: 0 },
    })
    expect(r).toMatchObject({ entra: false, motivo: 'fora_de_vigencia' })
  })

  it('contrato que ainda não começou não fatura', () => {
    const r = selecionar({ contrato: contrato({ dataInicio: ts('2026-09-01T12:00:00') }) })
    expect(r).toMatchObject({ entra: false, motivo: 'fora_de_vigencia' })
  })

  it('contrato desativado na mão não fatura', () => {
    const r = selecionar({ contrato: contrato({ ativo: false }) })
    expect(r).toMatchObject({ entra: false, motivo: 'contrato_inativo' })
  })

  it('valor não positivo ou ilegível não vira nota', () => {
    for (const valor of [0, -10, 'mil', '1.234,56', null, undefined]) {
      expect(selecionar({ contrato: contrato({ valor }) }))
        .toMatchObject({ entra: false, motivo: 'sem_valor' })
    }
  })

  it('valor gravado como string numérica ainda é aceito', () => {
    expect(selecionar({ contrato: contrato({ valor: '1500' }) })).toMatchObject({ entra: true })
  })
})

describe('resolverCamposFiscais — o contrato sobrepõe, clientes_fiscal completa', () => {
  const fiscalCompleto = {
    codigoServicoPadrao: '17.19',
    itemListaServico: '17.19',
    aliquotaPadrao: 5,
    issRetidoPadrao: false,
    descricaoServicoPadrao: 'Assessoria contábil',
    cnae: '6920601',
  }

  it('campos vazios no contrato herdam do cliente', () => {
    const r = resolverCamposFiscais(
      contrato({ itemListaServico: undefined, codigoServico: undefined, aliquota: undefined, descricao: undefined }),
      fiscalCompleto,
    )
    expect(r).toEqual({
      ok: true,
      campos: {
        descricaoServico: 'Assessoria contábil',
        codigoServico: '17.19',
        itemListaServico: '17.19',
        cnae: '6920601',
        aliquota: 5,
        issRetido: false,
      },
    })
  })

  it('o contrato ganha do padrão quando preenche', () => {
    const r = resolverCamposFiscais(
      contrato({ itemListaServico: '01.07', codigoServico: '107', aliquota: 2, descricao: 'Suporte de TI' }),
      fiscalCompleto,
    )
    expect(r).toMatchObject({
      ok: true,
      campos: { codigoServico: '107', itemListaServico: '01.07', aliquota: 2, descricaoServico: 'Suporte de TI' },
    })
  })

  it('sem código municipal separado, o item da lista serve de código', () => {
    const r = resolverCamposFiscais(
      contrato({ codigoServico: undefined }),
      { ...fiscalCompleto, codigoServicoPadrao: undefined },
    )
    expect(r).toMatchObject({ ok: true, campos: { codigoServico: '17.19' } })
  })

  it('alíquota em branco não vira 0%', () => {
    // `Number(null)` é 0: o cliente sem alíquota configurada emitia a nota com
    // ISS zerado, e ninguém via.
    for (const aliquotaPadrao of [null, undefined, '']) {
      const r = resolverCamposFiscais(
        contrato({ aliquota: undefined }),
        { ...fiscalCompleto, aliquotaPadrao },
      )
      expect(r).toMatchObject({ ok: false })
      expect(r.ok === false && r.faltando).toContain('alíquota')
    }
  })

  it('alíquota 0 explícita é decisão e passa (imune/isento)', () => {
    const r = resolverCamposFiscais(contrato({ aliquota: 0 }), fiscalCompleto)
    expect(r).toMatchObject({ ok: true, campos: { aliquota: 0 } })
  })

  it('lista tudo o que falta, em vez de recusar sem explicar', () => {
    const r = resolverCamposFiscais(contrato(), {})
    expect(r).toMatchObject({ ok: false })
    expect(r.ok === false && r.faltando).toEqual(['item da lista de serviço', 'código de serviço', 'alíquota'])
  })

  it('issRetido false no contrato não é sobreposto pelo padrão true', () => {
    // `false` é uma decisão, não ausência — `??` deixaria o padrão vencer.
    const r = resolverCamposFiscais(
      contrato({ issRetido: false }),
      { ...fiscalCompleto, issRetidoPadrao: true },
    )
    expect(r).toMatchObject({ ok: true, campos: { issRetido: false } })
  })

  it('sem issRetido no contrato, herda o padrão do cliente', () => {
    const r = resolverCamposFiscais(
      contrato({ issRetido: undefined }),
      { ...fiscalCompleto, issRetidoPadrao: true },
    )
    expect(r).toMatchObject({ ok: true, campos: { issRetido: true } })
  })

  it('sem descrição em lugar nenhum, cai num texto genérico válido', () => {
    const r = resolverCamposFiscais(
      contrato({ descricao: '' }),
      { ...fiscalCompleto, descricaoServicoPadrao: undefined },
    )
    expect(r).toMatchObject({ ok: true, campos: { descricaoServico: 'Serviços prestados' } })
  })
})

describe('avaliarTomador — a carteira de um cliente não vaza pra nota de outro', () => {
  it('tomador de OUTRO prestador bloqueia a emissão', () => {
    const r = avaliarTomador(contrato(), { clienteId: 'cli-2', ativo: true })
    expect(r).toEqual({ bloqueia: true, problema: 'de_outro_prestador' })
  })

  it('tomador inativo ou excluído bloqueia', () => {
    expect(avaliarTomador(contrato(), { clienteId: 'cli-1', ativo: false }))
      .toEqual({ bloqueia: true, problema: 'inativo' })
    expect(avaliarTomador(contrato(), { clienteId: 'cli-1', ativo: true, deletedAt: ts('2026-05-01T12:00:00') }))
      .toEqual({ bloqueia: true, problema: 'inativo' })
  })

  it('tomador sumido do cadastro não bloqueia, mas é reportado', () => {
    // Nome e documento estão denormalizados no contrato; só o endereço se perde.
    expect(avaliarTomador(contrato(), undefined))
      .toEqual({ bloqueia: false, problema: 'nao_cadastrado' })
  })

  it('tomador da carteira do próprio prestador passa limpo', () => {
    expect(avaliarTomador(contrato(), { clienteId: 'cli-1', ativo: true })).toEqual({ bloqueia: false })
  })
})

describe('clampDia', () => {
  it('normaliza o dia pro tamanho do mês', () => {
    expect(clampDia(2026, 2, 31)).toBe(28)
    expect(clampDia(2024, 2, 31)).toBe(29) // bissexto
    expect(clampDia(2026, 4, 31)).toBe(30)
    expect(clampDia(2026, 7, 31)).toBe(31)
    expect(clampDia(2026, 7, 0)).toBe(1)
  })
})
