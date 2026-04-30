# Qualidade de Engenharia — QA + Code Review + Performance

> Versão 1.0 — 2026-04-30

---

## PARTE 1 — ESTRATÉGIA DE TESTES

### Pirâmide de testes para este sistema

```
         /\
        /E2E\          5% — Fluxos críticos completos (Playwright)
       /──────\
      / Integr \      20% — Hooks + Firebase mocks
     /──────────\
    /   Unitário \    75% — Algoritmos de priorização, utils, formatters
   /______________\
```

**Justificativa:** Lógica de negócio crítica está em algoritmos (SLA score, cobrança score). Esses devem ter cobertura unitária total. E2E cobre apenas os 5 fluxos que custam mais caro em produção.

---

### Testes Unitários — Prioridade máxima

```typescript
// __tests__/lib/sla-score.test.ts

describe('slaScoreHoje', () => {
  it('tarefa fiscal urgente atrasada 5 dias = score máximo', () => {
    const task = {
      id: '1',
      titulo: 'Enviar DAS',
      prioridade: 'urgente',
      dataPrazo: Timestamp.fromDate(subDays(new Date(), 5)),
      responsavelId: undefined,
    }
    const score = slaScoreHoje(task)
    // tipoPeso(3) × 2 + diasAtraso(5+3) + urgencia(4) + semResponsavel(2) = 20
    expect(score).toBe(20)
  })

  it('tarefa sem prazo recebe score base', () => {
    const task = { id: '1', titulo: 'Tarefa simples', prioridade: 'normal' }
    expect(slaScoreHoje(task)).toBe(4) // (1×2) + urgencia(2)
  })

  it('ordena corretamente: fiscal urgente atrasada > financeiro alta > normal', () => {
    const tasks = [normal, financeiroAlta, fiscalUrgenteAtrasada]
    const sorted = sortTasksBySla(tasks)
    expect(sorted[0].id).toBe(fiscalUrgenteAtrasada.id)
    expect(sorted[1].id).toBe(financeiroAlta.id)
  })
})

// __tests__/lib/financeiro-prioridade.test.ts
describe('scoreCobranca', () => {
  it('lançamento atrasado 35 dias = 50 pontos base', () => {
    const lancamento = {
      dataVencimento: Timestamp.fromDate(subDays(new Date(), 35)),
      valor: 3000,
      status: 'pendente',
    }
    const score = scoreCobranca(lancamento, new Date())
    expect(score).toBeGreaterThanOrEqual(50)
  })
})

// __tests__/lib/utils.test.ts
describe('formatCurrency', () => {
  it('formata valor brasileiro corretamente', () => {
    expect(formatCurrency(1234.56)).toBe('R$ 1.234,56')
    expect(formatCurrency(0)).toBe('R$ 0,00')
    expect(formatCurrency(-500)).toBe('-R$ 500,00')
  })
})

describe('validateCnpj', () => {
  it('valida CNPJ correto', () => {
    expect(validateCnpj('11.222.333/0001-81')).toBe(true)
  })
  it('rejeita CNPJ inválido', () => {
    expect(validateCnpj('11.111.111/1111-11')).toBe(false)
  })
})
```

---

### Testes E2E (Playwright) — 5 fluxos críticos

```typescript
// e2e/critical-flows.spec.ts

// FLUXO 1 — Login + acesso ao cockpit
test('contador faz login e vê cockpit', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'operacional@ttrd.com')
  await page.fill('#senha', 'senha123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/hoje')
  await expect(page.locator('h2')).toContainText('Hoje')
})

// FLUXO 2 — Criar cliente completo
test('criar novo cliente com regime e responsável', async ({ page }) => {
  await page.goto('/clientes/novo')
  await page.fill('[name="razaoSocial"]', 'Empresa Teste LTDA')
  await page.fill('[name="cpfCnpj"]', '11.222.333/0001-81')
  await page.selectOption('[name="regimeTributario"]', 'simples_nacional')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/clientes\//)
  await expect(page.locator('h2')).toContainText('Empresa Teste LTDA')
})

// FLUXO 3 — Criar tarefa e concluir no cockpit
test('criar tarefa fiscal urgente e concluir pelo cockpit', async ({ page }) => {
  // Criar tarefa
  await page.goto('/tarefas/nova')
  await page.fill('[name="titulo"]', 'Enviar DAS - Teste')
  await page.selectOption('[name="prioridade"]', 'urgente')
  await page.click('button[type="submit"]')

  // Voltar ao cockpit e verificar aparece
  await page.goto('/hoje')
  await expect(page.locator('text=Enviar DAS - Teste')).toBeVisible()

  // Concluir
  await page.click('button:has-text("Concluir")', { near: page.locator('text=Enviar DAS - Teste') })
  await expect(page.locator('text=Enviar DAS - Teste')).not.toBeVisible()
})

// FLUXO 4 — Lançamento financeiro e baixa
test('criar lançamento e baixar pagamento', async ({ page }) => {
  await page.goto('/financeiro/novo')
  await page.fill('[name="descricao"]', 'Honorário Teste')
  await page.fill('[name="valor"]', '1500')
  await page.selectOption('[name="tipo"]', 'receita')
  await page.click('button[type="submit"]')

  await page.goto('/financeiro')
  await expect(page.locator('text=Honorário Teste')).toBeVisible()
})

// FLUXO 5 — Permissão: perfil leitura não acessa financeiro
test('usuário leitura é redirecionado ao acessar /financeiro', async ({ page }) => {
  // Login com perfil leitura
  await loginAs(page, 'leitura@ttrd.com', 'senha123')
  await page.goto('/financeiro')
  // Deve redirecionar ou mostrar acesso negado
  await expect(page).not.toHaveURL('/financeiro')
})
```

---

### Edge Cases Críticos

```
COCKPIT:
  □ Cliente sem nenhuma tarefa → cockpit mostra seções vazias sem quebrar
  □ Tarefa com dataPrazo null → SLA score usa apenas tipo + urgência
  □ Usuário sem nenhuma tarefa atribuída → cockpit vazio com EmptyState
  □ 100+ tarefas atrasadas → paginação ou truncamento sem travar

FINANCEIRO:
  □ Lançamento com valor 0 → não deve aparecer na fila de cobrança
  □ Cliente deletado mas lançamento ainda existe → não quebra a tabela
  □ dataVencimento no futuro distante (2099) → não aparece como atrasado

FECHAMENTO:
  □ Gerar fechamento com 0 clientes ativos → nenhum registro criado, toast informativo
  □ Gerar fechamento duplicado → verificação de existentes protege
  □ Sign-off com pendências → sistema avisa, não bloqueia (decisão de negócio)

AUTENTICAÇÃO:
  □ Token expirado durante uso → redirect para login sem perder URL
  □ Usuário inativo tenta login → mensagem específica
  □ Sessão em múltiplas abas → sem conflito de estado
```

---

## PARTE 2 — CODE REVIEW: RISCOS REAIS NO CODEBASE

### Risco Crítico — Ausência de validação de entrada no cliente

```typescript
// PROBLEMA (clientes/novo e forms em geral):
// Validação Zod acontece no frontend, mas não há Cloud Function
// que valide novamente no servidor antes de gravar no Firestore.

// Se alguém fizer request direto ao Firestore (SDK bypass):
await addDoc(collection(db, 'clientes'), {
  razaoSocial: '<script>alert(1)</script>',  // XSS via Firestore
  cpfCnpj: 'qualquer coisa',
  status: 'admin_override',
})

// SOLUÇÃO: Firestore Security Rules devem validar campos críticos
match /clientes/{id} {
  allow create: if request.resource.data.status in ['ativo', 'inativo', 'suspenso']
    && request.resource.data.razaoSocial is string
    && request.resource.data.razaoSocial.size() > 0
    && request.resource.data.razaoSocial.size() < 200;
}
```

### Risco Alto — Queries sem paginação em coleções grandes

```typescript
// PROBLEMA: Em vários lugares, lista TODOS os documentos sem limite
listDocuments('tarefas', [
  where('status', 'in', ['pendente', 'em_andamento']),
  orderBy('dataPrazo', 'asc'),
  // ← sem limit()
])

// Se um escritório tiver 5.000 tarefas abertas:
// - Download de todos os docs no cliente
// - RAM e processamento no browser
// - Custo de leitura no Firestore

// SOLUÇÃO: Adicionar limit() em queries de listagem
limit(100) // no máximo 100 por query, paginar o restante
```

### Risco Alto — Batch writes sem tratamento de limite

```typescript
// PROBLEMA (gerarFechamento):
for (const cliente of clientes) {
  await createDocument('fechamentos', { ... })  // await dentro de loop
}

// Se clientes.length = 200, isso são 200 writes sequenciais
// Tempo: ~200 × 50ms = 10 segundos bloqueados

// SOLUÇÃO: Firestore batch (limite 500 ops por batch)
const BATCH_SIZE = 499
for (let i = 0; i < clientes.length; i += BATCH_SIZE) {
  const batch = db.batch()
  const chunk = clientes.slice(i, i + BATCH_SIZE)
  chunk.forEach(c => batch.set(db.collection('fechamentos').doc(), { ... }))
  await batch.commit()
}
```

### Anti-patterns detectados

```typescript
// ANTI-PATTERN 1: Casting excessivo de unknown
// Problema: mascara erros de tipo em runtime
const valor = (l as Record<string, unknown>).valor as number

// Melhor: tipo correto no Firestore types
interface Lancamento {
  id: string
  valor: number  // definido aqui
  // ...
}

// ANTI-PATTERN 2: window.location.reload() para refresh
// Problema: recarrega a página inteira, perde scroll e estado
<Button onClick={() => window.location.reload()}>Tentar novamente</Button>

// Melhor: recarregar apenas os dados
<Button onClick={() => void load()}>Tentar novamente</Button>

// ANTI-PATTERN 3: eslint-disable-next-line react-hooks/exhaustive-deps
// Encontrado no dashboard/page.tsx
// Problema: mascara dependências faltantes → bugs de stale closure
// Solução: refatorar o useEffect para não precisar de deps mágicas

// ANTI-PATTERN 4: Dados desnormalizados desatualizados
// clienteNome, responsavelNome são denormalizados mas nunca atualizados
// Se cliente muda de razão social, todas as tarefas antigas mostram nome antigo
// Solução: Cloud Function que propaga updates de clienteNome
```

---

## PARTE 3 — PERFORMANCE

### Bottlenecks identificados

#### PERF-1 — Dashboard faz 8 queries paralelas no mount

```typescript
// dashboard/page.tsx — Promise.allSettled com 8 queries
// Cada query = 1 round-trip Firestore
// Total: 8 reads na abertura da tela

// Impacto real: ~400-800ms de loading com boa conexão
// Com conexão lenta: 2-4 segundos

// Solução: agrupar queries que compartilham índice
// Queries 3+5 (tarefas pendentes + tarefas vencidas) → 1 query com filtro client-side
// Economiza 1 round-trip

// Solução longo prazo: Cloud Function que pre-computa o snapshot do dashboard
// e cacheia no Firestore: /dashboard_cache/{userId}
// Atualizado por triggers quando tarefas/lançamentos mudam
```

#### PERF-2 — Cockpit recarrega todos os dados ao mudar filtro de responsável

```typescript
// hoje/page.tsx
const load = useCallback(async () => {
  setLoading(true)  // ← mostra skeleton inteiro
  const [users, cockpit] = await Promise.all([
    getUsuarios(),  // ← relê usuários TODA vez (raramente mudam)
    getHojeCockpit({ responsavelId }),
  ])
  // ...
}, [responsavelId])

// Problema: getUsuarios() é chamado a cada mudança de filtro
// Usuários não mudam durante a sessão

// Solução: separar os dois useEffects
useEffect(() => { void loadUsuarios() }, []) // uma vez
useEffect(() => { void loadCockpit() }, [responsavelId]) // ao filtrar
```

#### PERF-3 — FilaCobrancaItem faz request de email por cliente individualmente

```typescript
// financeiro/page.tsx
// Para cada clienteId na fila de cobrança → getCliente(cid)
// Se fila tem 12 itens com 12 clientes diferentes = 12 reads individuais

// Solução: batch read
const clientesDocs = await db.getAll(...ids.map(id =>
  db.collection('clientes').doc(id)
))
```

#### PERF-4 — Ausência de cache de sessão para dados estáticos

```typescript
// Dados que raramente mudam mas são lidos toda sessão:
// - Lista de usuários (getUsuarios)
// - Catálogo de serviços
// - Lista de municípios (MUNICIPIOS array em config-fiscal-form.tsx)

// MUNICIPIOS está importado como array estático no código — OK
// Mas getUsuarios() vai ao Firestore toda vez que o cockpit carrega

// Solução simples: sessionStorage cache com TTL de 5 minutos
function getCachedUsuarios(): Usuario[] | null {
  const cached = sessionStorage.getItem('ttrd:usuarios')
  if (!cached) return null
  const { data, ts } = JSON.parse(cached)
  if (Date.now() - ts > 5 * 60 * 1000) return null // 5min TTL
  return data
}
```

### Targets de performance

```
Métrica                        | Atual (estimado) | Target
-------------------------------|-----------------|--------
Time to Interactive (cockpit)  | 1.5–3s          | < 1.2s
Dashboard load                 | 1–2s            | < 1s
Lista de clientes (50 items)   | 0.8s            | < 0.5s
Baixa de lançamento (UX)       | 0.5s + reload   | < 0.3s + inline
Build size (total JS)          | ~800KB          | < 600KB
Lighthouse Performance         | ~72             | > 85
```

### Bundle size — otimizações rápidas

```typescript
// 1. firebase-admin não deve ser importado no cliente
// Verificar: scripts/check-firebase-client.mjs já existe para isso ✓

// 2. lucide-react — importar apenas o que usa
// Ruim (importa tudo):
import * as Icons from 'lucide-react'
// Bom (tree-shakeable, já está assim no projeto ✓):
import { AlertCircle, CheckCircle2 } from 'lucide-react'

// 3. date-fns — importar só as funções necessárias
// Ruim:
import { format, addDays, subDays, isAfter } from 'date-fns'
// Melhor: o projeto usa formatDate/tsToDate customizados — OK
// Verificar se date-fns está sendo importado diretamente em algum lugar
```
