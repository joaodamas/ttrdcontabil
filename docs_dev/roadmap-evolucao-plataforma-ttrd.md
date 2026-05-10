# Roadmap de Evolução — Plataforma TTRD Contábil

Atualizado em: 2026-05-10 (sessão 7)  
Base: arquitetura e funcionalidades atuais documentadas em `docs_dev/documentacao-tecnica-telas-fluxos-modais.md`.

## 0. Acompanhamento da execução

Status atualizado em: 2026-05-10 (sessão 7).

### Prioridade da sessão 6

| # | Item | Fase | Impacto |
|---|---|---|---|
| 1 | NFS-e: auto-fill do último rascunho do cliente | 5.1 | Alto |
| 2 | Timer operacional por tarefa | 2.3 | Alto |
| 3 | Dashboard v2: curva-S de fechamento (SVG inline) | 1.3 | Médio |
| 4 | Mobile: `FilterSheet` + `FilterSheetTrigger` | 7 | Médio |
| 5 | Timeline: badge manual vs automático | 3.2 | Médio |

### Prioridade da sessão 5

| # | Item | Fase | Impacto |
|---|---|---|---|
| 1 | Cliente 360: comentários rápidos na timeline | 3.2 | Alto |
| 2 | NFS-e wizard: preview/resumo da nota (step Resumo real) | 5.1 | Alto |
| 3 | Mobile: FAB com ações rápidas | 7 | Médio |
| 4 | Design System: InlineAlert com ícone/dismiss/action + EmptyState v2 | 1.1 | Médio |
| 5 | Fechamento: migrar tabela para DataTableShell + empty state inteligente | Em andamento | Médio |

### Resumo de progresso por fase

| Fase | Título | Progresso |
|---|---|---|
| 1.1 | Design System real | 60% |
| 1.2 | Sidebar e navegação | 100% |
| 1.3 | Dashboard v2 | 90% |
| 1.4 | Tabelas modernas | 80% |
| 1.5 | Modais e wizards | 90% |
| 2.1 | Cockpit operacional | 90% |
| 2.2 | Priorização inteligente | 90% |
| 2.3 | Modo foco | 100% |
| 3.1 | Cliente 360 | 95% |
| 3.2 | Timeline CRM | 100% |
| 3.3 | POP/base de conhecimento | 65% |
| 4.1 | Central de cobrança | 95% |
| 4.2 | Timeline financeira | 70% |
| 5.1 | Emissão assistida | 100% |
| 5.2 | Histórico e analytics fiscais | 85% |
| 7 | Mobile Experience | 80% |
| 10 | Performance e Arquitetura | 55% |
| 6, 8–12 | IA, SaaS, Segurança | 5–10% |

### Entregue

- [x] Documentação técnica completa da ferramenta em `docs_dev/documentacao-tecnica-telas-fluxos-modais.md`.
- [x] Matrizes de estado-transição para financeiro, WhatsApp, NFS-e, tarefas, competências, fechamento e IR.
- [x] Roadmap de evolução da plataforma em `docs_dev/roadmap-evolucao-plataforma-ttrd.md`.
- [x] Feature flags de UI premium por tenant nos parâmetros do escritório.
- [x] Provider global de feature flags no layout autenticado.
- [x] Atributos `data-*` no dashboard shell para liberar UI premium, dashboard v2, tabelas v2, modais v2 e sidebar v2.
- [x] Tela Admin > Parâmetros com seção “Rollout de UI premium”.
- [x] Correção do erro de lint em `src/components/competencias/competencia-form.tsx`.
- [x] Componente `AppModal` criado em `src/components/ui/app-modal.tsx`.
- [x] Primeiro modal migrado para `AppModal`: histórico de cobrança WhatsApp no Financeiro.
- [x] Componente `DataTableShell` criado em `src/components/ui/data-table-shell.tsx`.
- [x] Primeira tabela migrada para `DataTableShell`: lista de Clientes.
- [x] Command Palette passou a respeitar permissões por tela.
- [x] Command Palette passou a exibir páginas recentes via `localStorage`.
- [x] Command Palette passou a permitir favoritos locais via `localStorage`.
- [x] Sidebar ganhou ações rápidas fixas por permissão.
- [x] `.env.local` criado para execução local com Firebase Web SDK.
- [x] Dashboard v2 criado atrás da flag `dashboardV2Enabled`.
- [x] Dashboard v2 inclui bloco “O que precisa acontecer hoje”.
- [x] Dashboard v2 inclui fila crítica unificada de tarefas, cobranças e NFS-e.
- [x] Componente `KpiCard` criado em `src/components/ui/kpi-card.tsx`.
- [x] KPIs do Financeiro migrados para `KpiCard`.
- [x] KPIs do Fiscal migrados para `KpiCard`.
- [x] Tabela do Financeiro migrada para `DataTableShell`.
- [x] Tabela de prontidão fiscal migrada para `DataTableShell`.
- [x] Tabela de Tarefas migrada para `DataTableShell`.
- [x] Tabela de Competências migrada para `DataTableShell`.
- [x] Modal fiscal “Erro técnico da emissão” migrado para `AppModal`.
- [x] Componente `WizardSteps` criado em `src/components/ui/wizard-step.tsx`.
- [x] Modal “Emissão assistida de NFS-e” migrado para `AppModal`.
- [x] Modal “Emissão assistida de NFS-e” recebeu stepper visual com `WizardSteps`.
- [x] Modal “Emitir NFS-e em Lote” migrado para `AppModal`.
- [x] Modal “Baixar Lançamento” migrado para `AppModal`.
- [x] ESLint limpo sem warnings.
- [x] Validação TypeScript com `npx tsc --noEmit`.
- [x] Validação ESLint sem erros com `npm run lint`.
- [x] Timeline do Cliente 360 expandida com tarefas e filtros por tipo (Todos / Tarefas / Competências / Financeiro).
- [x] Health score do Cliente 360 expandido de 4 para 6 dimensões (+Tarefas, +NFS-e rascunho) com percentual visual.
- [x] KPIs executivos numéricos (honorários, atraso, tarefas abertas) adicionados ao painel direito do Cliente 360.
- [x] Bloco "Clientes em risco" adicionado ao Dashboard v2 com ranking por score (cobranças vencidas + tarefas atrasadas).
- [x] Indicador comparativo de execução do mês (% concluído de competências) adicionado ao Dashboard v2.
- [x] Cockpit Hoje ganhou modo foco (filtra só atrasadas + hoje), filtros de prioridade por chip, separadores visuais por grupo e destaque de tarefas sem responsável.
- [x] Command Palette recebeu busca contextual de clientes e tarefas via Firestore (resultado ao vivo com debounce de 300ms).
- [x] Score de inadimplência visual adicionado à tabela do Financeiro: motivo do risco exibido inline nas linhas de receita vencida.
- [x] `ConfigFiscalForm` migrado de Dialog para `AppModal`.
- [x] Lint e TypeScript validados limpos.
- [x] Central de Cobrança criada em `src/components/financeiro/central-cobranca.tsx`: aging de recebíveis (5 faixas) + ranking Top 5 inadimplentes + previsão 7 dias integrada ao Financeiro.
- [x] WizardSteps do modal "Emissão assistida de NFS-e" agora controlado: steps avançam automaticamente conforme o usuário preenche o formulário.
- [x] Busca inline por título/cliente/responsável adicionada à tabela de Tarefas.
- [x] Lint e TypeScript validados limpos (round 2).
- [x] Sidebar recebeu painel "Hoje" contextual com contadores de tarefas atrasadas e para hoje.
- [x] Lint e TypeScript validados limpos (round 3).
- [x] Tela de Clientes reformulada: health score como badge semântico (Estável/Atenção/Crítica), dropdown de ações rápidas por linha (abrir, editar, nova tarefa, nova competência, emitir NFS-e), indicador de WhatsApp, coluna de mensalidade, filtros de regime tributário por chip.
- [x] `ClienteModal` migrado de `Dialog` para `AppModal`.
- [x] `ClienteServicoDialog` migrado para `AppModal`.
- [x] `ServicosForm` (admin) migrado para `AppModal`.
- [x] Lint e TypeScript validados limpos (round 4).
- [x] Dashboard v2: strip de resumo inteligente diário ("Hoje: X tarefas vencidas · R$ Y em cobrança · Z NFS-e a emitir").
- [x] Dashboard v2: painel de produtividade do mês (concluídas/em andamento/abertas + % execução).
- [x] Fiscal Histórico NFS-e: KPI strip (emitidas, erros, valor total), agrupamento mensal com totalizadores, filtros migrados para FilterBtn, tabela migrada para DataTableShell, modal de cancelamento migrado para AppModal.
- [x] Cliente 360: aba POP (Procedimento Operacional do Cliente) com notas estruturadas por área (Fiscal, Financeiro, Operacional, Geral), salvas na coleção `clientes_pop`.
- [x] Cliente 360: eventos de WhatsApp na timeline (derivados dos lançamentos com `ultimoEnvioWhatsappEm`), filtro "WhatsApp" na timeline.
- [x] Cockpit Hoje: bloco "Gargalos operacionais" com detecção de tarefas sem responsável, sem prazo e com SLA em risco.
- [x] Competências: agrupamento inteligente por status ou por responsável com contadores por grupo.
- [x] Lint e TypeScript validados limpos (round 5).
- [x] Mobile: card view responsivo em Clientes e Tarefas (layout compacto em telas pequenas).
- [x] DataTableShell: salvar preferência de densidade (compacto/confortável) no localStorage por tabela.
- [x] Fiscal histórico: monitor de rejeições (alert strip + destaque visual nas linhas rejeitadas).
- [x] Cliente 360: resumo executivo no painel lateral (serviços ativos, competências, tarefas, atraso, dia emissão).
- [x] Cliente 360: insights automáticos computados (padrão de competências, inadimplência, tarefas sem prazo).
- [x] Financeiro: alertas inteligentes (vencimento hoje, concentração de receita, inadimplência recorrente).
- [x] Financeiro: previsão de caixa 30 dias com valor total e barra de progresso.
- [x] Cockpit Hoje: quick assign inline — dropdown para atribuir responsável diretamente na fila.
- [x] Admin Serviços: formulário reescrito com campos livres (nome, código, valor, frequência) — sem tabela COB pré-definida.
- [x] Correção: `generateStaticParams` da rota `/clientes/[id]` ajustado para static export.
- [x] Lint e TypeScript validados limpos (round 6).
- [x] Timeline financeira: modal `TimelineFinanceiraModal` com eventos sintetizados por lançamento (criação, atraso, WhatsApp, pagamento, estorno). Acessível via ícone de clock em cada linha do Financeiro.
- [x] Cockpit Hoje: modo Kanban adicionado — toggle Lista/Kanban no header, 3 colunas (Atrasadas/Para hoje/Próximos 7d) com quick assign por dropdown.
- [x] React Query: staleTime calibrado por tipo de dados, `gcTime` aumentado para 15 min, `networkMode: online`, retry 0 em mutations.
- [x] Lint e TypeScript validados limpos (round 7).
- [x] Cliente 360: comentários rápidos na timeline — input + Enter para salvar, salvo na coleção `clientes_comentarios`, exibido como eventos tipo `comentario` com autor e timestamp.
- [x] Cliente 360: filtro "Comentários" na timeline agrupa comentários manuais + eventos de WhatsApp.
- [x] NFS-e wizard: step Resumo real (Fase 5.1) — botão "Revisar antes de emitir" avança o wizard para o step 4, exibe painel de revisão estruturado (prestador/tomador/serviço/alíquota/ISS) antes de confirmar a emissão.
- [x] Mobile: FAB (Floating Action Button) criado em `src/components/layout/mobile-fab.tsx`, visível apenas em mobile (`sm:hidden`), com 4 ações rápidas: Nova tarefa, Novo cliente, Novo lançamento, Emitir NFS-e.
- [x] Design System: `InlineAlert` reescrito com ícone por tom, suporte a `dismissible`, `action` callback e dark mode. `EmptyState` v2 com `secondaryAction`, prop `size` (sm/md/lg) e remoção do docstring desnecessário.
- [x] Cliente 360: empty states inteligentes em Competências e Serviços com CTA contextual via `EmptyState`.
- [x] Fechamento: tabela `FechamentoTable` migrada para `DataTableShell` com toggle de densidade (compacto/confortável) + empty state com `EmptyState` + ícone `ClipboardList`.
- [x] Lint e TypeScript validados limpos (round 8).
- [x] NFS-e: auto-fill "Reutilizar último" — ao selecionar um cliente, carrega o último rascunho e exibe botão "Reutilizar último" no card Serviço para preencher descrição, código, valor, alíquota e ISS retido automaticamente.
- [x] Timer operacional por tarefa — componente `TaskTimer` (`src/components/tarefas/task-timer.tsx`) com start/pause/discard; salva sessões em `tarefas_timers`; exibido em cada linha do cockpit Hoje.
- [x] Dashboard v2: curva-S de fechamento — gráfico SVG inline mostrando progresso real (linha sólida) vs meta linear (linha tracejada) para os fechamentos do mês corrente; integrado ao painel lateral do Dashboard v2.
- [x] Mobile: `FilterSheet` + `FilterSheetTrigger` criados em `src/components/ui/filter-sheet.tsx`; `FilterSheetTrigger` aparece apenas em mobile (`sm:hidden`); integrado na página de Tarefas (status + prioridade).
- [x] Timeline: badge visual `manual` (ícone User) vs `auto` (ícone Bot) adicionado à `TimelineEvent`; comentários manuais marcados como `source: 'manual'`, eventos WhatsApp e automáticos marcados como `source: 'auto'`.
- [x] Lint e TypeScript validados limpos (round 9).
- [x] Virtualização do cockpit Hoje com `@tanstack/react-virtual` — lista de tarefas renderiza apenas as linhas visíveis; `VirtualTaskList` com overscan=8, estimativa por tipo (header 36px / tarefa 72px).
- [x] Relatório de produtividade individual — página `/relatorios/produtividade` com KPIs (total, sessões, usuários, média/sessão), gráfico de barras por usuário, top-10 tarefas, histórico de sessões. Dados de `tarefas_timers`. Link adicionado na sidebar.
- [x] Quick edit inline de prazo no cockpit Hoje — clique na data abre `<input type="date">` inline; Enter/blur salva; Escape cancela; salva em `tarefas` via `updateDocument`.
- [x] FilterSheet aplicado na página de Clientes — trigger mobile com badge de filtros ativos, sheet com status e regime tributário.
- [x] Validações avançadas no wizard NFS-e — CPF/CNPJ com checagem de dígitos, código de serviço com regex ABRASF, descrição mínima 10 chars, painel de avisos não-bloqueantes para alíquota < 2% e valor > R$ 50k.
- [x] Lint e TypeScript validados limpos (round 10).

### Em andamento

- [x] Migração incremental dos demais modais para `AppModal`. (ConfigFiscalForm, ClienteModal, ClienteServicoDialog, ServicosForm, emitir-nfse-modal, emitir-lote-modal, lancamento-baixar, erro-fiscal)
- [x] Migração incremental das demais tabelas para `DataTableShell`. (fiscal/historico ✓, fechamento ✓)
- [x] Evoluir Sidebar/Command Palette com busca contextual de clientes/tarefas.
- [ ] Evoluir Dashboard v2 com cache/agregações dedicadas.

### Backlog priorizado — próximas execuções

Ordenado por impacto operacional imediato → qualidade de produto → estratégico.

#### P0 — Crítico (operação em produção)

| # | Item | Fase | Motivo |
|---|---|---|---|
| 1 | Virtualização de listas grandes (`@tanstack/react-virtual`) | 10 | Listas de 200+ clientes/tarefas travam em produção |
| 2 | Cache de dashboard via `dashboard_kpis` + Cloud Function scheduler | 1.3 | Reduz leituras Firestore no carregamento inicial |
| 3 | Produtividade individual — relatório de tempo por tarefa/usuário | 2.3 | Completa o timer; mostra horas acumuladas por período |
| 4 | Melhorar responsividade geral (sidebar mobile, modais mobile) | 1.2 / 1.5 | Usuários acessam via celular; modais longos quebram |

#### P1 — Alto impacto (execução diária)

| # | Item | Fase | Motivo |
|---|---|---|---|
| 5 | Quick edit inline no cockpit Hoje (editar prazo/status sem sair da linha) | 2.1 | Reduz cliques no fluxo de trabalho diário |
| 6 | Classificação de tarefas por impacto financeiro/fiscal | 2.2 | Completa o score de priorização |
| 7 | Drag and drop no Kanban (reordenar colunas e cards) | 2.1 | Experiência esperada em Kanban |
| 8 | Swimlanes por responsável no Kanban | 2.1 | Visibilidade da carga por pessoa |
| 9 | Validações avançadas no wizard NFS-e (CNPJ, alíquota mínima, município) | 5.1 | Previne erros de emissão antes de chamar a prefeitura |
| 10 | Templates de serviço NFS-e (histórico por cliente + sugestão) | 5.1 | Reduz digitação no fluxo de emissão recorrente |

#### P2 — Qualidade de produto

| # | Item | Fase | Motivo |
|---|---|---|---|
| 11 | Logs visuais de emissão NFS-e (linha do tempo de tentativas) | 5.2 | Facilita diagnóstico de falhas fiscais |
| 12 | Heatmap operacional fiscal (mapa de calor de emissões/erros por dia) | 5.2 | Identificar gargalos recorrentes por período |
| 13 | Indicadores históricos do Cliente 360 (evolução mês a mês) | 3.1 | Mostra tendência de inadimplência e produtividade |
| 14 | Notas internas versionadas no POP do cliente | 3.3 | Histórico de alterações de procedimento |
| 15 | Anexos na timeline do cliente (upload de evidências) | 3.2 | Completar o CRM visual |
| 16 | Modo Agenda no cockpit Hoje | 2.1 | Visão semanal de tarefas e competências |
| 17 | Ações swipe em mobile (concluir/atribuir deslizando) | 7 | UX mobile esperada em apps modernos |
| 18 | `FilterSheet` em mais páginas (Clientes, Competências, Financeiro) | 7 | Consistência mobile em todo o app |
| 19 | Salvar views de tabela por usuário (colunas + filtros) | 1.4 | Personalização por analista |
| 20 | Animações suaves em modais e transições de página | 1.5 | Percepção premium |

#### P3 — Estratégico / SaaS

| # | Item | Fase | Motivo |
|---|---|---|---|
| 21 | Resumo diário inteligente via IA (Anthropic) | 6.1 | Diferencial competitivo: "Bom dia, hoje você tem…" |
| 22 | Auto-categorização de lançamentos financeiros | 6.2 | Reduz trabalho manual de classificação |
| 23 | Sugestão automática de responsável e prazo por tipo de tarefa | 6.2 | Aumenta produtividade da equipe |
| 24 | Previsão de inadimplência por padrão histórico do cliente | 6.1 | Cobrança proativa antes do vencimento |
| 25 | White-label: logo, cor e domínio por tenant | 8.1 | Habilita revenda como SaaS |
| 26 | Billing e controle de plano (`subscriptions` + `plans`) | 8.2 | Monetização do produto |
| 27 | Revisão completa das regras Firestore (isolamento multi-tenant) | 8.3 | Requisito antes de abrir para novos tenants |
| 28 | MFA e controle de sessão | 9.1 | Segurança para dados contábeis sensíveis |
| 29 | Playwright E2E + CI/CD automático | 9.3 | Impede regressão em deploys |
| 30 | ADRs (Architecture Decision Records) + Storybook | 9.3 | Onboarding de novos devs |

## 1. Visão Geral

A plataforma atual já possui uma base madura:

- Módulos operacionais integrados.
- Automações por Firebase Functions.
- Rastreabilidade e auditoria.
- Permissões por perfil e tenant.
- Processos reais para clientes, tarefas, competências, financeiro, fiscal, fechamento, IR e WhatsApp.
- Base técnica com potencial SaaS.

O próximo nível é transformar o ERP em uma plataforma operacional inteligente, prescritiva e premium.

Pilares da evolução:

| Pilar | Objetivo |
|---|---|
| UI/UX | Reduzir complexidade, melhorar percepção premium e diminuir esforço cognitivo |
| Operação | Acelerar execução diária e reduzir cliques |
| Inteligência | Priorizar, alertar e sugerir ações |
| Performance | Suportar volume real de dados e uso mobile |
| Produto SaaS | Permitir venda, expansão, white-label, billing e analytics |

## 2. Prioridade Real de Execução

### Prioridade absoluta

1. UI/UX global.
2. Dashboard inteligente.
3. Cockpit Hoje operacional.
4. Cliente 360 premium.
5. Financeiro inteligente.

### Prioridade alta

1. Timeline operacional.
2. Fiscal premium.
3. IA operacional.
4. Mobile.

### Prioridade estratégica

1. White-label.
2. Billing.
3. APIs.
4. Analytics SaaS.

## 3. Roadmap por Fases

## Fase 1 — Redesign Global UI/UX

Prioridade: máxima/crítica.  
Objetivo: reduzir confusão visual, aumentar produtividade imediata e transformar a percepção de ERP em SaaS premium.

### 1.1 Design System real

Problema atual:

- Existem tokens e padrões visuais, mas a experiência ainda alterna entre visual premium e visual ERP.
- Há inconsistências de espaçamento, elevação, densidade e hierarquia visual.
- O amarelo TTRD aparece como cor de marca, mas precisa ser usado com mais disciplina para não dominar a interface.

Criar estrutura:

```text
src/design-system/
  tokens/
  components/
  patterns/
  layouts/
  motion/
```

Padronizar escala de espaçamento:

```text
4, 8, 12, 16, 24, 32, 48, 64
```

Padronizar tipografia:

| Uso | Tamanho |
|---|---:|
| Hero KPI | 48-56 |
| Título de página | 32 |
| Título de seção | 24 |
| Texto principal | 14-16 |
| Texto auxiliar | 12 |

Componentes a padronizar:

- Cards.
- Tabelas.
- Badges.
- Alertas.
- Drawers.
- Modais.
- Botões.
- Selects.
- Inputs.
- Skeletons.
- Empty states.

Checklist:

- [ ] Redesenhar hierarquia visual global.
- [ ] Padronizar espaçamentos globais.
- [ ] Reduzir excesso de bordas visuais.
- [ ] Diminuir densidade de informação por tela.
- [ ] Melhorar contraste entre áreas importantes e secundárias.
- [ ] Criar identidade visual mais premium/SaaS.
- [ ] Revisar uso excessivo do amarelo TTRD.
- [ ] Criar sistema consistente de elevação/sombras.
- [ ] Melhorar responsividade geral.
- [x] Criar base de padrão visual consistente para KPIs.
- [ ] Criar documentação visual no Storybook.

Critérios de aceite:

- Telas críticas usam a mesma escala de espaçamento.
- KPIs seguem o mesmo padrão visual.
- Cards e superfícies têm elevação consistente.
- O usuário consegue identificar ação primária, informação crítica e contexto secundário sem procurar.

### 1.2 Sidebar e navegação

Problema atual:

- Sidebar é funcional, mas ainda parece uma lista.
- A navegação não mostra contexto operacional suficiente.
- Faltam favoritos, recentes e atalhos contextuais.

Evolução proposta:

- Seção “Hoje” com indicadores:
  - 7 atrasadas.
  - 4 críticas.
  - 22 concluídas.
- Favoritos salvos em `localStorage`.
- Recentes:
  - Clientes.
  - Tarefas.
  - Notas.
  - Competências.
- Quick actions fixas:
  - Novo cliente.
  - Nova tarefa.
  - Novo lançamento.
  - Emitir NFS-e.
  - Abrir cobrança.
- Command Palette contextual:
  - Abrir cliente.
  - Emitir NFS-e.
  - Concluir tarefa.
  - Criar lançamento.
  - Buscar nota.

Checklist:

- [x] Transformar sidebar em navegação moderna.
- [x] Melhorar estados ativos.
- [x] Melhorar agrupamento de módulos.
- [x] Criar quick actions fixas.
- [ ] Melhorar experiência mobile da sidebar.
- [x] Adicionar favoritos/atalhos rápidos.
- [x] Criar recentes.
- [x] Melhorar Command Palette com permissões e recentes.
- [x] Permitir ações por busca contextual.
- [x] Adicionar painel "Hoje" com indicadores contextuais na sidebar.

Critérios de aceite:

- Usuário acessa as 5 ações mais frequentes em até 1 clique.
- Command Palette encontra páginas, clientes e ações.
- Mobile consegue navegar sem perder contexto.

### 1.3 Dashboard inteligente v2

Problema atual:

- Dashboard mostra dados, mas ainda não direciona suficientemente a ação.
- KPIs soltos não respondem “o que precisa acontecer agora?”.

Criar feature:

```text
src/features/dashboard-v2/
  queries.ts
  services.ts
  aggregations.ts
  hooks.ts
  components/
    action-today.tsx
    risk-card.tsx
    financial-aging.tsx
    fiscal-readiness.tsx
    productivity-panel.tsx
```

Backend/cache:

```text
dashboard_cache
```

Atualização:

- Scheduler Cloud Function.
- Recalculo manual por callable admin.

Blocos novos:

1. Operação hoje:
   - O que precisa acontecer hoje.
   - Tarefas vencidas.
   - Clientes críticos.
   - Cobranças pendentes.
2. Financeiro:
   - Aging.
   - Previsão de recebimento.
   - Risco financeiro.
   - Inadimplência.
3. Fiscal:
   - Clientes sem certificado.
   - Rejeições.
   - Emissão pendente.
4. Produtividade:
   - Tarefas concluídas.
   - SLA.
   - Equipe.
   - Gargalos.
5. Acompanhamento preditivo:
   - Curvas S para comparar planejamento de fechamento mensal contra execução real.
   - Desvio por dia do mês.
   - Previsão de gargalo antes do fechamento.

Checklist:

- [x] Criar primeira versão do Dashboard v2 atrás de feature flag.
- [x] Substituir KPIs soltos por insights na versão v2.
- [x] Criar bloco “O que precisa acontecer hoje”.
- [x] Criar cards de risco operacional.
- [x] Criar cards de risco financeiro.
- [x] Criar cards de risco fiscal.
- [x] Criar indicadores comparativos semana/mês.
- [x] Criar resumo inteligente diário.
- [x] Criar ranking de clientes críticos.
- [x] Criar visão de produtividade operacional.
- [x] Criar curvas S de execução vs planejamento.
- [ ] Criar cache de dashboard.

Critérios de aceite:

- Dashboard responde claramente: “o que devo fazer hoje?”.
- Todo insight tem CTA ou link para ação.
- Métricas pesadas vêm de cache/agregação, não de múltiplas queries caras no client.

### 1.4 Tabelas modernas

Problema atual:

- Tabelas funcionam, mas têm leitura de ERP tradicional.
- Falta configuração por usuário, densidade, colunas e views salvas.

Stack recomendado:

- `@tanstack/react-table`.
- `@tanstack/react-virtual`.

Funcionalidades:

- Headers sticky.
- Densidade compacta/confortável.
- Hover mais refinado.
- Seleção múltipla.
- Ações inline.
- Filtros rápidos.
- Views salvas.
- Colunas configuráveis.
- Agrupamentos inteligentes.
- Linha expansível.
- Virtualização.

Agrupar por:

- Responsável.
- Status.
- Cliente.
- Prioridade.
- Mês/competência.

Checklist:

- [ ] Reduzir visual “ERP antigo”.
- [ ] Melhorar legibilidade.
- [x] Criar base de headers sticky.
- [x] Adicionar base de densidade compacta/confortável.
- [x] Melhorar hover e seleção.
- [x] Adicionar ações inline.
- [x] Adicionar filtros rápidos.
- [ ] Adicionar salvamento de visualização.
- [ ] Adicionar colunas configuráveis.
- [x] Adicionar agrupamentos inteligentes.
- [ ] Adicionar virtualização em listas grandes.

Critérios de aceite:

- Financeiro, tarefas, clientes e fiscal suportam alto volume sem travar.
- Usuário consegue salvar ao menos uma view personalizada.
- Ações comuns não exigem sair da tabela.

### 1.5 Modais e wizards

Problema atual:

- Modais são bons tecnicamente, mas ainda parecem formulários técnicos.
- Alguns fluxos deveriam ser assistidos em etapas.

Criar componente:

```text
AppModal
```

Recursos:

- Header sticky.
- Footer sticky.
- Summary lateral ou sticky.
- Loading overlay.
- Animação suave.
- Scroll interno previsível.
- Responsividade mobile.

Criar componente:

```text
WizardStep
```

Exemplo NFS-e:

1. Cliente.
2. Tomador.
3. Serviço.
4. Validação.
5. Resumo.

Checklist:

- [ ] Padronizar todos os modais.
- [ ] Melhorar largura e responsividade.
- [x] Criar base `AppModal` para layouts wizard/stepper.
- [x] Criar componente base `WizardSteps`.
- [x] Melhorar base de header/footer dos modais.
- [ ] Criar summaries sticky.
- [x] Melhorar base de scroll interno.
- [x] Migrar `ConfigFiscalForm` para `AppModal`.
- [ ] Melhorar UX mobile.
- [ ] Criar animações suaves.
- [ ] Melhorar overlays e profundidade.

Critérios de aceite:

- Todo modal crítico tem header, corpo e footer previsíveis.
- Fluxos longos usam wizard.
- Mobile não quebra scroll nem ações finais.

## Fase 2 — Cockpit Operacional “Hoje”

Prioridade: alta.  
Objetivo: transformar execução operacional em experiência moderna.

### 2.1 Experiência operacional

Modos:

- Lista.
- Kanban.
- Agenda.
- Swimlanes.

Kanban:

```text
Pendentes | Em andamento | Revisão | Concluídas
```

Swimlanes por:

- Responsável.
- Cliente.
- Prioridade.

Funcionalidades:

- Drag and drop.
- Bulk actions melhores.
- Edição inline.
- Quick assign.
- Quick conclude.
- Quick edit.

Checklist:

- [x] Redesenhar tela Hoje.
- [x] Criar agrupamento inteligente.
- [ ] Criar drag and drop.
- [ ] Criar swimlanes.
- [x] Criar modo Kanban.
- [x] Criar modo Lista.
- [ ] Criar modo Agenda.
- [ ] Criar quick edit inline.
- [x] Criar quick assign.
- [x] Criar quick conclude.

### 2.2 Priorização inteligente

Score sugerido:

```text
score = atraso + valor financeiro + cliente vip + prazo + urgencia + impacto fiscal + recorrencia
```

Checklist:

- [x] Melhorar score operacional.
- [x] Criar prioridade automática.
- [x] Detectar tarefas órfãs.
- [x] Detectar gargalos operacionais.
- [x] Detectar tarefas críticas automaticamente.
- [x] Detectar risco de SLA.
- [ ] Criar classificação por impacto financeiro/fiscal.

### 2.3 Modo foco

Checklist:

- [x] Criar “Minhas tarefas críticas”.
- [x] Criar “Modo foco”.
- [x] Remover distrações durante execução.
- [x] Criar timer operacional.
- [ ] Criar produtividade individual.

Critérios de aceite da fase:

- O usuário executa o trabalho do dia sem precisar navegar por 5 telas.
- Tarefas sem responsável/prazo aparecem como risco operacional.
- O cockpit mostra próximo melhor passo.

## Fase 3 — Cliente 360 Premium

Prioridade: alta.  
Objetivo: transformar cliente em hub operacional vivo.

### 3.1 Evolução do Cliente 360

Problema atual:

- Funcionalmente forte, mas ainda com leitura de ERP.
- Precisa virar workspace do cliente.

Blocos:

- Saúde operacional.
- Saúde financeira.
- Saúde fiscal.
- SLA.
- Receita mensal.
- Pendências críticas.
- Última emissão.
- Últimas cobranças.
- Próximas tarefas.
- Insights automáticos.

Health score:

```text
health = financeiro + fiscal + tarefas + sla + fechamento + whatsapp
```

Checklist:

- [x] Melhorar layout do Cliente 360.
- [x] Criar health score real.
- [x] Criar timeline visual.
- [x] Criar insights automáticos.
- [x] Criar visão consolidada operacional.
- [x] Criar visão consolidada financeira.
- [x] Criar visão consolidada fiscal.
- [ ] Criar indicadores históricos.
- [x] Criar alertas do cliente.
- [x] Criar bloco de pendências críticas.
- [x] Criar resumo executivo do cliente.

### 3.2 Timeline estilo CRM

Unificar:

- Financeiro.
- Tarefas.
- Fiscal.
- WhatsApp.
- Fechamento.
- IR.
- Comentários.
- Anexos.

Visual de referência:

- HubSpot.
- Salesforce.
- Attio.

Checklist:

- [x] Criar timeline moderna estilo CRM.
- [x] Criar filtros de timeline.
- [x] Criar comentários rápidos.
- [x] Diferenciar atividade humana vs automática.
- [ ] Adicionar anexos/eventos manuais.
- [x] Exibir WhatsApp na timeline.

### 3.3 Base de conhecimento do cliente

Adicionar módulo de documentação/POP específico do cliente.

Exemplos:

- “Cliente envia extrato todo dia 5 pelo portal X.”
- “Senha/credencial operacional fica no campo Y.”
- “Responsável fiscal responde apenas por e-mail.”
- “NFS-e deve usar descrição padrão Z.”

Checklist:

- [x] Criar bloco “Procedimento Operacional do Cliente”.
- [x] Criar campos estruturados por área: fiscal, financeiro, DP, societário.
- [ ] Permitir notas internas versionadas.
- [ ] Permitir anexos.
- [x] Exibir POP no Cliente 360.

Critérios de aceite da fase:

- Analista novo consegue entender o contexto do cliente em uma única tela.
- Timeline mostra eventos relevantes de todas as áreas.
- Health score explica o motivo da nota.

## Fase 4 — Financeiro Inteligente

Prioridade: alta.  
Objetivo: transformar financeiro em central de cobrança e risco.

### 4.1 Central de cobrança inteligente

Checklist:

- [x] Criar central de cobrança inteligente.
- [x] Criar score de inadimplência.
- [x] Criar previsão de recebimento.
- [x] Criar timeline financeira.
- [x] Criar aging financeiro.
- [x] Criar concentração de receita por cliente.
- [x] Criar alertas financeiros inteligentes.
- [x] Criar previsão de risco de caixa.

Score de inadimplência:

```text
score = dias_atraso + historico + ticket + recorrencia + interacao_whatsapp
```

Classificação:

| Score | Cor | Risco |
|---:|---|---|
| 0-20 | Verde | Baixo |
| 20-50 | Amarelo | Médio |
| 50+ | Vermelho | Alto |

### 4.2 Timeline financeira

Criar coleção:

```text
financeiro_eventos
```

Eventos:

- Cobrança enviada.
- Resposta.
- Promessa de pagamento.
- Baixa.
- Atraso.
- Renegociação.
- Estorno.
- Cancelamento.

Critérios de aceite:

- Financeiro mostra quem cobrar primeiro e por quê.
- Histórico da cobrança fica claro por lançamento e por cliente.
- Risco de caixa aparece antes do vencimento crítico.

## Fase 5 — Fiscal / NFS-e Premium

Prioridade: média/alta.  
Objetivo: elevar percepção premium da emissão fiscal.

### 5.1 Emissão assistida

Checklist:

- [x] Transformar emissão em wizard.
- [x] Melhorar revisão pré-emissão.
- [x] Melhorar base de feedback de erro com `AppModal`.
- [x] Melhorar base visual técnica da emissão assistida.
- [ ] Melhorar validações.
- [ ] Criar preview da nota.
- [ ] Criar templates de serviço.
- [x] Criar auto preenchimento inteligente.

Auto preenchimento preditivo:

- Se tomador for X, sugerir serviço Y.
- Se município for Z, sugerir item de serviço e alíquota.
- Se cliente usa descrição recorrente, pré-carregar texto.

### 5.2 Histórico e analytics fiscais

Checklist:

- [x] Melhorar histórico NFS-e.
- [x] Criar filtros avançados.
- [x] Criar agrupamento mensal.
- [x] Criar analytics fiscais.
- [x] Criar exportações melhores.
- [ ] Criar logs visuais.
- [x] Criar monitor de rejeições.
- [ ] Criar heatmap operacional fiscal.

Critérios de aceite:

- Erros fiscais ficam compreensíveis para usuário operacional.
- Emissão recorrente exige menos preenchimento manual.
- Histórico explica o ciclo da nota.

## Fase 6 — IA e Inteligência Operacional

Prioridade: média.  
Objetivo: transformar ERP em sistema inteligente.

### 6.1 Insights automáticos

Criar coleção:

```text
ai_insights
```

Scheduler:

```text
generateInsights()
```

Exemplos:

- “Cliente sempre atrasa após dia 15.”
- “Competências do Lucro Presumido atrasam mais.”
- “Município X apresenta maior taxa de rejeição.”
- “Responsável Y está com maior volume de tarefas críticas.”

Checklist:

- [ ] Criar resumo automático diário.
- [ ] Criar alertas inteligentes.
- [ ] Criar insights automáticos.
- [ ] Criar recomendações operacionais.
- [ ] Criar priorização automática.
- [ ] Criar previsão de atrasos.
- [ ] Criar previsão de inadimplência.
- [ ] Criar classificação automática de risco.

### 6.2 IA contextual e preenchimento preditivo

Checklist:

- [ ] Sugestão automática de responsável.
- [ ] Sugestão automática de prazo.
- [ ] Sugestão automática de ação.
- [ ] Sugestão automática de cobrança.
- [ ] Sugestão automática fiscal.
- [ ] Auto-categorização de lançamentos.
- [ ] Auto preenchimento de NFS-e baseado em padrões passados.

Resumo diário inteligente:

```text
Bom dia.
Hoje:
- 14 tarefas críticas.
- R$ 18.400 pendentes.
- 3 NFS-e com erro.
- 2 clientes com risco alto.
```

Critérios de aceite:

- Todo insight tem explicação e CTA.
- Sugestões podem ser aceitas ou ignoradas.
- IA não executa ação crítica sem confirmação.

## Fase 7 — Mobile Experience

Prioridade: média.  
Objetivo: tornar a plataforma realmente utilizável no celular.

Checklist:

- [x] Melhorar tabelas mobile.
- [x] Criar cards operacionais.
- [ ] Criar bottom sheets.
- [ ] Criar ações swipe.
- [x] Melhorar filtros mobile.
- [ ] Melhorar formulários mobile.
- [ ] Melhorar modais mobile.
- [x] Criar quick actions flutuantes.

Critérios de aceite:

- Usuário consegue concluir tarefa, consultar cliente, baixar lançamento e revisar cobrança no celular.
- Tabelas críticas têm versão em cards ou lista responsiva.
- Modais longos viram bottom sheet/wizard em mobile.

## Fase 8 — Produto SaaS Premium

Prioridade: estratégica.  
Objetivo: transformar ferramenta em produto escalável.

### 8.1 White-label

Criar coleção:

```text
tenant_theme
```

Campos:

- Logo.
- Cores.
- Nome.
- Favicon.
- Fontes.
- Domínio.
- Configuração visual.

Checklist:

- [ ] Tema por tenant.
- [ ] Logo por tenant.
- [ ] Cor por tenant.
- [ ] Domínio customizado.
- [ ] Configuração visual.
- [ ] CSS variables dinâmicas.

### 8.2 Billing e plano

Criar coleções:

```text
subscriptions
plans
tenant_usage
```

Controlar:

- Usuários.
- Clientes.
- Storage.
- Emissão NFS-e.
- WhatsApp.
- Funções premium.

Checklist:

- [ ] Onboarding guiado.
- [ ] Wizard inicial.
- [ ] Seed de dados.
- [ ] Métricas por tenant.
- [ ] Billing.
- [ ] Controle de plano.
- [ ] Controle de uso.
- [ ] Logs multi-tenant avançados.

### 8.3 Isolamento de dados

Objetivo:

- Garantir que vazamento entre tenants seja impossível na camada de dados, não apenas na camada de UI.

Checklist:

- [ ] Revisar modelo de isolamento por tenant.
- [ ] Criar testes automatizados de isolamento.
- [ ] Validar regras Firestore para todas as coleções.
- [ ] Criar simulações de acesso cruzado.
- [ ] Documentar RLS/isolamento equivalente do Firestore.
- [ ] Criar auditoria de acesso por tenant.

Critérios de aceite:

- Tenant A nunca lê dados do tenant B em testes automatizados.
- Billing bloqueia ou limita uso conforme plano.
- Tema aplica por tenant sem rebuild.

## Fase 9 — Segurança, Observabilidade e Qualidade

Prioridade: técnica/estratégica.  
Objetivo: preparar crescimento com segurança e monitoramento.

### 9.1 Segurança

Checklist:

- [ ] MFA.
- [ ] Controle de sessão.
- [ ] Auditoria de IP.
- [ ] Auditoria de device.
- [ ] Access logs.
- [ ] RBAC avançado.
- [ ] Revisão de permissões por feature.
- [ ] Exportação de logs de auditoria.

### 9.2 Observabilidade

Checklist:

- [ ] Sentry.
- [ ] Logs centralizados.
- [ ] Métricas Cloud Functions.
- [ ] Alertas automáticos.
- [ ] Monitoramento de fila WhatsApp.
- [ ] Monitoramento de NFS-e.
- [ ] Tracing.
- [ ] Dashboard técnico de saúde.

### 9.3 Qualidade

Checklist:

- [ ] Storybook.
- [ ] ADRs.
- [ ] Manual operacional.
- [ ] Mapeamento técnico.
- [ ] Playwright E2E.
- [ ] Testes de integração.
- [ ] CI/CD completo.
- [x] Feature flags.

Feature flags devem subir de prioridade:

- Permitem liberar redesign tenant por tenant.
- Permitem rodar UI legada e UI premium em paralelo.
- Reduzem risco de adoção.

Critérios de aceite:

- Erros críticos chegam em alerta.
- Fluxos críticos têm E2E.
- Mudanças grandes podem ser ligadas/desligadas por tenant.

## Fase 10 — Performance e Arquitetura

Prioridade: técnica.  
Objetivo: preparar crescimento.

### 10.1 Frontend

Checklist:

- [ ] Reduzir re-renderizações.
- [ ] Melhorar loading states.
- [x] Melhorar cache React Query.
- [ ] Virtualizar tabelas grandes.
- [ ] Melhorar hydration.
- [ ] Melhorar performance mobile.
- [ ] Prefetch de rotas críticas.
- [ ] Optimistic updates em ações simples.

Aplicar virtualização em:

- Financeiro.
- Tarefas.
- Clientes.
- Fiscal.
- Timeline.

### 10.2 Backend

Checklist:

- [ ] Revisar Cloud Functions pesadas.
- [ ] Criar filas reais.
- [ ] Criar retry inteligente.
- [ ] Melhorar observabilidade.
- [ ] Melhorar monitoramento.
- [ ] Criar métricas operacionais.
- [ ] Criar tracing.
- [ ] Separar jobs longos de callables síncronas.

Critérios de aceite:

- Listas grandes não travam a UI.
- Jobs fiscais/WhatsApp têm retry e rastreabilidade.
- Dashboards usam agregações/cache.

## Fase 11 — Integrações Futuras

Prioridade: futura/estratégica.

Checklist:

- [ ] API pública.
- [ ] Webhooks.
- [ ] SAP.
- [ ] Integrações de domínio contábil.
- [ ] Receita Federal.
- [ ] Banco/Open Finance.
- [ ] Integrações com provedores fiscais adicionais.
- [ ] Integração com e-mail/caixa de entrada.

## Fase 12 — Diferenciais Premium

Prioridade: futura.  
Objetivo: criar efeito WOW.

Checklist:

- [ ] Empty states inteligentes.
- [ ] Micro animações.
- [ ] Gamificação leve.
- [ ] Saúde operacional visual.
- [ ] Heatmaps.
- [ ] Evolução da operação.
- [ ] Rankings internos.
- [ ] Metas operacionais.
- [ ] Alertas visuais de risco.
- [ ] Comparativos semana/mês.

Recomendação técnica:

- Usar microinterações com parcimônia.
- Considerar `framer-motion` apenas quando houver benefício claro.
- Evitar animações que prejudiquem performance mobile.

## 4. Ordem Real por Sprint

### Sprint 1 — Percepção premium e produtividade imediata

- [ ] Redesign global UI/UX (tokens, espaçamentos globais, Storybook).
- [x] Melhorar tabelas.
- [x] Melhorar sidebar.
- [x] Melhorar modais.
- [x] Melhorar dashboard com primeira versão v2.
- [x] Introduzir feature flags para UI nova.

### Sprint 2 — Operação diária e contexto

- [x] Cockpit Hoje.
- [x] Cliente 360.
- [x] Timeline operacional.
- [x] Score operacional.
- [ ] POP/base de conhecimento do cliente.

### Sprint 3 — Receita, cobrança e fiscal

- [x] Central financeira inteligente.
- [ ] WhatsApp timeline.
- [x] Fiscal wizard.
- [ ] Insights automáticos.
- [x] Score de inadimplência.

### Sprint 4 — Produto escalável

- [ ] IA operacional.
- [ ] White-label.
- [ ] Mobile premium.
- [ ] Métricas SaaS.
- [ ] Billing inicial.

## 5. Dependências Técnicas

| Entrega | Depende de |
|---|---|
| Dashboard v2 | Cache/agregações, design system, feature flag |
| Tabelas modernas | TanStack Table, virtualização, preferências por usuário |
| Cliente 360 premium | Timeline unificada, health score, dados de eventos |
| Central financeira | Score inadimplência, eventos financeiros, WhatsApp consolidado |
| Fiscal wizard | AppModal, WizardStep, validações fiscais mais fortes |
| IA operacional | Base de eventos, métricas consolidadas, scheduler de insights |
| White-label | Tenant theme, CSS variables dinâmicas, isolamento validado |
| Billing | Planos, medição de uso, limites por tenant |
| Mobile premium | Componentes responsivos, bottom sheets, cards substituindo tabelas |

## 6. Métricas de Sucesso

### Produto e UX

- Tempo para identificar próxima ação.
- Número de cliques até concluir tarefa.
- Uso do Cliente 360 antes de ações.
- Abertura do dashboard por dia.
- Uso de Command Palette.

### Operação

- Tarefas concluídas por dia.
- Atraso médio por tarefa.
- Percentual de tarefas sem responsável.
- Percentual de tarefas sem prazo.
- Fechamento concluído dentro do prazo.

### Financeiro

- Valor vencido.
- Valor recuperado por WhatsApp.
- Promessas de pagamento.
- Tempo médio de baixa.
- Aging por cliente.

### Fiscal

- NFS-e emitidas no prazo.
- Taxa de rejeição.
- Tempo médio de correção.
- Certificados a vencer.
- Rascunhos pendentes.

### SaaS

- Tenants ativos.
- Usuários ativos.
- Uso por plano.
- Custo por tenant.
- Volume por módulo.

## 7. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Redesign Big Bang quebrar adoção | Feature flags por tenant e rollout gradual |
| Dashboard ficar pesado | Cache/agregações via Cloud Functions |
| IA sugerir ações erradas | Explicabilidade, confirmação humana e logs |
| Tabelas configuráveis ficarem complexas | Começar com 3 views padrão antes de liberar customização total |
| White-label causar inconsistência visual | Restringir tema a tokens controlados |
| Multi-tenant gerar risco de vazamento | Testes automatizados de isolamento e auditoria de acesso |
| Mobile virar segunda experiência | Projetar componentes mobile-first para fluxos críticos |

## 8. Primeiro Corte Recomendado

Se o objetivo for gerar valor rápido com menor risco, executar nesta ordem:

1. [x] Feature flags de UI.
2. [x] AppModal + padrões de tabela.
3. [x] Sidebar/Command Palette com recentes e quick actions.
4. [x] Dashboard v2 com “O que precisa acontecer hoje”.
5. [x] Cliente 360 com health score e timeline como primeira classe.
6. [x] Financeiro com score de inadimplência.
7. [x] Fiscal wizard para emissão NFS-e.

Resultado esperado:

- Percepção premium imediata.
- Menos navegação.
- Melhor priorização diária.
- Base sólida para IA, white-label e billing.
