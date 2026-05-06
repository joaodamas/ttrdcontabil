/**
 * Conector Campinas — Sistema IMA (ABRASF 2.03)
 * Migrou do sistema legado para ABRASF 2.03 em março/2025.
 * WebService: https://novanfse.campinas.sp.gov.br/
 */
import { AbrasfConector, AbrasfConfig } from './abrasf-base'

export class CampinasConector extends AbrasfConector {
  protected getConfig(homologacao: boolean): AbrasfConfig {
    return {
      endpoint: homologacao
        ? 'https://homol-rps.ima.sp.gov.br/notafiscal-abrasfv203-ws/NotaFiscalSoap'
        : 'https://novanfse.campinas.sp.gov.br/notafiscal-abrasfv203-ws/NotaFiscalSoap',
      versao:     '2.03',
      xmlns:      'http://www.abrasf.org.br/nfse.xsd',
      soapAction: '',
    }
  }
}
