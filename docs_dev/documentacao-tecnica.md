# TTRD Contabil - Documentacao Tecnica

## 1. Stack e runtime

Frontend:

- Next.js `16.2.2` (App Router, output estatico para Hosting)
- React `19.2.4`
- TypeScript `5`
- Tailwind CSS `4`
- shadcn/ui + Radix UI + Sonner
- TanStack Query (provider presente no projeto)

Backend e infraestrutura:

- Firebase Auth
- Cloud Firestore
- Firebase Storage
- Firebase Hosting (site: `ttrdcontabil-jpproject`)
- Firebase Cloud Functions (Node `20`, TypeScript)

Testes e qualidade:

- Vitest (unitarios)
- Playwright (E2E)
- ESLint

## 2. Estrutura principal do repositorio

- `src/app` - rotas Next.js
- `src/components` - componentes por dominio e UI base
- `src/lib` - helpers de auth, firestore, permissoes, algoritmos
- `src/contexts` - estado de autenticacao
- `functions/src` - automacoes server-side e integracoes fiscais
- `docs_dev` - documentacao e artefatos de execucao
- `e2e` - cenarios E2E

## 3. Arquitetura frontend (estado atual)

Status de evolucao 2.0:

- Feature-Layer iniciado em `src/features/hoje` com separacao por `types`, `schemas`, `services`, `queries` e `hooks`.
- Rota `src/app/(dashboard)/hoje/page.tsx` ja migrada para consumir a camada de feature via TanStack Query.
- Feature-Layer expandido para `src/features/clientes` com separacao equivalente.
- Rota `src/app/(dashboard)/clientes/page.tsx` migrada para leitura via `useClientesList` (TanStack Query) com filtros e paginacao.
- Feature-Layer expandido para `src/features/tarefas` com separacao equivalente.
- Rota `src/app/(dashboard)/tarefas/page.tsx` migrada para leitura via `useTarefasList` e mutacao com invalidacao via `tarefasKeys`.
- Feature-Layer expandido para `src/features/financeiro` com separacao equivalente.
- Rota `src/app/(dashboard)/financeiro/page.tsx` migrada para leitura via `useFinanceiroList` e baixa com invalidacao via `financeiroKeys`.
- Feature-Layer expandido para `src/features/competencias` com separacao equivalente.
- Rota `src/app/(dashboard)/competencias/page.tsx` migrada para leitura via `useCompetenciasList`.
- Feature-Layer expandido para `src/features/fechamento` com separacao equivalente.
- Rota `src/app/(dashboard)/fechamento/client.tsx` migrada para leitura via `useFechamentoList` e mutacoes com invalidacao via `fechamentoKeys`.
- Feature-Layer expandido para `src/features/fiscal` com separacao equivalente.
- Rota `src/app/(dashboard)/fiscal/page.tsx` migrada para leitura via `useFiscalDashboard` e mutacoes com invalidacao via `fiscalKeys`.
- Feature-Layer expandido para `src/features/ir` com separacao equivalente.
- Rota `src/app/(dashboard)/ir/page.tsx` migrada para leitura via `useIrList`.

Resumo de cobertura da migracao:

- Cobertura concluida no core operacional: `hoje`, `clientes`, `tarefas`, `financeiro`, `competencias`, `fechamento`, `fiscal`, `ir`.
- Cobertura pendente para concluir o ciclo 5A.1/5A.2: `admin`.

### 3.1 Roteamento

Rotas de autenticacao:

- `/login`

Rotas de dashboard e dominios:

- `/hoje`, `/dashboard`
- `/clientes/*`
- `/tarefas/*`
- `/competencias/*`
- `/fechamento`
- `/financeiro/*`
- `/fiscal/*`
- `/ir/*`
- `/admin/*`

### 3.2 Layout e guardas

Pecas principais:

- `src/app/(dashboard)/layout.tsx` - shell principal
- `src/components/layout/sidebar.tsx` - navegacao lateral
- `src/components/layout/topbar.tsx` - barra superior com acoes
- `src/components/auth/auth-guard.tsx` - bloqueio e redirecionamento por permissao
- `src/components/error-boundary.tsx` - tolerancia a falhas de render

`AuthGuard`:

- Detecta `TelaKey` pela rota atual.
- Verifica `canAccessTela`.
- Em caso de bloqueio, redireciona para primeira rota permitida (`getFirstAllowedRoute`).

### 3.3 Camada de dados frontend

Arquivo central:

- `src/lib/firestore-client.ts`

Capacidades:

- CRUD generico (`getDocument`, `listDocuments`, `createDocument`, `updateDocument`, `deleteDocument`)
- Soft delete (`softDeleteDocument`)
- Queries por dominio (`getClientes`, `getTarefas`, `getLancamentos`, etc.)
- Cockpit (`getHojeCockpit`)
- Timeline consolidada de cliente (`getClienteTimeline`)
- Cache de usuarios em memoria + `sessionStorage` com TTL
- Batch read de clientes por ID (`getClientesByIds`)

## 4. Autenticacao e autorizacao

### 4.1 Auth client

Arquivo:

- `src/lib/auth-client.ts`

Comportamento:

- Login por `signInWithEmailAndPassword`
- Leitura opcional de perfil em `usuarios/{uid}`
- Fallback seguro para perfil `leitura` quando metadado nao existe
- Bloqueio de usuario inativo (`ativo === false`)
- Sessao observada por `onAuthStateChanged`

### 4.2 Permissoes de tela

Arquivo:

- `src/lib/permissions.ts`

Detalhes:

- Matriz default por perfil (`PERFIL_DEFAULT_TELAS`)
- Override por `usuario.telas[]`
- Helpers: `canAccessTela`, `canAccessAnyTela`

## 5. Firestore - modelo de dados tecnico

Colecoes principais operacionais:

- `usuarios`, `clientes`, `servicos`, `clientes_servicos`
- `competencias`, `tarefas`, `tarefas_comentarios`
- `lancamentos`, `fechamentos`
- `clientes_fiscal`, `clientes_fiscal_integracao`
- `nfse_rascunhos`, `nfse_emitidas`, `nfse_eventos`, `nfse_fila_processamento`
- `ir_declaracoes`, `ir_checklist`
- `logs_auditoria`, `documentos`, `configuracoes`

Padroes de modelagem adotados:

- Denormalizacao de campos de nome (`clienteNome`, `responsavelNome`) para leitura rapida
- Campos de auditoria (`criadoEm`, `atualizadoEm`)
- Filtros e ordenacoes alinhados aos indices compostos

## 6. Firestore Security Rules

Arquivo:

- `firestore.rules`

Pontos tecnicos relevantes:

- Helper de autenticacao e atividade (`isAuth`, `isAtivo`)
- Controle por perfil (`isAdmin`, `isOperacional`, `isFiscal`, `isFinanceiro`)
- Validacao de payload em colecoes criticas (`clientes`, `tarefas`)
- Bloqueio de escrita direta para colecoes sensiveis:
  - `nfse_emitidas` (apenas Cloud Functions/Admin SDK)
  - `nfse_fila_processamento` (apenas Cloud Functions/Admin SDK)
- `logs_auditoria` append-only (sem update/delete)

## 7. Firestore indexes

Arquivo:

- `firestore.indexes.json`

Cobertura atual de indices:

- `clientes` por `deletedAt + razaoSocial`
- `competencias` por cliente/periodo e filtros de status
- `lancamentos` por cliente/status/tipo/data
- `tarefas` por responsavel/status/data de vencimento
- `fechamentos` por mes/ano/regime/codigo
- `nfse_emitidas` e `nfse_rascunhos` por cliente + data
- `ir_declaracoes` por cliente e por status/ano-base

## 8. Storage Rules

Arquivo:

- `storage.rules`

Politica atual:

- `documentos/*`: leitura autenticada, escrita bloqueada no cliente
- `certificados/*`: leitura e escrita bloqueadas no cliente
- `nfse/*`: leitura autenticada, escrita bloqueada no cliente
- default deny para qualquer outro path

## 9. Cloud Functions (automacao e integracao)

Arquivo de export principal:

- `functions/src/index.ts`

### 9.1 Schedulers

- `criarCompetenciasMensais` (`scheduler/competencias.ts`)
  - Dia 1, cria competencias para cliente ativo com servico ativo, evitando duplicidade.
- `criarLancamentosMensais` (`scheduler/lancamentos.ts`)
  - Dia 1, cria recebiveis mensais por servico ativo, com vencimento configuravel.
- `enviarAlertasDiarios` (`scheduler/alertas.ts`)
  - Consolida alertas de tarefas, inadimplencia e certificados via email.
- `alertasPrazoCritico` (`scheduler/alertas.ts`)
  - Marca `alertaPrazo48h` em tarefas proximas do vencimento.
- `detectarInadimplencia` (`scheduler/alertas.ts`)
  - Marca risco de inadimplencia por cliente com base em recebiveis atrasados.
- `exportarFirestoreSemanal` (`backup.ts`)
  - Inicia exportacao semanal do Firestore para bucket de backup.

### 9.2 Triggers

- `propagarRazaoSocial` (`triggers/cliente-update.ts`)
  - Ao alterar razao social do cliente, propaga para colecoes denormalizadas.
- `onTarefaConcluida` (`triggers/tarefa-concluida.ts`)
  - Ao concluir tarefa vinculada, conclui competencia automaticamente se nao houver pendencias.

### 9.3 NFS-e

Modulos em `functions/src/nfse`:

- Emissao avulsa (`emitir.ts`)
- Emissao em lote (`emitir-lote.ts`)
- Roteamento por municipio (`municipios/router.ts`)
- Conectores municipais (Barueri, Cajamar, Campinas, Cotia, Jundiai, Santana de Parnaiba, Sao Paulo, Taboao da Serra)
- Assinatura e SOAP/XML (`xml/*`)

## 10. Configuracao de deploy

Arquivo:

- `firebase.json`

Configuracao atual:

- Hosting com `public: out`
- Rewrites para rotas dinamicas em ambiente estatico
- Fallback geral para `/dashboard.html`
- Cache agressivo para assets (`js/css/woff2`) e no-cache para HTML
- Deploy de rules/indexes do Firestore e rules do Storage

Comando usado no fluxo:

- `firebase deploy --only hosting`

## 11. Scripts e comando de desenvolvimento

App principal (`package.json`):

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`

Functions (`functions/package.json`):

- `npm run build`
- `npm run serve` (emulador de functions)

## 12. Testes automatizados existentes

E2E:

- `e2e/auth.spec.ts`
- `e2e/clientes.spec.ts`
- `e2e/tarefas.spec.ts`
- `e2e/financeiro.spec.ts`
- `e2e/permissoes.spec.ts`

Unitarios:

- Estrutura com Vitest para regras de negocio e utilitarios (pontuacao SLA e priorizacao financeira)

## 13. Decisoes tecnicas relevantes ja implementadas

- Persistencia de filtro do cockpit por `localStorage`.
- Cache de usuarios com TTL em memoria e `sessionStorage`.
- Batch read de clientes para preencher nomes no financeiro.
- Correcao de loop de redirecionamento por permissao no `AuthGuard`.
- Propagacao automatica de `clienteNome` em dados denormalizados por trigger.

## 14. Riscos tecnicos e lacunas abertas

Itens ainda pendentes (segundo checklist atual):

- Validacao formal de regras no emulator por perfil (matriz completa)
- Concluir padronizacao por feature-layer no modulo `admin`
- Definir politica unica de cache/staleTime por tipo de dado
- Consolidar estrategia de invalidacao por dominio (cobertura total de mutacoes)
- Aplicar optimistic updates e prefetch nos fluxos criticos
- Evolucao de cobertura E2E para cenarios de permissao e edge cases criticos
- Smoke test pos-deploy completo em todos os modulos
