/**
 * Retenção dos registros de histórico (TTL do Firestore).
 *
 * Cada escritor grava `expiraEm` (Timestamp) = criação + retenção da coleção;
 * a política de TTL do Firestore apaga o documento depois dessa data (em até
 * ~24 h). Documento sem o campo nunca expira. A política só vale depois de
 * ativada no projeto — comando em docs/LGPD-TRATAMENTO.md ("Retenção").
 *
 * Fonte única, importada pelas functions e pelo navegador (mesmo padrão de
 * usuarios/perfis.ts). Módulo puro, sem firebase.
 *
 * Prazos (2026-11-06; **exige decisão do dono/advogado**, ver LGPD-TRATAMENTO):
 * - logs_auditoria: 6 anos. A trilha é prova de quem mexeu em cadastro, NFS-e,
 *   certificado e senha de portal; o prazo decadencial do CTN (art. 173, I)
 *   são 5 anos contados do 1º dia do exercício SEGUINTE ao fato — até ~6 anos
 *   do registro. Menos que isso perde a prova enquanto o fisco ainda pode
 *   lançar; mais que isso guarda IP/navegador da equipe sem finalidade (LGPD
 *   art. 15/16).
 * - events (linha do tempo do cliente, cópia resumida do que está nos
 *   registros de origem): 2 anos — é conveniência de tela, não guarda legal.
 * - nfse_eventos (histórico da nota: emissão, cancelamento, consulta): 6 anos,
 *   o mesmo raciocínio dos logs. Gravado em functions/src/nfse/ciclo.ts — fora
 *   deste PR; enquanto o escritor não gravar `expiraEm`, nada expira ali.
 *
 * Mudar um prazo: altere aqui; para ENCURTAR, ajuste também o mínimo aceito
 * do navegador em firestore.rules (expiraEmValido). Encurtar não apaga nada
 * já gravado (o `expiraEm` antigo continua valendo) — seria preciso um script.
 */

const DIA_MS = 24 * 60 * 60 * 1000

export const RETENCAO_DIAS = {
  logs_auditoria: 6 * 365 + 2,
  events: 2 * 365 + 1,
  nfse_eventos: 6 * 365 + 2,
} as const

export type ColecaoComRetencao = keyof typeof RETENCAO_DIAS

/** Nome do campo da política de TTL (o mesmo nas três coleções). */
export const CAMPO_EXPIRACAO = 'expiraEm'

/** Data em que um registro criado em `agora` deve expirar. */
export function dataDeExpiracao(colecao: ColecaoComRetencao, agora: Date = new Date()): Date {
  return new Date(agora.getTime() + RETENCAO_DIAS[colecao] * DIA_MS)
}
