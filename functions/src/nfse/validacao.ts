import type { ConfigFiscalCliente, EmitirNfseInput, Prestador } from './types'

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function isCpf(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i)
  let digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  if (digit !== Number(cpf[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i)
  digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  return digit === Number(cpf[10])
}

function isCnpj(value: string) {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false

  const calc = (base: string, factors: number[]) => {
    const sum = factors.reduce((acc, factor, index) => acc + Number(base[index]) * factor, 0)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const d1 = calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13])
}

function isCpfCnpj(value: unknown) {
  const digits = onlyDigits(value)
  return digits.length === 11 ? isCpf(digits) : digits.length === 14 ? isCnpj(digits) : false
}

function hasText(value: unknown, min = 1, max = 500) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
}

function isIbge(value: unknown) {
  return /^\d{7}$/.test(onlyDigits(value))
}

export function validarPayloadFiscal(
  input: EmitirNfseInput,
  config: ConfigFiscalCliente,
  prestador: Prestador
): string[] {
  const erros: string[] = []
  const tomador = input.tomador
  const servico = input.servico
  const aliquota = servico?.aliquota ?? config.aliquotaPadrao

  if (!input.clienteId) erros.push('clienteId obrigatório.')
  if (!tomador) erros.push('Dados do tomador obrigatórios.')
  if (!servico) erros.push('Dados do serviço obrigatórios.')

  if (!isCpfCnpj(prestador.cnpj)) erros.push('CNPJ do prestador inválido.')
  if (!hasText(prestador.razaoSocial, 2, 200)) erros.push('Razão social do prestador inválida.')
  if (!hasText(prestador.inscricaoMunicipal, 2, 30)) erros.push('Inscrição municipal do prestador inválida.')
  if (!isIbge(prestador.municipioIbge)) erros.push('Município IBGE do prestador inválido.')

  if (tomador) {
    if (!isCpfCnpj(tomador.cpfCnpj)) erros.push('CPF/CNPJ do tomador inválido.')
    if (!hasText(tomador.razaoSocial, 2, 200)) erros.push('Razão social do tomador inválida.')
    if (tomador.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tomador.email)) {
      erros.push('E-mail do tomador inválido.')
    }
    if (tomador.endereco?.cep && onlyDigits(tomador.endereco.cep).length !== 8) {
      erros.push('CEP do tomador inválido.')
    }
    if (tomador.endereco?.municipioIbge && !isIbge(tomador.endereco.municipioIbge)) {
      erros.push('Município IBGE do tomador inválido.')
    }
  }

  if (servico) {
    if (!hasText(servico.discriminacao, 5, 2000)) erros.push('Discriminação do serviço deve ter entre 5 e 2000 caracteres.')
    if (!hasText(servico.codigoServico ?? config.codigoServicoPadrao, 1, 40)) erros.push('Código de serviço obrigatório.')
    if (!hasText(servico.itemListaServico ?? config.itemListaServico, 1, 20)) erros.push('Item da lista de serviço obrigatório.')
    if (!Number.isFinite(servico.valorServico) || servico.valorServico <= 0) erros.push('Valor do serviço deve ser positivo.')
    if (servico.valorDeducoes != null && servico.valorDeducoes < 0) erros.push('Valor de deduções não pode ser negativo.')
    if (servico.valorDeducoes != null && servico.valorDeducoes > servico.valorServico) {
      erros.push('Valor de deduções não pode ser maior que o valor do serviço.')
    }
    if (aliquota == null || !Number.isFinite(aliquota) || aliquota < 0 || aliquota > 10) {
      erros.push('Alíquota fiscal inválida.')
    }
    if (typeof servico.issRetido !== 'boolean') erros.push('ISS retido deve ser informado como verdadeiro ou falso.')
  }

  if (!['homologacao', 'producao'].includes(config.ambienteEmissao)) erros.push('Ambiente fiscal inválido.')

  return erros
}
