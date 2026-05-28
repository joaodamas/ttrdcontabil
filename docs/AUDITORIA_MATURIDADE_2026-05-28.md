# Auditoria de Maturidade — TTRD Contábil

- **Data:** 2026-05-28
- **Branch / commit auditado:** `master` @ `0296014` ("chore(security): npm audit fix")
- **Auditor:** agente `auditor-plataforma` (inspeção técnica cética, visão de dono)
- **Escopo:** plataforma completa — 12 áreas (segurança, multi-tenant, RBAC, arquitetura, frontend/UX, backend, fiscal/NFS-e, banco, governança/LGPD, testes, observabilidade, prontidão comercial).

### O que foi EXECUTADO vs. apenas LIDO

| Verificação | Comando | Resultado real |
|---|---|---|
| Type-check frontend | `npx tsc --noEmit` | ✅ **passou** (exit 0) |
| Build das Functions | `npm --prefix functions run build` (`tsc`) | ✅ **passou** (exit 0) |
| Suíte de testes unitários | `npm test` (`vitest run`) | ⚠️ **9 passaram, 5 skipped** — apenas 3 arquivos de utilitários (`financeiro-prioridade`, `sla-score`, `utils`). |
| Teste de regras Firestore | `__tests__/rules/firestore.rules.test.ts` | 🚫 **NÃO VERIFICADO AQUI** — exige emulador (JDK 21+). Host tem **Java 1.8.0_491**. Teste fica `describe.skip` sem `FIRESTORE_EMULATOR_HOST`. |
| E2E Playwright | `npm run test:e2e` | 🚫 **NÃO EXECUTADO** — exige usuário real (`E2E_EMAIL/E2E_SENHA`) e ambiente de pé; specs fazem `test.skip` sem essas envs. |

Tudo que envolve runtime real (emissão em prefeitura, envio WhatsApp, Console Firebase, App Check) está marcado como **verificação pendente em ambiente real** ao longo do laudo.

---

## 1. Resumo executivo

**Veredito direto:** a plataforma tem uma fundação de segurança **acima da média** para um produto desse porte — criptografia AES-256-GCM real para credenciais, `nfse_emitidas`/`logs_auditoria` em append-only via regras, isolamento single-tenant por ambiente checado tanto nas rules quanto nas Functions, redação de PII/segredos nos logs de auditoria, e idempotência de retry fiscal por consulta de RPS. Isso é trabalho sério, não fachada.

**Mas não está pronta para vender a um escritório pagante hoje**, por três motivos concretos e demonstráveis:

1. **Regressão funcional introduzida pela própria última feature.** As coleções de WhatsApp (`whatsapp_messages`, `whatsapp_campaign_rules`, `whatsapp_templates`) e `nfse_erros` **não existem no `firestore.rules`**. O modelo é default-deny, então o frontend que lê essas coleções diretamente (`src/features/whatsapp/services.ts`) vai tomar `permission-denied` em produção. A régua WhatsApp e o histórico de erros NFS-e quebram para qualquer perfil. (G/U — Alto)
2. **Zero validação de propriedade onde mais importa.** A suíte de testes que de fato roda cobre 3 utilitários. O teste de regras (isolamento/RBAC/escalada de privilégio) **nunca rodou neste host** e os checklists de homologação de permissão e regressão E2E estão **100% desmarcados** em `docs/CHECKLIST-FINAL-PENDENTES.md`. "Tem teste" ≠ "provou a propriedade". Hoje a propriedade não está provada.
3. **Observabilidade praticamente inexistente.** Sem error tracking (Sentry/equivalente), sem alerta quando NFS-e/cobrança falha em silêncio. `processarFilaWhatsapp` marca job como `falhou` e **nunca mais reprocessa** (`nextRetryAt` é gravado mas ignorado). Uma cobrança que não sai não gera alarme.

A pergunta-guia — *"eu apostaria os dados fiscais do meu cliente nisto hoje?"* — a resposta é **"para demo e piloto controlado, sim; para um pagante operando sozinho, ainda não"**, e o gap é fechável em dias, não meses.

### Nota geral ponderada: **3.2 / 5**

Abaixo do corte comercial (≥ 3.5 e zero Crítico). Há **0 Crítico em aberto** após análise (os candidatos a Crítico se revelaram fail-closed), mas a soma de 1 Alto funcional + lacuna de testes + observabilidade segura o veredito.

### Pode vender para…?

| Segmento | Veredito | Condição |
|---|---|---|
| **Demo / apresentação comercial** | ✅ Sim | Está bonito e coeso; evite tocar régua WhatsApp e histórico de erro NFS-e até G01 fechar. |
| **Piloto interno (time TTRD)** | ✅ Sim, com ressalva | Corrigir G01 (rules WhatsApp/nfse_erros). É o uso para o qual o produto foi desenhado. |
| **Escritório pequeno pagante (operando sozinho)** | ⚠️ Com restrições | Só após fechar P0 inteiro: G01 + homologação de permissões executada + observabilidade mínima. |
| **Operação crítica / multi-escritório** | 🚫 Não | Falta tenant filter universal nos schedulers, App Check, error tracking, retry de fila, e prova de isolamento em emulador. |

---

## 2. Nota por área

| # | Área | Nota | Comentário curto |
|---|---|---:|---|
| 1 | Segurança | **3.5** | AES-256-GCM real, secret via `defineSecret`, append-only nas rules. Faltam App Check, rate limiting e verificação HMAC do webhook WhatsApp. API key web hardcoded em scripts (baixo risco). |
| 2 | Multi-tenant / isolamento | **3.5** | `requireEnvironmentTenant` + `sameTenant*` consistentes. Schedulers `enviarAlertasDiarios`/`detectarInadimplencia`/`alertasPrazoCritico` consultam coleções **sem filtro `tenantId`** — ok em single-tenant-por-projeto, landmine se um projeto for compartilhado. |
| 3 | Controle de acesso / RBAC | **3.5** | Rules, `authz.ts` e `permissions.ts` coerentes. Server-side real nas Functions. Não provado em emulador; alguns callables WhatsApp só exigem auth, não perfil. |
| 4 | Arquitetura | **4** | Functions bem modularizadas, retry idempotente por RPS, batch com cap de 400 ops. `emitir.ts`/`emitir-lote.ts` duplicam helpers (dívida controlada). |
| 5 | Frontend / UX | **3.5** | `ErrorBoundary` + `AuthGuard` no shell do dashboard; sem `error.tsx`/`global-error.tsx` por rota. `getErrorMessage` repassa `error.message` cru ao usuário. |
| 6 | Backend (Functions) | **3.5** | Validação de entrada manual (sem zod no callable), logging por `console`, transações nos pontos certos. `processarFilaWhatsapp` não honra `nextRetryAt`. |
| 7 | Integração fiscal (NFS-e) | **3.5** | Idempotência forte no retry; cancelamento/consulta com estados. Emissão ad-hoc (sem rascunho) **sem consulta-prévia** → risco de duplicidade em falha de rede. Gating de produção robusto. |
| 8 | Banco (Firestore) | **3** | Índices abrangentes, backup semanal + PITR documentado. **Sem TTL** em `logs_auditoria`, `events`, `whatsapp_webhook_events`, `nfse_eventos` (crescem para sempre). `fieldOverrides: []`. |
| 9 | Governança / LGPD | **3** | Audit append-only de verdade, redação de PII madura. **Sem export/exclusão por titular**, sem retenção definida. Coleções WhatsApp guardam telefone sem regra de acesso. |
| 10 | Testes | **2** | Só 3 utilitários rodam. Isolamento/RBAC/NFS-e/WhatsApp **sem teste que rode neste host**. E2E e homologação de permissão não executados. |
| 11 | Observabilidade | **2** | Sem error tracking, sem alerting acionável de falha. Alertas por email existem (bom), mas falha de fila WhatsApp e export de backup não geram alarme. |
| 12 | Prontidão comercial | **3** | Bom para demo/piloto; bloqueado para pagante por G01 + testes + observabilidade. |

---

## 3. Achados detalhados por área

### Segurança (S)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| S01 | Webhook WhatsApp **não valida assinatura HMAC** (`X-Hub-Signature-256`). GET valida `verify_token`; POST aceita qualquer corpo. Um atacante que conheça a URL pode forjar status/respostas e poluir `whatsapp_messages`/`events`. | Médio | Forja de eventos de cobrança, audit poluído | Baixo | P1 | [webhook.ts:10](functions/src/whatsapp/webhook.ts#L10) (sem `createHmac`/`appSecret` em todo o repo) |
| S02 | Comparação do `verify_token` com `===` (não constant-time). Token de webhook é baixo valor, mas o padrão deveria ser `crypto.timingSafeEqual`. | Baixo | Timing leak teórico | Baixo | P3 | [webhook.ts:19](functions/src/whatsapp/webhook.ts#L19) |
| S03 | **Sem App Check** e **sem rate limiting** em nenhum callable. `emitirNfse`, `uploadCertificado`, `salvarCredenciaisFiscais` são `invoker: 'public'` (correto para callable), mas qualquer usuário autenticado pode martelar a função. | Médio | Abuso/custo, brute force de senha de certificado via `validarCertificado` | Médio | P1 | [emitir.ts:298](functions/src/nfse/emitir.ts#L298), [emitir.ts:428](functions/src/nfse/emitir.ts#L428); grep `enforceAppCheck`/`rateLimit` = 0 ocorrências |
| S04 | Chave de API web do Firebase **hardcoded** em scripts (`AIzaSy...`). Chave web é pública por design, mas não deveria estar versionada repetida em 5 scripts. | Baixo | Nenhum (chave pública), higiene | Baixo | P3 | [scripts/setup-admin.mjs:18](scripts/setup-admin.mjs#L18), [scripts/smoke-prod.mjs:7](scripts/smoke-prod.mjs#L7) |
| S05 | `CREDENTIAL_KEY` como secret via `defineSecret` — **correto**. Criptografia AES-256-GCM com IV aleatório por valor e authTag — **correto**. `getKey()` valida 64 hex. Elogio com evidência. | — (positivo) | — | — | — | [encrypt.ts:21](functions/src/nfse/encrypt.ts#L21), [secrets.ts:3](functions/src/nfse/secrets.ts#L3) |
| S06 | Assinatura XML usa **RSA-SHA1 + C14N** — é o exigido pelo padrão ABRASF das prefeituras, não escolha insegura. Documentado e correto para o domínio. | — (positivo) | — | — | — | [signer.ts:72](functions/src/nfse/xml/signer.ts#L72) |

### Multi-tenant / isolamento (MT)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| MT01 | Schedulers consultam coleções **sem `where('tenantId', ...)`**: `enviarAlertasDiarios` (tarefas/lancamentos/clientes_fiscal), `alertasPrazoCritico`, `detectarInadimplencia`. Em single-tenant-por-projeto é inofensivo; se um projeto vier a hospedar 2 ambientes, vaza entre tenants. | Médio | Vazamento cross-tenant se o modelo de deploy mudar | Médio | P2 | [alertas.ts:52](functions/src/scheduler/alertas.ts#L52), [alertas.ts:297](functions/src/scheduler/alertas.ts#L297) |
| MT02 | Escalada de privilégio via `usuarios/{uid}` **está bloqueada**: update do próprio doc proíbe `affectedKeys().hasAny(['perfil','ativo','criadoEm','tenantId'])`. Bem feito. Porém **não há teste que prove isso rodando**. | — (positivo, mas a confirmar) | — | Baixo (teste) | P1 (teste) | [firestore.rules:100](firestore.rules#L100) |
| MT03 | `requireEnvironmentTenant` rejeita tenant ≠ `DEFAULT_TENANT_ID` server-side em toda operação fiscal/whatsapp. Defesa em profundidade correta. | — (positivo) | — | — | — | [tenant.ts:12](functions/src/tenant.ts#L12), [authz.ts:36](functions/src/authz.ts#L36) |

### Controle de acesso / RBAC (AC)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| AC01 | Callables WhatsApp `inicializarConfiguracaoWhatsapp` exige só `auth`, sem checar perfil. Cria defaults — baixo dano, mas qualquer perfil `leitura` autenticado pode disparar. | Baixo | Inicialização indevida de config | Baixo | P2 | [callables.ts:18](functions/src/whatsapp/callables.ts#L18) |
| AC02 | Demais callables WhatsApp (`disparar/pausar/retomar/reagendar`) checam `assertCanAccessCliente(..., 'financeiro')` corretamente via `getLancamentoOwnedByActor`. | — (positivo) | — | — | — | [callables.ts:10](functions/src/whatsapp/callables.ts#L10) |
| AC03 | `permissions.ts` (telas) e `authz.ts` (PERFIS_POR_ACAO) e `firestore.rules` (perfis) são **três fontes de verdade** que precisam ser mantidas em sincronia manualmente. Já estão coerentes hoje, mas é dívida de drift. | Baixo | Divergência futura silenciosa | Médio | P2 | [permissions.ts:16](src/lib/permissions.ts#L16), [authz.ts:9](functions/src/authz.ts#L9), [firestore.rules:33](firestore.rules#L33) |

### Arquitetura (A)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| A01 | `emitir.ts` e `emitir-lote.ts` **duplicam** `getConfigFiscal`/`getCliente`/`getCertificado`/`decryptSenhaCertificado`/`resumoNfseInput`. Divergência futura entre os dois caminhos de emissão. | Baixo | Manutenção, bug assimétrico | Médio | P2 | [emitir-lote.ts:69](functions/src/nfse/emitir-lote.ts#L69) vs [emitir.ts:31](functions/src/nfse/emitir.ts#L31) |
| A02 | Batches com cap de 400 ops e commit incremental — correto. Lote sequencial por exigência das prefeituras (mesmo CNPJ) — decisão consciente e documentada. | — (positivo) | — | — | — | [alertas.ts:262](functions/src/scheduler/alertas.ts#L262), [emitir-lote.ts:8](functions/src/nfse/emitir-lote.ts#L8) |

### Frontend / UX (U)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| U01 | A régua WhatsApp e telas que leem `whatsapp_messages`/`whatsapp_campaign_rules`/`whatsapp_templates` vão falhar com `permission-denied` (ver G01). UX: tela quebra/vazia sem explicação. | Alto | Feature inteira inacessível em prod | Baixo | **P0** | [services.ts:42](src/features/whatsapp/services.ts#L42) + ausência em `firestore.rules` |
| U02 | `getErrorMessage` repassa `error.message` cru ao usuário. Erros de Firestore/Functions podem expor mensagens técnicas (ex.: nomes de coleção, índice faltando). | Médio | Mensagem crua/confusa ao usuário | Baixo | P2 | [error-message.ts:2](src/lib/error-message.ts#L2) |
| U03 | `ErrorBoundary` + `AuthGuard` envolvem o shell do dashboard — bom. Mas não há `error.tsx`/`global-error.tsx` por segmento de rota; erro fora do boundary do `<main>` derruba a tela inteira. | Baixo | Tela branca em casos de borda | Médio | P2 | [layout.tsx:63](src/app/(dashboard)/layout.tsx#L63); grep `error.tsx` em `src/app` = 0 |
| U04 | `auth-client.signIn` libera sessão com `perfil='leitura'` e `tenantId=undefined` se a leitura do doc do usuário falhar. Fail-safe no nível de dados (rules exigem `userHasTenant()`), mas a UI dá a impressão de login válido. | Baixo | Confusão de UX, sem vazamento | Baixo | P3 | [auth-client.ts:45](src/lib/auth-client.ts#L45) |

### Backend / Functions (B)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| B01 | `processarFilaWhatsapp` só processa `status === 'agendado'`. Jobs que viram `falhou` gravam `nextRetryAt` mas **nunca são reprocessados**. Cobrança que falha morre em silêncio. | Médio | Cobrança perdida sem alarme | Médio | P1 | [scheduler.ts:51](functions/src/whatsapp/scheduler.ts#L51), [core.ts:392](functions/src/whatsapp/core.ts#L392) |
| B02 | Validação de payload nos callables é manual (`if (!input.x) throw`). Não usa zod (que está no `package.json`). Entradas malformadas chegam fundo antes de falhar. | Baixo | Erros tardios, menos defensivo | Médio | P2 | [emitir.ts:303](functions/src/nfse/emitir.ts#L303) |
| B03 | Logging por `console.log/error` apenas. Sem structured logging nem correlação. Aceitável para Cloud Logging básico, ruim para diagnóstico em incidente. | Baixo | Diagnóstico lento | Médio | P2 | [emitir.ts:304](functions/src/nfse/emitir.ts#L304) |

### Integração fiscal / NFS-e (F)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| F01 | **Emissão sem rascunho não tem consulta-prévia por RPS.** O retry (`retryNfse`) consulta o RPS na prefeitura antes de reemitir (excelente), mas a emissão direta só trava duplicidade quando há `rascunhoId` (transação de status). Se a prefeitura aceitar mas a rede cair antes de gravar `nfse_emitidas`, um novo clique pode emitir nota duplicada. | Médio | Emissão fiscal duplicada em falha de rede | Médio | P1 | [emitir.ts:145](functions/src/nfse/emitir.ts#L145) (sem consulta), contraste com [ciclo.ts:185](functions/src/nfse/ciclo.ts#L185) |
| F02 | Idempotência de retry por RPS + bloqueio quando RPS já existe no histórico interno — **muito bem feito**, é o padrão correto. | — (positivo) | — | — | — | [ciclo.ts:200](functions/src/nfse/ciclo.ts#L200) |
| F03 | Gating de produção exige config OU conector homologado+liberado+operação habilitada. Defesa em profundidade correta contra emissão acidental em produção. | — (positivo) | — | — | — | [conectores.ts:8](functions/src/nfse/conectores.ts#L8) |
| F04 | `retryNfse` por `erroId` faz `JSON.parse(raw)` do campo `input` e só então `assertCanAccessCliente(input.clienteId)`. A autorização ocorre antes de processar — ok — mas confia no `clienteId` do JSON persistido sem revalidar consistência tenant do erro original. | Baixo | Borda de autorização | Baixo | P2 | [ciclo.ts:449](functions/src/nfse/ciclo.ts#L449) |

### Banco / Firestore (D)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| D01 | **Sem TTL** em coleções de crescimento perpétuo: `logs_auditoria`, `events`, `nfse_eventos`, `whatsapp_webhook_events`, `whatsapp_messages`. `fieldOverrides: []`. Custo e tamanho crescem indefinidamente. | Médio | Custo crescente, sem política de retenção (LGPD) | Médio | P2 | [firestore.indexes.json:414](firestore.indexes.json#L414); [audit.ts:106](functions/src/audit.ts#L106) |
| D02 | Backup semanal via `exportDocuments` + PITR documentado — bom. Mas o sucesso do export só é logado, **sem alerta de falha** (o próprio comentário admite "If you want failure alerts, add a poller"). | Médio | Backup pode falhar silenciosamente | Médio | P1 | [backup.ts:61](functions/src/backup.ts#L61) |
| D03 | Índices compostos abrangentes para clientes/competências/lancamentos/tarefas/nfse. Bom trabalho de cobertura de query. | — (positivo) | — | — | — | [firestore.indexes.json:1](firestore.indexes.json#L1) |

### Governança / Compliance / LGPD (G)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| G01 | **Coleções WhatsApp e `nfse_erros` ausentes em `firestore.rules`.** Modelo default-deny ⇒ frontend que as lê direto toma `permission-denied`; e não há regra explícita de quem pode ler telefones de clientes em `whatsapp_messages`. Quebra funcional + governança de PII sem política. | Alto | Feature quebra em prod; PII (telefone) sem regra de acesso explícita | Baixo | **P0** | grep em `firestore.rules` = 0 ocorrências de `whatsapp_*`/`nfse_erros`; leitura em [services.ts:42](src/features/whatsapp/services.ts#L42) |
| G02 | Audit log é append-only de verdade: `logs_auditoria` tem `update,delete: if false` e cliente não escreve livremente (`create: if isAtivo() && sameTenantNew()`). Redação de PII/segredos em `redactAuditData` é madura (CPF/CNPJ/email/telefone/XML/payload). Elogio com evidência. | — (positivo) | — | — | — | [firestore.rules:273](firestore.rules#L273), [audit.ts:80](functions/src/audit.ts#L80) |
| G03 | **Sem export e sem exclusão por titular** (direito LGPD). Dados pessoais de clientes finais (CPF/CNPJ/email/telefone) não têm fluxo de portabilidade nem apagamento. | Médio | Não-conformidade LGPD para venda séria | Alto | P2 | ausência de rota/função; grep não encontra `exportarTitular`/`excluirTitular` |

### Testes (T)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| T01 | Suíte que **roda** cobre 3 utilitários (9 testes). Lógica de negócio crítica (emissão, régua, isolamento) sem teste executável neste host. | Alto | Regressão silenciosa | Alto | P1 | `vitest run` → 9 passed; [__tests__/lib/](__tests__/lib) |
| T02 | Teste de regras existe e é razoável (cross-tenant, perfil, `nfse_emitidas` write:false) **mas não cobre escalada de privilégio em `usuarios/{uid}` nem append-only de `logs_auditoria`**, e não roda sem emulador (JDK 21+). | Alto | Propriedade de isolamento/RBAC não provada | Médio | **P0** (rodar) | [firestore.rules.test.ts:67](__tests__/rules/firestore.rules.test.ts#L67) |
| T03 | E2E Playwright depende de credenciais reais e faz `test.skip` sem elas. Specs `clientes.spec.ts`/`financeiro.spec.ts` têm 7 linhas (praticamente stubs). | Médio | Cobertura E2E aparente, não real | Médio | P2 | [operacao-real.spec.ts:9](e2e/operacao-real.spec.ts#L9) |

### Observabilidade (O)

| ID | Achado | Sev. | Impacto | Esforço | Prio | Evidência |
|---|---|---|---|---|---|---|
| O01 | **Sem error tracking** (Sentry/Datadog/etc.) em frontend ou Functions. Sentry só aparece em doc de roadmap. Erro em produção = ninguém sabe. | Alto | Cegueira operacional | Médio | P1 | grep `Sentry`/`captureException` em `src/`/`functions/src` = 0 |
| O02 | Falhas silenciosas: fila WhatsApp que não reprocessa (B01), backup sem alerta (D02). O pior estado descrito na definição do auditor está presente. | Médio | Cobrança/backup falham sem alarme | Médio | P1 | [scheduler.ts:57](functions/src/whatsapp/scheduler.ts#L57), [backup.ts:67](functions/src/backup.ts#L67) |
| O03 | Alertas diários por email (tarefas/atrasos/cert vencendo/NFS-e com erro) — boa base de alerting de negócio. | — (positivo) | — | — | — | [alertas.ts:35](functions/src/scheduler/alertas.ts#L35) |

---

## 4. Divergências doc × código

| Alegação na doc | Realidade no código | Evidência |
|---|---|---|
| `docs/DEPLOY.md` descreve "Firebase App Hosting (Next.js 16 SSR + API) Cloud Run" e Cloudflare na frente. | Deploy real é **static export** (`output: 'export'`) para Firebase Hosting (`public: out`). Não há SSR nem Cloud Run; as rotas `src/app/_api_backup/**` (com firebase-admin) estão desativadas e não deployadas. | [next.config.ts:4](next.config.ts#L4), [firebase.json:9](firebase.json#L9), [DEPLOY.md:133](docs/DEPLOY.md#L133) |
| `docs/DEPLOY.md` §9 "Headers de Segurança (Cloudflare)" sugere X-Frame-Options/CSP. | **Nenhum header de segurança implementado no repo.** `firebase.json` só tem Cache-Control. CSP/HSTS/X-Frame inexistentes no artefato versionado. | [firebase.json:28](firebase.json#L28), [DEPLOY.md:143](docs/DEPLOY.md#L143) |
| `docs/CHECKLIST-FINAL-PENDENTES.md`: homologação de permissões e regressão E2E como pré-requisito de go-live. | Todos os checkboxes **desmarcados** — não foi executado. O laudo confirma: nenhum teste de permissão rodou neste host. | [CHECKLIST-FINAL-PENDENTES.md:13](docs/CHECKLIST-FINAL-PENDENTES.md#L13) |
| Última feature: "integração WhatsApp — régua de cobrança automática" (commit `f33e3ad`) como entregue. | Entregue no backend, mas o **frontend não consegue ler** as coleções (G01). Feature não funciona ponta a ponta em produção sem ajuste de rules. | `firestore.rules` (sem `whatsapp_*`), [services.ts:42](src/features/whatsapp/services.ts#L42) |
| `docs_dev/roadmap-evolucao-plataforma-ttrd.md` menciona Sentry/observabilidade. | Não implementado (O01). | grep `Sentry` = só na doc |

---

## 5. Jornadas críticas a testar manualmente (em ambiente real)

| Jornada | Ponto crítico | Resultado esperado |
|---|---|---|
| Login → abrir régua WhatsApp / templates | Leitura de `whatsapp_messages`/`whatsapp_campaign_rules`/`whatsapp_templates` | **Hoje falha** com permission-denied (G01). Após corrigir rules: lista carrega por tenant. |
| Login → Fiscal → emitir NFS-e individual em produção | Gating de produção + idempotência sem rascunho (F01) | Emite uma única nota; reenvio após sucesso não deve duplicar (validar com a prefeitura). |
| Login → emitir NFS-e em lote (50) | Cap de lote, sequencial, destrava rascunho em erro | Cada item resolve sucesso/erro isolado; rascunho nunca fica preso em `processando`. |
| Retry de NFS-e com erro | Consulta-prévia por RPS antes de reemitir | Bloqueia se RPS já existe; consulta prefeitura; só reemite se rejeitada/erro. |
| Cobrança WhatsApp falha no provider | Reprocessamento da fila | **Hoje não reprocessa** (B01); job morre em `falhou` sem alarme. |
| Tentar editar o próprio `perfil`/`tenantId` via SDK | Rules `usuarios/{uid}` update | Deve falhar (MT02) — **provar no emulador (T02)**. |
| Escrever direto em `logs_auditoria`/`nfse_emitidas` via SDK | Append-only / write:false | Deve falhar — provar no emulador. |
| Certificado A1 vencendo em 30 dias | Alerta diário por email | Email consolidado é enviado (O03). |

---

## 6. Backlog priorizado

### P0 — bloqueia venda a pagante / risco de incidente agora
- **G01 / U01** — Declarar regras Firestore para `whatsapp_messages`, `whatsapp_campaign_rules`, `whatsapp_templates`, `whatsapp_jobs`, `whatsapp_webhook_events`, `nfse_erros` (read por perfil correto + `sameTenant`; write `if false` onde só a Function escreve). *(Esforço: Baixo)*
- **T02** — Rodar a suíte de regras no emulador (provisionar JDK 21+ em CI) **e adicionar casos de escalada de privilégio em `usuarios/{uid}` e append-only de `logs_auditoria`**. Sem isso, o isolamento não está provado. *(Esforço: Médio)*

### P1 — bloqueia cliente maior / piloto sério
- **F01** — Consulta-prévia por RPS (ou chave de idempotência) também na emissão direta sem rascunho. *(Médio)*
- **B01 / O02** — Reprocessar jobs WhatsApp `falhou` honrando `nextRetryAt`; alertar quando esgotar tentativas. *(Médio)*
- **O01** — Error tracking (Sentry ou equivalente) em frontend e Functions. *(Médio)*
- **D02** — Alerta de falha do export de backup. *(Baixo)*
- **S01** — Verificação HMAC `X-Hub-Signature-256` no webhook WhatsApp. *(Baixo)*
- **S03** — App Check nos callables + rate limiting básico em `validarCertificado`/`emitirNfse`. *(Médio)*
- **T01** — Testes unitários da lógica fiscal e da elegibilidade da régua. *(Alto)*

### P2 — maturidade
- **D01** — TTL/retenção em `logs_auditoria`/`events`/`nfse_eventos`/`whatsapp_*`.
- **G03** — Fluxo de export e exclusão por titular (LGPD).
- **MT01** — Filtro `tenantId` universal nos schedulers.
- **AC01/AC03** — Perfil em `inicializarConfiguracaoWhatsapp`; fonte única de RBAC.
- **A01** — Extrair helpers comuns de `emitir`/`emitir-lote`.
- **B02/B03** — zod nos callables; structured logging.
- **U02/U03** — Sanitizar mensagem de erro ao usuário; `error.tsx` por rota.
- **F04** — Revalidar consistência de tenant no retry por `erroId`.

### P3 — polimento
- **S02** — `timingSafeEqual` no verify_token.
- **S04** — Remover API key web duplicada dos scripts.
- **U04** — UX de login quando o doc do usuário não carrega.

---

## 7. Itens que DEVEM ser corrigidos antes de vender (corte mínimo)

1. **G01/U01** — Rules das coleções WhatsApp + `nfse_erros`. Sem isso, uma feature anunciada como pronta está quebrada para o cliente. **(P0, Baixo)**
2. **T02** — Executar e ampliar o teste de regras no emulador. Isolamento e não-escalada de privilégio precisam estar **provados**, não presumidos. **(P0, Médio)**
3. **O01 + D02 + B01** — Mínimo de observabilidade: error tracking + alerta de backup + reprocessamento de cobrança. Vender sem saber quando algo falha é vender um problema futuro. **(P1)**
4. **F01** — Fechar a janela de duplicidade na emissão direta. Emissão fiscal duplicada gera retrabalho com a prefeitura e desconfiança do cliente. **(P1, Médio)**

Cumprido o corte, a média sobe acima de 3.5 com 0 Crítico — apta a escritório pequeno pagante.

---

## 8. Roadmap recomendado

| Rodada | Conteúdo | Resultado comercial |
|---|---|---|
| **R1 — "Destravar e provar" (dias)** | G01, T02 (rodar + ampliar), D02, S01 | Régua WhatsApp funciona; isolamento provado; backup confiável. **Libera piloto pagante interno.** |
| **R2 — "Não falhar no escuro" (1–2 semanas)** | O01, B01, F01, S03 | Operação observável, sem duplicidade fiscal, sem cobrança perdida. **Libera escritório pequeno pagante.** |
| **R3 — "Conformidade e escala" (semanas)** | D01 (TTL), G03 (LGPD export/exclusão), MT01, zod/structured logging | Conformidade LGPD + custo controlado. **Libera cliente maior / contrato sério.** |
| **R4 — "Multi-escritório" (mês+)** | Multi-tenant real (se sair do single-tenant-por-deploy), CSP/headers, hardening supply chain | **Habilita SaaS multi-tenant.** |

---

## 9. Conclusão — recomendação franca ao dono

Você tem um produto com **espinha dorsal de segurança honesta** — e isso é raro nesse estágio. A criptografia de credenciais é real, o audit log é à prova de adulteração pelo cliente, o isolamento single-tenant é checado em dois níveis, e a idempotência do retry fiscal mostra que quem escreveu entende o domínio (emissão duplicada é o pesadelo de um contador). Não é fachada.

O problema não é o alicerce — é o **acabamento e a prova**. A última feature (WhatsApp) foi entregue pela metade: o backend está lá, mas as regras de acesso não acompanharam, e isso quebra a tela em produção. É o tipo de bug que só aparece quando o cliente clica — exatamente onde você não quer descobrir. Some-se a isso que a propriedade mais importante do sistema (um usuário não escapa do seu tenant, não vira admin sozinho) **não está provada por nenhum teste que rode**, e que **ninguém será avisado quando algo falhar em produção**.

Nada disso é estrutural. Não há reescrita pela frente. O corte P0 + P1 é questão de dias a duas semanas de trabalho focado, e ele transforma "demo bonita" em "produto que aguenta um pagante operando sozinho".

**Dívida estrutural a registrar honestamente:** o modelo é **single-tenant por deploy**. Vender como SaaS multi-tenant de verdade (vários escritórios no mesmo projeto) exigiria revisar todos os schedulers (MT01), o gating fixo de `DEFAULT_TENANT_ID`, e a ausência de tenant filter universal — isso é uma rodada de engenharia, não um patch. Para o posicionamento atual (whitelabel single-tenant), está adequado; só não prometa multi-tenant antes da R4.

**Recomendação:** **NO-GO para pagante hoje; GO para piloto após R1.** Feche o P0 esta semana, rode o emulador de regras em CI antes de qualquer venda, e não anuncie a régua WhatsApp como pronta até G01 estar no ar.
