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
// agendarCobrancasWhatsapp e processarFilaWhatsapp: ver o bloco WhatsApp abaixo.

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
// DEFERIDO — o módulo está pronto no repositório e fora da superfície de deploy.
//
// Estas 9 functions declaram TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN via
// defineSecret. Sem os segredos no Secret Manager o `firebase deploy` aborta
// ANTES de publicar qualquer coisa — e o CLI resolve os segredos na fase de
// análise do código, então nem `--only functions:<lista fiscal>` contorna:
// ou os segredos existem, ou nenhuma function sobe. Enquanto a conta Twilio não
// existir, comentar aqui é o que mantém o resto do deploy possível.
//
// PARA REATIVAR:
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
// e descomentar este bloco mais a linha de ./whatsapp/scheduler, na seção
// Schedulers acima. Nada mais precisa mudar.
//
// export {
//   inicializarConfiguracaoWhatsapp,
//   dispararCobrancaWhatsappAgora,
//   pausarCobrancaWhatsappLancamento,
//   retomarCobrancaWhatsappLancamento,
//   reagendarCobrancaWhatsappLancamento,
//   atualizarTemplateWhatsapp,
// } from './whatsapp/callables'
// export { webhookWhatsapp } from './whatsapp/webhook'
// export { agendarCobrancasWhatsapp, processarFilaWhatsapp } from './whatsapp/scheduler'
