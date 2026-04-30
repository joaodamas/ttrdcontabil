# UX Strategy + Design System — TTRD Contábil

> UX Strategist + UI Designer + Design System Architect  
> Versão 1.0 — 2026-04-30

---

## PARTE 1 — UX STRATEGY: SISTEMA ORIENTADO A AÇÃO

### Princípio fundacional

O usuário nunca deve pensar: "por onde começo?"  
O sistema sempre apresenta **uma próxima ação** — clara, contextualizada, priorizável.

### Os 3 estados mentais do contador

```
ESTADO 1 — "O que tenho para fazer hoje?"
  → Entrada: Cockpit (/hoje)
  → Saída: Tarefa executada ou delegada

ESTADO 2 — "Este cliente está em dia?"
  → Entrada: /clientes/[id]
  → Saída: Ação tomada OU registrada

ESTADO 3 — "O mês pode fechar?"
  → Entrada: /fechamento
  → Saída: Sign-off registrado
```

**Regra de design:** Cada tela pertence a exatamente um desses estados. Se servir a dois, está errada.

---

### Redesign do Cockpit como Centro de Controle

**Estrutura atual:** 11 blocos de conteúdo (veja UX Research)  
**Estrutura alvo:** 4 blocos com hierarquia clara

```
┌─────────────────────────────────────────────────────┐
│  BLOCO 1 — RESUMO DO DIA (KPIs)           [topo]    │
│  4 números: atrasadas / hoje / 7 dias / bloqueios   │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  BLOCO 2 — ALERTA CRÍTICO           [se existir]    │
│  1 banner: máximo 1 risco por vez (o mais grave)    │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  BLOCO 3 — FILA DE AÇÃO                 [centro]    │
│  Lista ordenada por score SLA                       │
│  Cada item: título, cliente, urgência, ações inline │
│  Checkbox por item + selecionar todas no topo       │
│  Ações em lote aparecem quando há seleção (sticky)  │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  BLOCO 4 — BLOQUEIOS DE FECHAMENTO      [rodapé]    │
│  Lista de clientes bloqueando o mês com 1-click CTA │
└─────────────────────────────────────────────────────┘
```

**Regra para o cockpit:** A fila de ação é a tela. Todo o resto é contexto.

---

### Padrão de Alertas

**Hierarquia de 4 níveis — nunca misturar:**

```
NÍVEL 1 — CRÍTICO (vermelho)
  Quando: tarefa urgente em atraso, bloqueio de fechamento, NFS-e rejeitada
  Formato: Banner full-width no topo da seção relevante
  Ação: sempre tem botão de resolução direto
  Limite: máximo 1 por tela ao mesmo tempo

NÍVEL 2 — ATENÇÃO (âmbar)
  Quando: prazo nas próximas 48h, lançamento vencendo hoje, parcial no fechamento
  Formato: InlineAlert dentro da seção relevante
  Ação: link para o item específico
  Limite: máximo 3 por tela

NÍVEL 3 — INFORMATIVO (azul)
  Quando: confirmação de ação, contexto adicional, insight não-urgente
  Formato: InsightStrip ou tooltip
  Ação: opcional

NÍVEL 4 — SUCESSO (verde)
  Quando: ação concluída, mês fechado, pagamento baixado
  Formato: toast (3 segundos) + estado visual persistente
  Ação: nenhuma (confirmação, não ação)
```

**Regra crítica:** Nunca use CRÍTICO para informação. Se tem alerta vermelho, tem ação obrigatória.

---

### Status Colors — Hierarquia Semântica

```
OPERACIONAL:
  pendente     → cinza neutro    (bg-muted)
  em_andamento → azul info       (bg-info/10 text-info)
  concluida    → verde sucesso   (bg-success/10 text-success)
  cancelada    → cinza riscado   (bg-muted line-through)

PRIORIDADE (DIFERENTE de status):
  baixa   → cinza/borda         (sem cor de destaque)
  normal  → amarelo suave       (bg-primary/10)
  alta    → âmbar               (bg-amber-500/10 text-amber-700)
  urgente → vermelho pulsante   (bg-destructive/10 + dot animado)

FINANCEIRO:
  pago      → verde             (bg-success/10)
  pendente  → neutro            (bg-muted)
  atrasado  → vermelho          (bg-destructive/10 + bold)
  cancelado → riscado           (line-through opacity-60)

FISCAL:
  emitida   → verde
  pendente  → neutro
  rejeitada → vermelho
  cancelada → cinza
  erro      → vermelho bold

SAÚDE DO CLIENTE (3 dots no card):
  ok      → ● verde  (bg-success)
  atencao → ● âmbar  (bg-warning)
  risco   → ● vermelho pulsante (bg-destructive animate-pulse)
```

---

### Interação: O que acontece no clique

```
ITEM DE TAREFA NO COCKPIT:
  → Click na linha   = abre painel lateral (sheet) com detalhes
  → Click "Concluir" = ação imediata + toast + remove da fila
  → Click "..." menu = reatribuir / alterar prazo / ver no detalhe

ITEM DE CLIENTE NA LISTA:
  → Click na linha   = vai para /clientes/[id] (não modal)
  → Click no "⋮"     = ações rápidas (nova tarefa, novo lançamento)

ITEM NA FILA DE COBRANÇA:
  → Click no valor   = expande detalhes inline
  → Click "Baixar"   = confirmation dialog para valores > R$ 500
  → Click "Cobrar"   = abre draft de mensagem

ITEM DE FECHAMENTO:
  → Click no status  = dropdown para alterar (pendente → parcial → enviado → ok)
  → Click no cliente = vai para /clientes/[id] na seção fiscal
```

---

### Redução de Cliques — Mapeamento

| Fluxo atual | Cliques | Fluxo alvo | Cliques |
|---|---|---|---|
| Concluir tarefa no cockpit | 1 (sem confirmação) | Concluir tarefa normal | 1 |
| Concluir tarefa urgente/fiscal | 1 (sem confirmação) | Concluir tarefa urgente | 2 (confirm) |
| Reatribuir tarefa | 3 (select + apply + reload) | Reatribuir inline | 1 (select) + auto-save |
| Ver status do cliente | 3 (lista → click → tab) | Ver status na lista | 0 (visível na linha) |
| Cobrar cliente atrasado | 4 (financeiro → filtrar → encontrar → baixar) | Fila de cobrança → baixar | 2 |
| Mudar status de fechamento | 2 (cell click + dropdown) | Click direto no status | 2 (manter) |

---

### UX States — Obrigatórios em toda tela

```typescript
// Padrão obrigatório para toda tela com dados assíncronos

// LOADING — skeleton, não spinner
// Use skeleton com formato similar ao conteúdo real
// Nunca use Loader2 nu no centro da página

// EMPTY — com CTA e contexto
// Nunca exibir apenas "Nenhum resultado"
// Sempre explicar POR QUÊ está vazio e O QUE FAZER

// ERROR — com retry e diagnóstico
// Exibir mensagem específica (não "Algo deu errado")
// Botão "Tentar novamente" sempre presente
// Para erros de permissão: mensagem diferente + contato admin

// SUCCESS — toast (3s) + estado visual
// Para ações críticas (baixa, sign-off): persistir estado visualmente
// Nunca apenas toast para ações importantes

// PARTIAL — quando dados carregam em partes
// Exibir o que já chegou, indicar o que ainda carrega
// Não bloquear a tela inteira por dados secundários
```

---

## PARTE 2 — DESIGN SYSTEM

### Layout Base

```
┌─────────────────────────────────────────────────────────────┐
│ SIDEBAR (220px / 60px collapsed)                            │
│  Dark background: oklch(0.11 0 0)                           │
│  Brand yellow: oklch(0.82 0.18 88) = #F5C200               │
├──────────────────────────────────────────────────────────────┤
│ TOPBAR (56px)                                                │
│  Breadcrumbs left | Quick action button right               │
├──────────────────────────────────────────────────────────────┤
│ MAIN CONTENT                                                 │
│  max-w-[1280px] mx-auto px-6 py-6                          │
│  Background: oklch(0.96 0 0) — off-white, cards pop         │
└──────────────────────────────────────────────────────────────┘
```

### Tipografia — Escala e Uso

```
HEADING PÁGINA:     text-2xl font-bold tracking-tight     → Dashboard, títulos de seção
SUBHEADING:         text-lg font-semibold                 → Cards principais
BODY:               text-sm (0.875rem)                    → Todo conteúdo de tabela
META / LABEL:       text-xs (0.75rem)                     → Datas, subtítulos, helpers
SECTION LABEL:      text-[0.6875rem] font-semibold uppercase tracking-wider → Headers de tabela
METRIC HERO:        clamp(2rem, 4vw, 3rem) font-bold tabular-nums → KPIs grandes
```

### Spacing — Grid de 4px

```
gap-1  = 4px   → Entre elementos internos (ícone + texto)
gap-2  = 8px   → Entre campos de formulário relacionados
gap-3  = 12px  → Entre cards numa grade
gap-4  = 16px  → Entre seções dentro de um card
gap-6  = 24px  → Entre blocos principais de conteúdo (stack-6)
gap-8  = 32px  → Entre seções de página distintas
```

### Componentes — Especificações

#### CARD
```
bg-card (oklch(1 0 0)) — branco puro
border border-border/60
border-radius: var(--radius-xl) = 0.875rem
shadow: 0 1px 3px rgba(0,0,0,0.07)
hover: translateY(-1px) + shadow elevada
```

#### BUTTON — Hierarquia de 4 níveis
```
PRIMARY (default):   bg-primary text-primary-foreground  → 1 por contexto
SECONDARY (outline): border + transparent bg              → CTAs secundários
GHOST:               hover bg only                        → Ações terciárias
DESTRUCTIVE:         bg-destructive                       → Ações irreversíveis apenas
```

#### TABLE
```
Header: bg-muted/40, section-label class
Rows: divide-y divide-border/60, hover:bg-muted/20
Primeira coluna: font-medium (identidade)
Colunas de dados: text-muted-foreground text-xs/sm
Coluna de ação: w-10, ChevronRight no hover
```

#### MODAL — Padrão Full/Large
```
Estrutura obrigatória:
  DialogHeader:
    - Título (text-lg font-semibold)
    - Subtítulo opcional (text-sm text-muted-foreground)
    - Botão X (close)
  
  DialogContent (scrollable):
    - Formulário ou informação
    - Validação inline (não toast)
  
  DialogFooter (sticky bottom):
    - Cancelar (outline, esquerda)
    - Ação primária (default, direita)
    - Texto de confirmação se destrutivo

Tamanho: max-w-2xl para forms simples, max-w-4xl para forms complexos
Nunca usar modal para informação simples — use toast ou inline
```

#### FILTER BUTTON — Padrão unificado
```
Ativo:   bg-foreground text-background border-foreground
Inativo: bg-background text-muted-foreground border-border hover:text-foreground
Tamanho: h-8 px-3 text-xs font-medium rounded-md
```

#### INLINE BADGE — Substituir Badge component onde possível
```
Estrutura: rounded-full border px-2 py-0.5 text-xs font-medium
Status dot (opcional): 6px rounded-full inline-block
Cores: semantic via CSS vars (bg-success/10, bg-destructive/10, etc.)
Nunca usar cores Tailwind hardcoded (bg-green-100, bg-red-100)
```

### Design Tokens — Referência

```css
/* Cores semânticas — usar SEMPRE em vez de cores hardcoded */
--primary:     oklch(0.82 0.18 88)    /* amarelo TTRD */
--success:     oklch(0.52 0.15 145)   /* verde */
--warning:     oklch(0.72 0.15 70)    /* âmbar */
--destructive: oklch(0.577 0.245 27)  /* vermelho */
--info:        oklch(0.55 0.14 240)   /* azul */
--muted:       oklch(0.94 0 0)        /* cinza claro */

/* Sidebar (dark) */
--sidebar:     oklch(0.11 0 0)
--sidebar-primary: oklch(0.82 0.18 88)

/* Backgrounds */
--background:  oklch(0.96 0 0)   /* page — off-white */
--card:        oklch(1 0 0)      /* cards — branco puro */
```

### Figma — Estrutura de Componentes

```
📁 Foundations
  ├── Colors (tokens semânticos)
  ├── Typography (escala + pesos)
  ├── Spacing (4px grid)
  └── Radius

📁 Components / Base
  ├── Button (4 variantes × 3 tamanhos)
  ├── Badge / InlineBadge
  ├── Input / Select / Textarea
  ├── Card (default, shadow, hover)
  └── Skeleton (table row, KPI, list item)

📁 Components / Feedback
  ├── InlineAlert (4 tons)
  ├── RiskBanner (3 severidades)
  ├── EmptyState (com e sem CTA)
  └── Toast (success, error, info)

📁 Components / Data
  ├── TableRow (com e sem ações)
  ├── KpiCard (stable, up, down)
  ├── PriorityList item (4 severidades)
  └── Timeline item (done, pending)

📁 Templates
  ├── List page (header + filters + table)
  ├── Detail page (header + 70/30 grid)
  ├── Cockpit page (4 blocos)
  └── Form modal (header + content + footer)
```

---

## CHECKLIST DE QUALIDADE VISUAL

Antes de qualquer deploy, verificar:

```
□ Não há cores hardcoded (bg-green-*, bg-red-*, text-yellow-*)
□ Todos os estados têm loading skeleton (não Loader2 nu)
□ Empty states têm CTA quando aplicável
□ Erros têm retry button e mensagem específica
□ Ações destrutivas têm confirmação proporcional
□ Tabelas têm section-label nos headers
□ Badges usam InlineBadge com CSS vars
□ Filtros ativos são visualmente distintos (bg-foreground não bg-primary)
□ Modais têm header/content/footer estruturado
□ Toast aparece para ações de sucesso
```
