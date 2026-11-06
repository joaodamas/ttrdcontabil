// Popula os emuladores locais (Auth + Firestore) com dados FICTÍCIOS para revisão
// visual e testes manuais. Recusa rodar fora do emulador.
//
//   npx firebase emulators:exec --only auth,firestore --project demo-ttrd \
//     "node scripts/seed-emulador.mjs && <comando>"
//
// Login criado: admin@demo.local / demo1234 (perfil admin, tenant 'ttrd').
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Recusado: FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST ausentes — isto só roda no emulador.')
  process.exit(1)
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-ttrd' })
const db = getFirestore()
const auth = getAuth()
const TENANT = 'ttrd'

const hoje = new Date()
hoje.setHours(12, 0, 0, 0)
const dia = (offset) => Timestamp.fromDate(new Date(hoje.getTime() + offset * 86_400_000))
const agora = Timestamp.now()
const ano = hoje.getFullYear()
const mes = hoje.getMonth() + 1

async function put(col, id, data) {
  await db.collection(col).doc(id).set({ tenantId: TENANT, criadoEm: agora, atualizadoEm: agora, ...data })
}

const usuarios = [
  ['admin@demo.local', 'Ana Admin', 'admin'],
  ['op@demo.local', 'Otávio Operacional', 'operacional'],
  ['fiscal@demo.local', 'Fernanda Fiscal', 'fiscal'],
  ['fin@demo.local', 'Felipe Financeiro', 'financeiro'],
]
const uids = {}
for (const [email, nome, perfil] of usuarios) {
  const u = await auth.createUser({ email, password: 'demo1234', displayName: nome })
  uids[perfil] = { id: u.uid, nome }
  await put('usuarios', u.uid, { nome, email, perfil, ativo: true })
  // Projeção que o trigger sincronizarDiretorioUsuario manteria (functions não
  // rodam neste emulador): seletores e chips de responsável leem daqui.
  await put('usuarios_diretorio', u.uid, { nome, ativo: true })
}

const regimes = ['simples_nacional', 'simples_nacional', 'lucro_presumido', 'mei', 'lucro_real']
const nomes = [
  'Padaria Bom Grão Ltda', 'Oficina Mecânica Torque ME', 'Clínica Sorriso Pleno Ltda', 'Studio Lumen Design MEI',
  'Transportes Rota Sul Ltda', 'Mercadinho Vila Nova ME', 'Advocacia Prado & Lima', 'Tech Nuvem Sistemas Ltda',
  'Academia Corpo Ativo Ltda', 'Restaurante Sabor da Terra', 'Construtora Alicerce Ltda', 'Pet Shop Patas Felizes ME',
  'Consultoria Horizonte Ltda', 'Farmácia Saúde Já Ltda', 'Escola Pequeno Saber Ltda', 'Auto Peças Veloz ME',
  'Imobiliária Chave Certa', 'Gráfica Impressão Rápida', 'Salão Beleza Pura MEI', 'Distribuidora Fonte Viva Ltda',
]
const cidades = [['Jundiaí', 'SP', '3525904'], ['Campinas', 'SP', '3509502'], ['São Paulo', 'SP', '3550308'], ['Barueri', 'SP', '3505708']]
const servicos = [
  ['contabilidade-mensal', 'Contabilidade Mensal', 'mensal', 890],
  ['folha-pagamento', 'Folha de Pagamento', 'mensal', 350],
  ['irpf', 'Declaração IRPF', 'anual', 450],
]
for (const [id, nome, frequencia, valorPadrao] of servicos) await put('servicos', id, { nome, frequencia, valorPadrao, ativo: true })

const clientes = []
for (let i = 0; i < nomes.length; i++) {
  const id = `cli-${String(i + 1).padStart(2, '0')}`
  const [cidade, uf, ibge] = cidades[i % cidades.length]
  const cnpj = String(11222333000100 + i * 97).padStart(14, '0')
  const status = i === 17 ? 'inativo' : 'ativo'
  const categoriaFiscal = i === 4 ? 'transporte' : i === 5 || i === 15 ? 'produto' : 'servico'
  const c = {
    tipoPessoa: 'pj', razaoSocial: nomes[i], nomeFantasia: nomes[i].split(' ').slice(0, 2).join(' '),
    cpfCnpj: cnpj, email: `contato${i + 1}@exemplo.com.br`, telefone: '(11) 4000-00' + String(10 + i),
    cidade, uf, regimeTributario: regimes[i % regimes.length], status, categoriaFiscal,
    responsavelNome: i % 2 ? uids.operacional.nome : uids.fiscal.nome, diaEmissaoNFSe: 5 + (i % 20),
  }
  await put('clientes', id, c)
  clientes.push({ id, ...c, ibge })
  const valor = servicos[0][3] + (i % 5) * 120
  await put('clientes_servicos', `${id}-contab`, {
    clienteId: id, clienteNome: c.razaoSocial, servicoId: 'contabilidade-mensal', servicoNome: 'Contabilidade Mensal',
    valor, diaVencimento: 10, dataInicio: dia(-400), status: 'ativo',
  })
  await put('clientes_fiscal', `cf-${id}`, {
    clienteId: id, municipioIbge: ibge, municipioEmissor: cidade, inscricaoMunicipal: String(100000 + i),
    regimeTributario: c.regimeTributario, aliquotaPadrao: 2 + (i % 4), ambienteEmissao: 'homologacao',
    provedorNfse: i === 2 ? 'spedy' : 'municipio', optanteSimples: c.regimeTributario !== 'lucro_presumido',
  })
}

const titulos = ['Apurar DAS', 'Conferir folha', 'Enviar eSocial', 'Conciliar extrato', 'Entregar REINF', 'Cobrar documentos']
const prioridades = ['baixa', 'normal', 'alta', 'urgente']
const statusTarefa = ['pendente', 'pendente', 'em_andamento', 'concluida']
for (let i = 0; i < 36; i++) {
  const c = clientes[i % clientes.length]
  const resp = [uids.operacional, uids.fiscal, uids.admin][i % 3]
  await put('tarefas', `tar-${i + 1}`, {
    clienteId: c.id, clienteNome: c.razaoSocial, titulo: `${titulos[i % titulos.length]} — ${c.nomeFantasia}`,
    prioridade: prioridades[i % 4], status: statusTarefa[i % 4], responsavelId: resp.id, responsavelNome: resp.nome,
    dataPrazo: i % 9 === 0 ? null : dia((i % 11) - 4),
  })
}

const statusComp = ['aberta', 'em_andamento', 'concluida']
for (let i = 0; i < clientes.length; i++) {
  const c = clientes[i]
  for (const delta of [0, 1]) {
    const m = ((mes - 1 - delta + 12) % 12) + 1
    const a = mes - delta < 1 ? ano - 1 : ano
    await put('competencias', `${c.id}_${c.id}-contab_${a}_${String(m).padStart(2, '0')}`, {
      clienteId: c.id, clienteNome: c.razaoSocial, clienteServicoId: `${c.id}-contab`, servicoNome: 'Contabilidade Mensal',
      mes: m, ano: a, status: delta ? 'concluida' : statusComp[i % 3], responsavelId: uids.operacional.id,
      responsavelNome: uids.operacional.nome,
    })
  }
}

const statusLanc = ['pendente', 'pago', 'pendente', 'pago', 'pendente']
for (let i = 0; i < 45; i++) {
  const c = clientes[i % clientes.length]
  const st = statusLanc[i % statusLanc.length]
  await put('lancamentos', `lan-${i + 1}`, {
    clienteId: c.id, clienteNome: c.razaoSocial, tipo: i % 7 === 0 ? 'despesa' : 'receita',
    descricao: i % 7 === 0 ? 'Licença de software' : `Honorários ${String(mes).padStart(2, '0')}/${ano}`,
    valor: 690 + (i % 9) * 85.5, dataVencimento: dia((i % 30) - 18), status: st,
    dataPagamento: st === 'pago' ? dia((i % 30) - 20) : null, formaPagamento: st === 'pago' ? 'pix' : null,
  })
}

const obrig = ['ok', 'pendente', 'enviado', 'parcial', 'guia', 'na']
for (let i = 0; i < clientes.length; i++) {
  const c = clientes[i]
  await put('fechamentos', `${ano}_${mes}_${c.id}`, {
    clienteId: c.id, clienteNome: c.razaoSocial, clienteCodigo: i + 1, mes, ano, regime: c.regimeTributario,
    responsavel: c.responsavelNome, dasStatus: obrig[i % 6], esocialStatus: obrig[(i + 1) % 6],
    reinfStatus: obrig[(i + 2) % 6], fgtsStatus: obrig[(i + 3) % 6], status: 'aberto',
  })
}

for (let i = 0; i < 24; i++) {
  const c = clientes[i % 16]
  const st = i % 8 === 0 ? 'erro_integracao' : i % 11 === 0 ? 'cancelada' : 'emitida'
  await put('nfse_emitidas', `nf-${i + 1}`, {
    clienteId: c.id, clienteNome: c.razaoSocial, tipoDocumento: 'nfse', numeroNfse: String(2400 + i),
    numeroRps: String(10000 + i), serieRps: 'RPS', status: st, dataEmissao: dia(-(i * 3)),
    tomadorNome: nomes[(i + 7) % nomes.length], tomadorCpfCnpj: '99888777000166',
    descricaoServico: 'Serviços de consultoria e assessoria', codigoServico: '17.01',
    valorServico: 1500 + i * 230, valorDeducoes: 0, aliquota: 3, issRetido: i % 5 === 0,
    municipioIbge: c.ibge, municipioNome: c.cidade, ambienteEmissao: 'homologacao',
  })
}

for (let i = 0; i < 8; i++) {
  const c = clientes[i]
  await put('ir_declaracoes', `ir-${i + 1}`, {
    clienteId: c.id, clienteNome: c.razaoSocial, anoBase: ano - 1,
    status: ['pendente', 'em_andamento', 'entregue', 'pendente'][i % 4], responsavelId: uids.fiscal.id,
    responsavelNome: uids.fiscal.nome,
  })
}

for (let i = 0; i < 6; i++) {
  const c = clientes[i + 6]
  await put('produtos', `prod-${i + 1}`, {
    clienteId: clientes[5].id, codigo: `P${100 + i}`, descricao: ['Pão francês', 'Leite integral', 'Café 500g', 'Arroz 5kg', 'Feijão 1kg', 'Açúcar 1kg'][i],
    ncm: '19052090', cfop: '5102', unidade: 'UN', valorUnitario: 4.5 + i * 3, ativo: true,
  })
  void c
}

// Carteira de tomadores (clientes DOS clientes) dos 3 primeiros prestadores.
const tomadoresBase = [['Mercado Bom Preço Ltda', '11444777000161'], ['Hotel Vista Serra Ltda', '04252011000110'], ['Maria Aparecida Souza', '52998224725']]
for (let i = 0; i < 3; i++) {
  for (const [j, [razaoSocial, cpfCnpj]] of tomadoresBase.entries()) {
    await put('tomadores', `tom-${i + 1}-${j + 1}`, {
      clienteId: clientes[i].id, razaoSocial, cpfCnpj, email: `financeiro${j + 1}@exemplo.com.br`, ativo: true,
    })
  }
}

const conectores = [
  ['jundiai-sp', 'Jundiaí', '3525904', true], ['campinas-sp', 'Campinas', '3509502', true],
  ['sao-paulo-sp', 'São Paulo', '3550308', true], ['barueri-sp', 'Barueri', '3505708', false],
]
for (const [id, nome, ibge, homologado] of conectores) {
  await put('fiscal_conectores', id, {
    nome, municipioIbge: ibge, ativo: true, homologado, producaoLiberada: false, emissao: true, consulta: true, cancelamento: true,
  })
}

for (let i = 0; i < 12; i++) {
  const c = clientes[i]
  await put('events', `ev-${i + 1}`, {
    clienteId: c.id, tipo: ['fiscal', 'lancamento', 'tarefa'][i % 3], titulo: ['NFS-e emitida', 'Pagamento recebido', 'Tarefa concluída'][i % 3],
    descricao: `${c.nomeFantasia} — evento de exemplo`, criadoEm: dia(-i), metadata: { severidade: ['baixa', 'media', 'alta'][i % 3] },
  })
}

console.log(`seed ok: ${clientes.length} clientes, 36 tarefas, 45 lançamentos, 24 NFS-e — login admin@demo.local / demo1234`)
