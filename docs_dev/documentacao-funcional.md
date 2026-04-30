# TTRD Contabil - Documentacao Funcional

## 1. Objetivo do produto

O TTRD Contabil e uma plataforma de execucao operacional para escritorio contabil. O foco principal e transformar dados em acao diaria, com priorizacao de trabalho, contexto por cliente e controle de fechamento mensal.

Proposta central:

- Priorizar o que fazer agora (`/hoje`)
- Concentrar contexto operacional por cliente (`/clientes/[id]`)
- Conectar execucao, financeiro, fiscal e fechamento em um fluxo unico

## 2. Perfis de usuario e permissao funcional

Perfis existentes no sistema:

- `admin`
- `operacional`
- `fiscal`
- `financeiro`
- `leitura`

Telas controladas por `TelaKey`:

- `hoje`, `dashboard`, `clientes`, `tarefas`, `competencias`, `fechamento`, `financeiro`, `fiscal`, `ir`, `admin`, `servicos`

Comportamento funcional:

- O sistema usa perfil como base.
- Se o usuario tiver `telas[]` preenchido no cadastro, esse array sobrescreve o padrao do perfil.
- `AuthGuard` bloqueia rotas nao permitidas e redireciona para a primeira rota permitida.

## 3. Modulos funcionais existentes

### 3.1 Cockpit do dia - `Hoje` (`/hoje`)

Finalidade:

- Ponto de entrada diario do time.
- Fila unificada SLA com tarefas atrasadas, de hoje e proximos 7 dias, em estrutura de 4 blocos.

Capacidades atuais:

- Fila SLA unificada: atrasadas + hoje + proximos 7d ordenados por score (tipoPeso, diasAtraso, urgencia, semResponsavel)
- KPI strip reativo: 4 pills com cores condicionais (destructive/warning/neutro)
- Maximo 1 banner de alerta critico por sessao (atrasadas > bloqueios)
- Bulk actions inline no header da fila
- Categoria indicator: faixa vertical colorida por urgencia em cada tarefa
- Filtro por responsavel com persistencia em `localStorage`
- Skeleton de layout no loading state

### 3.2 Dashboard executivo - `Dashboard` (`/dashboard`)

Finalidade:

- Visao sintetica de saude operacional e financeira.

Capacidades atuais:

- KPIs e cards de status
- CTA "Comecar execucao" para `/hoje`
- Visual card-based alinhado ao design system atual

### 3.3 Clientes - `Clientes` (`/clientes`)

Rotas:

- `/clientes`
- `/clientes/novo`
- `/clientes/[id]`
- `/clientes/[id]/editar`
- `/clientes/[id]/fiscal`
- `/clientes/[id]/servicos/novo`

Capacidades atuais:

- Cadastro e edicao de cliente
- Vinculo de servicos contratados
- Visao 360 do cliente
- Timeline consolidada do cliente (tarefas, lancamentos, competencias, NFS-e e eventos)
- Soft delete de cliente (preservacao de integridade referencial)

### 3.4 Operacao - `Tarefas` (`/tarefas`)

Rotas:

- `/tarefas`
- `/tarefas/nova`
- `/tarefas/[id]`
- `/tarefas/[id]/editar`

Capacidades atuais:

- Criacao e acompanhamento de tarefas
- Prioridade e status operacional
- Responsavel e prazo
- Comentarios por tarefa
- Integracao com competencia (quando aplicavel)

### 3.5 Competencias - `Competencias` (`/competencias`)

Rotas:

- `/competencias`
- `/competencias/nova`
- `/competencias/[id]`
- `/competencias/[id]/editar`

Capacidades atuais:

- Controle por periodo (mes/ano)
- Relacao cliente x servico x ciclo de entrega
- Status da competencia

### 3.6 Fechamento mensal - `Fechamento` (`/fechamento`)

Finalidade:

- Ritual mensal de conferencias fiscais e operacionais por cliente.

Capacidades atuais:

- Geracao de registros de fechamento
- Status por obrigacao (`dasStatus`, `esocialStatus`, `reinfStatus`, `fgtsStatus`)
- Revisao e acompanhamento do mes

### 3.7 Financeiro - `Financeiro` (`/financeiro`)

Rotas:

- `/financeiro`
- `/financeiro/novo`

Capacidades atuais:

- Cadastro de lancamentos
- Fila de cobranca priorizada
- KPIs financeiros
- Baixa de pagamento
- Hidratacao de `clienteNome` com batch read (`getClientesByIds`) para evitar N+1

### 3.8 Fiscal / NFS-e - `Fiscal` (`/fiscal`)

Rotas:

- `/fiscal`
- `/fiscal/emitir`
- `/fiscal/historico`

Capacidades atuais:

- Configuracao fiscal por cliente
- Emissao avulsa e em lote de NFS-e
- Upload e validacao de certificado
- Historico de emissao

### 3.9 IR - `Imposto de Renda` (`/ir`)

Rotas:

- `/ir`
- `/ir/nova`
- `/ir/[id]`
- `/ir/[id]/editar`

Capacidades atuais:

- Registro e acompanhamento de declaracoes por cliente e ano-base
- Controle de status do ciclo

### 3.10 Administracao - `Admin` (`/admin`)

Rotas:

- `/admin`
- `/admin/usuarios`
- `/admin/servicos`

Capacidades atuais:

- Gestao de usuarios
- Gestao de tipos de servico
- Controle de configuracoes administrativas

## 4. Navegacao e experiencia atual

Estrutura de shell:

- Topnav horizontal fixo (56px) com background escuro — substituiu sidebar lateral e topbar
- Layout `flex-col`: topnav no topo + conteudo centralizado em `max-w-[1320px]`
- `ErrorBoundary` em todas as paginas do dashboard

Grupos de navegacao no topnav:

- **Hoje** e **Dashboard** — links diretos
- **Clientes** — link direto para `/clientes`
- **Operacao** — dropdown: Competencias, Tarefas, Fechamento Mensal
- **Fiscal** — dropdown: NFS-e, Historico NFS-e, Imposto de Renda
- **Financeiro** — link direto (visivel apenas para perfis `admin` e `financeiro`)
- **Admin** — dropdown: Painel Admin, Usuarios, Tipos de Servico (visivel apenas para `admin`)

Botao "+ Novo" (QuickActions):

- Novo Cliente, Nova Tarefa, Nova Competencia
- Novo Lancamento (admin/financeiro)
- Emitir NFS-e (admin/fiscal/financeiro)
- Acoes contextuais adicionais quando em pagina de cliente especifico

Melhorias recentes ja aplicadas:

- Topnav substituiu sidebar: navegacao mais limpa e acessivel em viewports medios
- Correcao de bug critico: `cleanUrls: true` no firebase.json — sem isso todas as rotas exibiam a pagina de dashboard
- Admin virou dropdown com acesso direto a `/admin/usuarios` e `/admin/servicos`
- Fiscal ganhou link direto para `/fiscal/historico`
- CTA operacional no dashboard para iniciar execucao no cockpit

## 5. Entidades funcionais principais

Entidades centrais:

- `usuarios`
- `clientes`
- `servicos`
- `clientes_servicos`
- `competencias`
- `tarefas`
- `tarefas_comentarios`
- `lancamentos`
- `fechamentos`
- `clientes_fiscal`
- `clientes_fiscal_integracao`
- `nfse_rascunhos`
- `nfse_emitidas`
- `nfse_eventos`
- `ir_declaracoes`
- `ir_checklist`
- `logs_auditoria`
- `documentos`
- `configuracoes`

## 6. Regras funcionais de negocio (estado atual)

- Cliente e raiz de contexto para operacao/fiscal/financeiro.
- Cockpit nao cria dados de dominio; agrega e prioriza dados existentes.
- Tarefa tem prioridade/status e participa do fluxo de SLA.
- Fechamento mensal consolida status por obrigacao em nivel de cliente.
- Financeiro prioriza cobranca por score de risco e proximidade.
- NFS-e emitida nao e escrita diretamente pelo browser.

## 7. Qualidade funcional e testes existentes

Testes E2E mapeados:

- `e2e/auth.spec.ts`
- `e2e/clientes.spec.ts`
- `e2e/tarefas.spec.ts`
- `e2e/financeiro.spec.ts`
- `e2e/permissoes.spec.ts`

Cobertura de cenarios:

- Login e acesso ao cockpit
- Criacao de cliente
- Criacao/conclusao de tarefa no fluxo operacional
- Fluxo financeiro basico
- Restricao de acesso por perfil

## 8. Pendencias funcionais abertas (alto nivel)

Blocos em aberto no checklist atual (v1.3):

- Limpeza de arquivos obsoletos: `sidebar.tsx` e `topbar.tsx` (substituidos pelo topnav)
- Validacao de responsividade do topnav em mobile (320px–768px) no browser
- Validacoes de seguranca por perfil no emulator (3 cenarios: leitura sem escrita, operacional sem financeiro, financeiro sem fiscal)
- Layout 70/30 no Cliente 360° — aside sticky com saude + proximos passos + timeline como primeira secao
- Progresso do dia no cockpit: tarefas tratadas vs total + fetch de usuarios independente do cockpit
- CTA "Cobrar agora" no financeiro com feedback visual de progresso
- Conclusao da migracao arquitetural por feature no modulo administrativo (`/admin`)
- Padronizacao de cache/staleTime e optimistic updates nos fluxos criticos (tarefas e financeiro)
- Ativacao de E2E com credenciais e fixtures reais + execucao dos 6 edge cases manuais
- Validacao de uso real por 5 dias uteis antes do go-live
- Deploy final completo (rules + indexes + functions + hosting) e smoke test pos-deploy

## 9. Estado de migracao funcional 2.0

Modulos ja operando no padrao 2.0:

- `Hoje`
- `Clientes`
- `Tarefas`
- `Competencias`
- `Fechamento`
- `Financeiro`
- `Fiscal / NFS-e`
- `IR`

Modulo ainda em transicao para 2.0:

- `Administracao`
