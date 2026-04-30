# Task: Redesign UI/UX completo preservando fluxos

## Objetivo
Refazer visual do sistema do zero (design system + shell + telas operacionais), mantendo 100% dos processos, integrações e mutações já existentes.

## Fases
- [x] Fase 1: Base visual (tokens, superfícies, shadows, layout shell)
- [x] Fase 2: Dashboard/Hoje/Financeiro no novo padrão
- [x] Fase 3: Clientes/Tarefas/Cliente 360 no novo padrão
- [x] Fase 4: Consolidação visual em telas restantes (Competências, Fiscal, IR, Admin)
- [x] Fase 5: QA técnico (tsc/build/lints) + checklist

## Decisões
| Decisão | Racional | Data |
|---|---|---|
| Preservar lógica e alterar apenas apresentação | Evitar regressões de processo | 2026-04-30 |
| Padronizar com `surface-subtle`, `card-shadow` e `kpi-value` | Consistência visual global | 2026-04-30 |
| Unificar header e blocos de filtros com `PageHeader` + `surface-subtle` | Escalabilidade visual por feature | 2026-04-30 |
| Validar cada fase com `tsc` + `build` antes de avançar | Garantia de estabilidade contínua | 2026-04-30 |

## Erros Encontrados
| Erro | Tentativa | Resolução |
|---|---|---|
| Scripts de algumas skills não presentes no repo | Executar scripts sugeridos | Aplicar guidelines manualmente via código |

# Task: TTRD Contábil — SaaS Product Architecture

## Goal
Redesign the accounting ERP into a scalable, action-driven SaaS product that guides accountants through their daily, weekly, and monthly workflows.

## Phases
- [x] Phase 1: Domain analysis (existing codebase reviewed)
- [x] Phase 2: Define system domains and responsibilities
- [x] Phase 3: Define user journeys
- [x] Phase 4: Define entities and relationships
- [x] Phase 5: Define navigation structure
- [x] Phase 6: Define product vision and differentiation

## Key Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Client as central entity | All workflows orbit the client — tasks, competências, fiscal, financial | 2026-04-30 |
| Cockpit as entry point | Accountant starts here every morning — SLA-driven, not menu-driven | 2026-04-30 |
| Competência as period-contract | Links client × service × time — the unit of work delivery | 2026-04-30 |
| Fechamento as ritual | Monthly closing is a ceremony with checklist, blockers, and sign-off | 2026-04-30 |
