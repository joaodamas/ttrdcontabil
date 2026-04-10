"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CajamarConector = void 0;
/**
 * Conector Cajamar — GeisWeb (ABRASF proprietário)
 * Portal: https://geisweb.com.br/cajamar/nfse/php/login.php
 * Autenticação: Certificado A1
 */
const abrasf_base_1 = require("./abrasf-base");
class CajamarConector extends abrasf_base_1.AbrasfConector {
    getConfig(homologacao) {
        // GeisWeb usa o mesmo endpoint para prod/homologação, diferencia por parâmetro interno
        return {
            endpoint: 'https://geisweb.com.br/cajamar/nfse/ws/nfse.php',
            versao: '2.02',
            xmlns: 'http://www.ginfes.com.br/tipos_v03.xsd',
            soapAction: homologacao
                ? 'http://www.ginfes.com.br/IServicoNFSe/RecepcionarLoteRpsTeste'
                : 'http://www.ginfes.com.br/IServicoNFSe/RecepcionarLoteRps',
        };
    }
}
exports.CajamarConector = CajamarConector;
//# sourceMappingURL=cajamar.js.map