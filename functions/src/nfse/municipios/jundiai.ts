/**
 * Conector Jundiaí — GissOnline ABRASF 2.04
 * Migrou de GINFES para GissOnline em out/2024.
 * WebService: https://ws-jundiai.giss.com.br/service-ws/nf/nfse-ws
 */
import { AbrasfConector, AbrasfConfig } from './abrasf-base'

export class JundiaiConector extends AbrasfConector {
  protected getConfig(homologacao: boolean): AbrasfConfig {
    return {
      endpoint: homologacao
        ? 'https://v2-ws-homologacao.giss.com.br/service-ws/nf/nfse-ws'
        : 'https://ws-jundiai.giss.com.br/service-ws/nf/nfse-ws',
      versao:     '2.04',
      xmlns:      'http://www.abrasf.org.br/nfse.xsd',
      soapAction: 'http://www.abrasf.org.br/nfse.xsd/RecepcionarLoteRps',
    }
  }
}
