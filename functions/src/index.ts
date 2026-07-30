import * as admin from 'firebase-admin'
admin.initializeApp()

// ── NFS-e ──────────────────────────────────────────────────────────────────────
export {
  emitirNfse,
  uploadCertificado,
  validarCertificado,
  salvarCredenciaisFiscais,
} from './nfse/emitir'

export { emitirNfseLote } from './nfse/emitir-lote'
export { cancelarNfse, consultarNfse, retryNfse } from './nfse/ciclo'
export { gerarRascunhosNfseMensais, processarNfseRecorrenteDiaria } from './nfse/rascunhos'
// Provisionamento em massa na Spedy — DEFERIDO: exige o secret SPEDY_OWNER_API_KEY
// (rodar `firebase functions:secrets:set SPEDY_OWNER_API_KEY` antes) e o
// provisionamento está pausado. Reativar este export quando for provisionar em massa.
// export { provisionarEmpresasSpedy } from './nfse/provisionar-spedy'
export { emitirNfeProduto } from './nfse/emitir-produto'
export { enviarCertificadoSpedy } from './nfse/spedy-certificado'
export { gerarFechamentoMensal } from './fechamento'
export { recalcularDashboardKpis } from './dashboard'

// ── Backup ────────────────────────────────────────────────────────────────────
export { exportarFirestoreSemanal } from './backup'

// ── Schedulers ────────────────────────────────────────────────────────────────
export { criarCompetenciasMensais } from './scheduler/competencias'
export { criarLancamentosMensais  } from './scheduler/lancamentos'
export { enviarAlertasDiarios, alertasPrazoCritico, detectarInadimplencia } from './scheduler/alertas'
export { agendarCobrancasWhatsapp, processarFilaWhatsapp } from './whatsapp/scheduler'

// ── Triggers ──────────────────────────────────────────────────────────────────
export { propagarRazaoSocial } from './triggers/cliente-update'
export { onTarefaConcluida } from './triggers/tarefa-concluida'
export {
  eventoTarefaCriada,
  eventoTarefaAtualizada,
  eventoLancamentoCriado,
  eventoLancamentoAtualizado,
  eventoCompetenciaCriada,
  eventoNfseEmitidaCriada,
  eventoFiscalAtualizado,
} from './triggers/cliente-events'

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export {
  inicializarConfiguracaoWhatsapp,
  dispararCobrancaWhatsappAgora,
  pausarCobrancaWhatsappLancamento,
  retomarCobrancaWhatsappLancamento,
  reagendarCobrancaWhatsappLancamento,
  atualizarTemplateWhatsapp,
} from './whatsapp/callables'
export { webhookWhatsapp } from './whatsapp/webhook'
