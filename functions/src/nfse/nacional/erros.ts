/**
 * Tradução PURA dos códigos de rejeição da Sefin Nacional/ADN para pt-BR.
 * Fonte dos códigos: Anexo I (RN DPS_NFS-e 1.01 / RN_RECEP) e Anexo II da
 * produção restrita; E0037 confirmado na prática (05/11/2026, Cajamar).
 * O código original sempre segue em `codigoErro` e a mensagem da Sefin em `detalhes`.
 */
import type { MensagemSefin } from './ambiente'
import { formatarMensagem } from './ambiente'

export interface ContextoErroNacional {
  /** Nome do município emissor, para as mensagens de convênio. */
  municipio: string
}

export function mensagemMunicipioSemConvenio(municipio: string): string {
  return `${municipio} ainda não aderiu ao Emissor Nacional — não é possível emitir pelo Ambiente Nacional para este município.`
}

export function mensagemMunicipioSemEmissorNacional(municipio: string): string {
  return `${municipio} tem convênio com o Ambiente Nacional, mas não usa o Emissor Nacional (mantém emissor próprio) — não é possível emitir pelo Ambiente Nacional para este município.`
}

const TRADUCOES: Record<string, (ctx: ContextoErroNacional) => string> = {
  E0037: (ctx) => mensagemMunicipioSemConvenio(ctx.municipio),
  E0008: () => 'Data de emissão posterior ao horário da Sefin. Aguarde alguns segundos e tente de novo.',
  // "Conjunto de Série, Número, Código do Município Emissor e CNPJ/CPF informado
  // nesta DPS já existe em uma NFS-e gerada a partir de uma DPS enviada
  // anteriormente." — o código não está em regras-dps.json (é regra da
  // recepção, RN_RECEP); texto confirmado em documentação de emissores
  // (Omie/Alterdata), a confirmar na homologação. Quem recebe o E0014
  // (emitir.ts) CONSULTA a DPS e registra a nota existente em vez de reenviar.
  E0014: () => 'Já existe uma NFS-e gerada com esta série e número de DPS (envio anterior que chegou à Sefin). A plataforma consulta essa nota e a registra — não emita outra.',
  E0932: () => 'O indicador de operação (IBS/CBS) escolhido é de operação com bem imóvel e exige os dados do imóvel. Para serviços em geral (consultoria, contabilidade, TI) use 100301 na nota e na configuração fiscal do cliente.',
  E0162: () => 'Regime de apuração do Simples (regApTribSN) só vale para ME/EPP optante. Revise o regime tributário do cliente.',
  // Texto oficial: "código de tributação nacional não administrado pelo município
  // de incidência na data de competência" — confirmado na produção restrita
  // (2026-11-05): o código existe, mas a alíquota municipal não está vigente
  // naquela competência. Não é falta de cTribMun.
  E0312: (ctx) => `${ctx.municipio} não tem o código de serviço informado vigente nesta competência. Confira o item da lista de serviço (e o desdobro) e a data de competência.`,
  E0084: (ctx) => `O CNPJ do prestador não tem estabelecimento em ${ctx.municipio} na competência informada (cadastro CNPJ/CNC). A nota precisa sair pelo município onde o cliente está estabelecido.`,
  E0315: (ctx) => `${ctx.municipio} não usa código de tributação municipal. Apague o "Desdobro municipal" da configuração fiscal.`,
  E0676: () => 'MEI não informa tributos federais (PIS/COFINS, retenções) na NFS-e.',
  E0712: () => 'Para ME/EPP do Simples, o total aproximado de tributos deve ir em percentual do Simples. Revise o regime e a alíquota do Simples na configuração fiscal.',
  E0714: () => 'A DPS precisa estar assinada com o certificado A1 do prestador.',
  E0717: () => 'Assinatura digital da DPS inválida. Reenvie o certificado A1 do cliente.',
  E0718: () => 'O certificado A1 usado não é do prestador da nota. Envie o certificado do próprio cliente (mesmo CNPJ).',
  E1225: () => 'Falha ao descompactar a DPS na Sefin (gzip/base64). Erro interno da plataforma — avise o suporte.',
  E1226: () => 'Falha ao descompactar a DPS na Sefin (gzip/base64). Erro interno da plataforma — avise o suporte.',
  E1228: () => 'XML da DPS com prefixo de namespace. Erro interno da plataforma — avise o suporte.',
  E1229: () => 'XML da DPS fora do padrão UTF-8. Erro interno da plataforma — avise o suporte.',
  E1235: () => 'A DPS não passou na validação de esquema (XSD) da Sefin. Erro interno da plataforma — avise o suporte com os detalhes.',
}

function traduzirCodigo(codigo: string | undefined, ctx: ContextoErroNacional): string | null {
  if (!codigo) return null
  const c = codigo.toUpperCase()
  const fn = TRADUCOES[c]
  if (fn) return fn(ctx)
  // E1200–E1209: certificado de transmissão (mTLS).
  if (/^E120\d$/.test(c)) {
    return 'Certificado A1 recusado pela Sefin (vencido, revogado, fora da ICP-Brasil ou sem CNPJ). Reenvie um certificado A1 válido do cliente.'
  }
  return null
}

export interface ErroTraduzido {
  erro: string
  codigoErro: string
  detalhes: string
}

/**
 * Junta as rejeições numa mensagem em pt-BR. Códigos conhecidos são
 * traduzidos; desconhecidos vão com a descrição da própria Sefin.
 */
export function traduzirErrosSefin(erros: MensagemSefin[], ctx: ContextoErroNacional): ErroTraduzido {
  if (erros.length === 0) {
    return { erro: 'A Sefin Nacional recusou a DPS sem informar o motivo.', codigoErro: 'SEFIN_REJEITADA', detalhes: '' }
  }
  const mensagens = erros.map((e) => {
    const t = traduzirCodigo(e.codigo, ctx)
    const base = t ?? ([e.descricao, e.complemento].filter(Boolean).join(' — ') || 'Rejeição sem descrição.')
    return e.codigo ? `${base} (código ${e.codigo})` : base
  })
  const unicas = [...new Set(mensagens)]
  return {
    erro: unicas.join(' | '),
    codigoErro: erros.find((e) => e.codigo)?.codigo ?? 'SEFIN_REJEITADA',
    detalhes: erros.map(formatarMensagem).join(' | '),
  }
}

const EXPLICA_HTTP: Record<number, string> = {
  400: 'requisição recusada pela Sefin (formato/parâmetro).',
  401: 'certificado A1 não aceito para esta operação.',
  403: 'acesso negado — certificado A1 recusado, ou o CNPJ do certificado não é ator da nota.',
  404: 'recurso não encontrado na Sefin.',
  429: 'muitas requisições — aguarde alguns minutos.',
  495: 'certificado A1 inválido.',
  496: 'certificado A1 não enviado.',
  500: 'erro interno da Sefin Nacional.',
  502: 'Sefin Nacional indisponível (gateway).',
  503: 'Sefin Nacional indisponível.',
  504: 'Sefin Nacional sem resposta (gateway).',
}

export function explicarStatusHttp(status: number): string {
  return `HTTP ${status}: ${EXPLICA_HTTP[status] ?? 'resposta inesperada da Sefin Nacional.'}`
}
