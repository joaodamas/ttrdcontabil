/**
 * Regras de recorrência do faturamento — lógica pura, sem Firestore.
 *
 * Vive separada de lancamentos.ts para poder ser testada: aquele arquivo importa
 * firebase-admin no topo e não sobe num teste de unidade. É a única lógica do
 * gerador que decide SE uma cobrança nasce, então é a que mais merece teste.
 *
 * O tipo de data é estrutural (`{ toDate(): Date }`) em vez de Timestamp do
 * firebase-admin, justamente para este módulo não arrastar o SDK.
 */

export type FrequenciaContrato = 'mensal' | 'avulso' | 'anual' | 'trimestral'

type DataFirestore = { toDate(): Date }

export type ContratoRecorrente = {
  frequencia?: string
  dataInicio?: DataFirestore
  dataFim?: DataFirestore
}

/**
 * Só contrato recorrente vira cobrança automática.
 *
 * A frequência mora no catálogo (`servicos.frequencia`) e passou a ser copiada
 * para o contrato no formulário — o gerador lê `clientes_servicos`, nunca o
 * catálogo. Antes o único filtro era `status === 'ativo'`, então um contrato de
 * IRPF (anual) ou de abertura de empresa (avulso) gerava honorário TODO MÊS.
 *
 * Contrato gravado antes desta correção não tem o campo: tratamos como 'mensal',
 * que é exatamente o que já acontecia. A mudança não altera cobrança existente —
 * só para de criar as que nunca deveriam ter nascido.
 */
export function deveFaturarNoMes(contrato: ContratoRecorrente, mes: number): boolean {
  const frequencia = (contrato.frequencia ?? 'mensal') as FrequenciaContrato

  if (frequencia === 'mensal') return true
  if (frequencia === 'avulso') return false // cobrado uma vez, na mão
  if (frequencia === 'trimestral') return mes % 3 === 1 // jan, abr, jul, out

  if (frequencia === 'anual') {
    // Fatura no mês de aniversário do contrato; sem dataInicio, em janeiro.
    const inicio = contrato.dataInicio?.toDate()
    return (inicio ? inicio.getMonth() + 1 : 1) === mes
  }

  // Frequência desconhecida: fatura. Deixar de cobrar em silêncio por causa de
  // um valor novo no catálogo seria pior que cobrar a mais — a mais alguém vê.
  return true
}

/**
 * Respeita a vigência do contrato. `dataInicio` e `dataFim` eram coletadas no
 * formulário e nunca lidas pelo gerador — e como nada vira o `status` ao chegar
 * a `dataFim`, contrato encerrado seguia faturando indefinidamente.
 *
 * A comparação é por MÊS, não por dia: o que importa é se a competência do mês
 * cai dentro da vigência, não o dia do vencimento. Contrato que termina no meio
 * do mês ainda gera a cobrança daquele mês — o serviço foi prestado.
 */
export function vigenteNoMes(contrato: ContratoRecorrente, ano: number, mes: number): boolean {
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0, 23, 59, 59)

  const inicio = contrato.dataInicio?.toDate()
  if (inicio && inicio > ultimoDia) return false

  const fim = contrato.dataFim?.toDate()
  if (fim && fim < primeiroDia) return false

  return true
}
