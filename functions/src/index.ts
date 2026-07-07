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
} from './whatsapp/callables'
export { webhookWhatsapp } from './whatsapp/webhook'
