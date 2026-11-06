import { initializeApp } from 'firebase-admin/app'
initializeApp()

// ── NFS-e ──────────────────────────────────────────────────────────────────────
export {
  emitirNfse,
  uploadCertificado,
  validarCertificado,
  definirNumeracaoDps,
} from './nfse/emitir'
// salvarCredenciaisFiscais (token/senha dos portais Simpliss, Conam e GIAP)
// saiu em 2026-11-06 com os conectores municipais: emissão só pelo Ambiente
// Nacional, cuja única credencial é o certificado A1 (uploadCertificado).

export { emitirNfseLote } from './nfse/emitir-lote'
export { cancelarNfse, consultarNfse, retryNfse } from './nfse/ciclo'
export { gerarDanfse, obterUrlDanfse } from './nfse/danfse/callable'
export { gerarRascunhosNfseMensais, processarNfseRecorrenteDiaria } from './nfse/rascunhos'
// Spedy (conta encerrada em 2026-09) e NF-e de produto, que só existia por ela,
// saíram do código em 2026-11-05: a emissão é direta pelo Ambiente Nacional,
// sem integrador (os conectores de prefeitura saíram em 2026-11-06). Ver docs/RADAR-NFSE-NACIONAL-2026-11-05.md.
export { gerarFechamentoMensal } from './fechamento'
export { recalcularDashboardKpis, recalcularDashboardKpisAgendado } from './dashboard'

// ── Usuários ──────────────────────────────────────────────────────────────────
// Criação/alteração/exclusão de usuários só pelo servidor (ver usuarios/callables.ts).
export {
  criarUsuario,
  atualizarUsuario,
  redefinirSenhaUsuario,
  excluirUsuario,
} from './usuarios/callables'
export { sincronizarDiretorioUsuario } from './usuarios/diretorio'

// ── Senhas de portal dos clientes (cifradas, só pelo servidor) ─────────────────
export {
  lerCredenciaisCliente,
  salvarCredenciaisCliente,
  exportarCredenciaisClientes,
} from './clientes/credenciais-callables'

// ── Auditoria no servidor e descarte LGPD ─────────────────────────────────────
export {
  auditarClientes,
  auditarClientesFiscal,
  auditarClientesCredenciais,
  auditarLancamentos,
  auditarUsuarios,
} from './auditoria/triggers'
export { descartarDadosClienteExcluido } from './clientes/descarte'

// ── Backup ────────────────────────────────────────────────────────────────────
export { exportarFirestoreSemanal } from './backup'

// ── Schedulers ────────────────────────────────────────────────────────────────
export { criarCompetenciasMensais } from './scheduler/competencias'
export { criarLancamentosMensais  } from './scheduler/lancamentos'
export { enviarAlertasDiarios, alertasPrazoCritico, detectarInadimplencia } from './scheduler/alertas'
export { reconciliarNfsePendentes } from './scheduler/nfse-reconciliacao'

// ── Triggers ──────────────────────────────────────────────────────────────────
export { propagarRazaoSocial } from './triggers/cliente-update'
export { sincronizarCredenciaisPreenchidas } from './clientes/credenciais-trigger'
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
