import { describe, expect, it } from 'vitest'
import {
  avaliarTetoDiario,
  decidirConfirmacaoPagamento,
  detectouBaixaDePagamento,
  DIAS_VALIDADE_CONFIRMACAO,
  mapEtapaToTemplate,
  normalizarTetoDiario,
  resolverTemplateKey,
  TEMPLATE_CONFIRMACAO_PAGAMENTO,
  TETO_DIARIO_MAXIMO,
  TETO_DIARIO_PADRAO,
  type EntradaConfirmacaoPagamento,
} from '../../functions/src/whatsapp/decisao'

describe('mapEtapaToTemplate — etapa nova não pode virar mensagem errada', () => {
  it('resolve as cinco etapas da régua padrão', () => {
    expect(mapEtapaToTemplate('D-7')).toBe('cobranca_pre_vencimento_7')
    expect(mapEtapaToTemplate('D-3')).toBe('cobranca_pre_vencimento_3')
    expect(mapEtapaToTemplate('D0')).toBe('cobranca_vencimento_hoje')
    expect(mapEtapaToTemplate('D+3')).toBe('cobranca_atraso_leve')
    expect(mapEtapaToTemplate('D+7')).toBe('cobranca_atraso_critico')
  })

  it('etapa D+15 não manda mais "vence em 3 dias"', () => {
    // O bug original: o default do switch era 'cobranca_pre_vencimento_3', então
    // uma etapa criada só no banco avisava vencimento futuro a quem já estava
    // 15 dias atrasado.
    expect(mapEtapaToTemplate('D+15')).toBe('cobranca_atraso_critico')
    expect(mapEtapaToTemplate('D+1')).toBe('cobranca_atraso_leve')
    expect(mapEtapaToTemplate('D+30')).toBe('cobranca_atraso_critico')
  })

  it('etapa nova antes do vencimento fica do lado do pré-vencimento', () => {
    expect(mapEtapaToTemplate('D-30')).toBe('cobranca_pre_vencimento_7')
    expect(mapEtapaToTemplate('D-1')).toBe('cobranca_pre_vencimento_3')
  })

  it('tolera caixa e espaço no cadastro da etapa', () => {
    expect(mapEtapaToTemplate('d+3')).toBe('cobranca_atraso_leve')
    expect(mapEtapaToTemplate(' D-7 ')).toBe('cobranca_pre_vencimento_7')
  })

  it('etapa ilegível devolve null em vez de chutar um template', () => {
    // Mandar a mensagem errada é pior que não mandar: o chamador cancela com
    // motivo visível.
    expect(mapEtapaToTemplate('atraso-grave')).toBeNull()
    expect(mapEtapaToTemplate('')).toBeNull()
    expect(mapEtapaToTemplate(undefined)).toBeNull()
  })

  it('a etapa da confirmação tem template próprio', () => {
    expect(mapEtapaToTemplate('CONFIRMACAO')).toBe(TEMPLATE_CONFIRMACAO_PAGAMENTO)
  })
})

describe('resolverTemplateKey — a regra manda, o mapa é o último recurso', () => {
  it('honra o templateKey da regra', () => {
    // Sem isso, toda mensagem nova exige deploy de código em vez de configuração.
    const resolvido = resolverTemplateKey({ templateKeyRegra: 'cobranca_atraso_15', etapa: 'D+15' })
    expect(resolvido).toEqual({ templateKey: 'cobranca_atraso_15', origem: 'regra' })
  })

  it('regra com templateKey vazio cai para o valor gravado no job', () => {
    const resolvido = resolverTemplateKey({ templateKeyRegra: '  ', templateKeyJob: 'cobranca_atraso_leve', etapa: 'D-3' })
    expect(resolvido).toEqual({ templateKey: 'cobranca_atraso_leve', origem: 'job' })
  })

  it('sem regra e sem job, usa o mapa da etapa', () => {
    const resolvido = resolverTemplateKey({ etapa: 'D0' })
    expect(resolvido).toEqual({ templateKey: 'cobranca_vencimento_hoje', origem: 'mapa' })
  })

  it('nada resolvido devolve null — o envio é cancelado, não adivinhado', () => {
    expect(resolverTemplateKey({ etapa: 'promocao_fim_de_ano' })).toEqual({ templateKey: null, origem: 'nenhuma' })
  })
})

describe('normalizarTetoDiario — default conservador', () => {
  it('sem configuração vale o padrão', () => {
    // null e '' precisam do mesmo tratamento que undefined: Number(null) é 0,
    // não NaN, e o campo em branco no formulário chega como um dos dois.
    expect(normalizarTetoDiario(undefined)).toBe(TETO_DIARIO_PADRAO)
    expect(normalizarTetoDiario(null)).toBe(TETO_DIARIO_PADRAO)
    expect(normalizarTetoDiario('')).toBe(TETO_DIARIO_PADRAO)
    expect(normalizarTetoDiario('abc')).toBe(TETO_DIARIO_PADRAO)
  })

  it('aceita número gravado como texto (vem de input da UI)', () => {
    expect(normalizarTetoDiario('5')).toBe(5)
  })

  it('zero ou negativo nunca desliga a régua em silêncio', () => {
    // Para desligar existe o interruptor whatsappCloudApiEnabled, que diz o que
    // está acontecendo.
    expect(normalizarTetoDiario(0)).toBe(1)
    expect(normalizarTetoDiario(-4)).toBe(1)
  })

  it('trunca fração e limita o máximo', () => {
    expect(normalizarTetoDiario(3.9)).toBe(3)
    expect(normalizarTetoDiario(999)).toBe(TETO_DIARIO_MAXIMO)
  })
})

describe('avaliarTetoDiario — o cliente com 3 serviços atrasados não recebe 15 mensagens', () => {
  it('libera enquanto está abaixo do teto', () => {
    expect(avaliarTetoDiario({ enviadasHoje: 0, teto: 3 }).permitido).toBe(true)
    expect(avaliarTetoDiario({ enviadasHoje: 2, teto: 3 }).permitido).toBe(true)
  })

  it('bloqueia ao atingir o teto, com motivo legível', () => {
    const veredicto = avaliarTetoDiario({ enviadasHoje: 3, teto: 3 })
    expect(veredicto.permitido).toBe(false)
    expect(veredicto.motivo).toContain('adiado')
  })

  it('continua bloqueando se o contador passou do teto', () => {
    expect(avaliarTetoDiario({ enviadasHoje: 9, teto: 3 }).permitido).toBe(false)
  })

  it('contador ausente ou corrompido conta como zero, não como infinito', () => {
    expect(avaliarTetoDiario({ enviadasHoje: undefined, teto: 3 })).toMatchObject({ permitido: true, enviadasHoje: 0 })
    expect(avaliarTetoDiario({ enviadasHoje: -2, teto: 3 })).toMatchObject({ permitido: true, enviadasHoje: 0 })
  })

  it('sem teto configurado aplica o default conservador', () => {
    expect(avaliarTetoDiario({ enviadasHoje: TETO_DIARIO_PADRAO, teto: undefined }).permitido).toBe(false)
  })
})

describe('detectouBaixaDePagamento — o gatilho da confirmação', () => {
  it('pendente que vira pago com data é baixa', () => {
    expect(detectouBaixaDePagamento(
      { status: 'pendente', temDataPagamento: false },
      { status: 'pago', temDataPagamento: true },
    )).toBe(true)
  })

  it('status já era pago e só agora a data chegou também é baixa', () => {
    // Esse caso não muda o status: se dependesse do early-return de status no
    // trigger, a confirmação sumiria.
    expect(detectouBaixaDePagamento(
      { status: 'pago', temDataPagamento: false },
      { status: 'pago', temDataPagamento: true },
    )).toBe(true)
  })

  it('editar um lançamento já pago não gera outra confirmação', () => {
    expect(detectouBaixaDePagamento(
      { status: 'pago', temDataPagamento: true },
      { status: 'pago', temDataPagamento: true },
    )).toBe(false)
  })

  it('pago sem data de pagamento não é baixa', () => {
    expect(detectouBaixaDePagamento(
      { status: 'pendente', temDataPagamento: false },
      { status: 'pago', temDataPagamento: false },
    )).toBe(false)
  })

  it('estorno (pago para pendente) não dispara nada', () => {
    expect(detectouBaixaDePagamento(
      { status: 'pago', temDataPagamento: true },
      { status: 'pendente', temDataPagamento: false },
    )).toBe(false)
  })
})

describe('decidirConfirmacaoPagamento — utilidade, mas com as mesmas travas da cobrança', () => {
  const agora = new Date('2026-07-29T14:00:00Z')

  const base: EntradaConfirmacaoPagamento = {
    canalHabilitado: true,
    tipo: 'receita',
    status: 'pago',
    valor: 450,
    dataPagamento: new Date('2026-07-29T10:00:00Z'),
    clienteAtivo: true,
    consentimento: true,
    clientePausado: false,
    temContatoValido: true,
    numeroOptOut: false,
    agora,
  }

  it('baixa recém-feita de cliente consentido é enviada', () => {
    expect(decidirConfirmacaoPagamento(base).enviar).toBe(true)
  })

  it('canal desligado não enfileira nada', () => {
    // É o que impede a fila de acumular meses de confirmações enquanto o módulo
    // está fora do deploy, para explodir tudo de uma vez no dia da ativação.
    expect(decidirConfirmacaoPagamento({ ...base, canalHabilitado: false }).enviar).toBe(false)
  })

  it('despesa não gera confirmação', () => {
    expect(decidirConfirmacaoPagamento({ ...base, tipo: 'despesa' }).enviar).toBe(false)
  })

  it('baixa revertida antes do envio cancela a mensagem', () => {
    const veredicto = decidirConfirmacaoPagamento({ ...base, status: 'pendente' })
    expect(veredicto.enviar).toBe(false)
    expect(veredicto.motivo).toContain('revertida')
  })

  it('pago sem data de pagamento não confirma', () => {
    expect(decidirConfirmacaoPagamento({ ...base, dataPagamento: null }).enviar).toBe(false)
  })

  it('valor zerado não tem o que confirmar', () => {
    expect(decidirConfirmacaoPagamento({ ...base, valor: 0 }).enviar).toBe(false)
  })

  it('baixa retroativa antiga não vira mensagem', () => {
    const antiga = new Date(agora.getTime() - (DIAS_VALIDADE_CONFIRMACAO + 1) * 86400000)
    const veredicto = decidirConfirmacaoPagamento({ ...base, dataPagamento: antiga })
    expect(veredicto.enviar).toBe(false)
    expect(veredicto.motivo).toContain('retroativa')
  })

  it('baixa dentro da janela de validade ainda vira mensagem', () => {
    const recente = new Date(agora.getTime() - (DIAS_VALIDADE_CONFIRMACAO - 1) * 86400000)
    expect(decidirConfirmacaoPagamento({ ...base, dataPagamento: recente }).enviar).toBe(true)
  })

  it('data de pagamento no futuro não bloqueia (baixa lançada adiantada)', () => {
    const futura = new Date(agora.getTime() + 2 * 86400000)
    expect(decidirConfirmacaoPagamento({ ...base, dataPagamento: futura }).enviar).toBe(true)
  })

  it('respeita consentimento, pausa e opt-out igual à cobrança', () => {
    expect(decidirConfirmacaoPagamento({ ...base, consentimento: false }).enviar).toBe(false)
    expect(decidirConfirmacaoPagamento({ ...base, clientePausado: true }).enviar).toBe(false)
    expect(decidirConfirmacaoPagamento({ ...base, numeroOptOut: true }).enviar).toBe(false)
    expect(decidirConfirmacaoPagamento({ ...base, clienteAtivo: false }).enviar).toBe(false)
    expect(decidirConfirmacaoPagamento({ ...base, temContatoValido: false }).enviar).toBe(false)
  })
})
