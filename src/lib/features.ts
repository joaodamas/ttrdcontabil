/**
 * Chaves de módulo (liga/desliga em tempo de build). Diferente das feature
 * flags de UI (contexts/feature-flags-context), que são preferências visuais:
 * aqui ficam módulos cujo BACKEND está desligado — mostrar a tela só levaria o
 * usuário a um erro.
 */

/**
 * Cobrança por WhatsApp (régua, envio manual, templates Twilio). Desligada: os
 * callables (`dispararCobrancaWhatsappAgora`, `pausar/retomar/reagendar…`,
 * `atualizarTemplateWhatsapp`) não estão publicados. O código do módulo
 * (src/features/whatsapp, functions/src/whatsapp) fica guardado para quando o
 * dono decidir religar — basta trocar para `true` e publicar as functions.
 */
export const WHATSAPP_HABILITADO = false
