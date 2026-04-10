"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JundiaiConector = void 0;
/**
 * Conector Jundiaí — GissOnline ABRASF 2.04
 * Migrou de GINFES para GissOnline em out/2024.
 * WebService: https://ws-jundiai.giss.com.br/service-ws/nf/nfse-ws
 */
const abrasf_base_1 = require("./abrasf-base");
class JundiaiConector extends abrasf_base_1.AbrasfConector {
    getConfig(homologacao) {
        return {
            endpoint: homologacao
                ? 'https://v2-ws-homologacao.giss.com.br/service-ws/nf/nfse-ws'
                : 'https://ws-jundiai.giss.com.br/service-ws/nf/nfse-ws',
            versao: '2.04',
            xmlns: 'http://www.abrasf.org.br/nfse.xsd',
            soapAction: 'http://www.abrasf.org.br/nfse.xsd/RecepcionarLoteRps',
        };
    }
}
exports.JundiaiConector = JundiaiConector;
//# sourceMappingURL=jundiai.js.map