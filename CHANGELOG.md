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

- Cadastro dos clientes na Spedy: hoje é manual (colar a chave de API por cliente, e criar a empresa direto no painel do Stage). A Spedy suporta uma hierarquia Owner/empresas-secundárias (`POST /v1/companies`) que permite automatizar isso pros 119 clientes de uma vez — inclusive **obrigatório** pro ambiente de teste, já que lá (arquitetura "API-First") não dá pra cadastrar empresa nem certificado pelo painel, só via API. Ainda não construído.

### Gaps conhecidos (backlog, não bloqueiam)
- A checagem de "sem tarefas abertas" para concluir competência só existe no client — Firestore rules não faz query em coleção, só valida documento por path. Fechar de vez exige uma Cloud Function (o trigger `functions/src/triggers/tarefa-concluida.ts` já tem a lógica de referência e pode ser reaproveitado).
- Sidebar deveria ser "sempre escura" conforme `docs/design-system`, mas hoje só acompanha o tema (`bg-card`) — os tokens `--sidebar-*` existem no CSS mas nenhum componente os usa. Desvio pré-existente, não causado pelo dark mode.
- Consulta e cancelamento de NFS-e via Spedy não implementados (só emissão).

---

## [Lote 10] — 2026-07-07 (commits `325ba10`, `b058ca7`, `752bfb0`)
### Adicionado
- **Emissão automática de NFS-e — opt-in por cliente, semi-automática por padrão.** Decisão do dono: NFS-e recorrente sempre gera rascunho sozinho + avisa por e-mail (humano confirma antes de emitir); "totalmente automático" (emite sem revisão) só existe como opção avançada, desligada por padrão, com aviso de risco explícito na tela.
  - Cron novo `processarNfseRecorrenteDiaria` (06:30 BRT, diário) — respeita o `diaEmissaoNFSe` de cada cliente. Reaproveita a mesma lógica de elegibilidade do botão manual "Gerar rascunhos".
  - Toda emissão automática reaproveita `processarEmissao(input, rascunhoId)` — herda a transação de alocação/reuso de RPS já validada, em vez de um caminho paralelo mais frágil.
  - Toggle "Emissão automática (sem revisão)" na config fiscal do cliente.
- **Botão "Exportar PDF" na listagem de Clientes** — reaproveita o padrão de impressão via navegador já usado na ficha cadastral (sem lib de PDF nova); exporta a lista inteira respeitando os filtros ativos.

### Corrigido (achados numa auditoria de UX dedicada, antes do deploy)
- **Rascunho podia travar permanentemente em `processando`** se a function crashasse no meio de uma emissão — ficava invisível em todo KPI/lista/alerta e bloqueava qualquer nova tentativa pro cliente naquela competência. O alerta diário agora detecta e recupera automaticamente (30min de tolerância).
- Texto do modal "Preparar mês" dizia que rascunhos sempre ficam pra revisão antes de emitir — não é mais verdade pros clientes com emissão automática ligada; corrigido.
- **Visibilidade total, ponta a ponta:** card de contagem + badge na tela Fiscal, badge na tela do cliente (as duas rotas), tag "Auto" no histórico de notas (tela Fiscal, Histórico completo e export CSV/Excel) e no modal de logs de cada nota — usa um campo novo (`origemEmissao`) gravado em `nfse_emitidas`/`nfse_erros` a cada emissão.
- Nova seção no e-mail diário: "rascunhos gerados automaticamente hoje, aguardando revisão" — fecha o "avisa" do fluxo semi-automático.

---

## [Lote 9] — 2026-07-07 (commits `29491f7`..`e96dddc`)
### Confirmado
- **Primeira emissão de NFS-e via Spedy funcionou de ponta a ponta** — NFS-e nº 14, R$ 20,00, JPProject, status "Emitida", via ambiente de teste da Spedy (Stage). Valida o conector inteiro: payload, autenticação, polling, gravação no histórico.

### Corrigido
- Credenciais de configuração fiscal (chave da Spedy, token Simpliss, login/senha GIAP, códigos Conam) eram pré-preenchidas no formulário com o valor **já criptografado** vindo do Firestore. Salvar de novo sem alterar o campo reencriptava o ciphertext por cima do ciphertext a cada edição — corrompeu a chave da Spedy do JPProject (chegou a 694 caracteres; UUID real tem 36). Campos de credencial agora sempre abrem vazios, com placeholder "já configurado" quando existe valor salvo; só são reenviados (e recriptografados) se o usuário digitar algo novo. Afeta todos os provedores, não só Spedy.
- Host do ambiente de teste da Spedy estava errado duas vezes: primeiro usava `sandbox-api.spedy.com.br` (nome que a doc pública usa, mas está desatualizado/incorreto), depois foi trocado para sempre produção (`api.spedy.com.br`) — mas a chave configurada era da conta de **Stage** (`stage-app.spedy.com.br`, plano Desenvolvedor Grátis), que só autentica em `stage-api.spedy.com.br`. Confirmado por teste direto (curl sem credencial) e pelo guia oficial da Spedy. `ambienteEmissao='homologacao'` agora roteia certo para o Stage.

### Pendências que exigem decisão do dono (novas)
- Testar emissão pra outros tipos de cliente/regime tributário e, futuramente, outros tipos de nota (produto/NF-e) — combinado como próximo passo.
- Construir a automação de provisionamento em massa via `POST /v1/companies` (agora confirmada como não-opcional pro ambiente de teste, que é "API-First": não dá pra cadastrar empresa/certificado pelo painel do Stage).

---

## [Lote 8] — 2026-07-07 (commits `91681ee`, `34c86a1`, `17e082f`, `9392c4e`)
### Confirmado
- Dark mode aprovado pelo dono em teste real — "ficou perfeita, não vamos mexer".

### Corrigido
- Cabeçalho da sidebar cortava visualmente ("TTRD Contábil" + tagline quebrando em 3 linhas dentro de um container de altura fixa) — truncado em uma linha.
- Índices compostos do Firestore nunca tinham sido deployados (só as rules) — causava "Não foi possível carregar o painel" no dashboard. Publicados via `firebase deploy --only firestore:indexes`.
- **`getErrorMessage` descartava a mensagem real de toda Cloud Function**: erros de `httpsCallable` chegam com código prefixado (`functions/failed-precondition`), que nunca batia com as chaves sem prefixo da tabela de mensagens amigáveis — todo erro de function (emissão de NFS-e, upload de certificado, fechamento mensal etc.) sempre mostrava o texto genérico de fallback em vez da causa real. Achado depurando por que a emissão de NFS-e do JPProject "não emitia" sem erro visível.
- Formulário de emissão de NFS-e: descrição abaixo do mínimo de caracteres barrava o envio **silenciosamente** (sem toast, sem chamada de rede) porque a mensagem de erro só existia numa tela escondida atrás do passo "Resumo". Agora mostra o erro e volta pra edição.
- **"Item da lista de serviço" (LC 116)** é exigido pelo backend mas nunca existia no formulário de emissão — só na config fiscal do cliente. Adicionado o campo (obrigatório) na emissão, com pré-preenchimento automático a partir da config do cliente.

### Adicionado
- Picker de item de serviço LC 116/2003 com busca por código ou palavra-chave (`src/lib/lc116.ts` + `src/components/fiscal/lc116-picker.tsx`), lista completa (193 itens) direto do texto oficial do planalto.gov.br. Usado na config fiscal do cliente e no formulário de emissão.
- **Integração com Spedy** como provedor alternativo de emissão de NFS-e (`provedorNfse: 'municipio' | 'spedy'`) — cobre 1.200+ municípios via API REST em vez dos 8 conectores caseiros. Ver pendências acima (não testado ainda, provisionamento em massa ainda manual).

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
