/**
 * Nome denormalizado (clienteNome, responsavelNome) a gravar ao salvar um form.
 *
 * As listas dos selects trazem só clientes ativos / os 100 primeiros usuários.
 * Editar um registro de cliente inativo não achava o nome e gravava null,
 * apagando-o. Se o id não mudou, o nome já gravado continua valendo.
 */
export function nomePreservado(
  idAtual: string | null | undefined,
  nomeEncontrado: string | null | undefined,
  anterior?: { id?: string | null; nome?: string | null },
): string | null {
  if (!idAtual) return null
  if (nomeEncontrado) return nomeEncontrado
  return anterior?.id === idAtual ? anterior.nome ?? null : null
}
