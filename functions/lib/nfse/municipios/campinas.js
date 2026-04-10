"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampinasConector = void 0;
/**
 * Conector Campinas — Sistema IMA (ABRASF 2.03)
 * Migrou do sistema legado para ABRASF 2.03 em março/2025.
 * WebService: https://novanfse.campinas.sp.gov.br/
 */
const abrasf_base_1 = require("./abrasf-base");
class CampinasConector extends abrasf_base_1.AbrasfConector {
    getConfig(homologacao) {
        return {
            endpoint: homologacao
                ? 'https://homol-rps.ima.sp.gov.br/notafiscal-abrasfv203-ws/NotaFiscalSoap'
                : 'https://novanfse.campinas.sp.gov.br/notafiscal-abrasfv203-ws/NotaFiscalSoap',
            versao: '2.03',
            xmlns: 'http://www.abrasf.org.br/nfse.xsd',
            soapAction: 'RecepcionarLoteRps',
        };
    }
}
exports.CampinasConector = CampinasConector;
//# sourceMappingURL=campinas.js.map