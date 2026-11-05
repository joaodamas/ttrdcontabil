import * as XLSX from 'xlsx'
import { CAMPOS_CREDENCIAL, CLIENTE_COLUMNS } from '@/lib/clientes-import'
import { situacaoNacional } from '@/lib/nfse-nacional-convenio'
import { normalizarIbge } from '@/lib/ibge'

/**
 * Relatório da ficha completa de TODOS os clientes ativos: cada campo da ficha
 * (mesmas colunas da planilha de importação), o que está preenchido e o que está
 * em branco. Senha/credencial sai como "✔ preenchida", exceto quando um
 * administrador pede o relatório com senhas (incluirSenhas).
 */

type Registro = Record<string, unknown>

export interface DadosRelatorioClientes {
  clientes: Registro[]
  fiscais: Registro[]
  /** Só para administrador, com confirmação e log de auditoria (ver a tela de Clientes). */
  incluirSenhas?: boolean
}

const SENHA_PREENCHIDA = '✔ preenchida'

function texto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'object' && 'toDate' in (v as object)) {
    const d = (v as { toDate: () => Date }).toDate()
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  return String(v).trim()
}

function documento(v: unknown): string {
  const d = texto(v).replace(/\D/g, '')
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return texto(v)
}

function valorCampo(c: Registro, key: string, incluirSenhas = false): string {
  const v = texto(c[key])
  if (!v) return ''
  if (CAMPOS_CREDENCIAL.has(key) && !incluirSenhas) return SENHA_PREENCHIDA
  if (key === 'cpfCnpj') return documento(c[key])
  return v
}

const ativo = (c: Registro) => !c.deletedAt && (c.status ?? 'ativo') === 'ativo'

export function montarRelatorioClientes(dados: DadosRelatorioClientes) {
  const clientes = dados.clientes
    .filter(ativo)
    .sort((a, b) => texto(a.razaoSocial).localeCompare(texto(b.razaoSocial), 'pt-BR'))
  const total = CLIENTE_COLUMNS.length

  const cab = ['Código', ...CLIENTE_COLUMNS.map((c) => c.label), 'Preenchidos', '% completo', 'Campos em branco']
  const linhas = clientes.map((c) => {
    const valores = CLIENTE_COLUMNS.map((col) => valorCampo(c, col.key, dados.incluirSenhas))
    const emBranco = CLIENTE_COLUMNS.filter((_, i) => !valores[i]).map((col) => col.label)
    const preenchidos = total - emBranco.length
    return [
      texto(c.codigo),
      ...valores,
      `${preenchidos}/${total}`,
      String(Math.round((preenchidos / total) * 100)),
      emBranco.join('; '),
    ]
  })

  const resumoPorCampo = CLIENTE_COLUMNS.map((col) => {
    const preenchidos = clientes.filter((c) => valorCampo(c, col.key)).length
    return [col.label, String(preenchidos), String(clientes.length - preenchidos)]
  })

  const fiscalPorCliente = new Map(dados.fiscais.map((f) => [String(f.clienteId), f]))
  const fiscal = clientes.map((c) => {
    const f = fiscalPorCliente.get(String(c.id))
    if (!f) return [texto(c.razaoSocial), documento(c.cpfCnpj), 'Sem configuração fiscal', '', '', '', '', '', '']
    const ibge = normalizarIbge(texto(f.municipioIbge ?? f.codigoMunicipioIbge))
    const situacao = situacaoNacional(ibge)
    const cred = (f.credenciais ?? {}) as Registro
    const certificado = cred.certificadoStoragePath ? (cred.certValido === true ? 'Válido' : 'Enviado, inválido/vencido') : 'Não enviado'
    return [
      texto(c.razaoSocial),
      documento(c.cpfCnpj),
      texto(f.municipioEmissor) || texto(c.cidade),
      ibge,
      situacao === 'emissor' ? 'Sim' : situacao === 'prefeitura' ? 'Não (sistema da prefeitura)' : situacao === 'sem_convenio' ? 'Não (sem convênio)' : 'Desconhecido',
      texto(f.inscricaoMunicipal),
      texto(f.regimeTributario) || texto(c.regimeTributario),
      certificado,
      f.ambienteEmissao === 'producao' ? 'Produção' : f.ambienteEmissao === 'homologacao' ? 'Homologação' : '',
    ]
  })

  return {
    clientes: [cab, ...linhas],
    resumoPorCampo,
    fiscal,
  }
}

export function baixarRelatorioClientesXlsx(dados: DadosRelatorioClientes) {
  const r = montarRelatorioClientes(dados)
  const wb = XLSX.utils.book_new()

  const wsClientes = XLSX.utils.aoa_to_sheet(r.clientes)
  wsClientes['!cols'] = r.clientes[0].map((h, i) => ({ wch: i === r.clientes[0].length - 1 ? 80 : Math.max(14, Math.min(40, h.length)) }))
  wsClientes['!freeze'] = { xSplit: 3, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes ativos')

  const wsResumo = XLSX.utils.aoa_to_sheet([['Campo da ficha', 'Preenchidos', 'Em branco'], ...r.resumoPorCampo])
  wsResumo['!cols'] = [{ wch: 60 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por campo')

  const wsFiscal = XLSX.utils.aoa_to_sheet([
    ['Cliente', 'CPF/CNPJ', 'Município', 'IBGE', 'Emite pelo Ambiente Nacional', 'Inscrição municipal', 'Regime', 'Certificado A1', 'Ambiente'],
    ...r.fiscal,
  ])
  wsFiscal['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsFiscal, 'Fiscal NFS-e')

  const hoje = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `clientes-ativos-ficha-completa${dados.incluirSenhas ? '-COM-SENHAS' : ''}-${hoje}.xlsx`)
}
