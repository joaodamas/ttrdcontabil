/**
 * Seed script — popula o Firestore com dados iniciais do TTRD Contábil.
 *
 * Uso:
 *   npx tsx src/scripts/seed.ts
 *
 * Requer FIREBASE_SERVICE_ACCOUNT_KEY no ambiente (via .env.local ou export).
 */

import 'dotenv/config'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

// ── Init ─────────────────────────────────────────────────────────────────────

function initAdmin() {
  if (getApps().length > 0) return getApps()[0]
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não configurada')
  return initializeApp({ credential: cert(JSON.parse(key)) })
}

initAdmin()
const db   = getFirestore()
const auth = getAuth()

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsert(collection: string, id: string, data: Record<string, unknown>) {
  const ref  = db.collection(collection).doc(id)
  const snap = await ref.get()
  if (snap.exists) {
    console.log(`  skip  ${collection}/${id}`)
  } else {
    await ref.set({ ...data, criadoEm: Timestamp.now(), atualizadoEm: Timestamp.now() })
    console.log(`  added ${collection}/${id}`)
  }
}

async function upsertAuto(collection: string, data: Record<string, unknown>, matchField: string) {
  const val  = data[matchField] as string
  const snap = await db.collection(collection).where(matchField, '==', val).limit(1).get()
  if (!snap.empty) {
    console.log(`  skip  ${collection} where ${matchField}=${val}`)
    return snap.docs[0].id
  }
  const ref = await db.collection(collection).add({ ...data, criadoEm: Timestamp.now(), atualizadoEm: Timestamp.now() })
  console.log(`  added ${collection}/${ref.id} (${val})`)
  return ref.id
}

// ── Clientes ──────────────────────────────────────────────────────────────────
//
// Extraídos das planilhas de fechamento (abas: SIMPLES, PRESU, 02.2026)
// Campos: codigo, razaoSocial, regime, responsavel, portalUrl, formaEntrega

type FormaEntrega = 'guia' | 'sm' | 'programa' | 'email' | 'portal'

interface ClienteSeed {
  codigo: number
  razaoSocial: string
  regime: 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei'
  responsavel: string
  portalUrl?: string
  formaEntrega?: FormaEntrega
  esocial?: boolean
  reinf?: boolean
  fgts?: boolean
}

const CLIENTES_SIMPLES: ClienteSeed[] = [
  { codigo: 2,  razaoSocial: 'LA VERGANI',                  regime: 'simples_nacional', responsavel: 'LUIS ALBERTO',    portalUrl: 'https://www.barueri.sp.gov.br/nfe/wfPrincipalNF.aspx',                                                            formaEntrega: 'portal' },
  { codigo: 4,  razaoSocial: 'RGS SUPORTE E ACESSORIA',     regime: 'simples_nacional', responsavel: 'RONE',             portalUrl: 'https://jandira.siltecnologia.com.br/loginCNPJContribuinte.jsp?execobj=ContribuintesWebRelacionados',              formaEntrega: 'portal' },
  { codigo: 5,  razaoSocial: 'DISK AGUA RUSSO',             regime: 'simples_nacional', responsavel: 'RICARDO',                                                                                                                                           formaEntrega: 'programa' },
  { codigo: 7,  razaoSocial: 'RENATO PIZZARIA E BUFFET',    regime: 'simples_nacional', responsavel: 'RENATO',           portalUrl: 'https://www.nf-eletronica.com.br/nfeletronica/login.asp?m=0&mot_=M',                                              formaEntrega: 'portal' },
  { codigo: 8,  razaoSocial: 'IT SOLUTIONS',                regime: 'simples_nacional', responsavel: 'DANIEL FREIRE',   portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                                        formaEntrega: 'portal' },
  { codigo: 9,  razaoSocial: 'HELITE 22',                   regime: 'simples_nacional', responsavel: 'MAICON',           portalUrl: 'https://geisweb.com.br/cajamar/index.php',                                                                          formaEntrega: 'portal', esocial: true },
  { codigo: 10, razaoSocial: 'CAPI MEDICAL',                regime: 'simples_nacional', responsavel: 'RODRIGO BARROS',                                                                                                                                    formaEntrega: 'programa' },
  { codigo: 11, razaoSocial: 'DT VENDA, SERVIÇOS',          regime: 'simples_nacional', responsavel: 'DAVI TENORIO',    portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                                        formaEntrega: 'portal' },
  { codigo: 12, razaoSocial: 'MARCELLA',                    regime: 'simples_nacional', responsavel: 'MARCELLA',                                                                                                                                           esocial: true, fgts: true },
  { codigo: 15, razaoSocial: 'MARQUES MARCENARIA',          regime: 'simples_nacional', responsavel: 'ANDERSON',        portalUrl: 'https://www.nf-eletronica.com.br/nfeletronica/login.asp?m=0&mot_=M',                                              formaEntrega: 'portal', esocial: true, fgts: true },
  { codigo: 16, razaoSocial: 'AUTO VIDROS COLINAS',         regime: 'simples_nacional', responsavel: 'JANA AUTO VIDROS', portalUrl: 'https://geisweb.com.br/cajamar/index.php',                                                                        formaEntrega: 'portal' },
  { codigo: 17, razaoSocial: 'ATELIE MARCELLA',             regime: 'simples_nacional', responsavel: 'MARCELLA' },
  { codigo: 18, razaoSocial: "FPL'A SERVIÇOS - FABIO",      regime: 'simples_nacional', responsavel: 'FABIO',                                                                                                                                              esocial: true, fgts: true },
  { codigo: 19, razaoSocial: 'BERNARDES MIDIA',             regime: 'simples_nacional', responsavel: 'FELIPE BERNARDES', portalUrl: 'https://www.nf-eletronica.com.br/nfeletronica/login.asp?m=0&mot_=M',                                             formaEntrega: 'portal', esocial: true, fgts: true },
  { codigo: 21, razaoSocial: 'ARTE & PRIME',                regime: 'simples_nacional', responsavel: 'EVANDRO',          portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                                       formaEntrega: 'portal' },
  { codigo: 22, razaoSocial: 'PANIFICADORA VITORIA',        regime: 'simples_nacional', responsavel: 'BENEDITO',                                                                                                                                           formaEntrega: 'programa' },
  { codigo: 24, razaoSocial: 'CANTINHO DAS CAIPIRINHAS',    regime: 'simples_nacional', responsavel: 'CHRISTIANE',      portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                                        formaEntrega: 'portal', esocial: true, fgts: true },
  { codigo: 25, razaoSocial: 'AÇAI DO PARAIBA FAZENDINHA',  regime: 'simples_nacional', responsavel: 'YGOR',                                                                                                                                               esocial: true, fgts: true },
  { codigo: 26, razaoSocial: 'CA ALMEIDA',                  regime: 'simples_nacional', responsavel: 'CARLINHOS',       portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                                        formaEntrega: 'portal', esocial: true },
  { codigo: 32, razaoSocial: 'MVM SOLUÇÕES',                regime: 'simples_nacional', responsavel: 'MARCEL',          portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                                        formaEntrega: 'portal', esocial: true, fgts: true },
  { codigo: 36, razaoSocial: 'DAYHEL',                      regime: 'simples_nacional', responsavel: 'HELDER' },
  { codigo: 37, razaoSocial: "MARIA'S CONFEITARIA",         regime: 'simples_nacional', responsavel: 'MARIAS',                                                                                                                                             formaEntrega: 'email' },
  { codigo: 38, razaoSocial: 'HELITE 22 - DISTRIBUIDORA',   regime: 'simples_nacional', responsavel: 'MAICON',          portalUrl: 'https://geisweb.com.br/cajamar/index.php',                                                                          formaEntrega: 'portal', esocial: true, fgts: true },
  { codigo: 41, razaoSocial: 'CR MULT ENGENHARIA',          regime: 'simples_nacional', responsavel: 'CARLOS',                                                                                                                                             esocial: true, fgts: true },
  { codigo: 43, razaoSocial: 'BRINQUEDOTECA - ROBERTA',     regime: 'simples_nacional', responsavel: 'GUI',             portalUrl: 'https://geisweb.com.br/cajamar/index.php',                                                                          formaEntrega: 'portal' },
  { codigo: 44, razaoSocial: 'GREENLINE MANUTEN - LUIS',    regime: 'simples_nacional', responsavel: 'LUIS BERNADO',   portalUrl: 'https://geisweb.com.br/cajamar/index.php',                                                                          formaEntrega: 'portal', esocial: true, fgts: true },
  { codigo: 49, razaoSocial: 'ESPETOS',                     regime: 'simples_nacional', responsavel: 'JOCLEI',                                                                                                                                             esocial: true, fgts: true },
  { codigo: 50, razaoSocial: 'CLICKON',                     regime: 'simples_nacional', responsavel: 'ADELSON',                                                                                                                                            esocial: true, fgts: true },
  { codigo: 51, razaoSocial: 'MINEIRO CONSTRUÇÕES',         regime: 'simples_nacional', responsavel: 'MICHAEL',        portalUrl: 'https://www.nf-eletronica.com.br/nfeletronica/login.asp?m=0&mot_=M',                                              formaEntrega: 'portal' },
  { codigo: 59, razaoSocial: 'DI PAULA CORRETORA',          regime: 'simples_nacional', responsavel: 'FRAN DI PAULA',                                                                                                                                     esocial: true, fgts: true },
  { codigo: 60, razaoSocial: 'JVA TRANSPORTES',             regime: 'simples_nacional', responsavel: 'JOSE VIANA',     portalUrl: 'https://nfe.etransparencia.com.br/sp.taboaodaserra/nfe/principal.aspx',                                              formaEntrega: 'portal' },
  { codigo: 62, razaoSocial: 'ARAUJO DISTRIBUIDORA',        regime: 'simples_nacional', responsavel: 'RODRIGO BARROS',                                                                                                                                    formaEntrega: 'programa' },
  { codigo: 63, razaoSocial: 'MAG INSTALAÇÃO 2',            regime: 'simples_nacional', responsavel: 'DOUGLAS',        portalUrl: 'https://novanfse.campinas.sp.gov.br/notafiscal/paginas/portal/index.html#/',                                        formaEntrega: 'portal', esocial: true },
  { codigo: 64, razaoSocial: 'STORE MORALES',               regime: 'simples_nacional', responsavel: 'DANILO MORALES',                                                                                                                                    esocial: true, fgts: true },
  { codigo: 66, razaoSocial: 'AÇAI DO PARAIBA - COLINAS',   regime: 'simples_nacional', responsavel: 'ITALO',                                                                                                                                             esocial: true, fgts: true },
  { codigo: 67, razaoSocial: 'GRUPO PEP',                   regime: 'simples_nacional', responsavel: 'PEP',                                                                                                                                               formaEntrega: 'programa' },
  { codigo: 68, razaoSocial: 'COLINAS CHURRASQUEIRAS',      regime: 'simples_nacional', responsavel: 'DEBORA' },
]

const CLIENTES_PRESUMIDO: ClienteSeed[] = [
  { codigo: 1,  razaoSocial: 'JGKB CANTINHO',                    regime: 'lucro_presumido', responsavel: 'CHRISTIANE',     portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                           formaEntrega: 'portal' },
  { codigo: 6,  razaoSocial: 'R&F TRANSPORTES',                   regime: 'lucro_presumido', responsavel: 'FABI',            portalUrl: 'https://novanfse.campinas.sp.gov.br/notafiscal/paginas/portal/index.html#/',                         formaEntrega: 'portal', esocial: true },
  { codigo: 13, razaoSocial: 'J-CAR MOTORS',                      regime: 'lucro_presumido', responsavel: 'MARCELLA',        portalUrl: 'https://geisweb.com.br/cajamar/index.php',                                                           formaEntrega: 'portal' },
  { codigo: 14, razaoSocial: 'MAG INSTALAÇÃO',                    regime: 'lucro_presumido', responsavel: 'DOUGLAS',         portalUrl: 'https://novanfse.campinas.sp.gov.br/notafiscal/paginas/portal/index.html#/',                         formaEntrega: 'portal', esocial: true },
  { codigo: 28, razaoSocial: 'CAMARA DE CONCILIAÇÃO CMS',         regime: 'lucro_presumido', responsavel: 'CASSIA',                                                                                                                              esocial: true },
  { codigo: 30, razaoSocial: 'MISTER THUNDER',                    regime: 'lucro_presumido', responsavel: 'MARI',                                                                                                                               formaEntrega: 'programa', esocial: true },
  { codigo: 31, razaoSocial: 'DRS CURSOS E MANUTENÇÃO',           regime: 'lucro_presumido', responsavel: 'MARI' },
  { codigo: 35, razaoSocial: 'EDNARDO GOMES',                     regime: 'lucro_presumido', responsavel: 'ED',              portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                           formaEntrega: 'portal', esocial: true },
  { codigo: 40, razaoSocial: 'CLARA TRANSPORTES',                 regime: 'lucro_presumido', responsavel: 'GABRIEL BERA',   portalUrl: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                           formaEntrega: 'portal', esocial: true },
  { codigo: 45, razaoSocial: 'ASSOCIAÇÃO PAULISTANA',             regime: 'lucro_presumido', responsavel: 'OSVALDO',                                                                                                                             esocial: true },
  { codigo: 46, razaoSocial: 'ASSOCIACAO RECANTO DA SERRA',       regime: 'lucro_presumido', responsavel: 'OSVALDO',                                                                                                                             esocial: true },
  { codigo: 47, razaoSocial: 'CAMARA DE CONCILIAÇÃO VALENTINA',   regime: 'lucro_presumido', responsavel: 'VAGNER',                                                                                                                              esocial: true },
  { codigo: 58, razaoSocial: 'MIX MULTIMARCAS',                   regime: 'lucro_presumido', responsavel: 'EDSON CASTANHA', portalUrl: 'https://francodarocha.meumunicipio.online/ISS/index.php',                                             formaEntrega: 'portal' },
  { codigo: 72, razaoSocial: 'CONEX',                             regime: 'lucro_presumido', responsavel: 'FERNANDO' },
]

const TODOS_CLIENTES = [...CLIENTES_SIMPLES, ...CLIENTES_PRESUMIDO]

// ── Conectores Fiscais ────────────────────────────────────────────────────────

const FISCAL_CONECTORES = [
  { id: 'barueri-sp',         nome: 'Prefeitura de Barueri',           municipio: 'Barueri',           uf: 'SP', urlPortal: 'https://www.barueri.sp.gov.br/nfe/wfPrincipalNF.aspx',                                                       tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'jandira-sp',         nome: 'Prefeitura de Jandira',           municipio: 'Jandira',           uf: 'SP', urlPortal: 'https://jandira.siltecnologia.com.br/loginCNPJContribuinte.jsp?execobj=ContribuintesWebRelacionados',         tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'nf-eletronica',      nome: 'NF-Eletrônica',                   municipio: null,                uf: null, urlPortal: 'https://www.nf-eletronica.com.br/nfeletronica/login.asp',                                                   tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'notadomilhao-sp',    nome: 'Nota do Milhão (São Paulo)',      municipio: 'São Paulo',         uf: 'SP', urlPortal: 'https://notadomilhao.prefeitura.sp.gov.br/',                                                                tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'cajamar-sp',         nome: 'Prefeitura de Cajamar (Geisweb)', municipio: 'Cajamar',           uf: 'SP', urlPortal: 'https://geisweb.com.br/cajamar/index.php',                                                                   tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'campinas-sp',        nome: 'Prefeitura de Campinas',          municipio: 'Campinas',          uf: 'SP', urlPortal: 'https://novanfse.campinas.sp.gov.br/notafiscal/paginas/portal/index.html#/',                                tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'taboaodaserra-sp',   nome: 'Prefeitura de Taboão da Serra',   municipio: 'Taboão da Serra',   uf: 'SP', urlPortal: 'https://nfe.etransparencia.com.br/sp.taboaodaserra/nfe/principal.aspx',                                    tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'francodarocha-sp',   nome: 'Prefeitura de Franco da Rocha',   municipio: 'Franco da Rocha',   uf: 'SP', urlPortal: 'https://francodarocha.meumunicipio.online/ISS/index.php',                                                   tipoIntegracao: 'manual_assistido', ativo: true },
  { id: 'manual-assistido',   nome: 'Emissão Manual Assistida',        municipio: null,                uf: null, urlPortal: null, tipoIntegracao: 'manual_assistido', descricao: 'Para municípios sem integração direta.', ativo: true },
]

// ── Serviços padrão ───────────────────────────────────────────────────────────

const SERVICOS_PADRAO = [
  { id: 'contabilidade-mensal',   nome: 'Contabilidade Mensal',        descricao: 'Escrituração contábil mensal, balancetes e demonstrações.', frequencia: 'mensal',    valorPadrao: null, ativo: true },
  { id: 'simples-nacional',       nome: 'Apuração Simples Nacional',   descricao: 'Cálculo e geração do DAS mensal.',                          frequencia: 'mensal',    valorPadrao: null, ativo: true },
  { id: 'lucro-presumido',        nome: 'Apuração Lucro Presumido',    descricao: 'Apuração trimestral IRPJ/CSLL e DCTF mensal.',              frequencia: 'mensal',    valorPadrao: null, ativo: true },
  { id: 'folha-pagamento',        nome: 'Folha de Pagamento',          descricao: 'Processamento de folha, FGTS, INSS e obrigações.',          frequencia: 'mensal',    valorPadrao: null, ativo: true },
  { id: 'esocial',                nome: 'eSocial',                     descricao: 'Obrigações do eSocial (S-1200, S-1210, S-1299).',           frequencia: 'mensal',    valorPadrao: null, ativo: true },
  { id: 'reinf',                  nome: 'EFD-REINF',                   descricao: 'Escrituração Fiscal Digital de Retenções.',                 frequencia: 'mensal',    valorPadrao: null, ativo: true },
  { id: 'fgts-digital',          nome: 'FGTS Digital',                descricao: 'Guia de recolhimento do FGTS via plataforma digital.',      frequencia: 'mensal',    valorPadrao: null, ativo: true },
  { id: 'abertura-empresa',       nome: 'Abertura de Empresa',         descricao: 'Registro e constituição de pessoa jurídica.',               frequencia: 'avulso',    valorPadrao: null, ativo: true },
  { id: 'irpf',                   nome: 'Declaração IRPF',             descricao: 'Declaração anual do Imposto de Renda PF.',                  frequencia: 'anual',     valorPadrao: null, ativo: true },
  { id: 'irpj',                   nome: 'Declaração IRPJ/CSLL',        descricao: 'Apuração e declaração anual do IRPJ.',                      frequencia: 'anual',     valorPadrao: null, ativo: true },
]

// ── Usuário admin ─────────────────────────────────────────────────────────────

async function criarAdmin() {
  const email = 'admin@ttrdcontabil.com.br'
  try {
    const existing = await auth.getUserByEmail(email)
    console.log(`  skip  auth/${existing.uid} (admin já existe)`)
    // Garante doc no Firestore
    await upsert('usuarios', existing.uid, {
      nome:   'Administrador',
      email,
      perfil: 'admin',
      ativo:  true,
    })
  } catch {
    // Usuário não existe — cria
    const user = await auth.createUser({
      email,
      password: 'Admin@123456',
      displayName: 'Administrador',
    })
    await upsert('usuarios', user.uid, {
      nome:   'Administrador',
      email,
      perfil: 'admin',
      ativo:  true,
    })
    console.log(`  added auth/${user.uid} (admin)`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TTRD Contábil — Seed ===\n')

  // 1. Conectores fiscais
  console.log('fiscal_conectores:')
  for (const c of FISCAL_CONECTORES) {
    const { id, ...data } = c
    await upsert('fiscal_conectores', id, data as Record<string, unknown>)
  }

  // 2. Serviços
  console.log('\nservicos:')
  for (const s of SERVICOS_PADRAO) {
    const { id, ...data } = s
    await upsert('servicos', id, data as Record<string, unknown>)
  }

  // 3. Clientes
  console.log('\nclientes:')
  for (const c of TODOS_CLIENTES) {
    const clienteId = await upsertAuto('clientes', {
      codigo:            c.codigo,
      razaoSocial:       c.razaoSocial,
      tipoPessoa:        'pj',
      regimeTributario:  c.regime,
      responsavelNome:   c.responsavel,
      portalUrl:         c.portalUrl ?? null,
      formaEntrega:      c.formaEntrega ?? null,
      status:            'ativo',
    }, 'codigo')

    // 4. Dados fiscais do cliente
    if (c.portalUrl) {
      const fiscalSnap = await db
        .collection('clientes_fiscal')
        .where('clienteId', '==', clienteId)
        .limit(1)
        .get()

      if (fiscalSnap.empty) {
        await db.collection('clientes_fiscal').add({
          clienteId,
          tipoIntegracaoNfse:  'manual_assistido',
          ambienteEmissao:     'producao',
          urlPortalNfse:       c.portalUrl,
          criadoEm:            Timestamp.now(),
          atualizadoEm:        Timestamp.now(),
        })
        console.log(`    fiscal → ${c.razaoSocial}`)
      }
    }
  }

  // 5. Usuário admin
  console.log('\nusuários:')
  await criarAdmin()

  console.log('\n✅ Seed concluído.')
  console.log('   Admin: admin@ttrdcontabil.com.br / Admin@123456')
  console.log('   ⚠️  TROQUE A SENHA NO PRIMEIRO LOGIN!')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
