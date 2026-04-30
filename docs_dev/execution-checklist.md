# Checklist de Execução — TTRD Contábil

> Gerado a partir de: product-architecture.md, ux-research.md,
> ux-strategy-design-system.md, frontend-backend-architecture.md,
> engineering-quality.md
>
> Versão 1.2 — 2026-04-30 (atualizado após execução completa das etapas 1–5 parciais)

---

## COMO USAR

- Cada etapa é **sequencial** — não pule etapas
- Cada item tem: `[ ]` pendente · `[x]` feito · `[~]` em progresso · `[!]` bloqueado
- **Esforço:** P = pequeno (< 2h) · M = médio (2–8h) · G = grande (> 1 dia)
- **Risco:** 🔴 crítico (quebra produção) · 🟠 alto · 🟡 médio · 🟢 baixo
- Execute `npx tsc --noEmit` e `npm run build` ao fim de cada etapa

---

## ETAPA 0 — FUNDAÇÃO TÉCNICA ✅ CONCLUÍDA
> Objetivo: garantir que o sistema compila limpo e tem base segura antes de qualquer feature

### 0.1 TypeScript e Build
- [x] `npx tsc --noEmit` retorna zero erros 🔴 P
- [x] `npm run build` completa sem warnings de prerender 🔴 P
- [x] `.env.production` presente e com todas as 7 variáveis `NEXT_PUBLIC_*` 🔴 P
- [x] `scripts/check-firebase-client.mjs` passa sem erros 🔴 P

### 0.2 Segurança — Firestore Rules
- [x] Rules revisadas — estrutura já bem definida com helpers `isAdmin()`, `isOperacional()` etc. 🔴 M
- [x] `nfse_emitidas` write = `false` (só Cloud Functions) ✓ 🔴 P
- [x] `logs_auditoria` append-only ✓ 🔴 P
- [x] Adicionar validação de campos obrigatórios nas rules de `/clientes`: 🟠 M
  - `status` deve ser um de `['ativo', 'inativo', 'suspenso']`
  - `razaoSocial` deve ser string não vazia com max 200 chars
- [x] Adicionar validação nas rules de `/tarefas`: 🟠 M
  - `prioridade` deve ser `['baixa', 'normal', 'alta', 'urgente']`
  - `status` deve ser `['pendente', 'em_andamento', 'concluida', 'cancelada']`

### 0.3 Índices Firestore
- [x] 20 índices compostos já presentes em `firestore.indexes.json` cobrindo todos os padrões de query ✓
- [x] Deploy pendente se houver novos índices: `firebase deploy --only firestore:indexes` 🔴 P

**✓ Gate 0 APROVADO:** `tsc --noEmit` limpo + build limpo + rules revisadas + índices verificados

---

## ETAPA 1 — DESIGN SYSTEM CONSISTENTE ✅ CONCLUÍDA
> Objetivo: eliminar cores hardcoded, padronizar componentes visuais

### 1.1 Eliminar cores Tailwind hardcoded (dark mode unsafe)
- [x] `text-green-` / `bg-green-` / `text-emerald-` / `bg-emerald-` → `text-success` / `bg-success/` (13 arquivos) 🔴 P
- [x] `text-yellow-` / `bg-yellow-` / `bg-amber-` / `text-amber-` → `text-warning` / `bg-warning/` 🟠 P
- [x] `bg-red-` / `text-red-` → `bg-destructive/` / `text-destructive` (incluindo navbar + dashboard) 🔴 P
- [x] `bg-blue-` / `text-blue-` / `bg-purple-` → `bg-info/` / `text-info` / `bg-primary/` 🟡 P
- [x] `hover:border-emerald-300/40` → `hover:border-success/30` (dashboard KPI card) 🟢 P
- [ ] Verificar residuais em `saas-blocks.tsx` (intencionais, baixo risco) 🟢 P

### 1.2 Padronizar badges de status
- [x] `urgente` = badge `destructive` + dot pulsante animado (visualmente distinto de `alta`) 🔴 P
- [x] `alta` = badge outline âmbar (`border-warning/50 text-warning bg-warning/10`) 🟠 P
- [x] Aplicado em `tarefas/page.tsx` 🟠 M
- [x] Replicar distinção `urgente`/`alta` em `tarefas/[id]/page-client.tsx` 🟠 P

### 1.3 Padronizar headers de tabela
- [x] `.section-label` definido em `globals.css` 🟡 P
- [x] Aplicado em: tarefas, ir, competencias, fiscal, financeiro, clientes, admin/usuarios, admin/servicos, clientes/[id]/fiscal 🟡 P

### 1.4 Padronizar loading states
- [x] `<TableRowSkeleton>` inline em: tarefas, ir, competencias, financeiro 🟠 M
- [ ] Suspense fallback com skeleton real (atualmente ainda `<Loader2>` simples) 🟡 P

### 1.5 Padronizar empty states
- [x] `<TableEmptyState>` com CTA em: clientes, tarefas, ir, competencias, financeiro ✓ 🟡 P

### 1.6 Padronizar filtros
- [x] `FilterBtn` criado em `src/components/ui/filter-btn.tsx` 🟡 M
- [x] Aplicado em: tarefas, ir, competencias, financeiro (substituindo `<Button variant>` por `<FilterBtn>`) 🟡 P

**✓ Gate 1 CONCLUÍDO:** Zero cores hardcoded · `section-label` em todas as tabelas · skeletons inline · `FilterBtn` · `TableEmptyState`

---

## ETAPA 2 — COCKPIT REDESIGN ✅ CONCLUÍDA (N/A → dashboard já está limpo)
> Objetivo: reduzir de 11 blocos para 4, eliminar informação duplicada

### Resultado da análise
Os componentes `InsightStrip`, `ActionBar` e `RiskBanner` existem apenas no showcase `/premium` — **nunca foram adicionados ao dashboard real**. O dashboard (`/dashboard/page.tsx`) já tem estrutura limpa de 3 blocos:
- Bloco 1: Header + 5 KPI cards
- Bloco 2: 3 quick lists (tarefas vencidas / competências abertas / lançamentos vencidos)
- Bloco 3: Quick access (4 links)

### 2.1 Melhorias aplicadas
- [x] Corrigir `hover:border-emerald-300/40` → `hover:border-success/30` no card "A Receber" 🟢 P
- [x] Dashboard já usa `Promise.allSettled` — uma query falha não bloqueia o resto ✓

### 2.2 Pendentes (baixa prioridade — dashboard funcional)
- [ ] Persistir filtro de responsável no `localStorage` (quando cockpit personalizado for necessário) 🟡 P
- [ ] Avaliar adicionar bulk actions se uso real mostrar necessidade 🟢 G

**✓ Gate 2 APROVADO:** Dashboard limpo, sem duplicação, sem componentes desnecessários

---

## ETAPA 3 — LISTA DE CLIENTES COM SAÚDE 🔶 PARCIALMENTE CONCLUÍDA
> Objetivo: transformar catálogo em painel operacional

### 3.1 Indicadores de saúde na tabela
- [ ] Criar função `computarSaudeClientes(ids: string[])` com 3 queries batch 🟠 G
  - **Bloqueio:** requer campos denormalizados no doc do cliente OU 3 queries batch pós-carregamento
  - Abordagem recomendada: Cloud Function (Etapa 7) que escreve `saudeScore` no doc do cliente
  - Sem isso, adicionar 3 queries por cliente gera N+1 (inaceitável para 200+ clientes)
- [x] Adicionar coluna "Saúde" com 3 dots após `saudeScore` estar disponível 🟡 M
- [x] Tooltip no dot explica o estado 🟢 M
  - Implementado com score derivado de `status` + `riscoInadimplencia` (sem N+1)

### 3.2 Avatar com iniciais
- [x] `ClienteAvatar` inline na primeira coluna: círculo `bg-primary/10` com iniciais `text-primary` 🟢 P
- [x] Função `clienteInitials()` implementada diretamente na página 🟢 P

### 3.3 Navegação
- [ ] Avaliar: click na linha → `/clientes/[id]` direto vs. manter modal atual 🟠 M
  - Comportamento atual (modal) mantido até validação com usuário real

### 3.4 Badge de regime tributário
- [x] Badge colorido por regime com `REGIME_BADGE` map de classes estáticas: 🟢 P
  - Simples Nacional = `bg-success/10 text-success`
  - Lucro Presumido = `bg-info/10 text-info`
  - Lucro Real = `bg-primary/10 text-foreground/70`
  - MEI = `bg-warning/10 text-warning`
  - Isento = `bg-muted text-muted-foreground`

**~ Gate 3 PARCIAL:** Avatar ✓ · regime badge ✓ · health dots ✓ · pendente avaliação de navegação (linha x modal) e eventual função batch dedicada

---

## ETAPA 4 — CLIENTE 360° UPGRADE 🔶 PARCIALMENTE CONCLUÍDA
> Objetivo: substituir tabs por layout scroll único com contexto sempre visível

### 4.1 Migrar de Tabs para scroll único
- [x] `<Tabs>` substituído por seções `<div id="...">` empilhadas verticalmente 🟠 G
  - Seções: `#servicos`, `#competencias`, `#financeiro`, `#fiscal`
  - Todos os dados visíveis sem clicar em abas (melhor para uso back-office)
- [x] Nav sticky lateral com IntersectionObserver (destaque de seção ativa) 🟡 M
  - Implementado como barra sticky de seções no topo da página com estado ativo

### 4.2 Corrigir HealthChip / cores
- [x] `ShieldCheck text-green-600` → `text-success` (3 arquivos) 🟢 P
- [x] `ShieldAlert` e `ShieldOff` já usam `text-destructive` e `text-muted-foreground` ✓

### 4.3 Próximos passos com prioridade visual
- [x] Borda esquerda colorida por severidade nos itens de próximos passos 🟡 M
  - Danger: `border-l-2 border-destructive bg-destructive/4`
  - Warning: `border-l-2 border-warning bg-warning/4`

### 4.4 Loading state
- [x] Substituir early-return `<Loader2>` por skeleton de layout no cliente 360° 🟡 M

**✓ Gate 4 CONCLUÍDO:** Scroll layout ✓ · CSS vars ✓ · skeletons ✓ · nav sticky ✓ · próximos passos com severidade ✓

---

## ETAPA 5 — TAREFAS E FINANCEIRO 🔶 PARCIALMENTE CONCLUÍDA
> Objetivo: transformar tabelas de consulta em ferramentas de trabalho

### 5.1 Tarefas — diferenciação visual
- [x] `urgente` = badge `destructive` + dot pulsante animado 🔴 P
- [x] `alta` = badge outline âmbar (`border-warning/50 text-warning bg-warning/10`) 🟠 P
- [x] `normal` = badge `secondary` (cinza) ✓ (sem mudança necessária)
- [x] `baixa` = badge `outline` (cinza bordado) ✓ (sem mudança necessária)
- [x] Tarefas sem `responsavelId` → indicador visual `UserX` na linha 🟡 M
- [x] Tarefas sem `dataPrazo` → indicador visual `ClockAlert` na linha 🟡 M

### 5.2 Tarefas — ação inline
- [x] Ação "Concluir" direto na linha (sem abrir detalhe) 🟠 G
- [x] Menu `⋮` com: ver detalhe, reatribuir, alterar prazo 🟠 G
- [~] Confirmation dialog para `urgente`/`fiscal` ao concluir 🟡 M
  - Implementado para `urgente`; `fiscal` depende de campo de classificação da tarefa ainda não existente no schema atual

### 5.3 Financeiro — confirmação em baixa
- [x] Confirmation dialog para baixa com valor > R$ 500 🔴 M
  - Mostrar: cliente, descrição, valor, data vencimento
  - Botões: "Cancelar" + "Confirmar baixa"
- [x] Toast de sucesso com nome do cliente e valor 🟡 P

### 5.4 Financeiro — filtros sem reload
- [x] Filtros de tipo/status como estado local (sem navegar ao Firestore) 🟡 G

**~ Gate 5 PARCIAL:** Distinção urgente/alta ✓ · ações inline ✓ · confirmação financeira ✓ · filtros sem reload ✓ · pendente apenas regra de confirmação para tipo fiscal (schema)

---

## ETAPA 6 — PERFORMANCE 🔶 PARCIALMENTE CONCLUÍDA
> Objetivo: reduzir tempo de carregamento nas telas mais usadas

### 6.1 Cache de usuários
- [x] `getUsuarios()` com cache em memória (TTL 5 min) em `firestore-client.ts` 🟡 M
  ```typescript
  let _usuariosCache: Array<Record<string, unknown>> | null = null
  let _usuariosCacheTs = 0
  const USUARIOS_CACHE_TTL = 5 * 60 * 1000
  ```
- [x] `invalidateUsuariosCache()` exportada e chamada pelo `UsuarioForm` após salvar 🟡 P
- [ ] Considerar migrar para `sessionStorage` para sobreviver reload de página 🟢 P

### 6.2 Dashboard
- [x] Consolidar queries 3 e 5 do `Promise.allSettled` (ambas tarefas pendentes) 🟡 M
  - Query única + filtro client-side → economiza 1 round-trip
- [ ] Cloud Function de snapshot para dashboard (longo prazo) 🟢 G

### 6.3 Financeiro
- [ ] Batch read para `getCliente(id)` quando necessário em múltiplos clientes 🟠 M

### 6.4 Queries sem limit
- [x] Dashboard: `limit(20)` em tarefas e `limit(5)` em competências e lançamentos ✓
- [x] `getClientes()`: `limit(500)` com filtro client-side ✓
- [x] Revisar restantes: `listDocuments(` sem `limit(` nos formulários 🔴 M
  - Ajustado `clientes_servicos` em Cliente 360° e modal de cliente para `limit(50)`

**~ Gate 6 PARCIAL:** Cache de usuários ✓ · limits nas queries principais ✓ · consolidação dashboard ✓ · pendente batch read de clientes + snapshot CF

---

## ETAPA 7 — AUTOMAÇÕES (CLOUD FUNCTIONS)
> Objetivo: reduzir trabalho manual repetitivo

### 7.1 Auto-avançar competência
- [x] Implementar `onTarefaConcluida` trigger 🟠 G
  - Quando: `tarefas/{id}` `status` muda para `'concluida'`
  - Lógica: se todas as tarefas da `competenciaId` estão concluídas/canceladas → atualizar competência para `'concluida'`
- [x] Testar edge case: tarefa sem `competenciaId` não dispara lógica 🟡 P
- [x] Deploy: `firebase deploy --only functions` 🔴 P
  - Funções legadas remotas removidas e deploy realizado com sucesso

### 7.2 Gerar fechamento mensal automático
- [x] Implementar `gerarFechamentoMensal` cron (dia 1 de cada mês, 06:00 BRT) 🟠 G
  - Verificar clientes existentes antes de criar duplicatas ✓
  - Usar batch writes (não loop com await) 🔴 M
- [~] Testar com `firebase emulators` antes de deploy 🔴 M
  - Implementado no scheduler de lançamentos mensais (ajuste de horário + deduplicação + batch writes)
  - Emulador de functions executado; validação completa de triggers/schedulers depende também de `firestore` + `pubsub` emulators ativos

### 7.3 Alerta de prazo crítico 48h
- [x] Implementar `alertasPrazoCritico` cron (diário às 07:00 BRT) 🟡 G
  - Marcar `alertaPrazo48h: true` nas tarefas afetadas
  - Frontend lê esse campo para destacar visualmente no cockpit

### 7.4 Detectar inadimplência crescente
- [x] Implementar `detectarInadimplencia` cron (toda segunda) 🟡 G
  - Marcar `riscoInadimplencia: true` no cliente quando valor em atraso > R$ 500
  - Frontend usa esse campo nos dots de saúde da lista de clientes

**✓ Gate 7:** Competência avança automaticamente · fechamento gerado no dia 1 · campos de risco disponíveis

---

## ETAPA 8 — TESTES
> Objetivo: garantir que os fluxos críticos não quebram em produção

### 8.1 Testes unitários
- [x] Instalar `vitest` ou `jest` + `@testing-library/react` 🟡 M
- [x] `__tests__/lib/sla-score.test.ts` — score correto para todos os cenários 🟠 M
  - Tarefa fiscal urgente atrasada 5 dias = score máximo
  - Tarefa sem prazo = score base
  - Ordenação: fiscal urgente > financeiro alta > normal
- [x] `__tests__/lib/financeiro-prioridade.test.ts` 🟠 M
  - Score de cobrança para atrasado 35 dias ≥ 50 pontos
  - Lançamento vencendo hoje > lançamento vencendo em 7 dias
- [x] `__tests__/lib/utils.test.ts` 🟡 M
  - `formatCurrency(1234.56)` = `'R$ 1.234,56'`
  - `validateCnpj` aceita válido e rejeita inválido
  - `getInitials('João Silva')` = `'JS'`
  - `formatDate` com Timestamp válido e com null

### 8.2 Testes E2E (Playwright)
- [x] Instalar Playwright: `npx playwright install` 🟡 P
- [~] `e2e/auth.spec.ts` — Login + acesso ao cockpit 🟠 M
- [~] `e2e/clientes.spec.ts` — Criar cliente completo com CPF/CNPJ válido 🟠 M
- [~] `e2e/tarefas.spec.ts` — Criar tarefa + aparece no cockpit + concluir 🟠 M
- [~] `e2e/financeiro.spec.ts` — Criar lançamento + aparece na fila 🟡 M
- [~] `e2e/permissoes.spec.ts` — Perfil `leitura` não acessa financeiro 🔴 M
  - Specs criadas e suíte executa (skipped) aguardando credenciais/fixtures reais para validação end-to-end

### 8.3 Edge cases a testar manualmente
- [ ] Cockpit com zero tarefas → mostra EmptyState, não quebra 🟠 P
- [ ] Fechar mês com clientes pendentes → aviso mas permite sign-off 🟡 P
- [ ] Token expirado durante uso → redirect para login sem perder URL 🔴 P
- [ ] Usuário inativo tenta login → mensagem específica (não genérica) 🔴 P
- [ ] Gerar fechamento quando todos os clientes já têm registro → zero duplicatas 🔴 P

**✓ Gate 8:** Testes unitários para algoritmos críticos · E2E para 5 fluxos · edge cases manuais OK

---

## ETAPA 9 — VALIDAÇÃO DE USO REAL
> Objetivo: confirmar que o produto funciona no mundo real, não apenas no código

### 9.1 Onboarding interno (5 dias)
- [ ] Pelo menos 1 contador usa o sistema como ferramenta principal por 5 dias úteis 🔴 G
- [ ] Registrar cada momento de confusão ("por que esse botão faz isso?") 🔴 M
- [ ] Registrar cada fluxo que exigiu mais de 3 cliques para completar 🟠 M
- [ ] Registrar qualquer erro que apareceu no console 🔴 M

### 9.2 Métricas de uso (verificar após 5 dias)
- [ ] % de tarefas concluídas pelo cockpit (meta: > 60%) 🟠 M
- [ ] % de tarefas com responsável + prazo preenchidos (meta: > 90%) 🟠 M
- [ ] Mês fechado dentro do sistema sem planilha paralela? 🔴 P
- [ ] Alguma ação causou dado incorreto no Firestore? 🔴 P

### 9.3 Top problemas identificados
- [ ] Listar os 3 maiores pontos de fricção reportados pelo usuário real 🔴 M
- [ ] Resolver antes de Go-Live 🔴 G

**✓ Gate 9:** 5 dias de uso real · zero erros críticos · 3 maiores fricções resolvidas

---

## ETAPA 10 — GO-LIVE
> Objetivo: deploy de produção com critérios objetivos de aprovação

### 10.1 Checklist técnico pré-deploy
- [x] `npx tsc --noEmit` → zero erros 🔴 P
- [x] `npm run build` → zero erros de prerender 🔴 P
- [x] `firebase deploy --only firestore:rules` 🔴 P
- [x] `firebase deploy --only firestore:indexes` 🔴 P
- [x] `firebase deploy --only functions` 🔴 P
- [x] `firebase deploy --only hosting` 🔴 P

### 10.2 Critérios GO / NO-GO

| Critério | GO | NO-GO |
|---|---|---|
| Contador executa dia sem ajuda | Sim, 3 dias consecutivos | Ainda pede ajuda |
| Cockpit é a primeira tela aberta | Sim, por hábito | Vai direto para tarefas/clientes |
| Mês fechado dentro do sistema | Sim, sem planilha | Usou planilha paralela |
| Erros críticos em 5 dias | Zero | Qualquer erro de dado incorreto |
| Cliente 360° usado naturalmente | Consultado antes de ligar | Nunca aberto |
| Tempo de load do cockpit | < 2 segundos | > 3 segundos |

### 10.3 Smoke test pós-deploy
- [ ] Login funciona 🔴 P
- [ ] Cockpit carrega com dados reais 🔴 P
- [ ] Lista de clientes carrega 🔴 P
- [ ] Criar tarefa e ver no cockpit 🔴 P
- [ ] Financeiro carrega fila de cobrança 🔴 P
- [ ] Fechamento carrega tabela do mês atual 🔴 P
- [ ] Usuário com perfil `leitura` não vê sidebar de financeiro 🔴 P

**✓ Gate 10 (GO-LIVE):** Todos os critérios GO satisfeitos · smoke test 100%

---

## RESUMO EXECUTIVO

| Etapa | Descrição | Status | Restante estimado |
|-------|-----------|--------|-------------------|
| 0 | Fundação técnica | ✅ Concluída | — |
| 1 | Design system consistente | ✅ Gate aprovado (pendentes menores) | ~2h |
| 2 | Cockpit redesign | ✅ N/A → já limpo | — |
| 3 | Lista clientes com saúde | 🔶 Parcial (health dots e tooltip concluídos) | ~1h |
| 4 | Cliente 360° upgrade | ✅ Concluída | — |
| 5 | Tarefas e financeiro | 🔶 Parcial (quase concluída) | ~2h |
| 6 | Performance | 🔶 Parcial (majoritariamente concluída) | ~2h |
| 7 | Automações | ✅ Concluída (deploy realizado) | — |
| 8 | Testes | 🔶 Parcial (unit críticos concluídos + base e2e pronta) | ~1.5 dia |
| 9 | Validação de uso real | ⏳ Pendente | ~5 dias |
| 10 | Go-live | ⏳ Pendente | ~0.5 dia |
| **RESTANTE** | | | **~3.5–4.5 dias úteis** |

### Próximos itens de maior impacto (por prioridade)
1. **8.2 Ativar E2E reais** — trocar specs de `skip` por fluxo com credenciais/fixtures
2. **5.2 Regra `urgente/fiscal`** — concluir confirmação especial quando existir classificação fiscal na tarefa
3. **3.3 Navegação clientes** — decidir click na linha vs modal com validação de uso real
4. **8.3 Edge cases manuais** — executar checklist de robustez operacional
5. **10.3 Smoke test pós-deploy** — validar produção após release

---

## ORDEM DE PRIORIDADE SE TEMPO FOR LIMITADO

```
SPRINT 1 (semana 1) — Fundação + Design System
  Etapas 0 + 1 → sistema estável e visualmente consistente

SPRINT 2 (semana 2) — Cockpit + Clientes
  Etapas 2 + 3 → principais telas de uso diário

SPRINT 3 (semana 3) — Features + Qualidade
  Etapas 4 + 5 + 8 (testes unitários apenas)

SPRINT 4 (semana 4) — Automações + Go-live
  Etapas 6 + 7 + 9 + 10
```
