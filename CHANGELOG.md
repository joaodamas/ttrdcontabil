# Changelog — JP Fiscal (ttrdcontabil)

Todas as alterações relevantes do projeto são registradas aqui: **o que mudou, por quê e quando**.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Datas no padrão `AAAA-MM-DD`.

Convenção para novas entradas:
- Adicionar no topo, logo abaixo de `## [Não lançado]`.
- Agrupar por tipo: `Adicionado`, `Corrigido`, `Alterado`, `Removido`, `Segurança`.
- Cada item referencia o commit/lote quando existir, e sinaliza se **exige homologação** (mudança fiscal) ou **exige decisão do dono** (chave, config, risco).
- Nada aqui substitui a auditoria completa em `docs/AUDITORIA-COMPLETA-2026-07-02.md` — o changelog é o rastro cronológico; a auditoria é o raio-x por dimensão.

---

## [Não lançado]

### Pendências que exigem decisão do dono
- Sentry — precisa de DSN para habilitar monitoramento de erros em produção.
- Recorrência de tarefas configurável — depende de um calendário de obrigações fiscais a ser definido.
- Bump do Next.js — fecha as 7 vulnerabilidades restantes do `npm audit`, mas é major/risco de quebra.
- TTL de documentos/coleções — precisa configuração no console do Firebase.
- Rotação de uma senha de admin que vazou no histórico do git (rotação manual, fora do código — valor não reproduzido aqui de propósito).
- **Monitorar o perfil `financeiro` em produção pós-deploy das rules (2026-07-07):** risco identificado de regressão de leitura em `clientes_fiscal`/`clientes_fiscal_integracao` se algum `usuarios/{uid}` não tiver o array `telas` (usuários criados via `seed.ts` não gravam esse campo). O dono decidiu deployar mesmo assim; falta ainda adicionar `financeiro` em `canReadFiscalConfig()` (ou confirmar que todo `financeiro` ativo tem `telas`), cobrir com teste, e colocar `.catch` nos dois `Promise.all` sem tratamento (`clientes/[id]/fiscal/page-client.tsx`, `features/fiscal/services.ts`) para que uma leitura negada não deixe a tela em branco sem aviso.

### Gaps conhecidos (backlog, não bloqueiam)
- A checagem de "sem tarefas abertas" para concluir competência só existe no client — Firestore rules não faz query em coleção, só valida documento por path. Fechar de vez exige uma Cloud Function (o trigger `functions/src/triggers/tarefa-concluida.ts` já tem a lógica de referência e pode ser reaproveitado).
- Sidebar deveria ser "sempre escura" conforme `docs/design-system`, mas hoje só acompanha o tema (`bg-card`) — os tokens `--sidebar-*` existem no CSS mas nenhum componente os usa. Desvio pré-existente, não causado pelo dark mode.
- Dark mode não testado visualmente em navegador (ambiente do agente é headless) — conferir `/dashboard`, `/tarefas`, `/fechamento`, `/clientes/[id]`, `/premium` antes de liberar.

---

## [Lote 7] — 2026-07-07 (commits `7eb554f`, `0256f78`, `1ce2998`)
### Adicionado
- **Matriz de transição de status** para competência e tarefa (`src/lib/status-transitions.ts`), aplicada no `<Select>` de `competencia-form.tsx`/`tarefa-form.tsx` (filtra opções por papel do usuário, bloqueia "concluir" com tarefa aberta) e reforçada em `firestore.rules` (não pode ser burlada via API direta). 17/17 testes unitários + 40/40 `test:rules` (31 originais + 9 novos). Regra confirmada com o dono em 2026-07-07: reabrir/ressuscitar **competência** concluída/cancelada é **admin-only**; em **tarefa** também vale para o responsável atual.
- **Dark mode ligado** (`ThemeProvider` do `next-themes`, já era dependência instalada mas nunca usada) + toggle Claro/Escuro/Sistema na TopBar. Corrigido contraste em: FAB mobile, badges de prioridade/SLA de tarefas, chips de regime tributário, aviso de credenciais no cadastro de cliente, linha do gráfico de tendência do cliente.
- `CHANGELOG.md` criado e `AGENTS.md` limpo (removido conteúdo enganoso sobre versão do Next.js).

### Deploy — 2026-07-07
Publicado em produção (`ttrdcontabil-jpproject`): **hosting** (frontend com a matriz de status + dark mode), **Firestore rules** (RBAC do Lote 4 + reforço da matriz de status do Lote 7), **storage rules** (sem mudança de conteúdo) e **todas as Cloud Functions** — incluindo `emitirNfse`/`emitirNfseLote`/`retryNfse` com o `numeroRps` persistido do Lote 3, cuja **homologação por município foi confirmada pelo dono do produto antes do deploy**.

---

## [Lote 6] — 2026-07-03
### Adicionado
- Exportação na tela de produtividade.
- Exclusão de cliente e inativação de serviço (admin).
- Vínculo de honorários à competência (`competenciaId`) no scheduler e no seletor de lançamento.
- Alerta de falha no backup semanal do Firestore.
### Corrigido
- `dataConclusao` agora é registrada ao concluir tarefa/competência.
- Dashboard passa a exibir estado de erro com retry em vez de tela quebrada.

## [Lote 5] — 2026-07-03
### Adicionado
- Confirmação de descarte no cadastro de cliente.
### Corrigido
- Edição de competência (serviço preservado + campos-chave travados).
- Deduplicação de Imposto de Renda por cliente + ano.
### Removido
- ~3.250 linhas de código morto (`_api_backup`, hooks duplicados, `sla-score`).
### Segurança
- `npm audit --omit=dev`: 16 → 7 vulnerabilidades (firebase-admin movida para devDependencies; bcryptjs/jose removidas).

## [Lote 4] — 2026-07-03
### Adicionado
- RBAC de leitura nas Firestore rules (por perfil + override de telas), validado no emulador (`npm run test:rules` = 31/31).
- Trava de fechamento após revisão, reforçada no app e nas rules (server-side).
### Removido
- Status manual "atrasado/estornado" no módulo Financeiro (agora calculado, não editável).

## [Lote 3] — 2026-07-03 (P0 Functions)
### Corrigido
- Cliente excluído deixa de ser cobrado.
- RPS da NFS-e passa a ser persistido e reutilizado (evita duplicidade fiscal).
- Fila do WhatsApp ganha retry + alerta de falha.
> Exige homologação fiscal — mudança direta no fluxo de emissão de NFS-e.

## [Lote 2] — 2026-07-03
### Corrigido
- Revalidação no Kanban e em `/hoje`.
- Validação de CPF/CNPJ com dígito verificador.
- Erros que viravam tela vazia agora mostram retry.
- Fluxo de "esqueci minha senha".

## [Lote 1] — 2026-07-03
### Corrigido
- Open-redirect no login.
- Senhas removidas do `seed.ts` (não ficam mais hardcoded).
- Guard contra auto-lockout de admin.
- Bug de edição-com-data (Timestamp → string).
### Alterado
- Mensagens de erro do Firebase traduzidas para pt-BR.

## [2026-07-02] — Auditoria completa
- Auditoria de 6 dimensões + revisão UX tela a tela dos 14 módulos → `docs/AUDITORIA-COMPLETA-2026-07-02.md`.
- Nota geral: 3,1/5. Gate comercial (≥3,5 e zero P0) segue fechado até as pendências acima serem resolvidas.
- 5 P0 identificados na auditoria foram todos endereçados nos lotes 1–6 acima.

---

## [2026-05-28] e anteriores
- Identidade visual JP no login, app-config, sidebar e `/hoje`.
- Design system JP Fiscal + skill `jp-fiscal-design`.
- P0 pré-go-live: rules de WhatsApp/NFS-e/erros, assinatura de webhook, remoção do `xmldom`, testes de rules.
- `npm audit fix` — correção de vulnerabilidades transitivas (PR #1).
- Sessões 1–9 (histórico de 2026-05-10): virtualização, produtividade, quick-edit, FilterSheet, validações de NFS-e, DnD Kanban, swimlanes, templates de NFS-e, logs, notas POP, tendência 360, integração WhatsApp (régua de cobrança automática), Agenda, Heatmap, impacto fiscal, animações, views persistidas.
