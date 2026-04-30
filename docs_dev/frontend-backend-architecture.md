# Frontend + Backend + Automação — TTRD Contábil

> Versão 1.0 — 2026-04-30

---

## PARTE 1 — ARQUITETURA FRONTEND

### Estrutura de pastas (alvo)

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/login/
│   └── (dashboard)/
│       ├── layout.tsx            # Shell: Sidebar + Topbar + ErrorBoundary
│       ├── hoje/page.tsx
│       ├── clientes/
│       │   ├── page.tsx          # Lista
│       │   └── [id]/
│       │       ├── page.tsx      # Wrapper SSG
│       │       └── page-client.tsx  # Client component
│       └── ...demais rotas
│
├── components/
│   ├── ui/                       # Primitivos: Button, Card, Badge, Input...
│   ├── layout/                   # Sidebar, Topbar, PageHeader
│   ├── premium/                  # saas-blocks: KpiCard, RiskBanner, etc.
│   ├── shared/                   # Componentes cross-domain (StatusBadge, etc.)
│   ├── clientes/                 # Componentes específicos do domínio
│   ├── tarefas/
│   ├── financeiro/
│   ├── fechamento/
│   ├── fiscal/
│   └── ir/
│
├── hooks/                        # useCliente, useTarefas, useFinanceiro...
├── lib/                          # Utils, Firebase client, permissions
├── contexts/                     # AuthContext (manter mínimo)
└── types/                        # Firestore types (único source of truth)
```

### Estado: Global vs Local

```
GLOBAL (AuthContext — manter apenas):
  - usuario: UserSession | null
  - loading: boolean
  - logout: () => void

LOCAL (useState dentro do componente):
  - dados da tela atual (allTarefas, lancamentos, etc.)
  - UI state (modalOpen, selectedIds, loading)
  - filtros da URL via useSearchParams

NÃO USAR react-query para queries Firestore diretas
  → Firestore já é real-time; React Query é para REST/cache HTTP
  → Usar useState + useEffect + Firebase SDK diretamente
  → Exceção: queries que precisam de cache cross-componente

REGRA: Se o estado não é compartilhado entre rotas, é local.
```

### Componentização — Hierarquia

```
NÍVEL 1 — UI Primitivos (src/components/ui/)
  Sem lógica de negócio. Apenas visual.
  Button, Card, Badge, Input, Select, Dialog, Table...

NÍVEL 2 — Blocos Premium (src/components/premium/saas-blocks.tsx)
  Composição de primitivos com semântica de produto.
  KpiCard, RiskBanner, DecisionCard, PriorityList...

NÍVEL 3 — Componentes de Domínio (src/components/[domain]/)
  Têm lógica de negócio específica.
  TaskCard, FilaCobrancaItem, FechamentoTable...

NÍVEL 4 — Páginas (src/app/(dashboard)/[route]/page.tsx)
  Orquestram dados + compõem blocos.
  Não devem ter lógica de render complexa — delegam para componentes.
```

### Memoização — Quando usar

```typescript
// USE useMemo: cálculos derivados de dados (não simples)
const filaPrioritaria = useMemo(() =>
  sortTasksBySla(data.atrasadas).slice(0, 6).map(toListItem),
  [data.atrasadas]
)

// USE useCallback: funções passadas como props para componentes filhos
const handleUpdate = useCallback(async (id, field, value) => {
  await updateDocument('fechamentos', id, { [field]: value })
  setFechamentos(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
}, []) // deps vazias = função estável

// NÃO USE memo() em componentes de lista (overhead > benefício para < 100 itens)
// USE memo() apenas em: Sidebar, Topbar (renderizam com qualquer re-render do layout)

// NÃO USE useMemo para: formatações simples, strings, booleans derivados
```

### Performance — Regras

```
1. queueMicrotask() antes de setState em useEffect
   → Evita bloquear o render inicial do layout
   → Já implementado em financeiro, competencias, tarefas

2. Promise.allSettled() para queries paralelas independentes
   → Uma query falha, as outras continuam
   → Já implementado no dashboard

3. Suspense + fallback skeleton em toda rota com dados assíncronos
   → Fallback deve ser estruturalmente similar ao conteúdo

4. generateStaticParams com placeholder para rotas dinâmicas
   → Obrigatório com output: 'export'
   → Já implementado em clientes/[id], tarefas/[id], etc.

5. Lazy loading de modais pesados
   // Antes:
   import { ConfigFiscalForm } from '@/components/fiscal/config-fiscal-form'
   
   // Depois (para forms grandes):
   const ConfigFiscalForm = dynamic(
     () => import('@/components/fiscal/config-fiscal-form'),
     { loading: () => <Skeleton /> }
   )
```

---

## PARTE 2 — ARQUITETURA BACKEND (FIRESTORE)

### Coleções — Estrutura canônica

```
/usuarios/{uid}
  uid, nome, email, perfil, telas[], ativo, criadoEm

/clientes/{clienteId}
  razaoSocial, nomeFantasia, cpfCnpj, regimeTributario
  cidade, uf, email, telefone, responsavelNome, responsavelId
  status: ativo|inativo|suspenso, codigo, criadoEm

/servicos/{servicoId}
  nome, descricao, ativo, criadoEm

/clientes_servicos/{id}
  clienteId, clienteNome (denorm), servicoId, servicoNome (denorm)
  valor, dataInicio, dataFim, status, criadoEm

/competencias/{id}
  clienteId, clienteNome, mes, ano, servicoId, servicoNome
  status, responsavelId, responsavelNome, criadoEm, updatedAt

/tarefas/{id}
  titulo, descricao, clienteId, clienteNome
  competenciaId (opcional), responsavelId, responsavelNome
  prioridade, status, dataPrazo, dataConclusao, criadoEm

/tarefas_comentarios/{id}
  tarefaId, texto, usuarioId, usuarioNome, criadoEm

/lancamentos/{id}
  clienteId, clienteNome, tipo, status, valor
  descricao, dataVencimento, dataPagamento
  competenciaId (opcional), criadoEm

/fechamentos/{id}
  clienteId, clienteNome, clienteCodigo, mes, ano, regime
  responsavel, dasStatus, esocialStatus, reinfStatus, fgtsStatus
  portalUrl, formaEntrega, revisaoAt, revisaoNota

/nfse_emitidas/{id}
  clienteId, clienteNome, numeroNfse, valorServico
  status, dataEmissao, municipioIbge, criadoEm

/nfse_rascunhos/{id}
  clienteId, titulo, dados{}, status: aguardando_emissao, criadoEm

/ir_declaracoes/{id}
  clienteId, clienteNome, anoBase, status
  responsavelId, responsavelNome, dataEntrega, criadoEm

/clientes_fiscal/{id}
  clienteId, municipioIbge, inscricaoMunicipal, inscricaoEstadual
  ambienteEmissao, regimeTributario, optanteSimples
  aliquotaPadrao, itemListaServico, cnae, credenciais{}
```

### Índices compostos — Obrigatórios

```javascript
// firestore.indexes.json — índices que precisam existir

// Cockpit (tarefas por responsável + prazo)
{ collection: "tarefas", fields: [
  { field: "responsavelId", order: "ASCENDING" },
  { field: "dataPrazo", order: "ASCENDING" }
]}

// Fechamento (por mês + ano + regime)
{ collection: "fechamentos", fields: [
  { field: "mes", order: "ASCENDING" },
  { field: "ano", order: "ASCENDING" },
  { field: "regime", order: "ASCENDING" }
]}

// Financeiro (receitas pendentes atrasadas)
{ collection: "lancamentos", fields: [
  { field: "tipo", order: "ASCENDING" },
  { field: "status", order: "ASCENDING" },
  { field: "dataVencimento", order: "ASCENDING" }
]}

// Competências por cliente + período
{ collection: "competencias", fields: [
  { field: "clienteId", order: "ASCENDING" },
  { field: "ano", order: "DESCENDING" },
  { field: "mes", order: "DESCENDING" }
]}

// IR por ano-base + status
{ collection: "ir_declaracoes", fields: [
  { field: "anoBase", order: "ASCENDING" },
  { field: "status", order: "ASCENDING" },
  { field: "clienteNome", order: "ASCENDING" }
]}
```

### Security Rules — Modelo

```javascript
// firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuth() {
      return request.auth != null;
    }
    function perfil() {
      return get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.perfil;
    }
    function isAdmin() { return perfil() == 'admin'; }
    function isAtivo() {
      return get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.ativo == true;
    }

    // Usuários — só admin gerencia, cada um lê a si mesmo
    match /usuarios/{uid} {
      allow read: if isAuth() && isAtivo() && (request.auth.uid == uid || isAdmin());
      allow write: if isAuth() && isAdmin();
    }

    // Clientes — leitura ampla, escrita restrita
    match /clientes/{id} {
      allow read: if isAuth() && isAtivo();
      allow create, update: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'operacional', 'fiscal'];
      allow delete: if isAuth() && isAdmin();
    }

    // Tarefas — todos leem, operacional/admin escrevem
    match /tarefas/{id} {
      allow read: if isAuth() && isAtivo();
      allow write: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'operacional', 'fiscal', 'financeiro'];
    }

    // Lançamentos — só financeiro e admin
    match /lancamentos/{id} {
      allow read: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'financeiro'];
      allow write: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'financeiro'];
    }

    // Fechamentos — operacional, fiscal, admin
    match /fechamentos/{id} {
      allow read: if isAuth() && isAtivo();
      allow write: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'operacional', 'fiscal'];
    }

    // NFS-e — fiscal e admin
    match /nfse_emitidas/{id} {
      allow read: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'fiscal', 'financeiro'];
      allow write: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'fiscal'];
    }

    // Config fiscal — fiscal e admin
    match /clientes_fiscal/{id} {
      allow read: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'fiscal'];
      allow write: if isAuth() && isAtivo() &&
        perfil() in ['admin', 'fiscal'];
    }
  }
}
```

---

## PARTE 3 — AUTOMAÇÕES E INTELIGÊNCIA

### Automações prioritárias (Cloud Functions)

#### AUTO-1 — Avançar status da competência

```typescript
// Trigger: quando tarefa é marcada como concluída
// Lógica: se todas as tarefas da competência estão concluídas → avança status

export const onTarefaConcluida = onDocumentUpdated(
  'tarefas/{tarefaId}',
  async (event) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()

    // Só age quando status muda para 'concluida'
    if (before?.status === after?.status) return
    if (after?.status !== 'concluida') return
    if (!after?.competenciaId) return

    const competenciaId = after.competenciaId
    const tarefasSnap = await db
      .collection('tarefas')
      .where('competenciaId', '==', competenciaId)
      .get()

    const todas = tarefasSnap.docs.map(d => d.data())
    const todasConcluidas = todas.every(
      t => t.status === 'concluida' || t.status === 'cancelada'
    )

    if (todasConcluidas) {
      await db.collection('competencias').doc(competenciaId).update({
        status: 'concluida',
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  }
)
```

#### AUTO-2 — Alerta de prazo crítico (48h)

```typescript
// Cron: diário às 07:00 BRT
// Lógica: busca tarefas vencendo em < 48h sem responsável ou com prioridade alta

export const alertasPrazoCritico = onSchedule('0 10 * * *', async () => {
  const agora = Timestamp.now()
  const em48h = Timestamp.fromMillis(agora.toMillis() + 48 * 60 * 60 * 1000)

  const snap = await db.collection('tarefas')
    .where('status', 'in', ['pendente', 'em_andamento'])
    .where('dataPrazo', '>=', agora)
    .where('dataPrazo', '<=', em48h)
    .get()

  for (const doc of snap.docs) {
    const tarefa = doc.data()
    // Criar notificação ou atualizar campo alertado
    await doc.ref.update({ alertaPrazo48h: true })
    // Futuramente: enviar push/email para responsavelId
  }
})
```

#### AUTO-3 — Gerar fechamento mensal automaticamente

```typescript
// Cron: dia 1 de cada mês às 06:00 BRT
export const gerarFechamentoMensal = onSchedule('0 9 1 * *', async () => {
  const agora = new Date()
  const mes = agora.getMonth() + 1
  const ano = agora.getFullYear()

  const [clientes, existentes] = await Promise.all([
    db.collection('clientes').where('status', '==', 'ativo').get(),
    db.collection('fechamentos')
      .where('mes', '==', mes).where('ano', '==', ano).get(),
  ])

  const existentesIds = new Set(existentes.docs.map(d => d.data().clienteId))
  const batch = db.batch()

  for (const doc of clientes.docs) {
    if (existentesIds.has(doc.id)) continue
    const c = doc.data()
    const ref = db.collection('fechamentos').doc()
    batch.set(ref, {
      clienteId: doc.id,
      clienteNome: c.razaoSocial,
      clienteCodigo: c.codigo ?? 0,
      mes, ano,
      regime: c.regimeTributario ?? 'simples_nacional',
      responsavel: c.responsavelNome ?? '',
      dasStatus: 'pendente',
      esocialStatus: 'na',
      reinfStatus: 'na',
      fgtsStatus: 'na',
      criadoEm: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
})
```

#### AUTO-4 — Detectar inadimplência crescente

```typescript
// Cron: toda segunda às 08:00
// Lógica: clientes com recebíveis atrasados > 30 dias → flag de risco

export const detectarInadimplencia = onSchedule('0 11 * * 1', async () => {
  const limite = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const snap = await db.collection('lancamentos')
    .where('tipo', '==', 'receita')
    .where('status', '==', 'pendente')
    .where('dataVencimento', '<', limite)
    .get()

  const porCliente: Record<string, { total: number; count: number }> = {}

  for (const doc of snap.docs) {
    const l = doc.data()
    if (!porCliente[l.clienteId]) porCliente[l.clienteId] = { total: 0, count: 0 }
    porCliente[l.clienteId].total += l.valor
    porCliente[l.clienteId].count += 1
  }

  // Atualizar campo de risco no cliente
  const batch = db.batch()
  for (const [clienteId, risco] of Object.entries(porCliente)) {
    if (risco.total > 500) { // threshold configurável
      batch.update(db.collection('clientes').doc(clienteId), {
        riscoInadimplencia: true,
        riscoValor: risco.total,
        riscoUpdatedAt: FieldValue.serverTimestamp(),
      })
    }
  }
  await batch.commit()
})
```

### Smart Insights — Lógica de detecção

```typescript
// lib/financeiro-prioridade.ts — já existe, expandir com:

// INSIGHT 1: Concentração de risco
export function topConcentracaoClientes(lancamentos, agora, top = 3) {
  // Já implementado — retorna top clientes com maior valor em atraso
}

// INSIGHT 2: Tendência de atraso (novo)
export function tendenciaAtraso(lancamentos: Lancamento[], meses = 3) {
  // Compara atraso médio dos últimos 3 meses
  // Retorna: crescendo | estável | melhorando
}

// INSIGHT 3: Cliente em risco de churn (novo)
export function clientesRiscoOperacional(
  tarefas: Tarefa[],
  competencias: Competencia[]
) {
  // Clientes com: competência em aberto há > 60 dias OU
  //              tarefas urgentes sem responsável há > 7 dias
  return clientes que precisam de atenção imediata
}
```

### Roadmap de IA (prioridade ordenada)

```
FASE 1 — Detecção de padrão (regras, não ML)
  ✓ Score SLA (já implementado)
  ✓ Score de cobrança (já implementado)
  → Detecção de inadimplência crescente
  → Alerta de competência esquecida

FASE 2 — Sugestões contextuais (heurísticas)
  → Sugerir responsável baseado em histórico do cliente
  → Sugerir prazo baseado em tipo de tarefa
  → Sugerir template de tarefa ao criar competência

FASE 3 — ML simples (classificação)
  → Prever probabilidade de pagamento dentro do prazo
  → Classificar urgência de tarefa por texto do título
  → Detectar anomalias no padrão de fechamento

FASE 4 — LLM integrado (Claude API)
  → Draft de mensagem de cobrança personalizada
  → Resumo automático da situação do cliente
  → Sugestão de próximos passos baseada em contexto
```
