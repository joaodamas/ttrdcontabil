# Documentação técnica completa da ferramenta

Atualizado em: 2026-05-10  
Escopo: aplicação Next.js em `src/app`, componentes em `src/components`, features em `src/features`, Firebase Functions em `functions/src`, regras Firestore e design system global.

Este documento descreve o comportamento implementado no código atual: o que a ferramenta contempla, quais módulos existem, o que cada tela exibe, quais ações existem, para onde cada ação leva, quais processos são disparados, quais documentos são gerados, quais automações rodam, quais modais são abertos, dimensões de overlays, campos, estados vazios, carregamento, confirmações, permissões, integrações, auditoria, cores e padrões visuais.

## 0. Visão geral da ferramenta

### 0.1 Propósito do sistema

O sistema TTRD Contábil é uma ferramenta operacional para escritório contábil. Ele centraliza cadastro de clientes, serviços contratados, competências mensais, tarefas, fechamento mensal, financeiro, cobrança por WhatsApp, emissão NFS-e, Imposto de Renda, administração de usuários, catálogo de serviços, conectores fiscais e parâmetros.

A ferramenta não é apenas uma lista de telas. Ela funciona como uma malha operacional:

- O cadastro de cliente alimenta fiscal, financeiro, tarefas, fechamento e timeline.
- O vínculo de serviços do cliente alimenta geração de competências e lançamentos mensais.
- Competências geram tarefas de execução e consolidam o andamento operacional.
- Tarefas alimentam cockpit Hoje, Dashboard, detalhe do cliente e fechamento.
- Lançamentos alimentam financeiro, fila de cobrança, inadimplência, WhatsApp e saúde do cliente.
- Configuração fiscal alimenta prontidão NFS-e, rascunhos, emissão, certificado e alertas.
- NFS-e emitidas e rascunhos alimentam painel fiscal, histórico, detalhe do cliente e alertas.
- IR cria declaração, checklist e tarefa operacional de coleta.
- Fechamento gera registros mensais por cliente e eventos na timeline.
- Eventos e auditoria registram o histórico de ações para rastreabilidade.

### 0.2 Módulos funcionais

| Módulo | O que resolve | Principais dados |
|---|---|---|
| Autenticação e permissões | Controla acesso por usuário, perfil, tenant e telas liberadas | `usuarios`, sessão Firebase/Auth |
| Clientes | Mantém ficha cadastral, contatos, endereço, credenciais, WhatsApp e saúde operacional | `clientes` |
| Serviços contratados | Define serviços ativos de cada cliente, valor, recorrência e base para geração mensal | `clientes_servicos`, `servicos` |
| Competências | Controla execução mensal por cliente/serviço/mês | `competencias` |
| Tarefas | Controla trabalho operacional, responsável, prazo, prioridade e status | `tarefas`, `tarefas_comentarios` |
| Cockpit Hoje | Prioriza tarefas atrasadas, do dia, próximos 7 dias e bloqueios de fechamento | `tarefas`, `fechamentos` |
| Dashboard | Consolida KPIs e atalhos executivos | `dashboard_kpis`, consultas agregadas |
| Financeiro | Controla receitas/despesas, baixas, atraso, exportações e cobrança | `lancamentos`, `cobrancas` |
| WhatsApp Cobrança | Agenda, envia, pausa, retoma, reagenda e registra cobrança automatizada | `whatsapp_*`, `lancamentos`, `clientes` |
| Fiscal/NFS-e | Configura prestador, credenciais, rascunhos, emissão, lote, histórico, consulta e cancelamento | `clientes_fiscal`, `nfse_rascunhos`, `nfse_emitidas`, `nfse_eventos` |
| Fechamento mensal | Gera e acompanha pendências mensais por cliente | `fechamentos`, `fechamento_revisoes` |
| Imposto de Renda | Controla declaração anual, checklist documental e tarefa de coleta | `ir_declaracoes`, `ir_checklist`, `tarefas` |
| Administração | Mantém usuários, serviços, conectores e parâmetros | `usuarios`, `servicos`, `fiscal_conectores`, `configuracoes` |
| Timeline/Auditoria | Registra eventos por cliente e logs auditáveis de escrita | `events`, `logs_auditoria` |

### 0.3 Ciclo operacional principal

1. Cliente é cadastrado em `/clientes/novo`.
2. Serviços são vinculados ao cliente pelo Cliente 360 ou rota de serviço.
3. Todo dia 1, o scheduler cria competências mensais para serviços ativos.
4. Junto com cada competência automática, o sistema cria uma tarefa de execução com prazo no dia 20.
5. Todo dia 1, outro scheduler cria lançamentos financeiros de receita para serviços ativos.
6. A tela Hoje organiza tarefas por atraso, prazo e prioridade.
7. A tela Financeiro destaca recebíveis, atrasos e fila de cobrança.
8. A régua WhatsApp agenda e processa mensagens para receitas pendentes elegíveis.
9. A área Fiscal usa configuração do cliente para gerar rascunhos e emitir NFS-e.
10. O Fechamento mensal cria uma linha por cliente ativo e acompanha pendências de DAS, eSocial, REINF e FGTS.
11. Eventos e auditoria registram alterações e ações relevantes.

### 0.4 Princípio de rastreabilidade

Cada escrita via helpers client-side em coleções auditadas:

- Adiciona metadados de ator: `criadoPorId`, `criadoPorNome`, `atualizadoPorId`, `atualizadoPorNome`.
- Adiciona timestamps: `criadoEm`, `atualizadoEm`.
- Adiciona `tenantId` quando o usuário tem tenant e a coleção é tenant-scoped.
- Escreve log em `logs_auditoria` quando a coleção faz parte de `AUDITED_COLLECTIONS`.
- Redige dados sensíveis antes da auditoria, substituindo senhas, tokens, certificados, credenciais, chaves e secrets por `[REDACTED]`.

## 0.5 Design system, cores e linguagem visual

Arquivo principal: `src/app/globals.css`.

### 0.5.1 Paleta light

| Token | Valor OKLCH | Uso funcional |
|---|---:|---|
| `--background` | `oklch(0.982 0.002 250)` | Canvas geral claro, próximo de slate-50 |
| `--foreground` | `oklch(0.13 0.008 260)` | Texto principal |
| `--card` | `oklch(1 0 0)` | Cards, tabelas e superfícies principais |
| `--popover` | `oklch(1 0 0)` | Dialogs, menus e overlays |
| `--primary` | `oklch(0.82 0.18 88)` | Amarelo TTRD, ação primária, foco e destaques |
| `--primary-foreground` | `oklch(0.10 0 0)` | Texto sobre amarelo primário |
| `--secondary` | `oklch(0.94 0 0)` | Ações secundárias |
| `--muted` | `oklch(0.958 0.003 250)` | Fundos sutis, cabeçalhos de tabela |
| `--muted-foreground` | `oklch(0.48 0.012 250)` | Texto secundário |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Erro, exclusão, atraso, rejeição |
| `--success` | `oklch(0.52 0.15 145)` | Pago, emitido, concluído, pronto |
| `--warning` | `oklch(0.72 0.15 70)` | Atenção, vencimento, pendência crítica |
| `--info` | `oklch(0.55 0.14 240)` | Informação, rascunho pronto, estados auxiliares |
| `--neutral` | `oklch(0.56 0.012 250)` | Aguardando, rascunho, andamento sem urgência |
| `--border` | `oklch(0.916 0.004 250)` | Bordas padrão |
| `--ring` | `oklch(0.82 0.18 88)` | Foco e highlight interativo |

### 0.5.2 Paleta dark

- Background escuro: `oklch(0.145 0.014 260)`.
- Cards: `oklch(0.19 0.012 260)`.
- Primary permanece amarelo TTRD.
- Muted e border usam variações escuras com baixa opacidade.
- Success, warning e info ficam mais luminosos que no light para manter contraste.

### 0.5.3 Sidebar

Light e dark mantêm sidebar escura:

- `--sidebar`: light `oklch(0.155 0.012 260)`, dark `oklch(0.125 0.01 260)`.
- Texto da sidebar: quase branco.
- Destaque primário da sidebar: amarelo TTRD.
- A intenção visual é separar navegação estrutural do conteúdo operacional.

### 0.5.4 Raios, sombras e superfícies

Raios derivados de `--radius: 0.625rem`:

- `--radius-sm`: `0.375rem`.
- `--radius-md`: `0.5rem`.
- `--radius-lg`: `0.625rem`.
- `--radius-xl`: `0.875rem`.
- `--radius-2xl`: `1.125rem`.
- `--radius-3xl`: `1.375rem`.
- `--radius-4xl`: `1.625rem`.

Classes utilitárias:

- `.surface-card`: fundo `surface-1`, borda padrão e raio `radius-xl`.
- `.surface-muted`: fundo `surface-2`, borda padrão e raio `radius-lg`.
- `.surface-subtle`: fundo translúcido de `surface-2`, borda com mix de `border`, blur de 10px e raio `radius-xl`.
- `.card-shadow`: sombra leve `0 1px 2px rgb(0 0 0 / 0.04)`.
- `.card-shadow-hover`: sombra `0 2px 8px -2px rgb(0 0 0 / 0.08)`.

### 0.5.5 Tipografia

- Fonte sans: `--font-geist-sans`.
- Fonte mono: `--font-geist-mono`.
- `--text-xs`: 0.75rem.
- `--text-sm`: 0.875rem.
- `--text-md`: 1rem.
- `--text-lg`: 1.125rem.
- `.text-title`: 1.125rem, line-height 1.4, peso 700, letter-spacing `-0.01em`.
- `.kpi-value`: `clamp(1.6rem, 2.2vw, 2.35rem)`, peso 700, tabular nums.
- `.text-metric-hero`: `clamp(2rem, 4vw, 3rem)`, peso 700, tabular nums.
- `.section-label`: texto pequeno, uppercase, tracking wider, muted.

### 0.5.6 Semântica de cor por status

| Cor | Significado operacional |
|---|---|
| Primary/amarelo | Ação principal, navegação ativa, botão primário, foco |
| Success/verde | Pago, emitido, pronto, concluído, certificado válido |
| Warning/âmbar | Alta prioridade, valor alto, pendência de fechamento, vencimento próximo |
| Destructive/vermelho | Atraso, erro fiscal, rejeição, exclusão, bloqueio |
| Info/azul | Informação auxiliar, prontidão parcial, estados intermediários |
| Muted/cinza | Rascunho, vazio, informação secundária, status neutro |

## 0.6 Modelo de dados e coleções

### 0.6.1 Coleções tenant-scoped

As coleções abaixo são filtradas automaticamente por `tenantId` em leituras client-side e exigem tenant nas regras:

- `clientes`
- `clientes_servicos`
- `servicos`
- `competencias`
- `tarefas`
- `tarefas_comentarios`
- `lancamentos`
- `cobrancas`
- `fechamentos`
- `fechamento_revisoes`
- `clientes_fiscal`
- `clientes_fiscal_integracao`
- `fiscal_conectores`
- `nfse_rascunhos`
- `nfse_emitidas`
- `nfse_eventos`
- `nfse_fila_processamento`
- `events`
- `logs_auditoria`
- `dashboard_kpis`
- `documentos`
- `ir_declaracoes`
- `ir_checklist`
- `usuarios`
- `whatsapp_templates`
- `whatsapp_campaign_rules`
- `whatsapp_jobs`
- `whatsapp_messages`
- `whatsapp_webhook_events`

### 0.6.2 Coleções auditadas

Coleções com log automático de create/update/delete/soft delete:

- `clientes`
- `clientes_servicos`
- `competencias`
- `tarefas`
- `lancamentos`
- `cobrancas`
- `fechamentos`
- `fechamento_revisoes`
- `clientes_fiscal`
- `nfse_rascunhos`
- `nfse_emitidas`
- `ir_declaracoes`
- `ir_checklist`
- `usuarios`
- `configuracoes`
- `whatsapp_templates`
- `whatsapp_campaign_rules`
- `whatsapp_jobs`
- `whatsapp_messages`
- `whatsapp_webhook_events`

### 0.6.3 Dados sensíveis

Campos com nomes contendo senha, password, token, credencial, certificado, chave, private ou secret são redigidos no log de auditoria.

Chaves explicitamente sensíveis:

- `senha`
- `password`
- `token`
- `accessToken`
- `refreshToken`
- `certificado`
- `certificadoBase64`
- `certificadoSenha`
- `senhaCertificado`
- `privateKey`
- `chavePrivada`
- `configJson`
- `credenciais`
- `payloadEnvio`
- `payloadRetorno`
- `respostaIntegracao`

## 0.7 Permissões e segurança

Arquivo: `firestore.rules`.

### 0.7.1 Regras de usuário

- Usuário precisa estar autenticado.
- Deve existir documento em `usuarios/{uid}`.
- Deve ter `tenantId` string não vazio.
- Deve estar ativo, exceto quando `ativo` não existe.
- Toda leitura/escrita tenant-scoped exige mesmo tenant do usuário.

### 0.7.2 Perfis de segurança Firestore

| Perfil lógico | Quem inclui | Finalidade |
|---|---|---|
| `isAdmin` | `admin` | Administração total e deleções sensíveis |
| `isOperacional` | `admin`, `operacional` | Clientes, serviços de cliente, competências, tarefas, fechamento, IR |
| `isFiscal` | `admin`, `fiscal` | Configuração fiscal, rascunhos, integração fiscal |
| `isFinanceiro` | `admin`, `financeiro` | Lançamentos e cobranças |
| `canRead` | qualquer usuário ativo | Leitura geral dentro do tenant |

### 0.7.3 Restrições importantes

- `nfse_emitidas`: leitura permitida, escrita direta do browser bloqueada. Somente Cloud Functions/Admin SDK escrevem.
- `nfse_fila_processamento`: escrita direta bloqueada.
- `dashboard_kpis`: leitura permitida, escrita direta bloqueada.
- `logs_auditoria`: append-only; leitura apenas admin; update/delete bloqueados.
- `events`: create permitido para usuário ativo; update/delete bloqueados.
- Deleção de clientes, serviços, lançamentos, configuração fiscal, documentos e logs é restrita a admin ou bloqueada.

## 0.8 Automações e Cloud Functions

Arquivo exportador: `functions/src/index.ts`.

### 0.8.1 Schedulers

| Function | Frequência | O que faz | Coleções afetadas |
|---|---|---|---|
| `criarCompetenciasMensais` | Dia 1, 01:00 BRT | Cria competência mensal para cada serviço ativo de cliente ativo e cria tarefa de execução com prazo dia 20 | `competencias`, `tarefas`, `logs_auditoria` |
| `criarLancamentosMensais` | Dia 1, 06:00 BRT | Cria lançamento de receita mensal para serviços ativos, vencimento por `diaVencimento` ou dia 10 | `lancamentos`, `logs_auditoria` |
| `enviarAlertasDiarios` | Todo dia, 07:00 BRT | Envia e-mail consolidado com tarefas próximas, lançamentos atrasados, certificados vencendo e NFS-e com erro/cancelamento/rascunho | e-mail, leitura em várias coleções |
| `alertasPrazoCritico` | Todo dia, 07:00 BRT | Marca/desmarca `alertaPrazo48h` em tarefas com prazo nas próximas 48h | `tarefas` |
| `detectarInadimplencia` | Segunda, 08:00 BRT | Marca `riscoInadimplencia` em clientes com receitas pendentes vencidas acima de R$ 500 | `clientes`, `lancamentos` |
| `agendarCobrancasWhatsapp` | Scheduler WhatsApp | Avalia lançamentos elegíveis e cria jobs de WhatsApp | `lancamentos`, `whatsapp_jobs` |
| `processarFilaWhatsapp` | Scheduler WhatsApp | Processa jobs pendentes de WhatsApp | `whatsapp_jobs`, `whatsapp_messages`, `lancamentos` |
| `exportarFirestoreSemanal` | Scheduler backup | Exporta backup semanal do Firestore | backup/storage |

### 0.8.2 Callables fiscais

| Function | Uso |
|---|---|
| `emitirNfse` | Emite uma NFS-e individual a partir dos dados revisados no formulário |
| `emitirNfseLote` | Emite até 50 NFS-e a partir de rascunhos selecionados |
| `cancelarNfse` | Solicita cancelamento de NFS-e |
| `consultarNfse` | Consulta status da NFS-e no conector/prefeitura |
| `retryNfse` | Reprocessa tentativa fiscal |
| `uploadCertificado` | Envia certificado A1 |
| `validarCertificado` | Valida certificado digital |
| `salvarCredenciaisFiscais` | Salva credenciais fiscais sensíveis em fluxo protegido |
| `gerarRascunhosNfseMensais` | Gera rascunhos mensais de NFS-e para clientes elegíveis |

### 0.8.3 Callables operacionais e dashboard

| Function | Uso |
|---|---|
| `gerarFechamentoMensal` | Cria fechamento mensal para clientes ativos, opcionalmente filtrando regime |
| `recalcularDashboardKpis` | Recalcula KPIs do dashboard |

### 0.8.4 Callables WhatsApp

| Function | Uso |
|---|---|
| `inicializarConfiguracaoWhatsapp` | Inicializa configuração e templates/regras de cobrança |
| `dispararCobrancaWhatsappAgora` | Enfileira cobrança manual imediata para lançamento |
| `pausarCobrancaWhatsappLancamento` | Pausa régua de cobrança do lançamento |
| `retomarCobrancaWhatsappLancamento` | Retoma régua e agenda próximo job |
| `reagendarCobrancaWhatsappLancamento` | Recalcula/agendada próxima ação |
| `webhookWhatsapp` | Recebe eventos externos de entrega/resposta/status |

### 0.8.5 Triggers de timeline e integridade

| Trigger | Quando roda | O que gera |
|---|---|---|
| `propagarRazaoSocial` | Cliente atualizado | Propaga `clienteNome` para competências, lançamentos e tarefas |
| `onTarefaConcluida` | Tarefa muda para concluída | Se todas as tarefas de uma competência estão concluídas, marca competência como concluída |
| `eventoTarefaCriada` | Tarefa criada | Evento na timeline do cliente |
| `eventoTarefaAtualizada` | Status da tarefa muda | Evento na timeline do cliente |
| `eventoLancamentoCriado` | Lançamento criado | Evento na timeline do cliente |
| `eventoLancamentoAtualizado` | Status do lançamento muda | Evento na timeline do cliente |
| `eventoCompetenciaCriada` | Competência criada | Evento na timeline do cliente |
| `eventoNfseEmitidaCriada` | NFS-e criada | Evento na timeline do cliente |
| `eventoFiscalAtualizado` | Ambiente/município fiscal muda | Evento na timeline do cliente |

## 0.9 Processos de negócio detalhados

### 0.9.1 Cadastro de cliente

Entrada:

- Dados gerais, contato, endereço, dados cadastrais, credenciais, representante, WhatsApp, NFS-e e observações.

Processamento:

- Para PJ, CNPJ completo consulta BrasilAPI.
- CEP consulta ViaCEP.
- WhatsApps são normalizados.
- Cliente recebe código sequencial por `getNextClienteCodigo`.
- Escrita gera auditoria.

Saídas:

- Documento em `clientes`.
- Cliente aparece em `/clientes`, Cliente 360, selects de tarefas, competências, financeiro, IR e fiscal.
- Pode ser usado por schedulers de competência, lançamento, fechamento, inadimplência e WhatsApp.

### 0.9.2 Serviço contratado

Entrada:

- Cliente, serviço de catálogo, valor, status e parâmetros recorrentes.

Processamento:

- Serviço ativo entra nas rotinas mensais.

Saídas:

- Documento em `clientes_servicos`.
- Valor mensal ativo no Cliente 360.
- Base para `competencias`.
- Base para `lancamentos`.
- Base indireta para NFS-e recorrente.

### 0.9.3 Competência mensal

Geração manual:

- Usuário cria em `/competencias/nova`.
- ID determinístico evita duplicidade por cliente/serviço/ano/mês.

Geração automática:

- `criarCompetenciasMensais` roda no dia 1 às 01:00 BRT.
- Para cada serviço ativo de cliente ativo:
  - Cria competência aberta.
  - Cria tarefa de execução.

Saídas:

- Documento em `competencias`.
- Documento em `tarefas`.
- Evento na timeline.
- Detalhe da competência passa a consolidar tarefas, lançamentos e NFS-e.

### 0.9.4 Tarefa

Entrada:

- Título, descrição, prioridade, status, cliente, competência, responsável e prazo.

Processamento:

- Cockpit Hoje considera tarefas pendentes/em andamento com prazo.
- Score considera grupo, atraso, prioridade e ausência de responsável.
- Conclusão de tarefa pode concluir competência automaticamente quando não restam tarefas pendentes.

Saídas:

- Documento em `tarefas`.
- Eventos de criação/alteração.
- Comentários em `tarefas_comentarios`.
- Impacto em Hoje, Dashboard, detalhe do cliente e competência.

### 0.9.5 Lançamento financeiro

Entrada:

- Tipo, descrição, valor, vencimento, pagamento, cliente, pagador, WhatsApp, status de cobrança e observações.

Processamento:

- Receita exige cliente.
- Baixa muda status para pago, grava data e forma de pagamento.
- Valor acima de R$ 500 exige confirmação extra na baixa.
- Receitas pendentes entram na fila de cobrança e régua WhatsApp.
- Scheduler mensal gera lançamentos de receita para serviços ativos.
- Scheduler de inadimplência marca cliente com risco quando soma vencida > R$ 500.

Saídas:

- Documento em `lancamentos`.
- Evento na timeline.
- Dados para exportação.
- Dados para WhatsApp.
- Dados para saúde do cliente.

### 0.9.6 Cobrança WhatsApp

Elegibilidade:

- Lançamento precisa existir.
- Precisa ter cliente.
- Tipo precisa ser `receita`.
- Status financeiro precisa ser `pendente` ou `atrasado`.
- Cobrança WhatsApp não pode estar desligada, ignorada ou pausada.
- Lançamento não pode estar pago.
- Cliente precisa ter destino financeiro resolvido.

Processamento:

- Scheduler avalia lançamentos.
- `queueWhatsappJob` cria job com chave por lançamento, etapa e data.
- Ações manuais podem enviar agora, pausar, retomar e reagendar.
- Webhook atualiza mensagens/status quando fornecedor retorna evento.

Saídas:

- Atualização em `lancamentos`:
  - `statusWhatsappCobranca`
  - `ultimoEnvioWhatsappEm`
  - `proximaAcaoWhatsappEm`
  - `pagadorNome`
  - `pagadorWhatsapp`
- Registros em `whatsapp_jobs`, `whatsapp_messages`, `whatsapp_webhook_events`.
- Histórico exibido no modal do financeiro.

### 0.9.7 NFS-e individual

Entrada:

- Cliente/prestador.
- Tomador.
- Serviço.
- Competência opcional.
- Rascunho opcional.
- Configuração fiscal e credenciais do cliente.

Processamento:

- Formulário pode salvar rascunho em `nfse_rascunhos`.
- Ao emitir, chama `emitirNfse`.
- Function valida acesso, configuração e conector municipal.
- Emissão grava resultado em `nfse_emitidas`.
- Falhas registram erro operacional, código e detalhes técnicos.

Saídas:

- NFS-e emitida, rejeitada ou com erro.
- Evento na timeline.
- Histórico fiscal.
- Detalhe NFS-e.
- Dashboard fiscal e Cliente 360.

### 0.9.8 NFS-e em lote

Entrada:

- Rascunhos com `status = aguardando_emissao`.
- Seleção de até 50 itens.

Processamento:

- Modal monta payload por rascunho.
- Chama `emitirNfseLote`.
- Retorna resultado por item.

Saídas:

- NFS-e emitidas ou erros por item.
- Modal mostra emitidas e falhas.
- Tela fiscal é invalidada/atualizada.

### 0.9.9 Rascunhos mensais NFS-e

Entrada:

- Mês, ano e flag `gerarAteHoje`.

Processamento:

- Function `gerarRascunhosNfseMensais` exige perfil fiscal.
- Considera clientes ativos, serviço ativo, configuração fiscal completa e dia de emissão.
- Quando `gerarAteHoje=true`, no mês atual ignora clientes cujo dia de emissão ainda não chegou.
- Evita duplicidade por cliente/competência.

Saídas:

- Documentos em `nfse_rascunhos`.
- Log em `logs_auditoria`.
- Rascunhos aparecem em Fiscal e podem ser revisados/emitidos.

### 0.9.10 Fechamento mensal

Entrada:

- Mês, ano e regime opcional.

Processamento:

- `gerarFechamentoMensal` exige perfil admin ou operacional.
- Busca clientes ativos do tenant.
- Ignora clientes fora do regime filtrado.
- Evita duplicidade por ID `{tenantId}_{ano}_{mes}_{clienteId}`.
- Cria status iniciais:
  - `dasStatus: pendente`
  - `esocialStatus: na`
  - `reinfStatus: na`
  - `fgtsStatus: na`

Saídas:

- Documento em `fechamentos`.
- Evento `fechamento` na timeline.
- Log de auditoria.
- Bloqueios aparecem em Hoje quando há status `pendente` ou `parcial`.

### 0.9.11 Imposto de Renda

Entrada:

- Cliente, ano-calendário, status, responsável, entrega, recibo e observações.

Processamento:

- Ao criar declaração:
  - Cria `ir_declaracoes`.
  - Cria checklist padrão em `ir_checklist`.
  - Cria tarefa operacional de coleta de documentos.

Saídas:

- Declaração visível em `/ir`.
- Checklist no detalhe.
- Tarefa aparece em tarefas/Hoje quando aplicável.

## 0.10 Integrações externas

| Integração | Onde aparece | Finalidade |
|---|---|---|
| Firebase Auth | AuthGuard, helpers, rules | Autenticação |
| Firestore | App inteira | Persistência operacional |
| Firebase Functions | Fiscal, fechamento, WhatsApp, schedulers | Processos protegidos e automações |
| Firebase Storage | Certificado/backup/documentos | Arquivos e certificados |
| BrasilAPI CNPJ | Formulário de cliente | Preencher dados de PJ |
| ViaCEP | Formulário de cliente | Preencher endereço |
| Prefeituras/conectores NFS-e | Functions fiscais | Emissão/consulta/cancelamento NFS-e |
| Provedor WhatsApp | Functions WhatsApp/webhook | Cobrança automática |
| E-mail | Scheduler de alertas | Resumo diário |

## 0.11 O que a ferramenta mostra, gera e atualiza por área

| Área | Mostra | Gera | Atualiza |
|---|---|---|---|
| Clientes | Lista, ficha, saúde, serviços, competências, financeiro, fiscal, timeline | Cliente, serviço vinculado, config fiscal, certificado | Dados cadastrais, WhatsApp, credenciais, status |
| Hoje | Tarefas atrasadas/hoje/7 dias, bloqueios fechamento | Ações em lote | Status, responsável, prazo |
| Dashboard | KPIs, alertas e atalhos | Nenhum dado direto na tela | Navegação para áreas críticas |
| Tarefas | Fila/lista, detalhe, comentários | Tarefa, comentário | Status, prioridade, responsável, prazo |
| Competências | Mês/ano, cliente, serviço, status | Competência | Status, responsável, observações |
| Financeiro | KPIs, lançamentos, fila cobrança, WhatsApp | Lançamento, cobrança manual/evento | Baixa, status WhatsApp, pausa/reagendamento |
| Fiscal | Prontidão, rascunhos, notas recentes, erros | Rascunho, NFS-e, lote | Status fiscal, erros, consulta, cancelamento |
| Fechamento | Pendências por cliente e mês | Fechamento mensal, revisão | Status DAS/eSocial/REINF/FGTS |
| IR | Declarações, checklist | Declaração, checklist, tarefa de coleta | Status, entrega, recibo, checklist |
| Admin | Usuários, serviços, conectores, parâmetros | Usuário, serviço, configuração | Permissões, catálogo, parâmetros |

## 1. Estrutura global da aplicação

### 1.1 Layout autenticado

Arquivo principal: `src/app/(dashboard)/layout.tsx`.

- Todas as telas do dashboard são envolvidas por `QueryProvider`, `AuthProvider`, `AuthGuard`, `ErrorBoundary`, `CommandPalette` e `Toaster`.
- A tela ocupa `h-screen` com `overflow-hidden`.
- A sidebar desktop fica fixa à esquerda, com largura `w-56`, ou seja, 224px.
- A topbar tem altura `h-12`, ou seja, 48px, fica sticky no topo e usa `z-30`.
- O conteúdo principal tem rolagem própria, padding `px-4 py-5`, `sm:px-6`, `lg:px-8`.
- O conteúdo interno é centralizado com largura máxima `max-w-[1280px]`.
- O toaster global fica em `top-right` e usa `richColors`.

### 1.2 Topbar

Arquivo: `src/app/(dashboard)/layout.tsx`.

Elementos:

- Botão de menu mobile: aparece abaixo de `md`, abre a sidebar em sheet lateral.
- Botão “Buscar”: aparece a partir de `sm`, dispara evento `open-command-palette`.
- Atalho visual: `⌘K`, visível a partir de `lg`.
- Botão “Novo”: visível quando existe usuário autenticado; leva para `/fiscal?emitir=1`.

### 1.3 Sidebar

Arquivo: `src/components/layout/app-sidebar.tsx`.

Dimensões:

- Desktop: `<aside className="hidden md:flex w-56 ... h-screen sticky top-0">`.
- Mobile: `SheetContent side="left" className="w-56 p-0"`.

Cabeçalho:

- Altura `h-14`, ou seja, 56px.
- Mostra logo (`appConfig.logoUrl`) ou ícone `Building2`.
- Exibe `appConfig.name` e `appConfig.tagline`.

Rodapé do usuário:

- Mostra iniciais, nome, perfil e botão de sair.
- Botão sair chama `logout`.

Regras de permissão:

- Cada item pode ter `telaKey`.
- A visibilidade passa por `canAccessTela(usuario, telaKey)`.
- Perfis padrão:
  - `admin`: acessa tudo.
  - `operacional`: Hoje, Clientes, Tarefas, Competências, Fechamento, Dashboard.
  - `fiscal`: Hoje, Clientes, Tarefas, Competências, Fechamento, Fiscal, IR, Dashboard.
  - `financeiro`: Hoje, Clientes, Financeiro, Fiscal, Dashboard.
  - `leitura`: Hoje, Clientes, Dashboard.
- Se `usuario.telas` existir e tiver itens, ela sobrescreve o padrão.

Mapa de navegação da sidebar:

| Seção | Item | Rota | Observação |
|---|---|---|---|
| Hoje | Hoje | `/hoje` | Link direto |
| Painel | Painel | `/dashboard` | Link direto |
| Cadastros | Clientes | `/clientes` | Grupo expansível |
| Operacional | Tarefas | `/tarefas` | Grupo expansível |
| Operacional | Competências | `/competencias` | Grupo expansível |
| Operacional | Fechamento Mensal | `/fechamento` | Grupo expansível |
| Fiscal & NFS-e | Emissão NFS-e | `/fiscal` | Grupo expansível |
| Fiscal & NFS-e | Histórico NFS-e | `/fiscal/historico` | Grupo expansível |
| Fiscal & NFS-e | Imposto de Renda | `/ir` | Grupo expansível |
| Financeiro | Financeiro | `/financeiro` | Link direto |
| Administração | Painel Admin | `/admin` | Grupo expansível |
| Administração | Usuários | `/admin/usuarios` | Grupo expansível |
| Administração | Tipos de Serviço | `/admin/servicos` | Grupo expansível |
| Administração | Conectores | `/admin/conectores` | Grupo expansível |
| Administração | Parâmetros | `/admin/parametros` | Grupo expansível |

Ação fixa da sidebar:

- “Emitir NFS-e” leva para `/fiscal?emitir=1`.

### 1.4 Command palette

Arquivo: `src/components/layout/command-palette.tsx`.

Ativação:

- `Ctrl+K` ou `Meta+K`.
- Evento customizado `open-command-palette`.

Dimensão:

- Usa `CommandDialog`, que herda `DialogContent` padrão, mas reposiciona em `top-1/3`, remove padding (`p-0`) e oculta botão de fechar por padrão.
- Lista tem `max-h-72`, ou seja, 288px.

Campo:

- Placeholder: “Buscar páginas ou ações...”.
- Estado vazio: “Nenhum resultado.”

Grupo “Navegação”:

- Dashboard -> `/dashboard`
- Clientes -> `/clientes`
- Tarefas -> `/tarefas`
- Competências -> `/competencias`
- Fechamento Mensal -> `/fechamento`
- NFS-e / Fiscal -> `/fiscal`
- Histórico NFS-e -> `/fiscal/historico`
- Imposto de Renda -> `/ir`
- Financeiro -> `/financeiro`
- Admin -> `/admin`
- Usuários -> `/admin/usuarios`

Grupo “Ações rápidas”:

- Novo cliente -> `/clientes/novo`
- Nova tarefa -> `/tarefas/nova`
- Nova competência -> `/competencias/nova`
- Novo lançamento -> `/financeiro/novo`
- Emitir NFS-e -> `/fiscal?emitir=1`

## 2. Sistema de overlays

### 2.1 Dialog padrão

Arquivo: `src/components/ui/dialog.tsx`.

Base visual:

- Overlay: `fixed inset-0 z-50 bg-black/40`, com blur quando suportado.
- Conteúdo: centralizado por `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`.
- Largura padrão: `w-full max-w-[calc(100%-2rem)]`.
- A partir de `sm`: `sm:max-w-sm`.
- Padding padrão: `p-4`.
- Raio: `rounded-xl`.
- Sombra: `shadow-2xl`.
- Botão fechar: botão ghost `size="icon-sm"` em `absolute top-2 right-2`, salvo quando `showCloseButton={false}`.

Footer padrão:

- `-mx-4 -mb-4`, borda superior, fundo `bg-muted/50`.
- Em mobile, botões em coluna reversa; em `sm`, linha alinhada à direita.

### 2.2 AlertDialog e ConfirmDialog

Arquivos:

- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/confirm-dialog.tsx`

Base visual:

- Overlay: `bg-black/10`, blur leve.
- Conteúdo: centralizado, `w-full`.
- `data-size=default`: `max-w-xs` em mobile e `sm:max-w-sm` em telas maiores.
- `data-size=sm`: `max-w-xs`.
- Padding `p-4`, raio `rounded-xl`.

ConfirmDialog reutilizável:

- Props principais: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel`, `destructive`, `onConfirm`.
- Título padrão: “Tem certeza?”
- Descrição padrão: “Esta ação não pode ser desfeita.”
- Botão cancelar padrão: “Cancelar”.
- Botão confirmar padrão: “Confirmar”.
- Quando `destructive=true`, botão confirmar usa vermelho destrutivo.
- Durante confirmação assíncrona, botão mostra `Loader2` e fica desabilitado.

### 2.3 Sheet padrão

Arquivo: `src/components/ui/sheet.tsx`.

Base visual:

- Overlay: `fixed inset-0 z-50 bg-black/10`.
- `side="left"`: `inset-y-0 left-0 h-full w-3/4`, `sm:max-w-sm`.
- `side="right"`: `inset-y-0 right-0 h-full w-3/4`, `sm:max-w-sm`.
- `side="top"` e `side="bottom"` usam altura automática.
- Botão fechar padrão: ghost `icon-sm`, `absolute top-3 right-3`.

Uso atual relevante:

- Sidebar mobile usa `side="left"`, largura override `w-56`, padding `p-0`.

## 3. Rotas e redirecionamentos

| Rota | Comportamento |
|---|---|
| `/` | Redireciona para área autenticada conforme implementação de `src/app/page.tsx` |
| `/(dashboard)` | Redireciona para `/hoje` |
| `/servicos` | Redireciona para `/admin/servicos` |
| `/hoje` | Cockpit operacional do dia |
| `/dashboard` | Painel executivo/resumo |
| `/clientes` | Lista de clientes com modal 360 |
| `/clientes/novo` | Cadastro de cliente |
| `/clientes/[id]` | Detalhe completo do cliente |
| `/clientes/[id]/editar` | Edição do cliente |
| `/clientes/[id]/fiscal` | Área fiscal do cliente |
| `/clientes/[id]/servicos/novo` | Vincular serviço ao cliente |
| `/tarefas` | Lista de tarefas |
| `/tarefas/nova` | Nova tarefa |
| `/tarefas/[id]` | Detalhe da tarefa |
| `/tarefas/[id]/editar` | Editar tarefa |
| `/competencias` | Lista de competências |
| `/competencias/nova` | Nova competência |
| `/competencias/[id]` | Detalhe da competência |
| `/competencias/[id]/editar` | Editar competência |
| `/fechamento` | Fechamento mensal |
| `/financeiro` | Lançamentos e cobrança |
| `/financeiro/novo` | Novo lançamento |
| `/fiscal` | Emissão, prontidão, rascunhos e notas recentes |
| `/fiscal?emitir=1` | Abre modal de emissão assistida de NFS-e |
| `/fiscal?emitir=1&clienteId={id}` | Abre emissão assistida já vinculada ao cliente |
| `/fiscal?emitir=1&rascunhoId={id}` | Abre emissão assistida a partir de rascunho |
| `/fiscal/historico` | Histórico de NFS-e emitidas |
| `/fiscal/[id]` | Detalhe de uma NFS-e |
| `/ir` | Lista de declarações de IR |
| `/ir/nova` | Nova declaração |
| `/ir/[id]` | Detalhe da declaração |
| `/ir/[id]/editar` | Editar declaração |
| `/admin` | Hub administrativo |
| `/admin/usuarios` | Gestão de usuários |
| `/admin/servicos` | Catálogo de serviços |
| `/admin/conectores` | Conectores fiscais |
| `/admin/parametros` | Parâmetros administrativos |
| `/premium` | Página demonstrativa de blocos SaaS |

## 4. Telas principais

### 4.1 Hoje (`/hoje`)

Arquivo: `src/app/(dashboard)/hoje/page.tsx`.

Objetivo:

- Concentrar a fila operacional priorizada por prazo, prioridade e responsável.

Cabeçalho:

- Título: “Hoje”.
- Descrição: “Fila operacional priorizada por prazo, prioridade e responsavel.”
- Filtro por responsável:
  - Select largura `w-52`.
  - Opção padrão: “Equipe inteira”.
  - Demais opções vêm de usuários.
- Botão “Atualizar”:
  - Variante outline.
  - Chama invalidação das queries `hojeKeys.all`.
  - Ícone `RefreshCw` gira durante carregamento.

KPIs:

- Grid `sm:grid-cols-4`.
- Cards:
  - Atrasadas: quantidade de `cockpit.data.atrasadas`.
  - Hoje: quantidade de `cockpit.data.hoje`.
  - Proximos 7 dias: quantidade de `cockpit.data.proximos7Dias`.
  - Bloqueios fechamento: quantidade de bloqueios de fechamento.

Bloqueios de fechamento:

- Exibido apenas quando `bloqueios.length > 0`.
- Card com borda e fundo warning.
- Mostra até 12 badges.
- Cada badge leva para `/fechamento`.

Fila de execução:

- Card com cabeçalho e corpo sem padding.
- Cabeçalho mostra checkbox “selecionar tudo” e contagem `{n} selecionada(s)`.
- Cada linha tem layout `grid grid-cols-[auto_1fr_auto]`.
- Linha pode ter borda esquerda:
  - Atrasada: `border-l-destructive`.
  - Hoje: `border-l-warning`.
  - Próximos: `border-l-border`.
- Dados por linha:
  - Checkbox.
  - Link para `/tarefas/{id}`.
  - Badge de grupo: Atrasada, Hoje ou Proximos 7 dias.
  - Badge de prioridade: Urgente, Alta, Normal, Baixa.
  - Cliente ou “Sem cliente”.
  - Responsável ou “Sem responsavel”.
  - Prazo formatado ou “Sem prazo”.
  - Atraso em dias, quando houver.
  - Score SLA no desktop.

Ações em lote:

- Aparecem somente quando `selected.size > 0`.
- “Concluir”: chama `bulkConcluirTarefas`.
- Select “Novo responsavel”: lista usuários.
- “Reatribuir”: exige responsável selecionado e chama `bulkReatribuirTarefas`.
- Input `type=date`, largura `w-40`.
- “Alterar prazo”: exige data e chama `bulkAlterarPrazo`.

Estado vazio:

- Card tracejado.
- Título: “Nenhuma tarefa acionavel para hoje”.
- Orienta iniciar por clientes, competências e tarefas.
- Botões:
  - “Ver clientes” -> `/clientes`
  - “Criar competencia” -> `/competencias/nova`
  - “Nova tarefa” -> `/tarefas/nova`

### 4.2 Dashboard (`/dashboard`)

Arquivo: `src/app/(dashboard)/dashboard/page.tsx`.

Objetivo:

- Painel de resumo executivo com atalhos para áreas críticas.

Blocos e navegação implementada:

- Alertas de clientes levam para `/clientes/{id}`.
- Ação fiscal em alerta leva para `/fiscal?emitir=1&clienteId={id}`.
- Card de clientes ativos leva para `/clientes?status=ativo`.
- Card de tarefas pendentes leva para `/tarefas?status=pendente`.
- Indicador financeiro pendente leva para `/financeiro?status=pendente`.
- Indicador financeiro atrasado leva para `/financeiro?status=atrasado`.
- Competências do mês levam para `/competencias?mes={mesAtual}&ano={anoAtual}`.
- Tarefas vencidas:
  - “Ver todas” leva para `/tarefas`.
  - Linhas levam para `/tarefas/{id}`.
- Competências abertas do mês anterior:
  - Link leva para `/competencias?mes={mesAnterior}&ano={anoAnterior}&status=aberta`.
  - Linhas levam para `/competencias/{id}`.
- Cobranças vencidas:
  - Link leva para `/financeiro?status=pendente`.
  - Linhas levam para `/financeiro`.

### 4.3 Clientes (`/clientes`)

Arquivo: `src/app/(dashboard)/clientes/page.tsx`.

Objetivo:

- Listar clientes, filtrar, paginar e abrir modal 360 sem sair da lista.

Header:

- `PageHeader`.
- Título: “Clientes”.
- Descrição: `{total} cliente(s) encontrado(s)` quando não está carregando.
- Ação: “Novo Cliente” -> `/clientes/novo`, botão `h-10 rounded-xl`.

Filtros:

- Container `surface-subtle border px-3 py-2.5`.
- Componente `ClientesFiltros`.
- Query params:
  - `busca`
  - `status`
  - `page`

Tabela:

- Card externo `rounded-2xl`, borda `border-border/65`, fundo `bg-card/95`.
- Wrapper horizontal.
- Tabela `min-w-[860px]`.
- Colunas:
  - Nome / Razão Social
  - CPF / CNPJ
  - Regime, oculto abaixo de `md`
  - Cidade / UF, oculto abaixo de `lg`
  - Status
  - Saúde
  - Ação

Linha:

- Clicável inteira.
- Abre `ClienteModal`.
- Mostra avatar circular 32px com iniciais.
- Nome principal: `razaoSocial`.
- Subtexto: `nomeFantasia`, quando existir.
- CPF/CNPJ em fonte mono.
- Regime como badge:
  - Simples, L. Presumido, L. Real, MEI, Isento.
- Status usa `ClienteStatusBadge`.
- Saúde mostra 3 pontos:
  - Suspenso: score 0, crítica.
  - Risco de inadimplência: score 1, atenção.
  - Inativo: score 2, atenção.
  - Normal: score 3, estável.
- Tooltip nativo via `title` descreve motivo e áreas operacional/fiscal/financeira.
- Botão “Ver” também abre o modal, com `stopPropagation`.

Estados:

- Carregando: `TableRowSkeleton` com 7 colunas e 8 linhas.
- Erro: “Não foi possível carregar clientes”.
- Vazio com filtro: “Nenhum cliente encontrado”.
- Vazio sem filtro: “Ainda não há clientes” e ação “Novo Cliente”.

Paginação:

- Exibida quando `totalPages > 1`.
- Mostra “Página {page} de {totalPages}”.
- “Anterior” e “Próxima” preservam `busca` e `status`.

Modal aberto:

- `ClienteModal` recebe `clienteId`, `clienteNome`, `open` e `onOpenChange`.

### 4.4 Novo/editar cliente

Arquivos:

- `src/app/(dashboard)/clientes/novo/page.tsx`
- `src/app/(dashboard)/clientes/[id]/editar/page-client.tsx`
- Formulário: `src/components/clientes/cliente-form.tsx`

Comportamento ao salvar:

- Novo cliente:
  - Obtém código por `getNextClienteCodigo`.
  - Cria documento em `clientes`.
  - Redireciona para `/clientes/{id}`.
- Editar:
  - Atualiza documento em `clientes`.
  - Invalida queries de lista e detalhe.
  - Redireciona para `/clientes/{id}`.

Cards e campos:

- “Dados Gerais”
  - Tipo de Pessoa: Pessoa Jurídica ou Pessoa Física.
  - Status: Ativo, Inativo ou Suspenso.
  - CNPJ/CPF obrigatório.
  - Para PJ, CNPJ com 14 dígitos consulta BrasilAPI e preenche razão social, fantasia, email, telefone e endereço.
  - Regime Tributário: vazio, Simples Nacional, Lucro Presumido, Lucro Real, MEI, Isento.
  - Razão Social/Nome Completo obrigatório.
  - Nome Fantasia somente para PJ.
  - E-mail, Telefone, Celular.
  - Celular tem `max-w-56`.
- “Cobrança por WhatsApp”
  - WhatsApp principal.
  - WhatsApp financeiro.
  - Consentimento para cobrança: Sim/Não.
  - Origem do consentimento.
  - Data do consentimento, desabilitada sem aceite.
  - Responsável financeiro, cargo, e-mail, telefone, WhatsApp.
  - Contato financeiro preferencial: Sim/Não.
  - Pausar régua automática: Não/Sim.
  - Data da pausa, motivo da pausa e pausado por, desabilitados quando a régua não está pausada.
- “Endereço”
  - CEP com auto-preenchimento ViaCEP.
  - Logradouro, número, complemento, bairro, cidade, UF.
- “Dados Cadastrais da Empresa”
  - Inscrição Estadual, Inscrição Municipal, NIRE, Capital social, Porte, IPTU, CNAE principal, CNAE secundário, Código do Simples, Mensalidade, Vencimento.
- “Credenciais da Empresa”
  - Login Prefeitura, Senha WEB Prefeitura, Senha PIN do Certificado Digital e-CNPJ, Login do posto fiscal, Senha posto fiscal.
  - Mostra aviso visual amber sobre senhas e permissões.
- “Dados do Representante”
  - Nome, e-mail, telefone, celular.
  - Endereço, número, complemento, bairro, CEP com auto-preenchimento, cidade, UF.
  - CPF, CNH, data emissão, RG, nascimento, órgão emissor, local nascimento, pais, PIS, estado civil, comunhão, escolaridade, formação, título eleitor.
  - Credenciais: Meu GOV, e-CAC PF, WEB Prefeitura, PIN Certificado Digital CPF.
- “Alerta de Emissão de NFS-e”
  - Dia de emissão mensal, número 1 a 31, `max-w-32`.
- “Observações”
  - Textarea `rows={3}`.

Ações:

- Primária: “Cadastrar Cliente” ou “Salvar Alterações”.
- Secundária: “Cancelar”, chama `onClose` quando fornecido ou `router.back()`.

### 4.5 Modal Cliente 360

Arquivo: `src/components/clientes/cliente-modal.tsx`.

Dimensões:

- `!w-[min(900px,calc(100vw-2rem))]`
- `!max-w-[min(900px,calc(100vw-2rem))]`
- `max-h-[calc(100dvh-2rem)]`
- Layout em grid: `grid-rows-[auto_minmax(0,1fr)]`
- Sem padding no content: `p-0`
- Altura mínima em `sm`: `sm:min-h-[560px]`

Carregamento:

- Ao abrir, carrega em paralelo:
  - Cliente em `clientes`.
  - Até 50 serviços em `clientes_servicos`.
  - Até 12 competências, ordenadas por ano/mês desc.
  - Até 10 lançamentos, ordenados por vencimento desc.
  - Até 20 NFS-e emitidas, ordenadas por criação desc.
  - Configuração fiscal em `clientes_fiscal`.

Header:

- Título: razão social ou nome recebido.
- Badge de status do cliente.
- Subtítulo: nome fantasia, quando existir.
- Botão “Ver completo” -> `/clientes/{clienteId}`.
- Botão “Editar” -> `/clientes/{clienteId}/editar`.

Info strip:

- CPF/CNPJ.
- Regime.
- E-mail, se existir.
- Telefone, se existir.
- Cidade/UF, se existir.
- Valor mensal ativo, somando serviços ativos.

Tabs:

- TabsList em grid 2 colunas no mobile e 4 colunas em `md`.
- Cada tab tem altura `h-9`, texto `text-xs` e contador reservado com largura `4ch`.
- Conteúdo tem `max-h-[calc(100dvh-19rem)]`, rolagem interna e em `md` `max-h-[430px]`.

Tab “Serviços”:

- Card “Serviços Vinculados”.
- Botão “+ Serviço” abre `ClienteServicoDialog`.
- Estado vazio: “Nenhum serviço vinculado”.
- Lista serviços com nome, data início, valor e badge de status.
- Rodapé soma “Total mensal (ativos)”.

Tab “Operacional”:

- Card “Competências Recentes”.
- Botão “Ver todas” -> `/competencias?clienteId={clienteId}`.
- Estado vazio: “Nenhuma competência”.
- Cada competência é botão que fecha o modal e leva para `/competencias/{id}`.

Tab “Financeiro”:

- Card “Lançamentos Recentes”.
- Botão “Ver todos” -> `/financeiro?clienteId={clienteId}`.
- Estado vazio: “Nenhum lançamento”.
- Lista descrição, vencimento, valor e status de pagamento.

Tab “Fiscal”:

- Card “Configuração NFS-e”.
  - Botão “Editar” ou “Configurar” abre `ConfigFiscalForm`.
  - Mostra município, ambiente, inscrição municipal, regime, alíquota ISS e optante simples.
  - Estado vazio: “Sem configuração fiscal”.
- Card “Certificado Digital A1”.
  - Aparece quando o município exige A1 (`abrasf_a1` ou `geisweb_a1`).
  - Usa `CertificadoUpload`.
- Card “Histórico NFS-e”.
  - Botão “+ Emitir” abre `EmitirNfseModal` se há configuração fiscal.
  - Estado vazio: “Nenhuma NFS-e emitida”.
  - Tabela: Nº NFS-e, emissão, valor, status.

Modais aninhados:

- `ClienteServicoDialog`: `DialogContent className="max-w-2xl"`.
- `ConfigFiscalForm`: `DialogContent style maxWidth 640px`, `max-h-[90vh]`, rolagem vertical.
- `EmitirNfseModal`: largura até 1120px.

### 4.6 Tarefas (`/tarefas`)

Arquivo: `src/app/(dashboard)/tarefas/page.tsx`.

Objetivo:

- Listar tarefas com filtros, ações rápidas e confirmação para conclusão de tarefas críticas.

Header:

- Título “Tarefas”.
- Botão “Nova Tarefa” -> `/tarefas/nova`, `h-10 rounded-xl`.

Filtros:

- Status via `FilterBtn`: status atual ativo por query param.
- Prioridade via `FilterBtn`.
- Paginação por `page`.

Tabela/lista:

- Linhas exibem título, cliente, responsável, prioridade, status e prazo.
- Link principal da tarefa leva para `/tarefas/{id}`.
- Indicadores:
  - “Tarefa sem responsável” com tooltip nativo.
  - “Tarefa sem prazo definido” com tooltip nativo.
- Botão concluir:
  - Se tarefa urgente/fiscal, abre confirmação.
  - Caso contrário, conclui diretamente.
- Menu “Mais ações”:
  - Ver detalhe -> `/tarefas/{id}`
  - Definir responsável -> `/tarefas/{id}/editar?focus=responsavel`
  - Definir prazo -> `/tarefas/{id}/editar?focus=prazo`

ConfirmDialog:

- Título: “Concluir tarefa urgente/fiscal?”
- Descrição varia conforme tarefa selecionada.
- Usa tamanho padrão de `AlertDialog`: max 320px mobile, 384px em `sm`.

Estados:

- Vazio: “Nenhuma tarefa encontrada”.
- Com filtros: “Tente ajustar os filtros.”
- Sem filtros: “Clique em "Nova Tarefa" para começar.”

### 4.7 Nova/editar tarefa

Arquivo do form: `src/components/tarefas/tarefa-form.tsx`.

Card:

- “Dados da Tarefa”.

Campos:

- Título obrigatório, máximo 200 caracteres.
- Descrição, textarea 3 linhas.
- Prioridade: Baixa, Normal, Alta, Urgente.
- Status: Pendente, Em andamento, Concluída, Cancelada.
- Cliente: select com clientes ativos e opção “Nenhum”.
- Responsável: select com usuários e opção “Nenhum”.
- Data Prazo: input date, `max-w-48`.

Salvar:

- Novo: cria documento em `tarefas`.
- Editar: atualiza documento.
- Ao salvar sem `onSuccess`, volta para `/tarefas` e chama `router.refresh()`.

### 4.8 Detalhe da tarefa (`/tarefas/[id]`)

Arquivo: `src/app/(dashboard)/tarefas/[id]/page-client.tsx`.

Header:

- Botão voltar -> `/tarefas`.
- Título com `tarefa.titulo`.
- Botão editar -> `/tarefas/{id}/editar`.

Cards:

- “Descrição”.
- “Detalhes”:
  - Cliente com link para `/clientes/{clienteId}` quando houver.
  - Competência com link para `/competencias/{competenciaId}` quando houver.
  - Responsável, status, prioridade e prazo.
- Comentários por `TarefaComentarios`.

Ao excluir/indisponibilidade:

- Fluxos de erro redirecionam para `/tarefas`.

### 4.9 Competências (`/competencias`)

Arquivo: `src/app/(dashboard)/competencias/page.tsx`.

Objetivo:

- Listar competências por mês/ano/status e permitir criação.

Header:

- Título “Competências”.
- Botão “Nova Competência” -> `/competencias/nova`.

Filtros:

- Navegação de mês:
  - Botões icon-only `h-9 w-9 rounded-xl`.
  - Alteram `mes` e `ano`.
- Status via `FilterBtn`.
- Query params comuns: `mes`, `ano`, `status`, `page`, `clienteId`.

Tabela:

- Linhas levam para `/competencias/{id}`.
- Exibe cliente, serviço, competência mês/ano, responsável e status.

Estados:

- Vazio: “Nenhuma competência encontrada”.
- Com status: “Tente ajustar os filtros.”
- Sem status: “Nenhuma competência para {mes/ano}.”

Paginação:

- “Anterior” e “Próxima” preservam filtros.

### 4.10 Nova/editar competência

Arquivo do form: `src/components/competencias/competencia-form.tsx`.

Card:

- “Dados da Competência”.

Campos:

- Cliente obrigatório.
- Serviço obrigatório:
  - Desabilitado enquanto cliente não foi selecionado.
  - Carrega serviços vinculados e ativos do cliente.
  - Placeholder:
    - “Selecione um cliente primeiro”
    - “Carregando...”
    - “Nenhum serviço vinculado”
    - “Selecione o serviço”
- Mês obrigatório: select com `MESES`.
- Ano obrigatório: intervalo de 5 anos, do ano atual -2 até +2.
- Status: Aberta, Em andamento, Concluída, Cancelada.
- Responsável: select com usuários e opção “Nenhum”.
- Observações: textarea 3 linhas.

Salvar:

- Novo:
  - ID determinístico `{clienteId}_{clienteServicoId}_{ano}_{mes2digitos}`.
  - Evita duplicidade de competência por cliente/serviço/mês.
  - Redireciona para `/competencias/{id}`.
- Editar:
  - Atualiza documento.
  - Redireciona para `/competencias/{id}`.

### 4.11 Detalhe da competência (`/competencias/[id]`)

Arquivo: `src/app/(dashboard)/competencias/[id]/page-client.tsx`.

Header:

- Voltar -> `/competencias`.
- Título com mês/ano e cliente/serviço.
- Editar -> `/competencias/{id}/editar`.

Cards:

- “Observações”.
- “Tarefas Vinculadas”:
  - Link para `/tarefas?competenciaId={id}`.
  - Linhas levam para `/tarefas/{id}`.
- “NFS-e Emitidas”.
- “Lançamentos”:
  - Link para `/financeiro?competenciaId={id}`.

### 4.12 Financeiro (`/financeiro`)

Arquivo: `src/app/(dashboard)/financeiro/page.tsx`.

Objetivo:

- Listar lançamentos, medir recebíveis, exportar dados, acionar baixa e operar régua de WhatsApp.

Header:

- Título “Financeiro”.
- Subtítulo: `{total} lançamento(s)`.
- Botões:
  - “Exportar lista”: gera Excel `financeiro-lancamentos`.
  - “Inadimplência”: gera Excel agrupado `relatorio-inadimplencia`.
  - “Novo Lançamento” -> `/financeiro/novo`.

KPIs:

- Grid `sm:grid-cols-3`.
- A Receber.
- Recebido no Mês.
- Em Atraso.

Filtros:

- Tipo:
  - Todos.
  - Receita.
  - Despesa.
- Status:
  - Qualquer.
  - Pendente.
  - Atrasado.
  - Pago.
  - Cancelado.
  - Estornado.
- Também lê query params:
  - `clienteId`
  - `competenciaId`

Fila de cobrança:

- Exibida quando há até 5 receitas pendentes priorizadas.
- Ordenação por `scoreCobranca`: atraso, proximidade do vencimento e impacto de caixa.
- Botão “Ver receitas pendentes” força filtros tipo receita e status pendente.

Tabela:

- Wrapper com `min-w-[1480px]`.
- Colunas:
  - Pagador
  - WhatsApp
  - Serviço / Referência
  - Vencimento
  - Pagamento
  - Valor
  - Status
  - Status WhatsApp
  - Última ação
  - Próxima ação
  - Ações

Ações por linha:

- “Baixar”: só aparece para `status === pendente`; abre `LancamentoBaixar`.
- Para receitas:
  - “Enviar agora”: chama `sendWhatsappNow`.
  - “Pausar régua” ou “Retomar régua”: chama pause/resume.
  - “Reagendar”: chama `rescheduleWhatsappRuleForLancamento`.
  - “Histórico”: abre modal de histórico.
- Para admin:
  - “Excluir”: abre `ConfirmDialog`.

ConfirmDialog de exclusão:

- Título: “Excluir lançamento?”
- Descrição: “Esta ação remove a linha financeira atual. Use apenas para lançamentos indevidos.”
- Confirm label: “Excluir”.
- Destrutivo.

Modal “Histórico de cobrança por WhatsApp”:

- `DialogContent className="max-w-2xl"`.
- Título: “Histórico de cobrança por WhatsApp”.
- Estados:
  - Carregando: “Carregando histórico...”
  - Vazio: “Nenhum evento de WhatsApp para este lançamento.”
- Cada evento:
  - Etapa.
  - Data/hora.
  - Badge de status.
  - Destino, erro e detalhes quando existirem.

Paginação:

- Controlada por cursor Firestore.
- Mostra “Página {page} de {totalPages}”.
- Botões “Anterior” e “Próxima”.

### 4.13 Novo lançamento (`/financeiro/novo`)

Form: `src/components/financeiro/lancamento-form.tsx`.

Card:

- “Dados do Lançamento”.

Campos:

- Tipo obrigatório: Receita ou Despesa.
- Descrição obrigatória, máximo 200 caracteres.
- Valor obrigatório, positivo, `step=0.01`.
- Vencimento obrigatório.
- Status: Pendente, Pago, Atrasado, Cancelado, Estornado.
- Forma de Pagamento.
- Data de Pagamento, `max-w-48`.
- Cliente:
  - Obrigatório quando tipo = Receita.
  - Select com clientes ativos e opção “Nenhum”.
- Pagador.
- WhatsApp do pagador.
- Cobrança WhatsApp: Ativa/Desligada.
- Status WhatsApp: Não agendado, Agendado, Pausado, Falhou.
- Pausa manual: Não/Sim.
- Exige aprovação: Não/Sim.
- Motivo da pausa/exceção.
- Observações, textarea 3 linhas.

Salvar:

- Cria/atualiza documento em `lancamentos`.
- Para receitas, valida cliente obrigatório.
- Normaliza WhatsApp.
- Redireciona para `/financeiro` e atualiza a rota.

### 4.14 Modal “Baixar Lançamento”

Arquivo: `src/components/financeiro/lancamento-baixar.tsx`.

Abertura:

- Botão inline “Baixar” em lançamentos pendentes.

Dimensão:

- `DialogContent className="sm:max-w-sm"`.
- Como herda dialog padrão, mobile fica `max-w-[calc(100%-2rem)]`; em `sm`, máximo 384px.

Conteúdo:

- Título: “Baixar Lançamento”.
- Resumo opcional:
  - Descrição.
  - Cliente.
  - Valor.
  - Se valor > 500, fundo warning e texto “Valor alto — confirme antes de baixar”.
- Data de Pagamento:
  - Default hoje.
  - Input date.
- Forma de Pagamento:
  - PIX.
  - Boleto.
  - Transferência.
  - Dinheiro.
  - Cartão.
  - Outro.

Ações:

- Cancelar: fecha modal.
- Confirmar baixa:
  - Se valor <= 500, baixa direto.
  - Se valor > 500, abre `AlertDialog`.

AlertDialog de valor alto:

- Título: “Confirmar baixa de valor alto?”
- Descrição: “Revise os dados antes de confirmar a baixa.”
- Mostra cliente, descrição, valor e vencimento.
- Botões: Cancelar e Confirmar baixa.

Persistência:

- Atualiza lançamento:
  - `status: pago`
  - `dataPagamento`
  - `formaPagamento`

### 4.15 Fiscal / NFS-e (`/fiscal`)

Arquivo: `src/app/(dashboard)/fiscal/page.tsx`.

Objetivo:

- Painel operacional de emissão NFS-e, prontidão fiscal, rascunhos e notas recentes.

Header:

- Título: “NFS-e — Emissão de Notas”.
- Subtítulo: `{n} nota(s) emitida(s) este mês · {valor}`.
- Botões:
  - “Histórico” -> `/fiscal/historico`.
  - “Emitir em Lote”: abre `EmitirLoteModal`.
  - “Preparar mês”: abre `ConfirmDialog`.
  - “Nova NFS-e”: altera URL para `/fiscal?emitir=1` e abre `EmitirNfseModal`.

KPIs:

- Grid `grid-cols-2 sm:grid-cols-4`.
- Emitidas no mês.
- Pendentes.
- Com erro.
- Canceladas.

Prontidão para emissão recorrente:

- Card com tabela.
- Cabeçalho mostra `{prontosEmissao}/{totalClientesAtivos} cliente(s) pronto(s) para emissão`.
- KPIs internos:
  - Clientes ativos.
  - Prontos p/ rascunho.
  - Prontos p/ emissão.
  - Com bloqueios.
- Tabela `min-w-[760px]`.
- Colunas:
  - Cliente, link para `/clientes/{clienteId}`.
  - Município.
  - Serviços.
  - Dia NFS-e.
  - Status.
  - Bloqueios.
- Status:
  - Pronto.
  - Falta credencial.
  - Bloqueado.
- Exibe até 8 clientes; se houver mais, mostra aviso no rodapé.

Notas Recentes:

- Tabela `min-w-[640px]`.
- Colunas:
  - Cliente.
  - Nº NFS-e.
  - Emissão.
  - Valor.
  - Status.
  - Ações.
- Estado vazio:
  - “Nenhuma NFS-e emitida ainda”.
  - Botão “Emitir primeira nota” abre modal de emissão.
- Ações:
  - Ícone olho: abre modal de erro técnico quando nota tem erro/rejeição/detalhes.
  - Ícone lápis: revisar rascunho via `/fiscal?emitir=1&rascunhoId={id}`.
  - Ícone lixeira: abre confirmação para remover rascunho.

ConfirmDialog “Remover rascunho de NFS-e?”:

- Descrição: “Esta ação exclui o rascunho fiscal e não pode ser desfeita pela interface.”
- Confirm label: “Remover rascunho”.
- Destrutivo.

ConfirmDialog “Gerar rascunhos NFS-e do mês?”:

- Descrição informa criação de rascunhos recorrentes para clientes ativos com dia de emissão vencido, serviço ativo e configuração fiscal completa.
- Confirm label: “Gerar rascunhos”.

Modal “Erro técnico da emissão”:

- `DialogContent className="max-w-2xl"`.
- Título: “Erro técnico da emissão”.
- Descrição: “Diagnóstico da última tentativa registrada para esta emissão ou rascunho fiscal.”
- Conteúdo:
  - Cliente.
  - Status.
  - Código do erro.
  - Última tentativa.
  - Mensagem operacional em caixa destrutiva.
  - Detalhes técnicos em `<pre>` com `max-h-52`.
  - Resumo do request enviado em `<pre>` com `max-h-52`.

### 4.16 Modal “Emissão assistida de NFS-e”

Arquivo: `src/components/fiscal/emitir-nfse-modal.tsx`.

Dimensões:

- `!w-[min(1120px,calc(100vw-1.5rem))]`
- `!max-w-[min(1120px,calc(100vw-1.5rem))]`
- `max-h-[calc(100dvh-1.5rem)]`
- `sm:min-h-[680px]`
- Layout: `grid grid-rows-[auto_minmax(0,1fr)]`
- Sem padding no content: `p-0`

Header:

- Ícone `FileText` em quadrado 36px.
- Título: “Emissão assistida de NFS-e”.
- Descrição: “Revise vínculo, tomador e serviço antes de enviar a nota para a prefeitura.”
- Badge desktop: “Fluxo assistido”.

Corpo:

- Scroll interno: `overflow-y-auto`.
- Padding `px-5 py-5`.
- Renderiza `NfseEmissaoForm`.

Parâmetros:

- `clienteId`: pré-seleciona cliente.
- `rascunhoId`: carrega rascunho.
- `onCancel`: fecha modal.
- `onFinished`: fecha modal e invalida fiscal/readiness na tela fiscal.

### 4.17 Formulário de emissão de NFS-e

Arquivo: `src/components/fiscal/nfse-emissao-form.tsx`.

Cards principais:

- “Vínculo”.
- “Dados do Tomador”.
- “Serviço”.
- “Resumo da emissão” quando dentro de modal, ou “Checklist antes da emissão” em página.
- “Ações”.

Ações:

- “Emitir NFS-e” abre `ConfirmDialog`.
- “Salvar rascunho”.
- “Cancelar”.

ConfirmDialog:

- Título: “Confirmar emissão de NFS-e?”
- Descrição contextual montada pelo formulário.

Após emissão:

- Quando em modal, chama `onFinished`.
- Em fluxo de página, redireciona para `/fiscal`.

### 4.18 Modal “Emitir NFS-e em Lote”

Arquivo: `src/components/fiscal/emitir-lote-modal.tsx`.

Dimensões:

- `DialogContent className="max-w-2xl max-h-[80vh] flex flex-col"`.
- Largura máxima em Tailwind `max-w-2xl`: 672px.
- Altura máxima: 80% da viewport.
- Corpo com rolagem em listas.

Etapa `select`:

- Carrega rascunhos em `nfse_rascunhos` com `status == aguardando_emissao`.
- Seleciona automaticamente os primeiros 50.
- Limite por lote: 50.
- Cabeçalho da lista:
  - Checkbox geral.
  - Cliente.
  - Valor.
- Cada linha:
  - Checkbox.
  - Cliente.
  - Valor formatado.
- Rodapé:
  - `{n} selecionada(s) · {total}`.
  - Botão “Cancelar”.
  - Botão “Emitir ({n})”.

Etapa `running`:

- Loader central.
- Texto: “Emitindo {n} NFS-e… Não feche esta janela.”

Etapa `done`:

- Badges:
  - `{n} emitidas`.
  - `{n} com erro`, quando houver falhas.
- Lista resultado:
  - Sucesso: ícone verde, cliente e número da NFS-e.
  - Falha: ícone destrutivo e mensagem de erro.
- Botão “Fechar”.

Cloud Function:

- Chama `emitirNfseLote` em `southamerica-east1`.

### 4.19 Histórico NFS-e (`/fiscal/historico`)

Arquivo: `src/app/(dashboard)/fiscal/historico/page.tsx`.

Header:

- Voltar -> `/fiscal`.
- Título: “Histórico de NFS-e”.
- Botões:
  - Exportar Excel.
  - Exportar CSV.

Filtros:

- Status via botões.
- Query params para cliente/status/mês/ano conforme implementação.

Tabela:

- Lista notas fiscais.
- Ações por linha:
  - Ver detalhe -> `/fiscal/{id}`.
  - Consultar status.
  - Baixar PDF, quando `pdfUrl` existir.
  - Solicitar cancelamento.

Estado vazio:

- “Nenhuma NFS-e encontrada”.
- Descrição muda conforme filtros ativos.

Modal “Solicitar cancelamento”:

- `DialogContent className="max-w-md"`.
- Título: “Solicitar cancelamento”.
- Descrição orienta que a solicitação depende de regras da prefeitura/conector.
- Botões: cancelar e confirmar.

### 4.20 Detalhe NFS-e (`/fiscal/[id]`)

Arquivo: `src/app/(dashboard)/fiscal/[id]/page-client.tsx`.

Header:

- Voltar -> `/fiscal/historico`.
- Título: `NFS-e {numeroNfse}` ou “NFS-e sem número”.
- Botão “Consultar status”.
- Botão PDF quando `pdfUrl` existe.
- Botão “Solicitar cancelamento”.

Cards:

- Status.
- Tomador.
- Serviço.
- Tratamento operacional.
- XML.
- Auditoria.

Modal “Solicitar cancelamento”:

- `DialogContent className="max-w-md"`.
- Título: “Solicitar cancelamento”.
- Descrição contextual.
- Botões cancelar e confirmar.

### 4.21 Fechamento mensal (`/fechamento`)

Arquivos:

- `src/app/(dashboard)/fechamento/page.tsx`
- `src/app/(dashboard)/fechamento/client.tsx`
- Componentes auxiliares em `src/components/fechamento`.

Objetivo:

- Gerar, revisar e avançar fechamento mensal por cliente.

Header:

- Título: “Fechamento Mensal”.
- Controles de mês/ano.
- Botões de atualização/geração/revisão conforme estado.

Navegação:

- Alteração de mês/ano atualiza query string com `router.push('/fechamento?...')`.

Modal “Encerrar revisão de {mês}/{ano}”:

- `DialogContent className="max-w-md" showCloseButton`.
- Título: “Encerrar revisão de {mesLabel} / {ano}”.
- Descrição informa o fechamento/revisão do mês.
- Botões:
  - Cancelar.
  - Continuar/confirmar revisão.

ConfirmDialog “Gerar fechamento de {mês}/{ano}?”:

- Descrição: “A geração cria registros mensais para todos os clientes ativos ainda sem fechamento. Registros existentes serão ignorados.”
- Usado antes de criar registros mensais.

ConfirmDialog “Revisão do mês registrada”:

- Confirma conclusão/registro da revisão.

ConfirmDialog de pendências:

- Título: `{pendentes} cliente(s) com pendência de fechamento`.
- Descrição: “Use os filtros e atualização em lote para avançar os status críticos primeiro.”

Tabelas/cards:

- `FechamentoTable` permite alterar status.
- `FechamentoPendenciasCards` mostra cards de pendências e também permite ação em status.
- Links externos `portalUrl` aparecem quando disponíveis.

### 4.22 Imposto de Renda (`/ir`)

Arquivo: `src/app/(dashboard)/ir/page.tsx`.

Objetivo:

- Listar declarações IR por ano-base e status.

Header:

- Botão “Nova Declaração” -> `/ir/nova`.

Filtros:

- Ano-base.
- Status:
  - Pendente.
  - Em andamento.
  - Entregue.
  - Retificado.
  - Cancelado.

Tabela:

- Linhas levam para `/ir/{id}`.
- Exibe cliente, ano-base, status, responsável e entrega.

Estados:

- Vazio: “Nenhuma declaração encontrada”.
- Com status: “Tente ajustar os filtros.”
- Sem status: “Nenhuma declaração para {anoBase}.”

Paginação:

- “Anterior” e “Próxima”.

### 4.23 Nova/editar declaração IR

Arquivo do form: `src/components/ir/ir-form.tsx`.

Card:

- “Dados da Declaração”.

Campos:

- Cliente obrigatório:
  - Select com clientes ativos.
  - Desabilitado em edição.
  - Em edição mostra aviso “O cliente não pode ser alterado.”
- Ano-Calendário obrigatório:
  - Número entre 2000 e 2100.
  - Default: ano atual - 1.
- Status:
  - Pendente.
  - Em andamento.
  - Entregue.
  - Retificado.
  - Cancelado.
- Responsável:
  - Select com usuários e opção “Nenhum”.
- Data de Entrega.
- Nº do Recibo.
- Observações, textarea 3 linhas.

Ao criar:

- Cria documento em `ir_declaracoes`.
- Cria checklist padrão em `ir_checklist`:
  - Informe de rendimentos.
  - Comprovantes de despesas médicas.
  - Comprovantes de educação.
  - Informe de bancos e investimentos.
  - Comprovantes de bens, dívidas e financiamentos.
  - Recibos de aluguéis ou rendimentos recebidos.
- Cria tarefa:
  - Título: `Coletar documentos IR {anoBase} - {cliente}`.
  - Prioridade alta.
  - Status pendente.
  - Prazo em 15 de abril do ano seguinte.
- Redireciona para `/ir/{id}`.

Ao editar:

- Atualiza `ir_declaracoes`.
- Redireciona para `/ir/{id}`.

### 4.24 Detalhe IR (`/ir/[id]`)

Arquivo: `src/app/(dashboard)/ir/[id]/page-client.tsx`.

Header:

- Voltar -> `/ir`.
- Título com declaração/ano.
- Editar -> `/ir/{id}/editar`.

Cards:

- “Checklist de Documentos”.
- “Detalhes”:
  - Cliente com link para `/clientes/{clienteId}`.
  - Responsável.
  - Status.
  - Ano-base.
  - Data entrega.
  - Recibo.

Ações de checklist:

- Itens podem ser marcados/atualizados conforme implementação do client.

### 4.25 Administração (`/admin`)

Arquivo: `src/app/(dashboard)/admin/page.tsx`.

Objetivo:

- Hub administrativo.

Conteúdo:

- Título “Administração”.
- Cards/link para:
  - Usuários.
  - Tipos de Serviço.
  - Conectores.
  - Parâmetros.

### 4.26 Usuários (`/admin/usuarios`)

Arquivos:

- Página: `src/app/(dashboard)/admin/usuarios/page.tsx`
- Form: `src/components/admin/usuario-form.tsx`

Página:

- Título “Usuários”.
- Lista usuários em tabela.
- Estado vazio: “Nenhum usuário cadastrado”.
- Descrição: “Crie pelo menos dois usuários por perfil principal antes de liberar o ambiente.”

Modal/form de usuário:

- `DialogContent` custom:
  - `w-full`
  - `max-w-2xl` (672px)
  - `max-h-[90vh]`
  - `overflow-y-auto`
  - `rounded-xl`
  - `shadow-2xl`
- Header tem `DialogTitle`.
- Seções:
  - “Dados do usuário”.
  - Permissões/telas.
- Ações:
  - Cancelar.
  - Salvar/criar usuário.

### 4.27 Tipos de Serviço (`/admin/servicos`)

Arquivos:

- Página: `src/app/(dashboard)/admin/servicos/page.tsx`
- Form: `src/components/admin/servico-form.tsx`

Página:

- Título “Tipos de Serviço”.
- Tabela de serviços.
- Estado vazio: “Nenhum serviço cadastrado”.
- Descrição: “Gere a tabela COB inicial ou cadastre um serviço manualmente para conseguir vincular clientes e gerar competências.”

Modal de serviço:

- `DialogContent className="max-w-md"`.
- Largura máxima 448px em Tailwind.
- Título dinâmico de criação/edição.
- Campos principais do serviço conforme schema/admin service.
- Footer:
  - Cancelar.
  - Salvar.

### 4.28 Conectores (`/admin/conectores`)

Arquivo: `src/app/(dashboard)/admin/conectores/page.tsx`.

Objetivo:

- Listar conectores fiscais configurados.

Estado vazio:

- Título: “Nenhum conector cadastrado”.
- Descrição: “Rode o seed de conectores fiscais antes da homologação e mantenha produção bloqueada até validar emissão, consulta e cancelamento.”

### 4.29 Parâmetros (`/admin/parametros`)

Arquivo: `src/app/(dashboard)/admin/parametros/page.tsx`.

Objetivo:

- Configurações administrativas gerais.

Layout:

- Card principal `max-w-3xl`.
- Usa borda `border-border/65`, fundo `bg-card/95` e `card-shadow`.

## 5. Componentes auxiliares de cliente/fiscal

### 5.1 Vincular serviço ao cliente

Arquivo: `src/components/clientes/cliente-servico-dialog.tsx`.

Dimensão:

- `DialogContent className="max-w-2xl"`, máximo 672px.

Título:

- “Vincular serviço ao cliente”.

Conteúdo:

- Renderiza `ClienteServicoForm`.

Form de serviço do cliente:

- Card “Dados do Serviço”.
- Campos típicos: serviço, valor, status, data de início e demais campos de vínculo.
- Salvar sem modal volta para `/clientes/{clienteId}`.
- Quando usado em modal, chama callback e fecha.

### 5.2 Configuração fiscal do cliente

Arquivo: `src/components/fiscal/config-fiscal-form.tsx`.

Dimensão:

- `DialogContent style={{ maxWidth: '640px' }}`
- `className="w-full max-h-[90vh] overflow-y-auto"`

Título:

- “Configuração Fiscal — NFS-e”.

Campos técnicos:

- Município IBGE.
- Inscrição Municipal.
- Inscrição Estadual.
- Ambiente de emissão.
- Regime tributário.
- Optante Simples.
- Incentivador cultural.
- Natureza da operação.
- Código de serviço padrão.
- Descrição de serviço padrão.
- Item da lista de serviço.
- CNAE.
- Alíquota padrão.
- ISS retido padrão.
- Credenciais variáveis por município/conector.

Ações:

- Salvar.
- Cancelar.

### 5.3 Certificado digital A1

Arquivo: `src/components/fiscal/certificado-upload.tsx`.

Uso:

- Aparece em cliente 360 e página fiscal do cliente quando o município exige certificado A1.

Comportamento:

- Exibe estado do certificado quando existe:
  - Titular.
  - Vencimento.
  - Validade.
  - Path de storage.
- Permite upload/atualização conforme implementação.

## 6. Estados, feedback e erros

### 6.1 Carregamento

Padrões usados:

- Tabelas: `TableRowSkeleton`.
- Cards: blocos `animate-pulse`.
- Modais: `Skeleton` ou `Loader2`.
- Botões assíncronos: `Loader2 animate-spin`.

### 6.2 Estados vazios

Componentes:

- `EmptyState` para cards.
- `TableEmptyState` para tabelas.

Exemplos relevantes:

- Clientes: “Ainda não há clientes”.
- Tarefas: “Nenhuma tarefa encontrada”.
- Competências: “Nenhuma competência encontrada”.
- Financeiro: “Nenhum lançamento encontrado”.
- Fiscal: “Nenhuma NFS-e emitida ainda”.
- IR: “Nenhuma declaração encontrada”.
- Admin usuários: “Nenhum usuário cadastrado”.
- Admin serviços: “Nenhum serviço cadastrado”.

### 6.3 Toasts

Biblioteca:

- `sonner`.

Posição:

- Top-right via `Toaster`.

Usos:

- Sucesso em criação/edição/exclusão.
- Erro em permissões e validações de Firestore.
- Avisos em lote, por exemplo limite de 50 NFS-e.

### 6.4 Exportações

Financeiro:

- `exportToExcel('financeiro-lancamentos', ...)`.
- `exportToExcel('relatorio-inadimplencia', ...)`.

Histórico fiscal:

- Exporta Excel e CSV conforme botões da tela.

## 7. Matrizes de estado-transição

Esta seção descreve o ciclo de vida dos principais status operacionais. Ela deve ser usada por novos desenvolvedores como contrato de domínio antes de alterar formulários, Cloud Functions, regras de cobrança, badges, filtros ou automações.

Observação importante: alguns formulários atuais expõem o campo `status` como select amplo e tecnicamente permitem ajustes manuais entre estados. Quando a matriz abaixo indicar “bloqueado por regra de domínio”, isso significa que a transição deve ser evitada no fluxo operacional normal e validada em serviços/ações dedicadas quando a regra for endurecida no código.

### 7.1 Lançamentos financeiros

Arquivo de tipos/status: `src/types/firestore.ts`.  
Formulário: `src/components/financeiro/lancamento-form.tsx`.  
Baixa: `src/components/financeiro/lancamento-baixar.tsx`.  
Tela: `src/app/(dashboard)/financeiro/page.tsx`.

Estados financeiros:

| Status | Significado | Cor/badge | Quem gera |
|---|---|---|---|
| `pendente` | Lançamento aberto aguardando pagamento, cobrança ou cancelamento | Outline/cinza | Criação manual, scheduler mensal |
| `atrasado` | Lançamento vencido e não pago | Destructive/vermelho | Pode ser atribuído por rotina/ajuste operacional |
| `pago` | Lançamento baixado com data e forma de pagamento | Success/verde | Modal “Baixar Lançamento” |
| `cancelado` | Lançamento cancelado antes da baixa | Destructive ou secundário, conforme tela | Ajuste financeiro/admin |
| `estornado` | Pagamento revertido após baixa | Warning/âmbar | Ajuste financeiro/admin |

Matriz recomendada:

| De | Para | Permitido? | Caminho correto | O que deve gerar/alterar |
|---|---|---:|---|---|
| `pendente` | `pago` | Sim | Modal “Baixar” | `dataPagamento`, `formaPagamento`, status `pago`, evento financeiro |
| `pendente` | `atrasado` | Sim | Rotina de atraso ou ajuste financeiro | Status `atrasado`, destaque vermelho, entra em inadimplência |
| `pendente` | `cancelado` | Sim | Ação administrativa/financeira | Status `cancelado`, remove da cobrança ativa |
| `pendente` | `estornado` | Não | Não há pagamento para estornar | Deve ser bloqueado por validação de domínio |
| `atrasado` | `pago` | Sim | Modal “Baixar” | Baixa normal, deixa de ser inadimplente |
| `atrasado` | `pendente` | Sim, com justificativa | Correção de vencimento/status | Remove destaque de atraso |
| `atrasado` | `cancelado` | Sim, com justificativa | Cancelamento de cobrança indevida | Remove da cobrança ativa |
| `atrasado` | `estornado` | Não | Não há pagamento confirmado para estornar | Deve ser bloqueado |
| `pago` | `estornado` | Sim | Fluxo de estorno | Limpa ou preserva histórico de pagamento conforme regra contábil, status `estornado` |
| `pago` | `pendente` | Não direto | Estornar primeiro, depois recriar/reabrir por ação explícita | Evita fraude ou perda de rastreabilidade |
| `pago` | `atrasado` | Não direto | Deve passar por `estornado` e novo lançamento/pendência | Exemplo crítico: pago não volta para atraso sem estorno |
| `pago` | `cancelado` | Não direto | Estornar primeiro, depois cancelar se necessário | Mantém trilha financeira |
| `estornado` | `pendente` | Sim, com justificativa | Reabertura controlada ou novo lançamento | Deve registrar motivo/auditoria |
| `estornado` | `pago` | Não direto | Nova baixa após reabertura | Evita pagamento sem estado aberto |
| `estornado` | `atrasado` | Sim, se reaberto e vencido | Reabrir como pendente/atrasado por serviço dedicado | Deve registrar motivo |
| `estornado` | `cancelado` | Sim | Cancelamento após estorno | Encerra ciclo |
| `cancelado` | `pendente` | Sim, com justificativa | Reativação/reabertura controlada | Deve registrar motivo/auditoria |
| `cancelado` | `pago` | Não direto | Reabrir e baixar | Evita baixa em documento encerrado |
| `cancelado` | `atrasado` | Não direto | Reabrir e recalcular atraso | Mantém rastreabilidade |
| `cancelado` | `estornado` | Não | Cancelado não possui pagamento ativo | Deve ser bloqueado |

Fluxograma textual:

```text
pendente ──baixar──> pago ──estornar──> estornado ──reabrir──> pendente
   │                    │
   │                    └── não volta direto para atrasado/cancelado
   ├──vencimento──> atrasado ──baixar──> pago
   └──cancelar──> cancelado ──reabrir controlado──> pendente
```

Impactos por estado:

- `pendente`: aparece na tabela financeira e pode entrar na fila de cobrança se for receita.
- `atrasado`: deve aparecer com vermelho/destructive, influencia inadimplência e saúde do cliente.
- `pago`: sai da fila de cobrança e não deve receber WhatsApp.
- `cancelado`: não deve participar de cobrança, inadimplência ou recebíveis.
- `estornado`: preserva a rastreabilidade de uma baixa revertida e não deve ser tratado como recebimento válido.

Ponto técnico de atenção:

- O formulário `LancamentoForm` possui select de status com `pendente`, `pago`, `atrasado`, `cancelado`, `estornado`.
- A baixa dedicada (`LancamentoBaixar`) só faz a transição para `pago`.
- Para aplicar rigidamente a matriz, criar função de domínio, por exemplo `validateLancamentoTransition(from, to)`, e usá-la em formulário, serviços e Cloud Functions.

### 7.2 Status da régua WhatsApp de cobrança

Arquivos principais:

- `src/components/financeiro/lancamento-form.tsx`
- `src/app/(dashboard)/financeiro/page.tsx`
- `functions/src/whatsapp/core.ts`
- `functions/src/whatsapp/callables.ts`

Estados WhatsApp:

| Status | Significado | Origem |
|---|---|---|
| `nao_agendado` | Ainda não há job de cobrança válido | Criação/estado inicial |
| `agendado` | Existe próxima ação programada | Scheduler ou reagendamento |
| `enviado` | Mensagem enviada ao provedor | Processamento da fila |
| `entregue` | Provedor confirmou entrega | Webhook |
| `lido` | Provedor confirmou leitura | Webhook |
| `respondido` | Cliente respondeu | Webhook |
| `falhou` | Envio ou processamento falhou | Processador/webhook |
| `pausado` | Régua pausada manualmente | Ação “Pausar régua” |

Matriz recomendada:

| De | Para | Permitido? | Ação |
|---|---|---:|---|
| `nao_agendado` | `agendado` | Sim | Scheduler ou “Reagendar” |
| `nao_agendado` | `enviado` | Sim | “Enviar agora” pode enfileirar envio imediato |
| `agendado` | `enviado` | Sim | Processador da fila |
| `enviado` | `entregue` | Sim | Webhook de entrega |
| `entregue` | `lido` | Sim | Webhook de leitura |
| `lido` | `respondido` | Sim | Webhook de resposta |
| `enviado` | `respondido` | Sim | Cliente pode responder sem evento intermediário confiável |
| `agendado` | `pausado` | Sim | “Pausar régua” |
| `falhou` | `agendado` | Sim | “Reagendar” |
| `pausado` | `agendado` | Sim | “Retomar régua” |
| `respondido` | `agendado` | Não padrão | Exige decisão humana | 
| qualquer | `falhou` | Sim | Falha técnica registrada |

Regras de elegibilidade:

- Só receitas entram na régua.
- Status financeiro precisa ser `pendente` ou `atrasado`.
- Se o lançamento está `pago`, não agenda.
- Se `whatsappCobrancaPausada` é verdadeiro, não agenda.
- Se `cobrancaWhatsappEnabled` é falso ou `whatsappCobrancaIgnorada` é verdadeiro, não agenda.
- Precisa haver cliente e destino financeiro/WhatsApp resolvido.

### 7.3 NFS-e emitida

Arquivos principais:

- `src/types/firestore.ts`
- `src/components/ui/status-badge.tsx`
- `src/app/(dashboard)/fiscal/page.tsx`
- `src/app/(dashboard)/fiscal/historico/page.tsx`
- `src/app/(dashboard)/fiscal/[id]/page-client.tsx`
- `functions/src/nfse/emitir.ts`
- `functions/src/nfse/emitir-lote.ts`
- `functions/src/nfse/ciclo.ts`

Estados de NFS-e:

| Status | Significado | Cor/badge |
|---|---|---|
| `pendente_processamento` | Emissão enviada/registrada e aguardando retorno ou consulta | Outline/warning conforme tela |
| `emitida` | Nota emitida com sucesso | Success/verde |
| `rejeitada` | Prefeitura/conector rejeitou a emissão | Destructive/vermelho |
| `erro_integracao` | Erro técnico de integração, credencial, XML, provedor ou prefeitura | Destructive/vermelho |
| `cancelada` | Nota cancelada | Secondary/cinza |
| `cancelamento_pendente` | Status usado em alertas para cancelamento solicitado e ainda não concluído | Atenção/operacional |

Matriz recomendada:

| De | Para | Permitido? | Caminho correto | O que mostra |
|---|---|---:|---|---|
| rascunho | `pendente_processamento` | Sim | Emitir individual/lote | Nota entra em acompanhamento |
| rascunho | `emitida` | Sim | Emissão síncrona bem-sucedida | Aparece como emitida |
| rascunho | `rejeitada` | Sim | Retorno de prefeitura rejeita | Mostra erro operacional |
| rascunho | `erro_integracao` | Sim | Falha técnica | Modal de erro técnico |
| `pendente_processamento` | `emitida` | Sim | Consulta ou callback confirma | PDF/XML/código quando disponíveis |
| `pendente_processamento` | `rejeitada` | Sim | Consulta retorna rejeição | Diagnóstico fiscal |
| `pendente_processamento` | `erro_integracao` | Sim | Consulta/processamento falha | Erro técnico |
| `emitida` | `cancelamento_pendente` | Sim | Solicitar cancelamento | Aguarda retorno do conector |
| `cancelamento_pendente` | `cancelada` | Sim | Cancelamento confirmado | Nota encerrada |
| `cancelamento_pendente` | `emitida` | Sim, se negado | Consulta informa cancelamento negado | Mantém nota emitida |
| `rejeitada` | rascunho | Sim | Revisar dados e reenviar como novo rascunho | Deve preservar histórico da rejeição |
| `erro_integracao` | rascunho | Sim | Corrigir configuração/credencial e tentar novamente | Deve preservar diagnóstico |
| `cancelada` | `emitida` | Não | Nota cancelada não volta a emitida | Emitir nova nota se necessário |
| `emitida` | `rejeitada` | Não | Nota já autorizada não vira rejeitada | Usar cancelamento/correção |
| `emitida` | `erro_integracao` | Não como status final | Erro de consulta pode ser evento, não rebaixar nota autorizada | Preservar status autorizado |

Fluxograma textual:

```text
nfse_rascunhos
   ├──salvar──> rascunho / aguardando_emissao
   └──emitir──> pendente_processamento ──consulta──> emitida ──cancelar──> cancelamento_pendente ──confirmar──> cancelada
                    │                         │
                    ├──rejeição──────────────> rejeitada
                    └──falha técnica─────────> erro_integracao
```

Regras de tela:

- `emitida`: aparece em notas recentes, histórico e Cliente 360.
- `rejeitada` e `erro_integracao`: habilitam visualização de erro técnico quando há payload de diagnóstico.
- Rascunhos podem ser revisados pelo ícone lápis.
- Rascunhos podem ser removidos por ação destrutiva.
- `nfse_emitidas` não pode ser escrita diretamente pelo browser; apenas Functions/Admin SDK.

### 7.4 Rascunhos de NFS-e

Estados conhecidos:

| Status | Significado |
|---|---|
| `rascunho` | Salvo manualmente, ainda incompleto ou não submetido |
| `validando` | Em validação interna |
| `pronto_para_emitir` | Validado, mas ainda não enviado |
| `aguardando_emissao` | Pronto para entrar em lote ou emissão |
| `erro_validacao` | Falha de dados antes de enviar |
| `erro_integracao` | Falha técnica ao tentar processar |

Matriz recomendada:

| De | Para | Permitido? | Observação |
|---|---|---:|---|
| `rascunho` | `validando` | Sim | Validação interna |
| `validando` | `pronto_para_emitir` | Sim | Dados completos |
| `pronto_para_emitir` | `aguardando_emissao` | Sim | Entra em fila/lote |
| `aguardando_emissao` | NFS-e `emitida` | Sim | Sai de rascunhos e gera nota |
| `aguardando_emissao` | `erro_integracao` | Sim | Tentativa falhou |
| `validando` | `erro_validacao` | Sim | Dados incompletos/inválidos |
| `erro_validacao` | `rascunho` | Sim | Usuário corrige dados |
| `erro_integracao` | `aguardando_emissao` | Sim | Correção técnica e nova tentativa |
| qualquer | removido | Sim, fiscal | Remoção exige confirmação na UI |

### 7.5 Tarefas

Estados:

| Status | Significado | Cor/badge |
|---|---|---|
| `pendente` | Ainda não iniciada/concluída | Outline |
| `em_andamento` | Em execução | Info |
| `concluida` | Finalizada | Success |
| `cancelada` | Não será executada | Secondary |

Matriz recomendada:

| De | Para | Permitido? | Impacto |
|---|---|---:|---|
| `pendente` | `em_andamento` | Sim | Indica início |
| `pendente` | `concluida` | Sim | Conclusão direta |
| `pendente` | `cancelada` | Sim | Sai do cockpit |
| `em_andamento` | `concluida` | Sim | Pode concluir competência vinculada |
| `em_andamento` | `pendente` | Sim | Reabertura simples |
| `em_andamento` | `cancelada` | Sim | Sai do cockpit |
| `concluida` | `pendente` | Sim, com justificativa | Reabre trabalho; pode reabrir impacto operacional |
| `concluida` | `em_andamento` | Sim, com justificativa | Reabertura parcial |
| `concluida` | `cancelada` | Não padrão | Preferir reabrir e cancelar com motivo |
| `cancelada` | `pendente` | Sim, com justificativa | Reativação |
| `cancelada` | `concluida` | Não direto | Reabrir antes |

Automação associada:

- Quando uma tarefa muda para `concluida`, `onTarefaConcluida` verifica a competência vinculada.
- Se não restarem tarefas pendentes da competência, a competência pode ser marcada como `concluida`.

### 7.6 Competências

Estados:

| Status | Significado |
|---|---|
| `aberta` | Criada e aguardando execução |
| `em_andamento` | Em execução |
| `concluida` | Todas as tarefas/obrigações da competência foram finalizadas |
| `cancelada` | Competência não será executada |

Matriz recomendada:

| De | Para | Permitido? | Origem |
|---|---|---:|---|
| `aberta` | `em_andamento` | Sim | Início operacional |
| `aberta` | `concluida` | Sim | Conclusão manual ou trigger se tarefas concluídas |
| `aberta` | `cancelada` | Sim | Cancelamento operacional |
| `em_andamento` | `concluida` | Sim | Finalização |
| `em_andamento` | `aberta` | Sim, com justificativa | Reabertura |
| `em_andamento` | `cancelada` | Sim | Cancelamento |
| `concluida` | `em_andamento` | Sim, com justificativa | Reabertura |
| `concluida` | `cancelada` | Não padrão | Reabrir antes |
| `cancelada` | `aberta` | Sim, com justificativa | Reativação |
| `cancelada` | `concluida` | Não direto | Reabrir e concluir |

### 7.7 Fechamento mensal

Campos de status:

- `dasStatus`
- `esocialStatus`
- `reinfStatus`
- `fgtsStatus`

Estados de obrigação:

| Status | Significado operacional |
|---|---|
| `pendente` | Ainda não resolvido |
| `parcial` | Parcialmente tratado, ainda bloqueia/alerta |
| `enviado` | Enviado, aguardando confirmação ou finalização |
| `ok` | Concluído/regular |
| `sm` | Sem movimento |
| `guia` | Guia gerada/controle específico |
| `na` | Não aplicável |

Matriz recomendada por obrigação:

| De | Para | Permitido? | Observação |
|---|---|---:|---|
| `pendente` | `parcial` | Sim | Execução parcial |
| `pendente` | `enviado` | Sim | Obrigação enviada |
| `pendente` | `ok` | Sim | Resolvida diretamente |
| `pendente` | `sm` | Sim | Identificado sem movimento |
| `pendente` | `guia` | Sim | Guia gerada |
| `pendente` | `na` | Sim | Não aplicável |
| `parcial` | `enviado` | Sim | Avanço |
| `parcial` | `ok` | Sim | Resolvido |
| `enviado` | `ok` | Sim | Confirmação/finalização |
| `ok` | `pendente` | Sim, com justificativa | Reabertura |
| `na` | `pendente` | Sim, com justificativa | Mudança de enquadramento |

Impacto:

- Hoje considera bloqueio de fechamento quando qualquer status está `pendente` ou `parcial`.
- Cards/tabelas de fechamento devem destacar esses estados como itens de ação.

### 7.8 Declaração de IR

Estados:

| Status | Significado |
|---|---|
| `pendente` | Declaração aberta, documentos pendentes |
| `em_andamento` | Em preparação/análise |
| `entregue` | Declaração entregue |
| `retificado` | Houve retificação após entrega |
| `cancelado` | Declaração não será executada |

Matriz recomendada:

| De | Para | Permitido? | Observação |
|---|---|---:|---|
| `pendente` | `em_andamento` | Sim | Início da preparação |
| `pendente` | `entregue` | Sim | Entrega direta |
| `pendente` | `cancelado` | Sim | Encerramento sem entrega |
| `em_andamento` | `entregue` | Sim | Entrega normal |
| `em_andamento` | `pendente` | Sim | Volta por falta de documentos |
| `entregue` | `retificado` | Sim | Retificação formal |
| `entregue` | `em_andamento` | Sim, com justificativa | Reabertura para correção antes de retificar |
| `retificado` | `em_andamento` | Sim, com justificativa | Nova correção |
| `cancelado` | `pendente` | Sim, com justificativa | Reativação |
| `cancelado` | `entregue` | Não direto | Reabrir antes |

## 8. Regras de navegação após salvar

| Formulário | Criação | Edição | Cancelar |
|---|---|---|---|
| Cliente | `/clientes/{id}` | `/clientes/{id}` | `onClose` ou `router.back()` |
| Tarefa | `/tarefas` + refresh | `/tarefas` + refresh | `onClose` ou `router.back()` |
| Competência | `/competencias/{id}` | `/competencias/{id}` | `onClose` ou `router.back()` |
| Lançamento | `/financeiro` + refresh | `/financeiro` + refresh | `onClose` ou `router.back()` |
| IR | `/ir/{id}` | `/ir/{id}` | `router.back()` |
| NFS-e | `/fiscal` ou fecha modal | fecha modal/atualiza fiscal | fecha modal ou `/fiscal` |

## 9. Índice de modais e dimensões

| Modal | Arquivo | Tamanho |
|---|---|---|
| Dialog padrão | `components/ui/dialog.tsx` | `max-w-[calc(100%-2rem)]`, `sm:max-w-sm` |
| Alert/Confirm padrão | `components/ui/alert-dialog.tsx` | `max-w-xs`, `sm:max-w-sm` no default |
| Sidebar mobile | `components/layout/app-sidebar.tsx` | Sheet esquerda `w-56`, altura total |
| Command palette | `components/ui/command.tsx` | Dialog padrão, `top-1/3`, lista `max-h-72`, sem padding |
| Cliente 360 | `components/clientes/cliente-modal.tsx` | até 900px, `max-h calc(100dvh - 2rem)`, `sm:min-h 560px` |
| Vincular serviço | `components/clientes/cliente-servico-dialog.tsx` | `max-w-2xl` |
| Configuração fiscal | `components/fiscal/config-fiscal-form.tsx` | max 640px, `max-h 90vh`, scroll |
| Emissão assistida NFS-e | `components/fiscal/emitir-nfse-modal.tsx` | até 1120px, `max-h calc(100dvh - 1.5rem)`, `sm:min-h 680px` |
| Emitir lote NFS-e | `components/fiscal/emitir-lote-modal.tsx` | `max-w-2xl`, `max-h 80vh` |
| Erro técnico fiscal | `app/(dashboard)/fiscal/page.tsx` | `max-w-2xl` |
| Baixar lançamento | `components/financeiro/lancamento-baixar.tsx` | `sm:max-w-sm` |
| Histórico WhatsApp | `app/(dashboard)/financeiro/page.tsx` | `max-w-2xl` |
| Cancelamento NFS-e | `fiscal/[id]` e `fiscal/historico` | `max-w-md` |
| Revisão fechamento | `fechamento/client.tsx` | `max-w-md` |
| Usuário admin | `components/admin/usuario-form.tsx` | `max-w-2xl`, `max-h 90vh`, scroll |
| Serviço admin | `components/admin/servico-form.tsx` | `max-w-md` |

## 10. Observações para manutenção e evolução

- A documentação acima reflete o código-fonte e os processos implementados, não uma especificação desejada.
- Há textos sem acentuação em algumas telas, por exemplo “responsavel” e “Proximos”; isso está preservado aqui porque é o texto implementado.
- O workspace continha alterações não relacionadas no momento da criação deste documento. Este arquivo foi adicionado sem modificar telas ou componentes.
- Para manter este documento confiável, qualquer alteração em `src/app/(dashboard)`, `src/components/*/*form.tsx`, `src/features`, `functions/src`, `firestore.rules`, `src/app/globals.css`, `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`, `src/components/ui/sheet.tsx` ou modais fiscais/financeiros deve atualizar as seções correspondentes.
- Mudanças de processo precisam registrar, no mínimo:
  - Tela ou automação que dispara o processo.
  - Pré-condições de permissão e dados.
  - Matriz estado-transição afetada, quando houver alteração de status.
  - Coleções/documentos criados, atualizados ou bloqueados.
  - Eventos, logs de auditoria, jobs ou mensagens gerados.
  - Feedback visual mostrado ao usuário.
  - Impacto em Dashboard, Hoje, Cliente 360, timeline e exportações.
- Mudanças visuais precisam registrar:
  - Tokens de cor usados.
  - Semântica operacional da cor.
  - Dimensão do componente ou overlay.
  - Estado vazio, loading, erro e sucesso.
