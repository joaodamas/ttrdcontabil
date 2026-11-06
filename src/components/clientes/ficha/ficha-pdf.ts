import { toast } from 'sonner'

import { formatCpfCnpj } from '@/lib/utils'
import { getStatusLabel } from '@/lib/status-semantics'
import { CAMPOS_CREDENCIAL_LISTA, credenciaisPreenchidasDe } from '@/lib/clientes-credenciais'
import { carregarCredenciaisCliente } from '@/features/clientes/credenciais'

/* Ficha cadastral para impressão (PDF pelo navegador) — movida da página do
   cliente para servir ao painel e à página (mesma ficha, mesmas ações). */

const REGIME_LABELS: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
  isento:           'Isento',
}

const EMPRESA_GERAL_FIELDS = [
  ['razaoSocial', 'Razão Social'],
  ['nomeFantasia', 'Nome Fantasia'],
  ['cpfCnpj', 'CNPJ / CPF'],
  ['email', 'E-mail'],
  ['telefone', 'Telefone'],
  ['celular', 'Celular'],
  ['regimeTributario', 'Regime Tributário'],
  ['status', 'Status'],
] as const

const EMPRESA_ENDERECO_FIELDS = [
  ['logradouro', 'Endereço'],
  ['numero', 'Número'],
  ['complemento', 'Complemento'],
  ['bairro', 'Bairro'],
  ['cidade', 'Cidade'],
  ['uf', 'Estado'],
  ['cep', 'CEP'],
] as const

const EMPRESA_CADASTRO_FIELDS = [
  ['inscricaoEstadual', 'Inscrição Estadual'],
  ['inscricaoMunicipal', 'Inscrição Municipal'],
  ['nire', 'NIRE'],
  ['capitalSocial', 'Capital social'],
  ['porteEmpresa', 'Porte'],
  ['cadastroImovelIptu', 'Cadastro IPTU'],
  ['cnaePrincipal', 'CNAE principal'],
  ['cnaeSecundario', 'CNAE secundário'],
  ['codSimplesNacional', 'Cód. Simples Nacional'],
  ['mensalidade', 'Mensalidade'],
  ['vencimento', 'Vencimento'],
] as const

const EMPRESA_CREDENCIAIS_FIELDS = [
  ['loginPrefeitura', 'Login Prefeitura'],
  ['senhaWebPrefeitura', 'Senha WEB Prefeitura'],
  ['senhaPinCertificadoDigitalECnpj', 'Senha PIN e-CNPJ'],
  ['loginPostoFiscal', 'Login posto fiscal'],
  ['senhaPostoFiscal', 'Senha posto fiscal'],
] as const

const REPRESENTANTE_FIELDS = [
  ['responsavelNome', 'Nome'],
  ['responsavelEmail', 'E-mail'],
  ['responsavelTelefone', 'Telefone'],
  ['responsavelCelular', 'Celular'],
  ['responsavelCpf', 'CPF'],
  ['responsavelCnh', 'CNH'],
  ['responsavelDataEmissao', 'Data de emissão'],
  ['responsavelRg', 'RG'],
  ['responsavelDataNascimento', 'Data de nascimento'],
  ['responsavelOrgaoEmissor', 'Órgão emissor'],
  ['responsavelLocalNascimento', 'Local de nascimento'],
  ['responsavelNomePai', 'Nome do pai'],
  ['responsavelNomeMae', 'Nome da mãe'],
  ['responsavelPis', 'PIS'],
  ['responsavelEstadoCivil', 'Estado civil'],
  ['responsavelComunhaoBens', 'Comunhão de bens'],
  ['responsavelEscolaridade', 'Escolaridade'],
  ['responsavelFormacaoSuperior', 'Formação superior'],
  ['responsavelTituloEleitor', 'Título de eleitor'],
] as const

const REPRESENTANTE_ENDERECO_FIELDS = [
  ['responsavelEndereco', 'Endereço'],
  ['responsavelNumero', 'Número'],
  ['responsavelComplemento', 'Complemento'],
  ['responsavelBairro', 'Bairro'],
  ['responsavelCep', 'CEP'],
] as const

const REPRESENTANTE_CREDENCIAIS_FIELDS = [
  ['responsavelSenhaMeuGov', 'Senha MEU GOV'],
  ['responsavelSenhaEcacPf', 'Senha e-CAC PF'],
  ['responsavelSenhaWebPrefeitura', 'Senha WEB Prefeitura'],
  ['responsavelSenhaPinCertificadoDigitalCpf', 'Senha PIN CPF'],
] as const

function printableValue(data: Record<string, unknown>, key: string) {
  const value = data[key]
  if (value == null || value === '') return '—'
  if (key === 'cpfCnpj' || key === 'responsavelCpf') return formatCpfCnpj(String(value))
  if (key === 'regimeTributario') return REGIME_LABELS[String(value)] ?? String(value)
  if (key === 'status') return getStatusLabel('cliente', String(value))
  return String(value)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function fichaRows(data: Record<string, unknown>, fields: readonly (readonly [string, string])[]) {
  return fields.map(([key, label]) => `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${escapeHtml(printableValue(data, key))}</td>
    </tr>
  `).join('')
}

function fichaSection(title: string, rows: string) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `
}

/**
 * Ficha para impressão. Senhas de portal só entram com valor para quem pode
 * vê-las (admin/fiscal), lidas na hora de clientes_credenciais; para os
 * demais, cada uma sai como "preenchida" ou "—".
 */
export async function exportFichaCadastralPdf(cliente: Record<string, unknown>, podeCredenciais: boolean, clienteId: string) {
  // Abre a janela antes do await: depois dele o bloqueador de pop-up a barraria.
  const printWindow = window.open('', '_blank', 'width=960,height=1200')
  if (!printWindow) {
    toast.error('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.')
    return
  }
  printWindow.opener = null
  printWindow.document.write('<p style="font-family:sans-serif">Gerando ficha…</p>')

  const semSenhas = Object.fromEntries(Object.entries(cliente).filter(([k]) => !CAMPOS_CREDENCIAL_LISTA.includes(k as never)))
  let dados: Record<string, unknown>
  if (podeCredenciais) {
    try {
      dados = { ...semSenhas, ...(await carregarCredenciaisCliente(clienteId, cliente)) }
    } catch (err) {
      console.error('[ficha-pdf] credenciais', err)
      printWindow.close()
      toast.error('Não foi possível carregar as senhas do cliente para a ficha.')
      return
    }
  } else {
    const preenchidas = credenciaisPreenchidasDe(cliente) as string[]
    dados = {
      ...semSenhas,
      ...Object.fromEntries(CAMPOS_CREDENCIAL_LISTA.map((k) => [k, preenchidas.includes(k) ? 'preenchida' : ''])),
    }
  }
  escreverFichaCadastral(printWindow, dados, podeCredenciais)
}

function escreverFichaCadastral(printWindow: Window, cliente: Record<string, unknown>, comSenhas: boolean) {
  const nome = printableValue(cliente, 'razaoSocial')
  const now = new Date()
  printWindow.document.open()
  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Ficha cadastral - ${escapeHtml(nome)}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #111827;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            line-height: 1.35;
          }
          header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #111827;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          h1 {
            margin: 0;
            font-size: 18px;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          .meta {
            text-align: right;
            color: #4b5563;
            white-space: nowrap;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          section {
            break-inside: avoid;
            border: 1px solid #d1d5db;
            margin-bottom: 10px;
          }
          h2 {
            margin: 0;
            padding: 6px 8px;
            background: #f3f4f6;
            border-bottom: 1px solid #d1d5db;
            font-size: 12px;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 5px 8px;
            vertical-align: top;
            border-bottom: 1px solid #e5e7eb;
          }
          tr:last-child th, tr:last-child td { border-bottom: 0; }
          th {
            width: 42%;
            text-align: left;
            font-weight: 700;
            color: #111827;
          }
          td {
            color: #1f2937;
            word-break: break-word;
          }
          .full { grid-column: 1 / -1; }
          .notice {
            margin-top: 4px;
            color: #6b7280;
            font-size: 10px;
          }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Ficha cadastral</h1>
            <div>${escapeHtml(nome)}</div>
          </div>
          <div class="meta">
            <div>Emitido em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div>Documento interno</div>
          </div>
        </header>
        <main class="grid">
          ${fichaSection('Dados da empresa', fichaRows(cliente, EMPRESA_GERAL_FIELDS))}
          ${fichaSection('Endereço da empresa', fichaRows(cliente, EMPRESA_ENDERECO_FIELDS))}
          <div class="full">
            ${fichaSection('Dados cadastrais e fiscais', fichaRows(cliente, EMPRESA_CADASTRO_FIELDS))}
          </div>
          ${fichaSection('Credenciais da empresa', fichaRows(cliente, EMPRESA_CREDENCIAIS_FIELDS))}
          ${fichaSection('Dados do representante', fichaRows(cliente, REPRESENTANTE_FIELDS))}
          ${fichaSection('Endereço do representante', fichaRows(cliente, REPRESENTANTE_ENDERECO_FIELDS) + `
            <tr><th>Cidade / UF</th><td>${escapeHtml([cliente.responsavelCidade, cliente.responsavelUf].filter(Boolean).join(' / ') || '—')}</td></tr>
          `)}
          <div class="full">
            ${fichaSection('Credenciais do representante', fichaRows(cliente, REPRESENTANTE_CREDENCIAIS_FIELDS))}
            <p class="notice">${comSenhas
              ? 'As credenciais são incluídas porque fazem parte da ficha cadastral exportada. Trate este PDF como documento confidencial.'
              : 'Senhas de portal só aparecem para administrador e fiscal; aqui consta apenas se estão preenchidas.'}</p>
          </div>
        </main>
        <script>
          window.addEventListener('load', () => {
            window.focus();
            setTimeout(() => window.print(), 200);
          });
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
