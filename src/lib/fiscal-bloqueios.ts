/**
 * Mensagens de bloqueio da prontidão fiscal (tela /fiscal → "Prontidão").
 * Curtas, acentuadas e acionáveis — o usuário vê exatamente estes textos.
 */
export const BLOQUEIO_FISCAL = {
  semServicoAtivo: 'Nenhum serviço ativo',
  diaEmissaoAusente: 'Falta dia de emissão da NFS-e',
  semConfiguracaoFiscal: 'Sem configuração fiscal',
  municipioAusente: 'Falta município emissor',
  inscricaoMunicipalAusente: 'Falta inscrição municipal',
  regimeAusente: 'Falta regime tributário',
  codigoServicoAusente: 'Falta código de serviço padrão',
  itemListaAusente: 'Falta item da lista de serviço',
  descricaoAusente: 'Falta descrição padrão da NFS-e',
  aliquotaAusente: 'Falta alíquota padrão',
  certificadoA1: 'Falta certificado A1 válido',
  tokenSimpliss: 'Falta token Simpliss',
  usuarioConam: 'Falta usuário Conam',
  contribuinteConam: 'Falta código de contribuinte Conam',
  loginGiap: 'Falta login GIAP',
  senhaGiap: 'Falta senha GIAP',
  producaoNaoLiberada: 'Município não liberado para produção',
  provedorDescontinuado: 'Configurado com a Spedy (descontinuada) — salve a configuração fiscal',
} as const

/**
 * Texto compacto para a célula da tabela: até `max` bloqueios separados por
 * " · " e "+N" para o restante (a lista completa vai no `title`).
 */
export function resumirBloqueios(bloqueios: readonly string[], max = 3): string {
  if (bloqueios.length === 0) return 'Sem bloqueios'
  const visiveis = bloqueios.slice(0, max).join(' · ')
  const resto = bloqueios.length - max
  return resto > 0 ? `${visiveis} · +${resto}` : visiveis
}
