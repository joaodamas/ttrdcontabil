/**
 * Códigos da Sefin Nacional que mudam o FLUXO (não só a mensagem). Módulo leve:
 * importado por emitir.ts sem carregar o conector (node-forge/xml-crypto).
 */

/**
 * E0014 — "Conjunto de Série, Número, Código do Município Emissor e CNPJ/CPF
 * informado nesta DPS já existe em uma NFS-e gerada a partir de uma DPS enviada
 * anteriormente". A nota EXISTE: quem recebe consulta a DPS e a registra.
 * Fonte: regra da recepção (RN_RECEP), fora de regras-dps.json; texto conferido
 * em documentação de emissores — PREMISSA a confirmar na homologação.
 */
export const CODIGO_DPS_JA_EMITIDA = 'E0014'
