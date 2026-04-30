# Plano de Redesign Tecnico - TTRD Contabil 2.0

> Versao 2.0 - 2026-04-30  
> Documento executivo de migracao arquitetural e evolucao UX orientada a execucao.

---

## 1. Visao Geral e Objetivos Estrategicos

### 1.1 Proposito do Redesign

Transformar o TTRD Contabil de ferramenta de registro em plataforma de execucao operacional de alta performance.

Objetivos centrais:

- Eliminar acoplamento de regra de negocio em componentes genericos
- Aplicar separacao rigorosa por dominio (Feature-Layer)
- Garantir fidelidade dos fluxos financeiro, fiscal e fechamento
- Priorizar acao operacional sobre visualizacao passiva

### 1.2 Pilares da Modernizacao

1. Modernizacao da stack  
   Uso consolidado de Next.js `16.2.2`, React `19.2.4`, Tailwind `4`, shadcn/ui + Radix + Sonner.

2. Padronizacao arquitetural por feature  
   Fronteiras claras por dominio com isolamento de UI, estado, tipos, servicos e contratos.

3. Evolucao UX orientada a reducao de ruido  
   A interface deve antecipar bloqueios de fechamento e destacar prioridades por SLA.

### 1.3 Matriz de valor tecnico

| Criterio | Estado atual | Estado futuro (2.0) |
|---|---|---|
| Performance | Queries Firestore diretas com render predominantemente client-side | Estrategia hibrida com RSC para leitura intensiva + cache/inteligencia de invalidacao |
| Escalabilidade | Logica de dominio dispersa | Feature-Layer com boundaries por dominio |
| Consistencia visual | Design system em transicao | UI unificada com componentes imutaveis e tokens consolidados |
| Seguranca e dados | Risco residual de flash de conteudo proibido | Bloqueio por rota/layout + componente com permissao preavaliada |

---

## 2. Nova Stack e Arquitetura de Frontend

### 2.1 Stack core obrigatoria

- Next.js App Router (`16.2.2`)
- React (`19.2.4`)
- Tailwind CSS (`4`)
- shadcn/ui + Radix UI
- Sonner para feedback operacional
- TypeScript estrito
- Zod para validacao de entrada por dominio

### 2.2 Padronizacao por Feature-Layer

Cada dominio deve seguir a estrutura:

```txt
src/features/<dominio>/
  ui/
  hooks/
  services/
  queries/
  types/
  schemas/
```

Regras:

- `ui/`: apenas composicao visual da feature
- `hooks/`: estado local e orquestracao da regra de negocio
- `services/`: acesso Firebase SDK isolado
- `queries/`: TanStack Query (query keys e invalidacao)
- `types/`: contratos TypeScript do dominio
- `schemas/`: validacao Zod antes de persistir

### 2.3 Componentes reutilizaveis

Padroes obrigatorios:

- Badges de status semanticas por estado de tarefa/competencia
- Cards de KPI com skeleton para estado de loading
- Timeline polimorfica para auditoria, tarefas, lancamentos e NFS-e

---

## 3. Reengenharia da Experiencia (UX/UI)

### 3.1 Cockpit Hoje (`/hoje`)

Diretrizes obrigatorias:

- Priorizacao por SLA com destaque para `alertaPrazo48h`
- Barras de progresso das 4 obrigacoes core:
  - DAS
  - eSocial
  - Reinf
  - FGTS
- Badges unificadas para bloqueios financeiro/fiscal de fechamento

### 3.2 Cliente 360 e Timeline

Requisitos:

- `getClienteTimeline` como fonte principal de consolidacao
- Feed unico em ordem cronologica inversa
- Diferenciacao visual de:
  - `nfse_eventos`
  - `logs_auditoria`
- Contexto completo de tarefas, lancamentos, competencias e NFS-e

### 3.3 Dashboard executivo

Diretrizes:

- Manter CTA estrategico "Comecar execucao" apontando para `/hoje`
- Preservar contexto de navegacao com persistencia de filtros em `localStorage`
- Reduzir ruido visual e priorizar decisao operacional

---

## 4. Camada de Dados e Integracao Firebase

### 4.1 Estrategia TanStack Query

Padrao tecnico:

- Query keys granulares por dominio (`featureKeys.domain.action(params)`)
- Invalidação orientada por eventos de mutacao
- Politica padrao de `staleTime` por tipo de dado
- Reuso sistematico de `getClientesByIds` para evitar N+1

### 4.2 Integridade com Cloud Functions

A UI deve reagir aos estados de automacao:

- `onTarefaConcluida` -> conclui competencia automaticamente
- `propagarRazaoSocial` -> atualiza dados denormalizados
- `detectarInadimplencia` -> ajusta sinalizacao de risco por cliente

### 4.3 Restricoes de escrita e leitura

Regras funcionais e tecnicas:

- `nfse_rascunhos`: editavel no cliente (perfil permitido)
- `nfse_emitidas`: somente leitura no cliente, escrita server-side
- `logs_auditoria`: append-only, sem update/delete
- Validacao obrigatoria com `firestore.rules` para `isAtivo` e perfis

---

## 5. Gestao de Permissoes e Acesso

### 5.1 Refinamento do AuthGuard

Meta:

- Reduzir flash de conteudo nao autorizado
- Antecipar bloqueio de acesso no nivel de layout/rota
- Manter consistencia de `canAccessTela` e fallback por `getFirstAllowedRoute`

### 5.2 Hierarquia de perfil e sobrescrita

Regra oficial:

- `telas[]` do usuario sobrescreve `PERFIL_DEFAULT_TELAS`

Comportamento esperado de interface:

- Ocultar rotas, menus e botoes sem permissao de tela/escrita
- Perfil `leitura`: visualizacao e filtros apenas, sem mutacoes
- `admin`: acesso total incluindo `admin` e `servicos`

---

## 6. Plano de Transicao e Garantia de Qualidade

### 6.1 Ordem oficial de migracao

1. Fundacao transversal  
   Shell, Sidebar, Topbar, AuthGuard

2. Operacao core  
   `hoje`, `clientes`

3. Execucao  
   `tarefas`, `competencias`, `fechamento`

4. Especialistas  
   `fiscal`, `financeiro`, `ir`

5. Gestao  
   `admin`

### 6.2 Estrategia de testes

Expansao obrigatoria no Playwright:

- Bloqueio de perfil fiscal em `/admin` com redirecionamento correto
- Regressao do fluxo NFS-e (`nfse_rascunhos` -> processamento -> `nfse_emitidas`)
- Permissoes de escrita por perfil em cenarios de UI

### 6.3 Validacao final pre-Go-Live

Checklist tecnico minimo:

- Firebase Emulator Suite para validar `firestore.rules` por perfil
- Teste de carga de queries do cockpit
- Smoke test ponta a ponta:
  - Tarefa concluida
  - Competencia encerrada
  - Fechamento gerado

---

## 7. Backlog executavel 2.0 (mapeado ao checklist atual)

Prioridade P0:

- Etapa `5A.1`: Estrutura Feature-Layer por dominio
- Etapa `5A.2`: TanStack Query por feature + invalidacao por chave
- Etapa `0.2`: Validacao completa de rules no emulator por perfil
- Etapa `8.2`: E2E de permissao e fluxos criticos

Prioridade P1:

- Etapa `2.2`: Evolucao do cockpit (progresso diario e visibilidade de prioridade)
- Etapa `4.3`: Timeline inteligente por criticidade
- Etapa `5A.3`: Optimistic updates e prefetch de detalhes

Prioridade P2:

- Etapa `6.2`: Snapshot de dashboard via Cloud Function
- Etapa `7.4`: Sugestoes automaticas por eventos de risco/atraso
- Etapas `9-11`: Validacao de uso real, metricas e decisao GO/NOGO

---

## 8. Criterios de aceite do Redesign 2.0

Arquitetura:

- Nenhuma feature nova pode depender de logica centralizada em `src/components` legado
- Todos os novos fluxos devem nascer em `features/<dominio>`

Dados e seguranca:

- Nao ha escrita client-side em colecoes server-only
- Regras validadas por perfil no emulator com evidencias

UX operacional:

- Cockpit evidencia risco e bloqueio sem necessidade de exploracao manual
- Cliente 360 exibe contexto consolidado e acionavel

Qualidade:

- E2E criticos verdes
- `npx tsc --noEmit` e `npm run build` sem erros
- Smoke test operacional completo aprovado
