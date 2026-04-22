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

// ── Backup ────────────────────────────────────────────────────────────────────
export { exportarFirestoreSemanal } from './backup'

// ── Schedulers ────────────────────────────────────────────────────────────────
export { criarCompetenciasMensais } from './scheduler/competencias'
export { criarLancamentosMensais  } from './scheduler/lancamentos'
export { enviarAlertasDiarios     } from './scheduler/alertas'

// ── Triggers ──────────────────────────────────────────────────────────────────
export { propagarRazaoSocial } from './triggers/cliente-update'
