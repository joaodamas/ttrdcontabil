import mapa from './nfse-nacional-convenios.json'
import { normalizarIbge } from './ibge'

/**
 * Situação do município no Sistema Nacional NFS-e (PRODUÇÃO), consultada em
 * todos os 5.571 municípios — ver docs/nfse-nacional-convenios-*.csv e
 * scripts/atualizar-convenios-nfse.mjs para atualizar.
 *  - emissor: emite pelo Emissor Nacional (API pública da Sefin)
 *  - prefeitura: só compartilha dados; a emissão é no sistema da prefeitura
 *  - sem_convenio: sem convênio com o Sistema Nacional
 *  - desconhecido: código fora do mapa
 *
 * É um retrato para avisar cedo na tela; a palavra final é a consulta ao vivo
 * que o NacionalConector faz antes de cada emissão.
 */
export type SituacaoNacional = 'emissor' | 'prefeitura' | 'sem_convenio' | 'desconhecido'

const CODIGOS = (mapa as { municipios: Record<string, string> }).municipios
export const CONVENIOS_CONSULTADOS_EM = (mapa as { consultadoEm: string }).consultadoEm

export function situacaoNacional(ibge: string | null | undefined): SituacaoNacional {
  const c = CODIGOS[normalizarIbge(ibge)]
  return c === 'E' ? 'emissor' : c === 'A' ? 'prefeitura' : c === 'S' ? 'sem_convenio' : 'desconhecido'
}
