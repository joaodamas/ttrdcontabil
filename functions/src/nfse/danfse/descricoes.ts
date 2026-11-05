/**
 * Descrições dos códigos do leiaute da NFS-e Nacional e formatações exigidas
 * pelo DANFSe (NT 008/2026 SE/CGNFS-e, item 2.4.5 — "Utilizar a descrição
 * destas opções"). Os textos vêm da documentação dos tipos simples do XSD
 * oficial (scripts/poc-nfse-nacional/schemas-producao/tiposSimples_v1.01.xsd),
 * exceto onde marcado como PREMISSA.
 */

export const URL_CONSULTA_PUBLICA = 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave='

/** Endereço do QR Code do DANFSe (NT 008/2026, item 2.4.3). */
export function urlConsultaPublica(chave: string): string {
  return `${URL_CONSULTA_PUBLICA}${chave}`
}

export const AMBIENTE_GERADOR: Record<string, string> = {
  '1': 'Prefeitura',
  '2': 'Sistema Nacional da NFS-e',
}

export const TIPO_AMBIENTE: Record<string, string> = {
  '1': 'Produção',
  '2': 'Homologação',
}

export const EMITENTE_DPS: Record<string, string> = {
  '1': 'Prestador',
  '2': 'Tomador',
  '3': 'Intermediário',
}

/**
 * cStat da NFS-e. O XSD só tipa como TStat (sem enumeração documentada).
 * PREMISSA: descrições do Manual de Contribuintes do Sistema Nacional — 100
 * é o único confirmado pelos XMLs reais; a NT 008 cita "NFS-e de Decisão
 * Judicial ou Administ..." como exemplo de truncamento.
 */
export const SITUACAO_NFSE: Record<string, string> = {
  '100': 'NFS-e Gerada',
  '101': 'NFS-e de Substituição Gerada',
  '102': 'NFS-e de Decisão Judicial ou Administrativa',
  '103': 'NFS-e Avulsa',
}

export const FINALIDADE_NFSE: Record<string, string> = {
  '0': 'NFS-e regular',
}

export const OPCAO_SIMPLES: Record<string, string> = {
  '1': 'Não Optante',
  '2': 'Optante - Microempreendedor Individual (MEI)',
  '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
}

export const REGIME_APURACAO_SN: Record<string, string> = {
  '1': 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional',
  '2': 'Regime de apuração dos tributos federais pelo SN e ISSQN por fora do SN conforme respectiva legislação municipal do tributo',
  '3': 'Regime de apuração dos tributos federais e municipal por fora do SN conforme respectivas legislações federal e municipal de cada tributo',
}

export const REGIME_ESPECIAL: Record<string, string> = {
  '0': 'Nenhum',
  '1': 'Ato Cooperado (Cooperativa)',
  '2': 'Estimativa',
  '3': 'Microempresa Municipal',
  '4': 'Notário ou Registrador',
  '5': 'Profissional Autônomo',
  '6': 'Sociedade de Profissionais',
  '9': 'Outros',
}

export const TRIBUTACAO_ISSQN: Record<string, string> = {
  '1': 'Operação Tributável',
  '2': 'Imunidade',
  '3': 'Exportação de Serviço',
  '4': 'Não Incidência',
}

export const RETENCAO_ISSQN: Record<string, string> = {
  '1': 'Não Retido',
  '2': 'Retido pelo Tomador',
  '3': 'Retido pelo Intermediário',
}

export const TIPO_IMUNIDADE: Record<string, string> = {
  '0': 'Imunidade (tipo não informado na nota de origem)',
  '1': 'Patrimônio, renda ou serviços, uns dos outros',
  '2': 'Templos de qualquer culto',
  '3': 'Patrimônio, renda ou serviços dos partidos políticos, sindicatos, educação e assistência social',
  '4': 'Livros, jornais, periódicos e o papel destinado a sua impressão',
  '5': 'Fonogramas e videofonogramas musicais produzidos no Brasil',
}

export const SUSPENSAO_EXIGIBILIDADE: Record<string, string> = {
  '1': 'Exigibilidade Suspensa por Decisão Judicial',
  '2': 'Exigibilidade Suspensa por Processo Administrativo',
}

export const BENEFICIO_MUNICIPAL: Record<string, string> = {
  '1': 'Isenção',
  '2': 'Redução da BC em %',
  '3': 'Redução da BC em R$',
  '4': 'Alíquota Diferenciada',
}

export const RETENCAO_PIS_COFINS: Record<string, string> = {
  '0': 'PIS/COFINS/CSLL Não Retidos',
  '1': 'PIS/COFINS Retidos',
  '2': 'PIS/COFINS Não Retidos',
  '3': 'PIS/COFINS/CSLL Retidos',
  '4': 'PIS/COFINS Retidos, CSLL Não Retido',
  '5': 'PIS Retido, COFINS/CSLL Não Retido',
  '6': 'COFINS Retido, PIS/CSLL Não Retido',
  '7': 'PIS Não Retido, COFINS/CSLL Retidos',
  '8': 'PIS/COFINS Não Retidos, CSLL Retido',
  '9': 'COFINS Não Retido, PIS/CSLL Retidos',
}

/** Primeiros 2 dígitos do código IBGE do município → sigla da UF. */
export const UF_POR_CODIGO_IBGE: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

export function ufDoIbge(cMun: string | undefined): string | undefined {
  if (!cMun || cMun.length < 2) return undefined
  return UF_POR_CODIGO_IBGE[cMun.slice(0, 2)]
}

/** "Descrição (código)" — ou o próprio código quando não há descrição conhecida. */
export function descrever(mapa: Record<string, string>, codigo: string | undefined): string | undefined {
  if (codigo === undefined || codigo === '') return undefined
  return mapa[codigo] ?? codigo
}

// ─── Formatações ─────────────────────────────────────────────────────────────

const so = (v: string) => v.replace(/\D/g, '')

export function formatarCnpjCpf(doc: string | undefined): string | undefined {
  if (!doc) return undefined
  const d = so(doc)
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return doc
}

/** CEP do leiaute pode vir sem o zero à esquerda (ex.: 5201200). */
export function formatarCep(cep: string | undefined): string | undefined {
  if (!cep) return undefined
  const d = so(cep).padStart(8, '0')
  if (d.length !== 8) return cep
  return `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}`
}

/** "AAAA-MM-DD" → "DD/MM/AAAA". */
export function formatarData(data: string | undefined): string | undefined {
  if (!data) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data
}

/**
 * "AAAA-MM-DDThh:mm:ss-03:00" → "DD/MM/AAAA hh:mm:ss", no fuso informado no
 * próprio XML (sem converter — é o horário que o documento declara).
 */
export function formatarDataHora(dh: string | undefined): string | undefined {
  if (!dh) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(dh)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : dh
}

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** "1234.5" → "1.234,50" (decimal do XML sempre com ponto). */
export function formatarDecimal(valor: string | undefined, casas = 2): string | undefined {
  if (valor === undefined || valor === '') return undefined
  const n = Number(valor)
  if (!Number.isFinite(n)) return valor
  const [int, dec] = Math.abs(n).toFixed(casas).split('.')
  return `${n < 0 ? '-' : ''}${agruparMilhar(int)}${dec ? `,${dec}` : ''}`
}

export function formatarMoeda(valor: string | undefined): string | undefined {
  const v = formatarDecimal(valor)
  return v === undefined ? undefined : `R$ ${v}`
}

export function formatarPercentual(valor: string | undefined): string | undefined {
  const v = formatarDecimal(valor)
  return v === undefined ? undefined : `${v}%`
}

/** cTribNac "010101" → "01.01.01". */
export function formatarCodTribNac(c: string | undefined): string | undefined {
  if (!c) return undefined
  return /^\d{6}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4)}` : c
}

/** cNBS "123456789" → "1.2345.67.89". */
export function formatarNbs(c: string | undefined): string | undefined {
  if (!c) return undefined
  return /^\d{9}$/.test(c) ? `${c[0]}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7)}` : c
}

export function somarDecimais(...valores: Array<string | undefined>): string | undefined {
  const presentes = valores.filter((v): v is string => v !== undefined && v !== '' && Number.isFinite(Number(v)))
  if (presentes.length === 0) return undefined
  const centavos = presentes.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0)
  return (centavos / 100).toFixed(2)
}
