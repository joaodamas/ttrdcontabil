"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rotearEmissao = rotearEmissao;
const jundiai_1 = require("./jundiai");
const campinas_1 = require("./campinas");
const cajamar_1 = require("./cajamar");
const sao_paulo_1 = require("./sao-paulo");
const santana_parnaiba_1 = require("./santana-parnaiba");
const taboao_serra_1 = require("./taboao-serra");
const cotia_1 = require("./cotia");
const barueri_1 = require("./barueri");
// Municípios que exigem certificado A1
const IBGE_A1 = new Set(['3525904', '3509502', '3508900', '3550308', '3505708']);
async function rotearEmissao(input, config, prestador, cert) {
    const ibge = prestador.municipioIbge;
    // Valida certificado A1 para municípios que exigem
    if (IBGE_A1.has(ibge) && !cert) {
        return { sucesso: false, erro: 'Certificado A1 não encontrado. Faça o upload nas configurações fiscais do cliente.' };
    }
    switch (ibge) {
        // ── ABRASF ──────────────────────────────────────────────────────
        case '3525904': // Jundiaí
            return new jundiai_1.JundiaiConector().emitir(input, config, cert, prestador);
        case '3509502': // Campinas
            return new campinas_1.CampinasConector().emitir(input, config, cert, prestador);
        case '3508900': // Cajamar
            return new cajamar_1.CajamarConector().emitir(input, config, cert, prestador);
        // ── Proprietários com A1 ─────────────────────────────────────────
        case '3550308': // São Paulo
            return new sao_paulo_1.SaoPauloConector().emitir(input, config, cert, prestador);
        case '3505708': // Barueri
            return new barueri_1.BarueriConector().emitir(input, config, cert, prestador);
        // ── Token / REST ─────────────────────────────────────────────────
        case '3547304': // Santana de Parnaíba
            return new santana_parnaiba_1.SantanaParnaibhaConector().emitir(input, config, prestador);
        case '3552502': // Taboão da Serra
            return new taboao_serra_1.TaboaoSerraConector().emitir(input, config, prestador);
        case '3513009': // Cotia
            return new cotia_1.CotiaConector().emitir(input, config, prestador);
        default:
            return {
                sucesso: false,
                erro: `Município com código IBGE ${ibge} ainda não integrado. Entre em contato com o suporte.`,
            };
    }
}
//# sourceMappingURL=router.js.map