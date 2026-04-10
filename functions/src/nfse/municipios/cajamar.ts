/**
 * Conector Cajamar — GeisWeb (ABRASF proprietário)
 * Portal: https://geisweb.com.br/cajamar/nfse/php/login.php
 * Autenticação: Certificado A1
 */
import { AbrasfConector, AbrasfConfig } from './abrasf-base'

export class CajamarConector extends AbrasfConector {
  protected getConfig(homologacao: boolean): AbrasfConfig {
    // GeisWeb usa o mesmo endpoint para prod/homologação, diferencia por parâmetro interno
    return {
      endpoint:   'https://geisweb.com.br/cajamar/nfse/ws/nfse.php',
      versao:     '2.02',
      xmlns:      'http://www.ginfes.com.br/tipos_v03.xsd',
      soapAction: homologacao
        ? 'http://www.ginfes.com.br/IServicoNFSe/RecepcionarLoteRpsTeste'
        : 'http://www.ginfes.com.br/IServicoNFSe/RecepcionarLoteRps',
    }
  }
}
