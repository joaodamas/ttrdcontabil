# TTRD Contabil - Documentacao funcional e tecnica consolidada

Atualizado em 2026-05-08.

Este documento consolida o estado funcional, tecnico, integracoes, ajustes pendentes e pontos conhecidos de funcionamento da ferramenta. A base usada foi o codigo atual do projeto, as regras Firebase e os checklists em `docs_dev`.

## 1. Visao geral

O TTRD Contabil e uma ferramenta operacional para escritorio contabil. O objetivo principal e organizar o trabalho diario do escritorio em torno de clientes, tarefas, competencias, financeiro, fiscal/NFS-e, fechamento mensal e IR.

O produto esta estruturado como single-tenant por ambiente Firebase:

- cada escritorio deve rodar em um projeto Firebase proprio;
- o tenant atual padrao e `ttrd`;
- o campo `tenantId` continua obrigatorio para isolamento, regras de seguranca, auditoria e clonagem whitelabel;
- nao existe selecao de tenant na interface do usuario;
- o modelo whitelabel depende de clonagem de ambiente, nao de multi-tenant SaaS no mesmo Firestore.

## 2. Stack tecnica

Frontend:

- Next.js 16.2.2 com App Router;
- React 19.2.4;
- TypeScript 5;
- Tailwind CSS 4;
- shadcn/ui, Radix UI, Base UI, lucide-react e Sonner;
- TanStack Query para cache, queries e invalidacao por dominio.

Backend e infraestrutura:

- Firebase Auth;
- Cloud Firestore;
- Firebase Storage;
- Firebase Hosting;
- Firebase Cloud Functions v2 em Node 20;
- Secret Manager para segredos sensiveis das Functions;
- Firestore Security Rules e Storage Rules.

Qualidade:

- ESLint;
- Vitest;
- Playwright;
- Storybook;
- testes de regras Firestore com emulator, pendentes de execucao local por dependencia de Java 21+.

## 3. Estrutura do repositorio

- `src/app`: rotas Next.js.
- `src/components`: componentes de UI, layout e componentes por dominio.
- `src/features`: camada por dominio com `types`, `schemas`, `services`, `queries` e `hooks`.
- `src/lib`: Firebase client, auth, permissoes, exports, cache e algoritmos auxiliares.
- `src/contexts`: contexto de autenticacao.
- `functions/src`: Cloud Functions, schedulers, triggers, NFS-e, dashboard, fechamento e backup.
- `e2e`: testes Playwright.
- `__tests__`: testes unitarios e regras.
- `docs` e `docs_dev`: documentacao operacional, tecnica e checklists.
- `scripts`: scripts administrativos, seed, backfill, smoke e verificacoes.

## 4. Modulos funcionais

### 4.1 Autenticacao e permissao

Funcionalidades:

- login via Firebase Auth;
- leitura do perfil em `usuarios/{uid}`;
- bloqueio de usuario inativo;
- fallback seguro para perfil `leitura` quando o metadado nao esta disponivel;
- bloqueio de rotas por `AuthGuard`;
- redirecionamento para a primeira rota permitida.

Perfis:

- `admin`;
- `operacional`;
- `fiscal`;
- `financeiro`;
- `leitura`.

Telas controladas por permissao:

- `hoje`;
- `dashboard`;
- `clientes`;
- `tarefas`;
- `competencias`;
- `fechamento`;
- `financeiro`;
- `fiscal`;
- `ir`;
- `admin`;
- `servicos`.

Regra funcional importante: se `usuarios/{uid}.telas[]` estiver preenchido, ele sobrescreve o padrao do perfil.

### 4.2 Layout e navegacao

O layout ativo usa:

- sidebar desktop em `src/components/layout/app-sidebar.tsx`;
- drawer mobile com `Sheet`;
- topbar compacta com busca/command palette e atalho para novo item;
- command palette;
- `ErrorBoundary` em paginas do dashboard;
- `QueryProvider` para TanStack Query;
- toaster global.

Navegacao principal:

- Hoje;
- Painel;
- Cadastros > Clientes;
- Operacional > Tarefas, Competencias, Fechamento Mensal;
- Fiscal & NFS-e > Emissao NFS-e, Historico NFS-e, Imposto de Renda;
- Financeiro;
- Administracao > Painel Admin, Usuarios, Tipos de Servico, Conectores, Parametros.

### 4.3 Hoje / cockpit operacional

Rota: `/hoje`.

Funcionalidades:

- entrada operacional principal;
- fila de tarefas atrasadas, de hoje e proximos 7 dias;
- priorizacao por SLA;
- filtro por responsavel;
- acoes em massa: concluir, reatribuir e alterar prazo;
- exibicao de bloqueios de fechamento do mes atual;
- estados vazios com orientacao.

Funciona:

- leitura de tarefas e fechamentos respeitando tenant;
- priorizacao operacional;
- atualizacao otimista em fluxo de conclusao de tarefa;
- auditoria client-side nos updates de tarefas.

Pontos de atencao:

- validacao visual mobile/tablet ainda precisa ser concluida em ambiente autenticado real;
- uso interno por 5 dias uteis sem planilha paralela ainda nao foi executado.

### 4.4 Dashboard / painel executivo

Rota: `/dashboard`.

Funcionalidades:

- KPIs operacionais, financeiros e fiscais;
- cards de clientes ativos, tarefas, competencias e financeiro;
- listas resumidas de pendencias;
- CTA para iniciar execucao no cockpit;
- uso de agregado `dashboard_kpis/{tenantId_ano_mes}`;
- Cloud Function `recalcularDashboardKpis` para recalculo server-side.

Funciona:

- dashboard nao depende mais apenas de varredura completa no browser;
- queries de apoio possuem limites;
- cache pode ser recalculado via Function callable.

Pontos de atencao:

- smoke pos-deploy com credencial real ainda esta pendente;
- indices novos podem exigir tempo de inicializacao apos deploy.

### 4.5 Clientes e Cliente 360

Rotas:

- `/clientes`;
- `/clientes/novo`;
- `/clientes/[id]`;
- `/clientes/[id]/editar`;
- `/clientes/[id]/fiscal`;
- `/clientes/[id]/servicos/novo`.

Funcionalidades:

- cadastro e edicao de clientes;
- soft delete de clientes;
- filtros e paginacao por limite progressivo;
- vinculo de servicos contratados;
- configuracao fiscal por cliente;
- visao 360 com contexto operacional, fiscal e financeiro;
- timeline consolidada por cliente;
- proximos passos sugeridos;
- saude do cliente por dimensoes operacional, fiscal e financeira.

Eventos exibidos no Cliente 360:

- tarefas;
- lancamentos;
- competencias;
- NFS-e;
- eventos manuais/sistemicos em `events`;
- eventos fiscais e revisoes quando existentes.

Funciona:

- cliente e a entidade central do sistema;
- timeline e contexto local ja aparecem no cliente;
- alteracao de razao social propaga para colecoes denormalizadas via trigger;
- auditoria de writes criticos e soft delete.

Pontos de atencao:

- existem 46 clientes importados por CNPJ, mas ainda falta criar cenarios operacionais/fiscais/financeiros reais sobre eles;
- `clientes_servicos` precisa ser populado para todos os clientes ativos;
- massa real para validar Cliente 360 ainda esta incompleta.

### 4.6 Servicos contratados

Rotas e telas:

- `/servicos`;
- `/admin/servicos`;
- `/clientes/[id]/servicos/novo`.

Funcionalidades:

- cadastro de tipos de servico;
- vinculo de servico ativo a cliente;
- dados de recorrencia e valores usados por competencias, financeiro e NFS-e;
- geracao de codigos de servico no padrao `COBxx`.

Funciona:

- servicos sao tenant-scoped;
- CRUD administrativo de tipos de servico;
- vinculo a cliente usado por schedulers.

Pontos de atencao:

- clientes existentes ainda precisam receber servicos contratados reais;
- sem servico ativo, competencias, honorarios recorrentes e rascunhos NFS-e recorrentes nao fecham o ciclo operacional.

### 4.7 Tarefas

Rotas:

- `/tarefas`;
- `/tarefas/nova`;
- `/tarefas/[id]`;
- `/tarefas/[id]/editar`.

Funcionalidades:

- criacao e edicao de tarefas;
- status: `pendente`, `em_andamento`, `concluida`, `cancelada`;
- prioridade: `baixa`, `normal`, `alta`, `urgente`;
- responsavel, prazo e cliente;
- comentarios;
- filtro por status, prioridade e paginacao;
- conclusao de tarefa;
- integracao com competencias;
- participacao no cockpit.

Funciona:

- rules validam titulo, prioridade e status;
- updates geram auditoria;
- trigger `onTarefaConcluida` conclui competencia vinculada quando nao houver pendencias;
- eventos de timeline sao gerados por triggers.

Pontos de atencao:

- suite E2E mutacional real ainda precisa rodar com fixtures controladas;
- dados reais de tarefas com responsavel e prazo ainda precisam ser completados.

### 4.8 Competencias

Rotas:

- `/competencias`;
- `/competencias/nova`;
- `/competencias/[id]`;
- `/competencias/[id]/editar`.

Funcionalidades:

- controle por cliente, servico, mes e ano;
- status operacional;
- geracao mensal via scheduler;
- tarefas recorrentes a partir de competencias/servicos;
- prevencao de duplicidade por id deterministico/transacao;
- filtros por periodo/status.

Funciona:

- scheduler `criarCompetenciasMensais`;
- status usa enum compativel com o app;
- competencias conectam tarefas e fechamento.

Pontos de atencao:

- competencias do mes atual ainda precisam ser criadas com massa real;
- validacao operacional completa depende de servicos contratados em todos os clientes ativos.

### 4.9 Fechamento mensal

Rota: `/fechamento`.

Funcionalidades:

- geracao de fechamento mensal via Cloud Function `gerarFechamentoMensal`;
- id deterministico por `tenantId`, ano, mes e cliente;
- acompanhamento de obrigacoes como DAS, eSocial, Reinf e FGTS;
- revisao mensal com observacao;
- snapshot de pendencias;
- integracao com cockpit por bloqueios;
- auditoria e evento de timeline.

Funciona:

- geracao server-side reduz risco de falha parcial;
- revisao mensal registra ator, data e status agregado;
- fechamento aparece como bloqueio operacional.

Pontos de atencao:

- falta validar uso real completo durante fechamento mensal de producao.

### 4.10 Financeiro

Rotas:

- `/financeiro`;
- `/financeiro/novo`.

Funcionalidades:

- lancamentos de receita e despesa;
- baixa de pagamento;
- fila de cobranca priorizada;
- score de cobranca;
- recorrencia de honorarios mensais por `clientes_servicos`;
- registro de cobranca/negociacao;
- filtros por cliente, competencia, tipo e status;
- paginacao por limite no Firestore;
- exportacao CSV/Excel conforme helpers existentes.

Funciona:

- todo lancamento de receita deve ter `clienteId`;
- baixa financeira e fila de cobranca estao implementadas;
- filtros principais usam Firestore;
- eventos financeiros entram na timeline do cliente;
- delete direto de lancamento fica restrito a admin nas rules.

Pontos de atencao:

- cursor real com `startAfter` ainda nao substituiu totalmente a paginacao numerica;
- exportacao Excel real aparece como parcialmente pendente no checklist NFS-e/operacional;
- relatorio PDF de inadimplencia ainda consta pendente.

### 4.11 Fiscal / NFS-e

Rotas:

- `/fiscal`;
- `/fiscal/emitir`;
- `/fiscal/historico`;
- `/fiscal/[id]`;
- `/clientes/[id]/fiscal`;
- `/admin/conectores`.

Funcionalidades:

- configuracao fiscal por cliente;
- upload e validacao de certificado A1;
- salvamento de credenciais fiscais;
- emissao avulsa de NFS-e;
- emissao em lote;
- rascunhos mensais recorrentes sem emissao automatica;
- matriz de prontidao fiscal para emissao recorrente;
- historico de NFS-e;
- detalhe da NFS-e com XML, erro da ultima tentativa e eventos;
- consulta, cancelamento e retry via Cloud Functions;
- bloqueio de municipio nao homologado para producao;
- matriz municipio x capacidade em conectores fiscais.

Municipios roteados:

- Jundiai - IBGE `3525904`;
- Campinas - IBGE `3509502`;
- Cajamar - IBGE `3508900`;
- Sao Paulo - IBGE `3550308`;
- Barueri - IBGE `3505708`;
- Santana de Parnaiba - IBGE `3547304`;
- Taboao da Serra - IBGE `3552502`;
- Cotia - IBGE `3513009`.

Tipos de credencial por familia:

- municipios ABRASF/A1 e proprietarios com A1 exigem certificado A1;
- Santana de Parnaiba usa modelo Simpliss/token;
- Taboao da Serra usa Conam;
- Cotia usa GIAP.

Cloud Functions fiscais:

- `emitirNfse`;
- `emitirNfseLote`;
- `uploadCertificado`;
- `validarCertificado`;
- `salvarCredenciaisFiscais`;
- `consultarNfse`;
- `cancelarNfse`;
- `retryNfse`;
- `gerarRascunhosNfseMensais`.

Funciona:

- idempotencia transacional para emissao avulsa e lote;
- validacao server-side do payload fiscal;
- gravacao de erros e tentativas;
- redacao de dados sensiveis em logs de erro;
- `nfse_emitidas` nao permite escrita direta pelo browser;
- certificados e NFS-e em Storage nao permitem escrita pelo client;
- `CREDENTIAL_KEY` passou a ser obrigatorio em producao e vinculado às Functions fiscais.

Nao funciona ou nao esta liberado completamente:

- idempotencia fiscal real contra provedor municipal ainda nao esta completa;
- retry apos timeout/crash externo ainda precisa consultar prefeitura pelo RPS antes de nova emissao;
- consulta real por municipio ainda precisa homologacao/evidencia;
- cancelamento real por municipio ainda precisa homologacao/evidencia;
- emissao real por municipio ainda precisa homologacao/evidencia;
- recuperacao de erro em lote ainda precisa garantir saida de `processando` para estado retryavel em todos os casos;
- confirmacao fiscal forte antes da emissao ainda deve substituir confirmacao simples;
- fallback de senha de certificado em texto puro ainda deve ser removido;
- rotas dinamicas com `output: export` ainda dependem de placeholders e rewrites.

### 4.12 Imposto de Renda

Rotas:

- `/ir`;
- `/ir/nova`;
- `/ir/[id]`;
- `/ir/[id]/editar`.

Funcionalidades:

- cadastro de declaracao de IR por cliente e ano-base;
- responsavel;
- checklist de documentos;
- alertas de prazo;
- tarefa vinculada ao prazo;
- acompanhamento de status.

Funciona:

- fluxo minimo de cadastro e checklist;
- checklist e status participam do acompanhamento;
- alerts entram no cockpit e rotinas.

Pontos de atencao:

- producao atual ainda precisa ser populada com declaracoes reais;
- massa operacional de IR ainda esta incompleta.

### 4.13 Administracao

Rotas:

- `/admin`;
- `/admin/usuarios`;
- `/admin/servicos`;
- `/admin/conectores`;
- `/admin/parametros`.

Funcionalidades:

- gestao de usuarios;
- perfil, ativo/inativo e telas permitidas;
- gestao de tipos de servico;
- gestao de conectores fiscais;
- parametros do escritorio;
- configuracao whitelabel basica por variaveis `NEXT_PUBLIC_APP_*`.

Funciona:

- criacao de usuarios com `ativo`, `perfil`, `tenantId` e telas;
- modulo admin ja possui camada `src/features/admin`;
- parametros basicos de marca estao em `src/lib/app-config.ts`.

Pontos de atencao:

- seed inicial completo de ambiente single-tenant ainda esta pendente;
- textos de e-mail/Functions, seeds e scripts administrativos ainda precisam ser totalmente parametrizados para whitelabel.

### 4.14 Premium

Rota: `/premium`.

Estado:

- existe rota e componentes visuais premium/SaaS blocks;
- nao aparece como modulo operacional central nos checklists de producao;
- deve ser tratado como pagina auxiliar/comercial ou area futura ate haver decisao funcional clara.

## 5. Integracoes

### 5.1 Firebase Auth

Usado para login, sessao e UID do ator. O usuario so deve acessar dados se tambem existir documento ativo em `usuarios/{uid}` com `tenantId`.

### 5.2 Cloud Firestore

Banco operacional principal. Colecoes relevantes:

- `usuarios`;
- `clientes`;
- `servicos`;
- `clientes_servicos`;
- `competencias`;
- `tarefas`;
- `tarefas_comentarios`;
- `lancamentos`;
- `cobrancas`;
- `fechamentos`;
- `fechamento_revisoes`;
- `clientes_fiscal`;
- `clientes_fiscal_integracao`;
- `fiscal_conectores`;
- `nfse_rascunhos`;
- `nfse_emitidas`;
- `nfse_eventos`;
- `nfse_fila_processamento`;
- `nfse_erros`;
- `ir_declaracoes`;
- `ir_checklist`;
- `events`;
- `logs_auditoria`;
- `dashboard_kpis`;
- `documentos`;
- `configuracoes`.

### 5.3 Firebase Storage

Usado para documentos, XML/PDF de NFS-e e certificados. A politica atual:

- `documentos/{clienteId}/...`: leitura por usuario ativo do mesmo tenant do cliente; escrita bloqueada no client;
- `nfse/{clienteId}/...`: leitura por usuario ativo do mesmo tenant do cliente; escrita bloqueada no client;
- `certificados/{clienteId}/...`: leitura e escrita bloqueadas no client;
- demais paths negados.

### 5.4 Cloud Functions

Automacoes e operacoes sensiveis:

- NFS-e: emissao, lote, certificado, credenciais, consulta, cancelamento, retry e rascunhos mensais;
- fechamento: geracao mensal;
- dashboard: recalculo de KPIs;
- backup: exportacao semanal do Firestore;
- schedulers: competencias mensais, lancamentos mensais, alertas diarios, alerta de prazo 48h e inadimplencia;
- triggers: propagacao de razao social, conclusao de competencia por tarefa concluida e eventos de timeline.

### 5.5 Secret Manager

Segredos esperados:

- `CREDENTIAL_KEY`;
- `SMTP_HOST`;
- `SMTP_PORT`;
- `SMTP_USER`;
- `SMTP_PASS`;
- `EMAIL_FROM`;
- `EMAIL_TO`.

`CREDENTIAL_KEY` e obrigatorio para criptografia de credenciais fiscais e deve ser uma chave hex valida de 32 bytes.

### 5.6 E-mail

O modulo `functions/src/email/mailer.ts` envia alertas operacionais por SMTP. Parametrizacao whitelabel de textos e remetentes ainda precisa ser completada.

### 5.7 Prefeituras / provedores NFS-e

Integracao por conectores municipais em `functions/src/nfse/municipios`. O roteador escolhe o conector pelo codigo IBGE. A existencia do conector nao significa liberacao de producao: emissao, consulta e cancelamento precisam de homologacao por municipio.

### 5.8 BrasilAPI

Ha script de reset/importacao de clientes por CNPJ que usou dados da BrasilAPI para importar 46 clientes. Essa integracao aparece como apoio administrativo de carga de dados, nao como fluxo principal da UI.

### 5.9 ViaCEP

Existe hook `use-viacep`, indicando apoio ao preenchimento de endereco por CEP em formularios.

## 6. Seguranca, auditoria e compliance

Implementado:

- Firestore Rules exigem usuario autenticado, ativo e com tenant;
- colecoes operacionais exigem `tenantId` igual ao usuario;
- `usuarios` nao esta aberto para leitura anonima/global;
- `nfse_emitidas`, `nfse_fila_processamento` e `dashboard_kpis` bloqueiam escrita direta do browser;
- `logs_auditoria` e `events` sao append-only;
- Storage bloqueia escrita client-side de documentos, certificados e NFS-e;
- Functions fiscais usam controle de perfil e cliente;
- `assertCanAccessCliente` protege acesso server-side a cliente;
- auditoria client-side em colecoes criticas;
- redacao basica de campos sensiveis em auditoria e erros fiscais.

Pendente:

- executar suite de rules em emulator com Java 21+;
- revisar redacao LGPD completa de logs;
- cobrir todos os writes feitos por Admin SDK/Cloud Functions com trilha de auditoria padronizada;
- garantir `tenantId`, `clienteId`, ator, origem e payload redigido em todos os `nfse_eventos`;
- remover fallback de senha de certificado em texto puro.

## 7. Performance e cache

Implementado:

- TanStack Query por dominios;
- stale times por criticidade;
- invalidacao por dominio;
- cache de usuarios em memoria e `sessionStorage` com TTL;
- batch read de clientes por IDs;
- queries operacionais com `limit`;
- dashboard com agregado server-side;
- indices compostos revisados para filtros principais.

Pendente:

- substituir paginacao numerica/limite progressivo por cursor real `startAfter` onde fizer sentido;
- validar performance com volume real apos carga completa de servicos, competencias, tarefas, financeiro e NFS-e.

## 8. Testes, deploy e operacao

Scripts principais:

- `npm run dev`;
- `npm run build`;
- `npm run lint`;
- `npm run test`;
- `npm run test:rules`;
- `npm run test:e2e`;
- `npm run smoke:prod`;
- `npm run backfill:tenant`;
- `npm run seed:connectors`;
- `npm run reset:clientes`.

Testes existentes:

- unitarios de utilitarios, SLA e prioridade financeira;
- suite de Firestore Rules;
- E2E de auth, clientes, tarefas, financeiro, permissoes e operacao real.

Estado:

- lint foi corrigido e executa sem erro segundo checklist;
- rules, functions, indexes, storage e hosting foram publicados em 2026-05-05 segundo checklist;
- testes de rules estao bloqueados localmente por Java 8, exigindo Java 21+;
- smoke real de producao depende de `ADMIN_PASSWORD`;
- E2E mutacional com fixtures reais ainda precisa ser configurado.

## 9. O que funciona hoje

- Login e controle basico de permissao por perfil/telas.
- Isolamento por tenant nas colecoes operacionais.
- Navegacao principal por sidebar, topbar e command palette.
- Cockpit operacional `/hoje`.
- Dashboard com KPIs e agregado server-side.
- Cadastro, edicao, listagem e soft delete de clientes.
- Cliente 360 com timeline e proximos passos.
- Cadastro e vinculo de servicos.
- Tarefas com status, prioridade, responsavel, prazo, comentarios e conclusao.
- Competencias mensais e tarefas recorrentes.
- Fechamento mensal via Cloud Function.
- Financeiro com lancamentos, baixa, fila de cobranca e recorrencia.
- Fiscal com configuracao, rascunhos, emissao avulsa/lote, historico, detalhe, retry, consulta e cancelamento em nivel de fluxo.
- Upload e validacao de certificado A1 quando secrets estao configurados.
- IR com declaracoes, checklist e alertas.
- Admin de usuarios, servicos, conectores e parametros.
- Auditoria client-side de writes criticos.
- Triggers de timeline e propagacao de razao social.
- Backfill de tenant executado com 0 documentos pendentes no fechamento do checklist.

## 10. O que nao funciona ou nao esta pronto para producao externa

- Homologacao real de emissao, consulta e cancelamento NFS-e por todos os municipios.
- Idempotencia fiscal real contra provedor municipal em caso de timeout/crash apos envio.
- Recuperacao completa de erro em lote NFS-e em todos os estados.
- Remocao total de fallback de senha de certificado em texto puro.
- Seed inicial completo para novo ambiente single-tenant.
- Parametrizacao whitelabel completa em Functions, e-mails, seeds e scripts.
- Validacao automatizada de Firestore Rules e Storage Rules no emulator local com Java 21+.
- Smoke pos-deploy com credenciais reais.
- E2E mutacional completo com fixtures reais controladas.
- Uso interno por 5 dias uteis sem planilha paralela.
- Massa real de servicos, competencias, tarefas, lancamentos, IR e NFS-e de homologacao.
- Validacao mobile/tablet autenticada das telas criticas.
- Paginacao por cursor real em todas as telas de alto volume.
- Exportacao PDF de inadimplencia.

## 11. Ajustes criticos

1. Homologar NFS-e por municipio antes de liberar producao fiscal.
   - Impacto: risco de emissao incorreta, rejeicao fiscal ou cancelamento/consulta sem efeito real.
   - Inclui emissao, consulta, cancelamento, certificado/credencial, ambiente homologacao/producao e evidencia por municipio.

2. Implementar idempotencia fiscal real contra a prefeitura.
   - Impacto: risco de duplicidade em timeout ou crash apos envio externo.
   - Necessario persistir RPS/chave antes da chamada, consultar por RPS em retry e usar ID deterministico em `nfse_emitidas`.

3. Fechar recuperacao de erro em lote NFS-e.
   - Impacto: item pode ficar preso em `processando` ou sem estado retryavel claro.
   - Cada falha deve gravar `erroId`, estado operacional e aparecer no historico.

4. Remover fallback de senha/certificado em texto puro.
   - Impacto: risco de seguranca fiscal e exposicao de credenciais.
   - Emissao deve exigir credencial criptografada e falhar com erro operacional claro quando descriptografia falhar.

5. Executar validacao de regras e smoke com credenciais reais.
   - Impacto: risco de acesso indevido ou deploy aparentemente correto sem fluxo operacional validado.
   - Requer Java 21+ e `ADMIN_PASSWORD`/credenciais de teste.

6. Criar seed inicial single-tenant.
   - Impacto: clonagem whitelabel depende de conhecimento manual e fica sujeita a ambiente incompleto.
   - Deve criar admin, parametros, servicos base, conectores, tenant fixo e permissoes.

7. Completar massa operacional minima.
   - Impacto: sistema pode estar tecnicamente funcional, mas sem dados para operar escritorio real.
   - Exige servicos ativos por cliente, competencias, tarefas, lancamentos e ao menos uma NFS-e homologada.

## 12. Ajustes medios

1. Revisar redacao LGPD dos logs.
   - CPF/CNPJ, e-mail, telefone, XML, certificado, senha, token e payload fiscal completo devem ser redigidos.

2. Completar auditoria server-side.
   - Writes por Admin SDK e Cloud Functions devem gerar eventos padronizados.

3. Vincular todos os eventos fiscais a tenant e cliente.
   - `nfse_eventos` deve ser filtravel e auditavel por tenant/cliente.

4. Parametrizar whitelabel alem do frontend.
   - E-mails, textos de Functions, seed e scripts devem ler configuracao do ambiente.

5. Validar responsividade mobile/tablet.
   - Telas criticas: Hoje, Cliente 360, Fiscal Emitir, Historico NFS-e, Fechamento e Financeiro.

6. Migrar paginacao para cursor real.
   - Reduz custo e melhora previsibilidade em colecoes grandes.

7. Completar E2E mutacional.
   - Criar cliente, vincular servico, gerar competencia, concluir tarefa, gerar fechamento, baixar financeiro, salvar/emitir/cancelar NFS-e em homologacao.

8. Resolver arquitetura `output: export` com rotas dinamicas.
   - Hoje ha placeholders e rewrites; precisa decisao se isso permanece ou se muda para runtime que suporte rotas dinamicas nativamente.

9. Finalizar exportacoes e relatorios.
   - Excel real e PDF/relatorio de inadimplencia.

## 13. Ajustes baixos

1. Atualizar documentacoes antigas que ainda citam topnav como layout principal.
2. Melhorar README, que ainda esta no template padrao do Next.js.
3. Classificar rota `/premium` como comercial, futura ou remover da navegacao se nao for usada.
4. Padronizar nomenclatura visual entre "Painel", "Dashboard" e "Hoje".
5. Revisar textos de estados vazios e mensagens de erro apos validacao com usuarios reais.
6. Limpar logs, caches de hosting e artefatos locais antes de release, sem apagar dados necessarios de auditoria.
7. Consolidar docs duplicadas em `docs` e `docs_dev` para reduzir divergencia.

## 14. Ordem recomendada para producao

1. Fechar seguranca verificavel: Java 21+, `npm run test:rules`, Storage Rules e smoke real.
2. Completar NFS-e critica: homologacao, idempotencia fiscal real, lote e credenciais criptografadas.
3. Criar seed single-tenant e validar clone whitelabel.
4. Popular massa minima real: usuarios por perfil, clientes com servicos, competencias, tarefas, financeiro, IR e NFS-e homologada.
5. Rodar E2E mutacional e smoke pos-deploy.
6. Executar 5 dias uteis de operacao interna sem planilha paralela.
7. Corrigir achados de uso real antes de liberar escritorio externo.
