# Auditoria Completa — JP Fiscal (ttrdcontabil)

- **Data:** 2026-07-02
- **Commit auditado:** `master` @ `c6a851d` (+ landing page não commitada)
- **Método:** 6 auditorias paralelas por dimensão (segurança, processos/negócio, telas/UX, UI/design system, qualidade técnica, Cloud Functions), com verificação executada de typecheck/lint/testes/build/audit e leitura direta de código. Achados confirmados no código-fonte, não supostos.
- **Baseline de comparação:** `AUDITORIA_MATURIDADE_2026-05-28.md` (nota 3.2/5) e `PLANO-PRIORIZACAO-2026-05-28.md`.

---

## 1. Veredito executivo

A fundação continua **acima da média** para o porte: criptografia AES-256-GCM real de credenciais fiscais, webhook do WhatsApp fail-closed com HMAC, coleções sensíveis (`nfse_emitidas`, `whatsapp_*`) como `write: if false`, trilha de auditoria append-only com redação de PII, batch Firestore saneado em 100% dos usos, e um módulo fiscal de **integração real** (8 conectores municipais ABRASF com XML assinado por A1) — não é mock. O pipeline está verde: `tsc` 0 erros, build de produção passa, 31 rotas.

**Mas a plataforma regrediu em relação ao plano de 28/05: nenhum item dos Blocos 1 e 2 foi executado**, e a auditoria desta rodada encontrou **5 P0 novos** que a de maio não tinha detectado — todos no coração do fluxo contábil (autorização de leitura, cobrança de cliente excluído, numeração de NFS-e, fila de cobrança). O gate comercial ("laudo ≥ 3.5 e zero P0 aberto") **permanece fechado**.

### Nota geral: **3.1 / 5** (era 3.2 em 28/05)

A leve queda reflete P0 estruturais que a auditoria anterior não pegou (não uma regressão de código), somados ao fato de que 5 semanas se passaram e a dívida de "provar" (testes de rules, observabilidade) segue 100% intocada.

### Pode vender para…?

| Segmento | Veredito | Condição |
|---|---|---|
| Demo / apresentação | ✅ Sim | Visual forte e coeso. Não tocar régua WhatsApp nem histórico de erro NFS-e ao vivo. |
| Piloto interno (time JP) | ⚠️ Com ressalva | Corrigir P0-1 (leitura) e P0-3 (cliente excluído cobrado) antes. |
| Escritório pagante operando sozinho | 🚫 Não | Todos os 5 P0 + observabilidade mínima + testes de rules rodando. |
| Multi-escritório / crítico | 🚫 Não | Falta filtro universal de tenant, App Check, error tracking, retry de fila. |

---

## 2. Score por dimensão

| # | Dimensão | Nota | Δ vs 28/05 | Comentário |
|---|---|---:|:--:|---|
| 1 | Segurança & dados | **3.0** | ↓ | Escrita sólida (papel+tenant). **Leitura fina só na UI (P0)**; senha admin real commitada (P0). |
| 2 | Processos & negócio | **2.5** | ↓ | Cliente excluído segue cobrado (P0); NFS-e sem RPS persistido (P0); sem backfill; recorrência fixa dia 20. |
| 3 | Cloud Functions | **3.3** | = | Fundações fortes; fila que para sozinha e emissão direta sem dedup mordem o fluxo. |
| 4 | Telas & UX | **2.8** | ↓ | 2ª rodada (§10) achou densidade alta de P1: edição bloqueada em silêncio, drop que "some", erro-vira-vazio, cadastro sem validação real. |
| 5 | UI / Design System | **3.4** | ↑ | DS real e usado no miolo; marca em hex duplicado 3×; dark mode fantasma; login fora do DS. |
| 6 | Qualidade técnica | **3.3** | = | Pipeline verde; índices de tenant não acompanham; ~35 arquivos mortos; cobertura ~9 testes. |
| — | Observabilidade | **2.0** | = | Sem error tracking, sem alerta de falha de fila/backup. Intocado desde maio. |
| — | Testes | **2.0** | = | Rules suite ainda `describe.skip`; 16 testes só rodam com emulador que ninguém sobe. |

---

## 3. Delta do plano (o que mudou desde 28/05)

| Bloco | Item | Status |
|---|---|:--:|
| 0 (P0 técnico) | Rules `whatsapp_*`/`nfse_erros`, HMAC webhook, remoção `xmldom` | ✅ Continua feito |
| 1 (PROVAR) | Rodar suíte de rules em CI (JDK 21) | ❌ Não feito — 16 testes seguem skipped, sem CI |
| 1 | Preencher evidências (GO-LIVE, VALIDACAO-PERMISSOES, REGRESSAO) | ❌ Não feito |
| 1 | Deploy das novas rules | ⚠️ Não verificável no repo |
| 2 (ROBUSTEZ) | Error tracking (Sentry) front + Functions | ❌ Não feito — grep = 0 |
| 2 | Retry da fila WhatsApp honrando `nextRetryAt` | ❌ Não feito — job `falhou` nunca reprocessa |
| 2 | Alerta de falha de backup | ❌ Não feito |
| 2 | Consulta-prévia por RPS na emissão direta | ❌ Não feito — RPS nem é persistido (P0) |
| 3 (PODAS UX) | Separar `/dashboard` (leitura) de `/hoje` (execução) | ✅ Feito — dashboard virou "Visão executiva" com link p/ fila |
| 3 | Simplificar `/hoje` aos 4 blocos (tirar Kanban/Agenda) | ❌ Não feito — Kanban e Agenda seguem embutidos |
| 3 | Unificar `PageHeader` em todas as páginas | ⚠️ Parcial — `/hoje` e `/clientes` usam; dashboard mantém `<h1>` próprio |
| 3 | Recolher Administração no rodapé da sidebar | ⚠️ Parcial — recolhida ✔; mas Produtividade segue atrás de `telaKey: 'admin'` |
| 3 | Skeleton no loading do cockpit | ⚠️ Parcial — dashboard ✔; `/hoje` ainda com `Loader2` nu |

**Leitura:** o trabalho das últimas 5 semanas foi para **UI/marca (login + landing)** e para o Bloco 3 (podas de UX, parcialmente) — exatamente a inversão que o plano mandava evitar. A dívida de "provar" (Bloco 1) e observabilidade (Bloco 2), marcada como inegociável antes de qualquer pagante, segue **100% intocada**.

---

## 4. Achados P0 (bloqueiam pagante — corrigir antes de tudo)

### P0-1 · Controle de acesso de leitura vive só na UI — qualquer usuário ativo lê tudo
**`firestore.rules` (regras de `read` de lancamentos, ir_declaracoes, competencias, fechamento, nfse, clientes) + `src/lib/permissions.ts:24-34`**
As regras de `read` usam apenas `canRead()` = `isAtivo()` (autenticado + ativo + mesmo tenant), **sem checar `perfil` nem o array `telas`**. O `telas` — mecanismo que o admin configura por usuário para restringir acesso — só é avaliado no `AuthGuard`/sidebar (cliente). Um usuário `leitura` restrito a `['hoje','clientes']` lê, pelo console do navegador via SDK, **lançamentos financeiros, declarações de IR, competências, fechamentos, NFS-e e CPF/CNPJ de clientes**. Como o app é 100% client-side (static export), as rules são a única fronteira real — e elas não aplicam o controle fino. *Ressalva honesta: num escritório onde todos veem todos os clientes, parte disso pode ser intencional; o que não é defensável é o controle por `telas` ser anunciado e 100% burlável.* **Ação:** mover a checagem de `perfil`/`telas` de leitura para dentro das rules, por coleção.

### P0-2 · Senha real de admin commitada no repositório
**`src/scripts/seed.ts:178-179`** (rastreado pelo git)
Senhas de administrador em texto puro no código, incluindo o que parece a senha pessoal real de `joaodamasit@gmail.com` (`Jopa@0206`). Qualquer um com acesso ao repo obtém login admin em produção. **Ação imediata:** rotacionar essa senha (provavelmente reutilizada em outros serviços), remover do código e purgar do histórico do git.

### P0-3 · Cliente "excluído" continua sendo cobrado e ganhando competências/NFS-e
**`src/lib/firestore-client.ts:327-346` + schedulers `competencias.ts:71`, `lancamentos.ts:73`, `fechamento.ts:51-54`, `nfse/rascunhos.ts:77-81`**
`softDeleteDocument` só grava `deletedAt`/`deletedById` — não muda `status` nem inativa `clientes_servicos`. **Nenhuma Cloud Function checa `deletedAt`** (grep em `functions/src` = 0); todas filtram só `status == 'ativo'`. Resultado: os schedulers do dia 1º seguem criando competências, **lançamentos de honorários (cobrança!)**, fechamentos e rascunhos de NFS-e para cliente excluído, indefinidamente. Agravante: `useDeleteCliente` existe mas não está exposto em nenhuma tela, e a inativação por `status` também não limpa tarefas/competências abertas (órfãos no cockpit e nos alertas diários). **Ação:** exclusão/inativação precisa cascatear para `status` de `clientes_servicos` e os schedulers precisam filtrar `deletedAt == null`.

### P0-4 · NFS-e: `numeroRps`/`serieRps` nunca são persistidos
**`functions/src/nfse/emitir.ts:195-221` (write sem RPS) + `ciclo.ts:190-195` + conectores (`abrasf-base.ts:44`, `sao-paulo.ts:31`…)**
Os conectores geram RPS com fallback `numero = input.numeroRps ?? String(Date.now())`, mas o write em `nfse_emitidas` **não inclui** `numeroRps`/`serieRps`, e o rascunho nunca recebe `dados.numeroRps` (confirmado lendo o código: linhas 195-221 e 223-274 não gravam o campo). Consequências: o retry lança sempre `'Retry fiscal bloqueado: o rascunho não possui RPS persistido'`, a consulta prévia `where('numeroRps','==',...)` nunca encontra nada, e em timeout pós-envio o RPS consumido na prefeitura fica **sem registro local** → risco de nota duplicada ou perdida. A numeração por `Date.now()` também não é sequencial por série, como as prefeituras exigem. **Ação:** persistir `numeroRps`/`serieRps` no rascunho e em `nfse_emitidas`, com controlador de numeração sequencial por série.

### P0-5 · Fila de cobrança WhatsApp para sozinha e em silêncio
**`functions/src/whatsapp/scheduler.ts:45-54` + `core.ts:392`**
`processarFilaWhatsapp` consulta `whatsapp_jobs` filtrando só por `tenantId` com `.limit(50)`, **sem** `where('status','==','agendado')` e **sem** `orderBy` — o filtro de status é feito em memória (linha 54). À medida que jobs `enviado`/`falhou` se acumulam, os 50 documentos retornados deixam de conter pendentes e a régua **para de despachar, sem erro e sem alerta**. Um job que falha vira `falhou` (linha 59) e nunca é reprocessado; o `nextRetryAt` gravado em `core.ts:392` é código morto. Combinado com a ausência total de error tracking (Bloco 2), uma cobrança que não sai não gera nenhum alarme. **Ação:** filtrar `status == 'agendado'` na query com `orderBy(scheduledFor)`, e implementar o reprocesso de `falhou` honrando `nextRetryAt` + alerta ao esgotar tentativas.

---

## 5. Achados P1 (bloqueiam pagante sério)

### Processos & negócio
- **Emissão direta (sem rascunho) não tem guarda de duplicidade** — `emitir.ts:147-163` — o lock transacional só roda `if (input.rascunhoId)`. Emissão avulsa pelo modal: dois cliques/dois usuários = duas notas reais na prefeitura.
- **Editar competência quebra o ID determinístico e duplica com o scheduler** — `competencia-form.tsx:145-169` — em edição, cliente/serviço/mês/ano seguem editáveis mas o save usa `updateDocument` no ID antigo; a guarda anti-duplicata só existe na criação. Editar junho→julho mantém o ID `..._2026_06` → no dia 1º de julho o scheduler cria outra de julho.
- **Competência/fechamento sem regra de transição de status** — `competencia-form.tsx:282-296` — `<Select>` livre: dá para concluir com tarefas abertas, reabrir concluída, ressuscitar cancelada, sem validação e sem `concluidaEm/concluidaPor`. `updateFechamentoField` segue aceitando updates após a revisão registrada (não congela).
- **Honorários automáticos não vinculam `competenciaId`** — o scheduler grava só `competencia: "MM/YYYY"` (string), sem `competenciaId`; o filtro do financeiro e o card "Lançamentos" da competência (`where('competenciaId','==',...)`) nunca acham os honorários do mês. No manual, `lancamento-form.tsx:29` tem o campo no schema mas **não existe input na UI**.
- **Status manual `atrasado`/`estornado` some dos KPIs e da cobrança** — `financeiro/services.ts:20-24` + `financeiro-prioridade.ts:5` — todo cálculo de atraso usa `status == 'pendente'`; um lançamento marcado 'atrasado' à mão some de `somaAReceber`, `somaEmAtraso`, da fila de cobrança e dos alertas. Dois modelos de "atrasado" coexistindo = erro contábil silencioso.
- **Edição de tarefa/IR com data existente falha em silêncio** — `tarefas/[id]/editar/page-client.tsx:16-29` + `tarefa-form.tsx:35` — a página passa o doc cru; `dataPrazo` chega como `Timestamp`, mas o schema é `z.string()` e o input é `type="date"`. Campo aparece vazio, zod rejeita no submit **sem mensagem** — usuário clica "Salvar" e nada acontece.
- **Sem backfill: mês pulado ou cliente cadastrado no meio do mês fica sem competência/honorário** — `competencias.ts:30-32` + `lancamentos.ts:45-47` — usam só o mês corrente na hora da execução; não há retroativo nem callable manual. Recuperação = criar competência manual, uma a uma.
- **Recorrência de tarefas rígida: prazo fixo dia 20, sem responsável** — `competencias.ts:107-124` — `new Date(ano, mes-1, 20)` hardcoded para toda tarefa recorrente, sem motor configurável (DAS dia 20, eSocial dia 15, DCTFWeb dia 25…). Para escritório contábil, o calendário de obrigações por prazo legal é o coração do processo.
- **IR sem dedup por cliente+ano-base e checklist não-atômico** — `ir-form.tsx:112-136` — usa `createDocument` (ID automático) → duas declarações do mesmo cliente/ano coexistem; checklist são 6 `createDocument` em `Promise.all` sem rollback; `status: 'entregue'` não exige `dataEntrega`/`numeroRecibo`.

### Segurança & Functions
- **`recriarRegras`/templates default do WhatsApp sem verificação de perfil** — callable exige só auth, não perfil admin (os demais callables WhatsApp checam `financeiro`).
- **Índices compostos não cobrem o filtro automático de `tenantId`** — `firestore-client.ts:219-221` vs `firestore.indexes.json` — `listDocuments()` injeta `where('tenantId','==')` em toda coleção; combinado com os `orderBy`, exige índices que não existem (`tarefas(tenantId,status,dataPrazo)`, `lancamentos(tenantId,clienteId,dataVencimento)`…). Hoje só funciona porque o doc do usuário não tem `tenantId`; ao ativar multi-tenant, Tarefas/Hoje/Financeiro/Fiscal quebram com `FAILED_PRECONDITION`.
- **16 vulnerabilidades (4 high) vindas de `firebase-admin` que só código morto usa** — `package.json:49` — importado apenas por `_api_backup/**` (morto), `auth.ts` e `seed.ts`. Com `output:'export'` não há runtime server; remover do front zera o `npm audit` de produção. `bcryptjs` e `jose` são 100% mortas (zero imports).

### UI / UX
- **Erros do Firebase chegam crus ao usuário** — `error-message.ts:1-5` — a função "de tradução" repassa `error.message`; `permission-denied` vira toast em inglês. Usada em 49 pontos de 18 arquivos.
- **Filtros de tarefas gravados mas nunca restaurados** — `tarefas/page.tsx:69` — o valor lido do localStorage é descartado (`const [, saveFilters] = ...`); persistência write-only. O hook `use-persisted-filters` só é usado em 2 telas.
- **Não existe página 404 — rota inválida renderiza o dashboard** — `firebase.json` catch-all `** → /dashboard.html`; links quebrados ficam mascarados e indetectáveis em produção.
- **Dark mode é feature fantasma** — `layout.tsx:33-40` — `next-themes` instalado, tokens `.dark` completos e dezenas de `dark:` nos componentes, mas **não há `ThemeProvider`** em nenhum layout, sem toggle, sem `suppressHydrationWarning`. Todo esse investimento é código morto; o app é permanentemente light.
- **Marca duplicada em 3 lugares sem fonte única** — `login-form.tsx:31-38` + `landing-data.ts:33-37` + `app-sidebar.tsx:202-204` — os tokens `--brand-*` documentados no DS nunca foram portados para `globals.css`; a marca vive em hex copiado à mão. Login inteiro foi construído fora do DS (hex + inline styles + paleta `gray-*`).
- **Título de página tem 5 padrões concorrentes** — `PageHeader` (só em hoje/clientes) vs `text-2xl` (dashboard) vs `text-lg` (fiscal/produtividade) vs `.text-title` vs `text-base`.
- **Contraste: `text-warning` em texto pequeno (~2.7:1) e alphas abaixo de AA** — `tarefas/page.tsx:289-304`, `agenda-view.tsx:94`, `login-form.tsx:221` — o próprio Badge oficial já corrige para `text-amber-800`, mas dezenas de usos diretos ficaram para trás.
- **Landing sem acesso ao login em mobile** — `landing-nav.tsx:53` — "Entrar" é `hidden sm:inline-flex` sem menu hamburger; em celular, cliente existente não acha o login.
- **Lint quebrado (gate de CI vermelho)** — `landing/motion.tsx:37` — `react-hooks/set-state-in-effect`; `npm run lint` sai com erro.
- **CTA de WhatsApp da landing com telefone placeholder** — `landing-data.ts:26` — `WHATSAPP_DESTINO = '55XXXXXXXXXXX'` em produção; todo lead cai num link quebrado.

---

## 6. Achados P2 (maturidade / polimento)

- **Concorrência last-write-wins** nos forms (tarefa/competência/lançamento salvam o objeto inteiro via `updateDocument` sem versão/transação).
- **Kanban "Hoje" com bug de timezone** — `kanban-board.tsx:38-49` — `isoToday()` usa `toISOString()` (UTC): entre 21h e 0h BRT retorna o dia seguinte; drop grava `T00:00:00` destoando do padrão `T12:00` do app.
- **Concluir tarefa pelo form não grava `dataConclusao`** (diverge de `concluirTarefa`) → métrica de conclusão inconsistente.
- **sla-score órfão** — `sla-score.ts` tem 3 testes verdes mas **zero uso** em `src/`: a priorização por SLA regrediu ou o teste dá falsa cobertura. Boost fiscal por `titulo.includes('fiscal')` é heurística frágil.
- **~35 arquivos mortos** — `_api_backup/**` (29 arquivos), camada `src/hooks/queries/*` duplicada e divergente da viva (`features/*/queries.ts`), `layout/header.tsx`, keyframe `fadeSlideUp` referenciado e nunca definido.
- **Queries sem `limit()` em agregações fiscais** — `fiscal/services.ts:66-77` baixa `nfse_emitidas` inteira por status a cada snapshot; padrão "baixa 500 e filtra no client" em `getClientes`/`getCompetencias`.
- **Dashboard fora do padrão de dados** — `dashboard/page.tsx` (1.005 linhas) usa `useEffect`+`setState` sem TanStack Query: sem cache, refaz ~5 queries pesadas a cada visita.
- **Índices provavelmente órfãos** em `firestore.indexes.json` (~10 índices sem query correspondente após a migração para filtro client-side).
- **Schedulers sem filtro de `tenantId`** (alertas/inadimplência) — ok em single-tenant, landmine se um 2º tenant entrar.
- **Horários de cron divergem dos comentários** (backup roda 05:00 BRT, comentário diz 02:00; idem alertas/competências).
- **Webhook: status de mensagem pode regredir** (`delivered` após `read` rebaixa o status; Meta não garante ordem).
- **Log de auditoria escrito pelo cliente é forjável/omissível** — `logs_auditoria` permite create a qualquer `isAtivo()` com `usuarioId` controlado pelo cliente; integridade depende da cooperação do cliente.
- **Usuário pode auto-editar o próprio `telas`** — a regra de update de `usuarios` protege `perfil/ativo/tenantId` mas não `telas`.
- **CPF/CNPJ e valor monetário sem máscara** em vários forms (`nfse-emissao-form.tsx:497,565`) apesar de existir `cpf-cnpj-input.tsx` no projeto.
- **Fiscal re-implementa loading/empty inline** em vez dos componentes oficiais (`TableRowSkeleton`/`TableEmptyState`); badges de status re-implementados por módulo (4 vocabulários).
- **Cobertura de testes muito fina** — 9 testes ativos para 259 arquivos; zero teste nas Cloud Functions (assinatura XML/NFS-e), agregações fiscais, fechamento e KPIs.
- **Higiene**: `package.json` name `"app-temp"`; `sr-only "Close"` em inglês; PFX armazenado em claro no Storage (mitigado por rules deny); Sora e `appConfig.brandPrimary` documentados mas não usados.

---

## 7. O que está BEM FEITO

1. **Módulo fiscal é integração real** — 8 conectores municipais ABRASF com XML assinado por certificado A1 (RSA-SHA1+C14N, exigido pelo padrão), SOAP/REST reais, ambientes homologação/produção com trava `producaoLiberada`, ciclo completo de consulta/cancelamento. Não é mock.
2. **Segurança de escrita e Functions exemplar** — AES-256-GCM real via Secret Manager, webhook Meta fail-closed com HMAC constant-time, redação de PII/segredos na auditoria, autorização por papel+tenant nas rules e no servidor, coleções sensíveis `write: if false`, Storage deny-by-default.
3. **Batch Firestore e idempotência saneados** — 100% dos 7 pontos re-instanciam o batch após commit (o bug de abril não reaparece); competências/fechamentos/honorários usam IDs determinísticos que impedem duplicação entre execuções do scheduler.
4. **Camada de dados bem desenhada** — `firestore-client.ts` como acesso único com auditoria automática e redação; TanStack Query consistente com `createFeatureKeys`, staleTimes semânticos e invalidation por prefixo; zero listeners `onSnapshot` (nenhum vazamento possível).
5. **Design system real e disciplina visual** — `globals.css` é um DS de verdade (semânticos completos, surfaces, utilities de domínio), kit próprio acima do shadcn (`KpiCard`, `DataTableShell`, `EmptyState`, `StatusBadge`), 86 usos de `tabular-nums`, mobile pensado (Sheet, FAB, linhas extras). Login e landing têm direção de arte forte e coerente.
6. **Pipeline verde de verdade** — `tsc --noEmit` 0 erros, build de produção passa com React Compiler, export estático de 7,5 MB.

---

## 8. Plano de ação priorizado

**Sprint 1 — destravar o gate (P0, ~1 semana):**
1. Rotacionar e remover a senha do `seed.ts`; purgar do histórico (P0-2). *(horas)*
2. Filtrar `deletedAt`/`status` nos 4 schedulers e cascatear inativação para `clientes_servicos` (P0-3). *(1-2 dias)*
3. Persistir `numeroRps`/`serieRps` e adicionar controlador de numeração por série (P0-4). *(2-3 dias)*
4. Corrigir a query da fila WhatsApp (`status=='agendado'` + `orderBy`) e implementar reprocesso de `falhou` + alerta (P0-5). *(1-2 dias)*
5. Mover checagem de `perfil`/`telas` de leitura para as Firestore rules por coleção — ou decidir formalmente que leitura é liberada a todo staff e remover o `telas` como "controle de acesso" (P0-1). *(2 dias + decisão do dono)*

**Sprint 2 — pagar a dívida de prova (Bloco 1+2, o que o plano de maio já mandava):**
6. Subir JDK 21 em CI e rodar `test:rules` (16 testes hoje skipped); preencher os 3 arquivos de evidência de homologação.
7. Error tracking (Sentry) no front e nas Functions; alerta de falha de backup.
8. Guarda de idempotência na emissão direta de NFS-e (P1); dedup de IR por cliente+ano.

**Sprint 3 — robustez de fluxo e limpeza:**
9. Motor de recorrência de obrigações configurável (substituir o "dia 20" fixo); backfill de competência/honorário para mês pulado.
10. Traduzir erros no `error-message.ts`; consertar persistência de filtros; adicionar `not-found`.
11. Remover código morto (`_api_backup`, `firebase-admin`/`bcryptjs`/`jose`, hooks duplicados) → zera `npm audit` de produção; religar ou remover `sla-score`.
12. Ligar `ThemeProvider` (ou remover o dark morto); portar tokens `--brand-*` para o `globals.css`; unificar título em `PageHeader`; varrer contraste `text-warning`.

---

## 9. Cobertura desta auditoria

Auditadas por leitura direta de código: firestore/storage rules, auth/RBAC, todo `functions/src`, camada de dados, processos de todos os módulos de negócio, design system e a camada transversal de UX. **Verificações executadas:** typecheck, lint, vitest, `npm audit`, build de produção.

**Segunda rodada (§10):** a auditoria UX **tela a tela** dos 14 módulos foi executada — ver a seção 10 abaixo. Não foi executado o Playwright (exige browser + credenciais) nem homologação em ambiente real (emissão em prefeitura, envio WhatsApp).

---

## 11. Correções aplicadas (execução 2026-07-02)

> Todas em working tree, **não commitadas e não deployadas**. Cada lote passou por QA (executor: tsc/lint/build reais; reviewer: revisão de diff). Build do app 40/40 e das functions verdes.

**Lote 1 — segurança e P1 rápidos (QA aprovado):**
- Open-redirect no login (`?from=` sanitizado só para caminho interno) · `login-form.tsx`
- Senhas reais removidas do `seed.ts` (via env) · **rotação da senha real e purga do histórico do git seguem como ação manual do dono**
- Guard de auto-lockout do admin (não rebaixa/inativa o próprio usuário) · `usuario-form.tsx` · *reforço server-side pendente (entra no RBAC)*
- Bug P1-crítico: edição com data (Timestamp→string) — edições não são mais descartadas em silêncio · `form-dates.ts` + `tarefa-form.tsx` + `ir-form.tsx`
- Erros do Firebase traduzidos para pt-BR sem perder mensagens do app · `error-message.ts`

**Lote 2 — fricção de UX (QA aprovado):**
- Kanban/edição inline de prazo revalidam a fila (a mudança não some mais) · `hoje/page.tsx` + `kanban-board.tsx`
- CPF/CNPJ com dígito verificador (cliente + tomador NFS-e) · `cliente-form.tsx` + `nfse-emissao-form.tsx`
- "Erro-vira-vazio" agora mostra erro + retry · `produtividade`, `fiscal`, `ir`
- "Esqueci minha senha" no login (anti-enumeração) · `login-form.tsx`

**Lote 3 — P0 de Cloud Functions (QA aprovado com ressalvas):**
- Cliente excluído/inativo deixa de ser cobrado (soft-delete inativa + cascata para `clientes_servicos`; guard de `deletedAt` nos schedulers) · `firestore-client.ts` + `scheduler/*` + `fechamento.ts` + `nfse/rascunhos.ts` — **APROVADO**
- NFS-e: `numeroRps`/`serieRps` persistidos na transação antes do envio e reusados no retry; gravados em `nfse_emitidas`; dupla-emissão segue bloqueada · `nfse/emitir.ts` — **APROVADO com ressalva** (ver abaixo)
- Fila WhatsApp: query corrigida (não para mais com fila cheia), retry de `falhou` até 5 tentativas + alerta ao esgotar; **+ correção do tech lead**: falha precoce (config off/token ausente) agora também registra `nextRetryAt`/`attemptCount` e progride até `esgotado` (antes ficava preso) · `whatsapp/scheduler.ts` + `whatsapp/core.ts` — **APROVADO**

**Pendências antes de PRODUÇÃO (não bloqueiam merge):**
- **RPS 8 dígitos:** a numeração foi padronizada em 8 díg (`Date.now().slice(-8)`) para todos os municípios — ciclo de colisão ~27,8h. **Homologar por município** (especialmente SP/Barueri/Taboão) e implementar **numeração sequencial por série** como fix próprio (fica para lote fiscal dedicado).
- Toda a mudança fiscal exige homologação antes de produção (emite nota em prefeitura).

**Lote 4 — RBAC, trava de fechamento e financeiro (QA aprovado; rules validadas no emulador 31/31):**
- **RBAC de leitura nas Firestore rules (P0-1) — validado no emulador.** Leitura das coleções sensíveis (`lancamentos`, `ir_declaracoes`, `nfse_*`, `fechamentos`, `ir_checklist`, `fechamento_revisoes`, `clientes_fiscal*`) agora exige perfil **ou** override `telas` do usuário (espelha `canAccessTela`, sem lockout); cadastro/operacional segue aberto a qualquer ativo. Nenhum WRITE afrouxado. `npm run test:rules` = **31/31** (Java 21 disponível — destrava o Bloco 1 do plano de maio). · `firestore.rules` + `__tests__/rules/*`
- **Fechamento travado de fato após a revisão** — enforcement no app (`updateFechamentoField`) **e** server-side nas rules (edição bloqueada em mês travado; reabertura só-admin) + na Cloud Function que gera o mês; UI desabilita as células e mostra o estado; "Reabrir mês" só admin. · `fechamento.ts` + `fechamento/services.ts` + `fechamento/client.tsx` + `fechamento-table.tsx` + `fechamento-pendencias-cards.tsx`
- **Status manual `atrasado`/`estornado` removido do Financeiro** ('atrasado' volta a ser derivado); legado normalizado no load sem quebrar leitura; `dataPagamento` exigido quando `pago`. · `lancamento-form.tsx`

**Lote 5 — correções de UX e limpeza (QA aprovado; build 40/40):**
- Cadastro de cliente: **confirmação de descarte** ao cancelar com alterações não salvas (isDirty em todos os campos, sem falso-dirty). · `cliente-form.tsx`
- Edição de competência: **preserva o serviço** ao abrir (não apaga no mount) e **trava cliente/serviço/mês/ano** na edição (protege o ID determinístico contra duplicata com o scheduler). · `competencia-form.tsx`
- IR: **dedup por cliente+ano-base** antes de criar (evita declaração/checklist/tarefa duplicados). · `ir-form.tsx`
- **Limpeza de código morto:** apagados `_api_backup/**` (29 arquivos), `auth.ts`/`firebase-admin.ts`, `hooks/queries/*`, `use-action`/`use-paginated-query`, `sla-score` órfão (~3.250 linhas); removidas deps mortas `bcryptjs`/`jose`; `firebase-admin` movida para devDependencies. **`npm audit --omit=dev`: 16 → 7** (as 7 restantes são framework/transitivas: Next.js, @babel/core, @grpc/grpc-js, hono, js-yaml).

**Follow-ups menores (P2, não bloqueiam):** `fiscal_conectores` ainda com `canRead()`; sem bypass de admin para editar `fechamentos` de mês travado (precisa reabrir antes — consistente com o app); TOCTOU teórico no dedup de IR (double-submit — fix definitivo seria ID determinístico); as 7 vulnerabilidades restantes (bump de versão do Next); rotação manual da senha `Jopa@0206` + purga do histórico do git.

**Status dos 5 P0 da auditoria:** P0-1 ✅ (rules validadas) · P0-2 ✅ (código; falta rotação manual) · P0-3 ✅ · P0-4 ✅ núcleo (RPS persistido; numeração sequencial + homologação pendentes) · P0-5 ✅. **Nada commitado nem deployado; toda a mudança fiscal exige homologação antes de produção.**

---

## 10. Segunda rodada — auditoria UX tela a tela (14 módulos)

Varredura de cada tela com leitura de código, schemas Zod e componentes. **Nenhum P0 novo de UI puro** (os pontos irreversíveis — emissão/cancelamento de NFS-e — estão bem protegidos com ConfirmDialog e guarda de double-submit). Mas a densidade de **P1 de fricção e de dados** é alta e recorrente. Achados abaixo são adicionais aos transversais já listados (§5).

### Padrões que se repetem em vários módulos
- **"Erro-vira-vazio":** dashboard, produtividade, lista de IR e painel fiscal engolem falha de query com `.catch(() => [])` e renderizam "sem dados"/"R$ 0,00" como se fosse verdade — o usuário não distingue falha de vazio, sem retry.
- **Mutação que não revalida a query:** drop no Kanban e edição inline de prazo (`/hoje`) gravam no Firestore e dão toast de sucesso, mas **não invalidam** a query → a mudança "some" da tela até um refresh manual.
- **Sem confirmação de descarte:** nenhum form checa `isDirty` antes de sair; forms enormes (cliente, tarefa, competência) perdem tudo num misclick em Cancelar ou na navbar.
- **`PageHeader` só em `/hoje` e `/clientes`:** 5 padrões de cabeçalho/título coexistem; telas de criação (novo cliente, nova competência) nem têm título/voltar.
- **Ausência total de exclusão na UI:** clientes, serviços e (parcialmente) competências/tarefas não expõem excluir; quando existe ação de status sensível, quase nunca há `ConfirmDialog`.

### Clientes
- **[P1] Filtro de regime é aplicado depois da paginação** — `clientes/page.tsx:108-110` — filtra só os 20 da página atual; "Simples" pode mostrar "nenhum" na pág.1 com clientes Simples na pág.2; contador/paginação ignoram o filtro.
- **[P1] Cap silencioso de 500 na lista e na busca** — `services.ts:14` `limit(500)` + busca client-side; escritório com >500 clientes perde registros sem aviso.
- **[P1] CPF/CNPJ sem dígito verificador** — `cliente-form.tsx:28` valida só `min(11)`; o componente `CpfCnpjInput` com validação real (`utils.ts:110-141`) existe e **não é usado**. Aceita documento inválido num sistema fiscal.
- **[P1] Sem confirmação ao descartar o form gigante** — `cliente-form.tsx:888-893` — dezenas de campos; Cancelar/navbar apagam tudo. (Beira P0 por perda de digitação.)
- **[P2]** erro de lista sem retry; input de busca não reseta ao limpar; "Novo" sem título; CNPJ 404 na BrasilAPI falha em silêncio; telefone/CEP não validados e CNPJ duplicado permitido; upload de A1 sem validar tipo/tamanho + erro cru; `servicos/novo` é rota órfã (sem link).

### Competências + Tarefas
- **[P1-crítico] Editar qualquer tarefa/competência que já tem data descarta as edições em silêncio** — `tarefa-form.tsx:69,205,230` + schema `z.string()` — `initialData` chega com `dataPrazo` como `Timestamp`, o input `type="date"` mostra vazio e o zod rejeita o Timestamp no submit, **bloqueando o save inteiro sem mensagem**. O usuário muda status/responsável, clica Salvar, vê o spinner e as mudanças somem. Atinge toda tarefa com prazo (a maioria, num calendário fiscal). *Um dos agentes classificou como P0 por perda de dado; o mecanismo confirmado é bloqueio silencioso do save + descarte das edições.*
- **[P1] Editar competência limpa o serviço selecionado no mount** — `competencia-form.tsx:137` — o effect de `clienteId` roda ao abrir a edição e faz `setValue('clienteServicoId','')`; o zod `min(1)` bloqueia o save até re-selecionar.
- **[P1] Status é `<Select>` livre, sem regra de transição** — `competencia-form.tsx:282-296`, `tarefa-form.tsx:143-158` — concluir competência com tarefas abertas, reabrir concluída, ressuscitar cancelada; concluir tarefa pelo form não grava `dataConclusao` (diverge de `concluirTarefa`).
- **[P1] Listas mascaram erro como vazio** (mesmo padrão erro-vira-vazio).
- **[P2]** sem excluir/ConfirmDialog nos dois módulos; contador de itens enganoso; deep-link F5 dependente de rewrite; edição sem cabeçalho/voltar.

### Fiscal + IR
- **[P1] Painel fiscal engole erro e mostra vazio** — falha de query vira "nenhuma nota" sem retry.
- **[P1] IR: `status = entregue` não exige `dataEntrega` nem `numeroRecibo`** — `ir-form.tsx:27-37` — dá para marcar "entregue" sem a prova que a ferramenta existe para guardar; o detalhe só mostra os campos `if (dataEntrega)`, então passa despercebido.
- **[P1] IR sem dedup por cliente+ano, sem aviso na UI** — cada submit ainda recria 6 itens de checklist + 1 tarefa, multiplicando lixo.
- **[P2]** editar IR com ID inexistente = spinner infinito (`ir/[id]/editar/page-client.tsx:13-28`, sem `else/catch`); checklist ordena por `criadoEm` ignorando o campo `ordem`; toggle de checklist sem tratamento de erro; 3 mapas de status divergentes; notas rejeitadas sem retry acionável.

### Dashboard, Hoje, Fechamento, Relatórios, Serviços
- **[P1] Dashboard esconde todos os erros** — `dashboard/page.tsx:565-585` — KPI/recálculo com `.catch(()=>null)` e listas com `allSettled`→`[]`; o executivo vê "0 clientes / R$ 0,00 / sem alerta crítico" como dado real.
- **[P1] Dashboard sem cache e sem indicação de "atualizando"** — `useEffect`+`setState` refaz ~5 queries pesadas a cada visita, sem botão Atualizar nem spinner de refetch.
- **[P1] Kanban drop e edição inline de prazo gravam mas não revalidam** — `kanban-board.tsx:189-195`, `hoje/page.tsx:170-179` — a mudança some da tela apesar do toast (só assign/bulk chamam `refresh()`).
- **[P1] "Encerrar revisão do mês" (Fechamento) não congela nada** — `client.tsx:153-178` — a tabela segue 100% editável após a revisão e o snapshot salvo diverge da realidade em silêncio; a UI sugere um congelamento que não existe.
- **[P1] Produtividade não tem exportação** apesar de `export-csv.ts`/`export-excel.ts` prontos e usados noutras telas; e erro-vira-vazio.
- **[P2]** dois dashboards inteiros mantidos por flag com títulos divergentes; curva-S usa `updatedAt` como proxy de conclusão; drop em "Atrasadas" grava prazo=hoje (no-op enganoso) + timezone; filtros de prioridade/responsável/foco não persistem; bulk-concluir sem confirmação; `/hoje` e `/admin/servicos` com `Loader2` nu; "Gerar COB01-20" cria 20 docs sem confirmação; textos sem acento em vários toasts do cockpit.

### Financeiro, Admin, Premium, Login
- **[P1] Status manual `atrasado`/`estornado` vira registro-fantasma** — `lancamento-form.tsx:37` + `financeiro/services.ts:20-24` — o literal 'atrasado' some do Baixar, da fila de cobrança, do aging e de todas as abas de filtro (que reescrevem "atrasado" como `pendente & venc<hoje`). Beco sem saída operacional.
- **[P1] `status: 'pago'` manual não exige/gera `dataPagamento`** — `lancamento-form.tsx:36,197` — lançamento "pago" sem data não entra no KPI "Recebido no mês".
- **[P1] `competenciaId` no schema mas sem input na UI** — não há como vincular lançamento a competência pela tela; o valor só é lido para filtrar.
- **[P1] Baixar na Fila de Cobrança pula a confirmação de valor alto** — `fila-cobranca.tsx:139` vs `lancamento-baixar.tsx:58-59` — chamada só com `lancamentoId`, sem `valor`; o `AlertDialog` de valores > R$ 500 nunca dispara ali (baixa R$ 6.200 sem confirmar).
- **[P1] Admin pode se auto-rebaixar / auto-inativar sem guarda (auto-lockout)** — `usuario-form.tsx:163-172,306-326` — sem checar usuário logado nem "último admin"; no próximo load o `AuthGuard` expulsa o próprio admin de `/admin`, sem volta pela UI.
- **[P2]** valor sem máscara monetária (`type=number` + placeholder "0,00" com vírgula → `NaN` para quem digita 1.234,56); contador do cabeçalho mostra só a página; criar usuário pode deixar conta órfã no Auth se o 2º passo falhar; segredos do WhatsApp em `<Input>` texto puro; liberar Produção fiscal sem confirmação; Premium é placeholder órfão com botões sem handler; **Login sem "esqueci minha senha"**; **possível open-redirect via `?from=` não validado** (`login-form.tsx:49,63`); toggle de senha `tabIndex={-1}` (inacessível por teclado).

### O que está BEM FEITO na 2ª rodada
1. **Emissão e cancelamento de NFS-e** — resumo + ConfirmDialog com aviso de irreversibilidade + botão desabilitado durante o await; cancelamento com motivo obrigatório ≥10 chars.
2. **Baixa de pagamento com confirmação por risco** — valores > R$ 500 exigem AlertDialog com resumo (na tabela).
3. **Concluir tarefa na lista** — optimistic update com rollback, e ConfirmDialog extra para tarefas fiscais/urgentes.
4. **Histórico fiscal** — estados completos, erro tratado, banner de rejeitadas, paginação por cursor e export CSV/Excel.
5. **Login não vaza enumeração de e-mail** — erro colapsado em "e-mail ou senha inválidos" com tratamento pt-BR de rate-limit/bloqueio.

### Ajustes ao plano de ação (§8) a partir da 2ª rodada
Entram na **Sprint 1/2** por serem baratos e de alto impacto no uso diário:
- Corrigir a edição com data (normalizar `Timestamp`→`YYYY-MM-DD` no `initialData` de tarefa/competência/IR) — bug que afeta toda edição com prazo.
- Invalidar a query após drop/edição inline no `/hoje`.
- Trocar `.catch(()=>[])` por estado de erro real em dashboard/produtividade/fiscal/IR.
- Validar `?from=` como caminho interno no login (open-redirect) e adicionar "esqueci a senha".
- Guarda de auto-lockout no admin (impedir rebaixar/inativar o próprio usuário / último admin).
- Plugar `CpfCnpjInput` (dígito verificador) no cadastro de cliente e no tomador da NFS-e.
- Congelar de fato o fechamento após a revisão (ou remover a promessa de congelamento da UI).

