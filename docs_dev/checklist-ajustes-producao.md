# Checklist de ajustes para producao

Status inicial em 2026-05-04.

Objetivo: transformar o TTRD Contabil de MVP interno em ferramenta operacional pronta para uso real por escritorio contabil, reduzindo risco fiscal, vazamento de dados, inconsistencias operacionais e retrabalho.

Decisao de arquitetura em 2026-05-05:

- A plataforma TTRD Contabil sera tratada como **single-tenant por ambiente Firebase**.
- O objetivo whitelabel sera atendido por clonagem de ambiente/projeto para cada novo escritorio, com troca de marca, configuracoes e dados iniciais.
- Nao sera implementado multi-tenant SaaS completo no mesmo Firebase neste ciclo.
- Mesmo single-tenant, `tenantId` continua obrigatorio como identificador fixo do ambiente, protecao de acesso, organizacao de dados e base para clonagem futura.
- Tenant padrao atual: `ttrd`.

Legenda:

- [ ] Pendente
- [~] Em andamento
- [x] Concluido

## 1. Bloqueadores de producao

### 1.0 Arquitetura single-tenant e whitelabel

- [x] Definir modelo single-tenant por ambiente Firebase.
  - Criterio de aceite: cada escritorio roda em projeto/ambiente isolado; nao ha compartilhamento de dados entre escritorios no mesmo Firebase.
  - Status 2026-05-05: decisao tomada. TTRD usa tenant fixo `ttrd`; futuros clientes whitelabel devem receber clone de ambiente.

- [x] Documentar processo de clonagem whitelabel.
  - Deve incluir: criar novo projeto Firebase, configurar Auth, Firestore, Storage, Functions, Hosting, variaveis de ambiente, branding, usuario admin inicial, tenant fixo, parametros do escritorio, indices, secrets e seed minimo.
  - Criterio de aceite: um novo ambiente pode ser criado seguindo o documento sem depender de conhecimento informal.
  - Status 2026-05-05: criado `docs_dev/guia-whitelabel-single-tenant.md`.

- [~] Parametrizar marca e dados do escritorio por ambiente.
  - Campos: nome do produto/escritorio, logo, cor primaria, CNPJ do escritorio, e-mail de alertas, tenant fixo, ambiente fiscal padrao.
  - Criterio de aceite: novo whitelabel nao exige alterar codigo-fonte para trocar identidade basica.
  - Status 2026-05-05: criada configuracao frontend `appConfig` com `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_SHORT_NAME`, `NEXT_PUBLIC_APP_TAGLINE`, `NEXT_PUBLIC_APP_TENANT_ID`, `NEXT_PUBLIC_APP_BRAND_PRIMARY` e `NEXT_PUBLIC_APP_LOGO_URL`; aplicada em metadata, login, sidebar, header, parametros do escritorio e criacao de usuarios. Falta parametrizar textos de e-mail/Functions, seed e scripts administrativos.

- [x] Remover complexidade visual de multi-tenant da UI.
  - Criterio de aceite: usuario nao ve selecao/troca de tenant; tenant e detalhe tecnico de ambiente.
  - Status 2026-05-05: campo editavel "Tenant atual" removido da tela de parametros; tenant segue preservado internamente via usuario/configuracao de ambiente.

- [ ] Criar seed inicial para ambiente single-tenant.
  - Deve criar: tenant fixo, usuario admin, parametros do escritorio, perfis/telas padrao e servicos base.
  - Criterio de aceite: ambiente novo fica operacional apos deploy + seed.

### 1.1 Seguranca e controle de acesso

- [~] Implementar seguranca single-tenant com `tenantId` fixo obrigatorio.
  - Colecoes: `usuarios`, `clientes`, `servicos`, `clientes_servicos`, `competencias`, `tarefas`, `lancamentos`, `fechamentos`, `clientes_fiscal`, `nfse_*`, `ir_*`, `documentos`, `logs_auditoria`.
  - Criterio de aceite: usuario autenticado sem cadastro ativo em `usuarios/{uid}` nao acessa dados; documentos criticos sem `tenantId = ttrd` nao sao aceitos; UI, SDK e REST respeitam as mesmas regras.
  - Status 2026-05-04: helpers client-side passam a gravar `tenantId` quando o usuario possui tenant; novos usuarios recebem tenant padrao `ttrd`; script `npm run backfill:tenant -- --write` criado.
  - Revisao 2026-05-05: como o produto sera single-tenant por ambiente, nao e necessario suportar multiplos tenants simultaneos no mesmo Firebase. Falta remover fallback permissivo para usuario/documento sem tenant, executar backfill com credencial admin e validar emulator.
  - Execucao 2026-05-05: removido fallback permissivo em Firestore Rules, Storage Rules e Functions criticas; usuario/documento sem tenant deixa de ser aceito nos fluxos protegidos. `listDocuments` passou a adicionar filtro `tenantId` automaticamente nas colecoes operacionais. Script `backfill:tenant` foi convertido para Admin SDK, sem depender de senha do usuario. Tentativa de dry-run bloqueada porque a sessao nao possui `FIREBASE_SERVICE_ACCOUNT_KEY` nem Application Default Credentials. Falta executar backfill/admin smoke em ambiente com credenciais.
  - Publicacao 2026-05-05: backfill executado via fallback Firestore REST com token `gcloud`; 16/155 documentos ajustados para `tenantId=ttrd`; dry-run final confirmou 0/155 pendentes. Firestore Rules, Storage Rules, Functions e Hosting publicados em producao.

- [~] Atualizar Firestore Rules para validar `tenantId` e vinculo do usuario.
  - Criterio de aceite: testes no emulator cobrindo admin, operacional, fiscal, financeiro, leitura e usuario autenticado sem cadastro interno.
  - Status 2026-05-04: Rules aplicam filtro de tenant em leituras, creates e updates; updates tambem validam tenant existente.
  - Revisao 2026-05-05: rules ainda devem bloquear fallback de `usuarios/{uid}` ausente, `tenantId` ausente e leitura global de `usuarios`. Falta suite automatizada no emulator.
  - Execucao 2026-05-05: `isAtivo()` agora exige usuario interno existente, ativo e com tenant; `sameTenantExisting/New` exigem `tenantId`; `nfse_eventos`, `logs_auditoria` e `configuracoes` passaram a validar tenant; tarefas/documentos/comentarios deixaram de aceitar escrita por perfil somente leitura. `npm run test:rules` ainda bloqueado por Java 8 local; emulator exige JDK 21+.
  - Publicacao 2026-05-05: regras compiladas e publicadas no Firebase. Validacao automatizada no emulator ainda pendente por JDK 21+.

- [x] Bloquear leitura global da colecao `usuarios`.
  - Criterio de aceite: apenas usuario interno ativo do ambiente consegue listar usuarios do mesmo tenant; usuario autenticado sem cadastro interno nao acessa; escrita/permissoes seguem restritas a admin.
  - Motivo: mesmo single-tenant, e-mail, perfil e permissoes de usuarios sao dados internos protegidos.
  - Status 2026-05-05: regra deixou de permitir qualquer autenticado; `get/list` exigem usuario interno ativo com tenant, e o helper client-side adiciona filtro `tenantId`. Escrita de perfil/permissao continua admin.

- [~] Atualizar Storage Rules para bloquear leitura global de documentos e NFS-e.
  - Criterio de aceite: PDF/XML/documentos so podem ser lidos por usuario autorizado ao tenant/cliente.
  - Revisao 2026-05-05: manter regra single-tenant, mas remover fallback que permite acesso quando usuario ou cliente nao possui tenant.
  - Execucao 2026-05-05: Storage agora exige usuario interno ativo com tenant e cliente com mesmo tenant. Falta validar no emulator apos JDK 21+.
  - Publicacao 2026-05-05: regras compiladas e publicadas no Firebase Storage.

- [x] Criar helper server-side `assertCanAccessCliente(uid, clienteId, acao)`.
  - Usar em todas as Cloud Functions fiscais e operacionais sensiveis.

- [x] Reforcar `assertCanAccessCliente` para ambiente single-tenant.
  - Criterio de aceite: function falha se usuario nao existe, esta inativo, nao tem perfil valido ou nao pertence ao tenant fixo; cliente sem `tenantId = ttrd` nao pode ser acessado.
  - Status 2026-05-05: helper reforcado com `requireEnvironmentTenant`; dashboard, fechamento, rascunhos e schedulers tiveram fallbacks `?? 'ttrd'` removidos ou centralizados em tenant de ambiente.
  - Publicacao 2026-05-05: Functions publicadas em producao.

- [x] Proteger Cloud Functions fiscais por perfil e cliente.
  - Funcoes: `emitirNfse`, `emitirNfseLote`, `uploadCertificado`, `salvarCredenciaisFiscais`, `consultarNfse`, `cancelarNfse`, `retryNfse`.
  - Criterio de aceite: usuario sem perfil fiscal/admin nao consegue emitir/cancelar/alterar credenciais.

- [x] Remover fallback de criptografia em producao.
  - Arquivo: `functions/src/nfse/encrypt.ts`.
  - Criterio de aceite: function falha com erro claro se `CREDENTIAL_KEY` nao estiver configurada.
  - Incidente 2026-05-05: upload do certificado A1 falhava porque o segredo `CREDENTIAL_KEY` nao existia e as Functions fiscais nao estavam vinculadas ao Secret Manager.
  - Execucao 2026-05-05: criado segredo `CREDENTIAL_KEY` valido, adicionado binding `secrets` em `emitirNfse`, `emitirNfseLote`, `uploadCertificado`, `salvarCredenciaisFiscais`, `consultarNfse`, `cancelarNfse` e `retryNfse`; Functions publicadas.

- [ ] Remover fallback de senha de certificado em texto puro nos fluxos de emissao.
  - Criterio de aceite: certificado/credencial fiscal precisa estar criptografado; se descriptografia falhar, emissao bloqueia com erro operacional claro.

### 1.2 Auditoria e rastreabilidade

- [~] Implementar trilha de auditoria automatica para writes criticos.
  - Colecoes: `clientes`, `clientes_servicos`, `competencias`, `tarefas`, `lancamentos`, `fechamentos`, `clientes_fiscal`, `nfse_rascunhos`, `nfse_emitidas`, `usuarios`.
  - Criterio de aceite: cada create/update/delete sensivel gera evento com ator, data, entidade, antes/depois e origem.
  - Status 2026-05-05: helpers client-side geram `logs_auditoria` com redacao de campos sensiveis para colecoes criticas, incluindo IR, cobrancas e revisoes; `gerarFechamentoMensal` gera log server-side de criados/ignorados. Falta cobrir todos os writes feitos diretamente por Admin SDK/Cloud Functions.

- [ ] Revisar redacao LGPD dos logs de auditoria.
  - Campos a redigir: CPF/CNPJ, e-mail, telefone, XML de NFS-e, dados de certificado, senha, token, payload fiscal completo, dados aninhados sensiveis.
  - Criterio de aceite: logs preservam rastreabilidade sem armazenar dado sensivel desnecessario.

- [x] Padronizar eventos de timeline do cliente.
  - Criterio de aceite: toda tarefa, lancamento, competencia, fechamento e NFS-e relevante aparece no Cliente 360.
  - Status 2026-05-05: triggers de timeline existentes foram exportados nas Functions; Cliente 360 tambem monta contexto operacional local; revisao de fechamento e fechamento gerado criam evento.

- [x] Redigir dados sensiveis em logs de erro de NFS-e.
  - Remover CPF/CNPJ completo, e-mail e payload integral.
  - Criterio de aceite: `nfse_erros` guarda payload minimo, hash/id e mensagem util.

- [ ] Vincular eventos fiscais ao tenant e cliente.
  - Criterio de aceite: todo documento em `nfse_eventos` possui `tenantId`, `clienteId` quando aplicavel, ator, origem e payload redigido.
  - Motivo: mesmo single-tenant, eventos fiscais precisam ser filtraveis, auditaveis e seguros para clone whitelabel.

### 1.3 NFS-e

- [x] Garantir idempotencia transacional para emissao avulsa.
  - Criterio de aceite: duplo clique/retry simultaneo nao emite duas notas para o mesmo rascunho.

- [x] Garantir idempotencia transacional para emissao em lote.
  - Criterio de aceite: lote concorrente nao duplica NFS-e.

- [ ] Implementar idempotencia fiscal real contra provedor municipal.
  - Criterio de aceite: numero de RPS e chave de idempotencia sao persistidos antes da chamada externa; retry consulta a prefeitura pelo RPS antes de tentar nova emissao; `nfse_emitidas` usa id deterministico por rascunho/RPS.
  - Motivo: a idempotencia transacional evita duplo clique interno, mas nao cobre timeout/crash apos envio para a prefeitura.

- [ ] Garantir recuperacao de erro em lote.
  - Criterio de aceite: qualquer item com falha sai de `processando`, volta para `erro_integracao` ou estado retryavel, grava `erroId` e aparece no historico.

- [ ] Homologar emissao real por municipio configurado.
  - Municipios atuais: Jundiai, Campinas, Cajamar, Sao Paulo, Barueri, Santana de Parnaiba, Taboao da Serra, Cotia.
  - Criterio de aceite: cada municipio tem evidencia de homologacao ou fica marcado como nao liberado.

- [ ] Homologar consulta real por municipio.
  - Criterio de aceite: status fiscal volta corretamente e atualiza `nfse_emitidas`.

- [ ] Homologar cancelamento real por municipio.
  - Criterio de aceite: cancelamento atualiza status, motivo, evento fiscal e retorno do provedor.

- [x] Criar checklist visual antes de emitir NFS-e.
  - Deve mostrar: ambiente, prestador, tomador, municipio, inscricao municipal, servico, valor, aliquota, ISS retido, certificado/credencial usada.
  - Criterio de aceite: usuario confirma dados antes da chamada fiscal.

- [x] Corrigir bloqueio de upload de certificado A1.
  - Problema: validacao do PFX podia passar, mas o salvamento falhava ao criptografar a senha sem `CREDENTIAL_KEY` disponivel no runtime.
  - Criterio de aceite: Functions fiscais recebem `CREDENTIAL_KEY` via Secret Manager e o segredo ativo tem 32 bytes em hex.
  - Status 2026-05-05: segredo criado/rotacionado sem quebra de linha, validado via Secret Manager, Functions publicadas.

- [ ] Substituir confirmacao simples por modal fiscal forte.
  - Criterio de aceite: antes da emissao, operador ve resumo imutavel da nota e confirma explicitamente tomador, servico, valor, competencia, ambiente e certificado/credencial.

## 2. Fundacao operacional do produto

### 2.1 Cockpit diario

- [x] Restaurar `/hoje` como tela real do cockpit.
  - Hoje a rota redireciona para `/dashboard`.
  - Criterio de aceite: apos login, usuario operacional cai no cockpit com fila priorizada.

- [x] Fazer `/hoje` ser a entrada padrao para perfis operacionais.
  - Admin pode escolher dashboard, mas operacao deve iniciar no cockpit.

- [x] Validar bulk actions do cockpit.
  - Acoes: concluir, reatribuir, alterar prazo.
  - Criterio de aceite: atualizacao aparece imediatamente e gera auditoria.
  - Status 2026-05-04: UI e mutations implementadas; auditoria client-side cobre updates de tarefas.

- [x] Exibir estado vazio util no cockpit.
  - Criterio de aceite: se nao houver tarefas/fechamentos, mostrar proximo passo: criar competencia, vincular servico ou gerar fechamento.

### 2.2 Cliente 360

- [x] Garantir que Cliente 360 mostre proximos passos sugeridos.
  - Regras iniciais:
    - cliente sem servico vinculado;
    - cliente sem configuracao fiscal;
    - certificado ausente/vencendo;
    - competencia aberta;
    - tarefa atrasada;
    - lancamento atrasado;
    - rascunho NFS-e pendente.

- [x] Reposicionar timeline como primeira secao relevante do contexto.
  - Criterio de aceite: operador entende rapidamente o que aconteceu e o que fazer.

- [x] Padronizar saude do cliente.
  - Dimensoes: operacional, fiscal, financeiro.
  - Criterio de aceite: cada dimensao tem regra objetiva e fonte de dados.

### 2.3 Servicos contratados e competencias

- [ ] Vincular servicos aos clientes existentes.
  - Producao atual: `clientes_servicos = 0`.
  - Criterio de aceite: cada cliente ativo tem pelo menos um servico ativo ou motivo registrado.

- [x] Corrigir/validar geracao mensal de competencias.
  - Criterio de aceite: servico ativo gera competencia correta por cliente/mes/ano.

- [x] Corrigir status gerado por scheduler de competencias.
  - Status deve usar enum do app: `aberta`, `em_andamento`, `concluida`, `cancelada`.

- [x] Criar tarefas recorrentes a partir das competencias/servicos.
  - Criterio de aceite: competencia mensal gera tarefas com dono, prazo e prioridade.

- [x] Impedir duplicidade de competencia.
  - Criterio de aceite: id deterministico ou transacao por `clienteId + servicoId + mes + ano`.

### 2.4 Fechamento mensal

- [x] Mover geracao de fechamento para Cloud Function ou batch seguro.
  - Criterio de aceite: falha parcial nao deixa mes inconsistente.
  - Status 2026-05-05: criada e publicada Cloud Function callable `gerarFechamentoMensal`; usa id deterministico por tenant/ano/mes/cliente, batch server-side, audit log e evento de timeline por fechamento criado.

- [x] Usar id deterministico para fechamento.
  - Sugestao: `${tenantId}_${ano}_${mes}_${clienteId}`.

- [x] Conectar fechamento ao cockpit.
  - Criterio de aceite: pendencias/parciais aparecem como bloqueio operacional.

- [x] Registrar sign-off com auditoria robusta.
  - Criterio de aceite: revisao mensal tem ator, data, observacao, status agregado e snapshot de pendencias.

## 3. Financeiro

- [x] Garantir que todo lancamento de receita tenha `clienteId`.
  - Excecao apenas para despesas internas, com tipo/flag propria.

- [x] Implementar recorrencia real de honorarios mensais por `clientes_servicos`.
  - Criterio de aceite: servico ativo gera lancamento mensal sem duplicar.

- [x] Melhorar fila de cobranca como tela/fluxo principal, nao apenas lista.
  - Criterio de aceite: ordenacao por score, acao de cobrar, baixar e registrar observacao.

- [x] Criar registro de cobranca/negociacao.
  - Criterio de aceite: mailto/WhatsApp/contato gera evento no cliente.

- [x] Corrigir filtros para incluir todos os status esperados.
  - Exemplo: `atrasado` e `estornado` devem ser filtraveis onde aparecem no enum.

- [x] Paginar financeiro no Firestore.
  - Criterio de aceite: nao baixar toda a colecao para filtrar/paginar no cliente.
  - Status 2026-05-05: query principal de `lancamentos` passou a aplicar `clienteId`, `competenciaId`, `tipo`, `status/atrasado` e `limit` progressivo por pagina no Firestore; indices compostos enviados.

## 4. Fiscal / NFS-e

- [x] Padronizar status de rascunhos.
  - Hoje ha divergencia entre criacao de rascunho e consultas que esperam `aguardando_emissao`.

- [x] Salvar `clienteNome` no rascunho.
  - Criterio de aceite: listas e lote exibem cliente sem depender de fallback pelo titulo.

- [x] Preparar rascunhos recorrentes de NFS-e sem emissão automática.
  - Criterio de aceite: cliente ativo com serviço, dia de emissão e configuração fiscal completa pode gerar rascunho mensal idempotente para revisão antes da emissão.
  - Status 2026-05-05: criada Cloud Function callable `gerarRascunhosNfseMensais`; painel fiscal recebeu ação "Preparar mês". Os rascunhos gerados ficam com `status = rascunho` e `requerRevisao = true`, fora do lote de emissão até revisão operacional. A tela de emissão agora abre `?rascunhoId=...`, preenche os dados, permite revisar/liberar para lote e emite usando o proprio `rascunhoId`.

- [x] Criar matriz operacional de prontidão para NFS-e recorrente.
  - Criterio de aceite: painel fiscal mostra clientes ativos prontos para rascunho, prontos para emissão e bloqueados por falta de serviço, dia de emissão, configuração fiscal, certificado ou credencial municipal.
  - Status 2026-05-05: painel `/fiscal` passou a exibir a seção "Prontidão para emissão recorrente", com contadores e bloqueios por cliente. Isso orienta o preenchimento dos dados antes da geração de rascunhos e da emissão em lote.

- [x] Validar payload fiscal server-side.
  - Campos: CPF/CNPJ valido, valor positivo, aliquota por municipio/regime, codigoServico/itemListaServico, inscricao municipal, ambiente.

- [x] Criar matriz de municipio x capacidade.
  - Colunas: emissao, consulta, cancelamento, certificado, credencial, homologado, producao liberada.

- [x] Bloquear municipio nao homologado para producao.
  - Criterio de aceite: ambiente `producao` so funciona se municipio estiver liberado.

- [x] Implementar exportacao PDF/relatorio de inadimplencia pendente no checklist NFS-e.

## 5. IR

- [~] Popular fluxo minimo de IR com declaracao real.
  - Producao atual: `ir_declaracoes = 0`.
  - Status 2026-05-04: formulario cria declaracao, checklist padrao e tarefa de prazo. Falta criar dados reais em producao.

- [x] Criar checklist de documentos por declaracao.
  - Criterio de aceite: IR nao e apenas status; deve ter pendencias/documentos.

- [x] Criar alertas de prazo para IR.
  - Criterio de aceite: aparece no cockpit e/ou alertas diarios.

## 6. Admin

- [x] Concluir migracao do modulo admin para feature-layer.
  - Status 2026-05-05: criada camada `src/features/admin` com tipos e servicos para usuarios, servicos, conectores fiscais e parametros do escritorio. Paginas/formularios admin deixam de acessar `firestore-client` diretamente; o acesso a Firestore fica centralizado na feature.

- [x] Adicionar gestao de conectores fiscais.
  - Rota planejada: `/admin/conectores`.
  - Criterio de aceite: admin ve municipios, ambientes, status de homologacao e credenciais exigidas.

- [x] Criar tela de parametros do escritorio.
  - Campos: email de alertas, dados do escritorio, padrao de vencimento, tenant atual, ambiente fiscal padrao.

- [x] Revisar criacao de usuarios.
  - Criterio de aceite: usuario criado sempre tem `ativo`, `perfil`, `tenantId` e telas coerentes.

## 7. UX/UI operacional

- [x] Ajustar navegacao para refletir prioridade de trabalho.
  - Entrada diaria: Hoje.
  - Dashboard: analitico, nao operacional.

- [x] Adicionar estados vazios com acao recomendada.
  - Clientes sem servico, competencias vazias, tarefas vazias, NFS-e sem configuracao, financeiro sem cliente.
  - Status 2026-05-05: cockpit, clientes, competencias, tarefas, financeiro, IR, Cliente 360, fiscal, historico NFS-e e telas admin criticas usam estado vazio padronizado com orientacao/CTA quando aplicavel.

- [x] Adicionar confirmacoes fortes para acoes irreversiveis.
  - Emissao NFS-e, cancelamento, exclusao, fechamento/revisao do mes.
  - Status 2026-05-05: emissao avulsa ja exige confirmacao, cancelamento exige modal com motivo, remocao de rascunho exige confirmacao destrutiva, fechamento e revisao mensal exigem confirmacao. Varredura final nao encontrou exclusao direta exposta na UI fora do fluxo fiscal; hooks de delete restantes nao estao usados por telas.

- [x] Melhorar mensagens de erro.
  - Trocar "Erro ao salvar" por causa provavel e proxima acao.
  - Status 2026-05-05: criado helper `getErrorMessage` e aplicado em clientes, servicos do cliente, tarefas, baixa financeira, fechamento, rascunho fiscal, historico NFS-e, admin, IR e configuracao fiscal. Varredura por mensagens genericas concluida.

- [x] Corrigir crash/reload em selects opcionais.
  - Problema: Radix Select/shadcn nao aceita `SelectItem value=""`; telas de cadastro de cliente e telas relacionadas podiam quebrar ao renderizar select com opcao "Nenhum".
  - Criterio de aceite: selects opcionais usam valor sentinela e gravam `null`/`undefined` no payload, sem expor ID tecnico nem derrubar a pagina.
  - Status 2026-05-05: corrigido em clientes, financeiro, IR, competencias, emissao NFS-e e tarefas; build e deploy publicados.

- [~] Validar responsividade mobile/tablet das telas criticas.
  - Telas: cockpit, cliente 360, fiscal emitir, historico NFS-e, fechamento, financeiro.
  - Status 2026-05-05: historico NFS-e recebeu tabela com scroll horizontal e cabecalho com quebra responsiva. Falta validacao visual final em viewport real/autenticada para todas as telas criticas.

- [x] Remover/limpar componentes obsoletos de layout.
  - Validar antes: `sidebar.tsx`, `topbar.tsx`, `navbar.tsx`, `topnav.tsx`, `app-sidebar.tsx`.
  - Status 2026-05-05: `app-sidebar.tsx` e o layout ativo foram mantidos; `sidebar.tsx`, `topbar.tsx`, `navbar.tsx` e `topnav.tsx` nao tinham importadores e foram removidos.

## 8. Performance e escala

- [~] Trocar paginacao client-side por cursor Firestore.
  - Telas: clientes, fiscal historico, financeiro, tarefas, competencias.
  - Status 2026-05-05: financeiro, clientes, tarefas, competencias e historico fiscal deixaram de baixar a colecao inteira e passaram a usar limite progressivo por pagina no Firestore. Falta substituir pagina numerica por cursor real (`startAfter`) onde a UX permitir.

- [x] Evitar queries sem `limit` em dashboards/KPIs.
  - Status 2026-05-05: dashboard principal passou a limitar consultas de clientes ativos, competencias do mes, tarefas abertas e lancamentos de vencimento/atraso.

- [x] Criar agregados/cache para KPIs de dashboard.
  - Criterio de aceite: dashboard nao depende de varrer colecoes grandes no browser.
  - Status 2026-05-05: criada Cloud Function callable `recalcularDashboardKpis`, que calcula KPIs por tenant/mes/ano no servidor e grava `dashboard_kpis/{tenantId_ano_mes}`. O `/dashboard` agora tenta carregar o agregado e aciona recalculo quando o cache ainda nao existe; listas operacionais continuam limitadas para exibir detalhes.

- [x] Revisar indices compostos apos filtros finais.
  - Status 2026-05-05: indices de clientes, competencias, tarefas, financeiro, historico NFS-e e agregados de dashboard foram revisados e publicados. Os indices novos de `tenantId + mes/ano`, `tenantId + tipo/status/dataVencimento` e `tenantId + status` podem ficar em `INITIALIZING` por alguns minutos no Firestore.

- [x] Padronizar `staleTime`, invalidacao e optimistic update por dominio.
  - Status 2026-05-05: criado catalogo `queryStaleTimes` por criticidade (`realtime`, `operational`, `fiscal`, `financial`, `reference`) e aplicado nas queries principais de clientes, tarefas, competencias, financeiro, fiscal, hoje, fechamento e IR. Fluxo de concluir tarefa recebeu atualizacao otimista com rollback e invalidacao final por dominio.

## 9. Qualidade, testes e deploy

- [x] Corrigir `npm run lint`.
  - Problema atual: dependencia/config `eslint-plugin-storybook`.
  - Status 2026-05-05: lint executa limpo, sem erros e sem warnings.

- [~] Criar testes de Firestore Rules no emulator.
  - Casos minimos:
    - leitura sem escrita;
    - operacional sem financeiro;
    - financeiro sem fiscal;
    - fiscal sem financeiro;
    - tenant A nao acessa tenant B.
  - Status 2026-05-05: criada suite `__tests__/rules/firestore.rules.test.ts` e script `npm run test:rules`. Execucao bloqueada localmente porque Firebase Emulator atual exige JDK 21+ e o ambiente esta com Java 8.

- [~] Criar E2E com fixtures reais.
  - Fluxos:
    - criar cliente;
    - vincular servico;
    - gerar competencia;
    - criar/concluir tarefa;
    - gerar fechamento;
    - criar/baixar lancamento;
    - salvar rascunho NFS-e;
    - emitir/erro/retry/cancelar NFS-e.
  - Status 2026-05-05: criada suite `e2e/operacao-real.spec.ts` com login real, abertura de telas criticas, Cliente 360/fiscal do cliente por `E2E_CLIENTE_ID`, painel fiscal/prontidao e formularios principais sem submissao. Falta configurar fixtures reais e liberar testes mutacionais controlados para criar/baixar/emitir em homologacao.

- [~] Criar smoke test pos-deploy.
  - Validar: login, clientes, financeiro, fiscal, functions, rules, indexes, storage.
  - Status 2026-05-05: script `npm run smoke:prod` valida login, perfil/tenant, leituras das colecoes criticas, `dashboard_kpis`, Function `validarCertificado` e Function `recalcularDashboardKpis`. Execucao segue bloqueada nesta sessao por ausencia de `ADMIN_PASSWORD`. O script `check-usuario` foi ajustado para garantir `tenantId` no admin quando executado.
  - Publicacao 2026-05-05: deploy de regras, functions e hosting concluido; smoke com usuario real ainda pendente porque `ADMIN_PASSWORD` nao esta disponivel na sessao.

- [ ] Executar 5 dias uteis de uso interno sem planilha paralela.
  - Criterio de aceite: problemas registrados e corrigidos antes de liberar cliente externo.

## 10. Dados iniciais necessarios para validar operacao

- [ ] Garantir pelo menos 2 usuarios por perfil principal.
  - `admin`, `operacional`, `fiscal`, `financeiro`, `leitura`.

- [~] Garantir clientes com cenarios diferentes.
  - Cliente com NFS-e;
  - cliente sem fiscal configurado;
  - cliente com lancamento atrasado;
  - cliente com competencia aberta;
  - cliente com tarefa atrasada.
  - Status 2026-05-05: clientes anteriores removidos e 46 clientes da lista importados por CNPJ com dados da BrasilAPI. Backup em `backups_clientes_reset/2026-05-05T01-10-02-450Z`. Falta criar cenarios operacionais/fiscais/financeiros sobre esses clientes.

- [ ] Criar servicos contratados para todos os clientes ativos.

- [ ] Criar competencias do mes atual.

- [ ] Criar tarefas com responsavel e prazo.

- [ ] Criar pelo menos uma NFS-e em homologacao.

- [~] Criar eventos/auditoria suficientes para validar Cliente 360.
  - Status 2026-05-05: eventos automaticos cobrem tarefas, lancamentos, competencias, NFS-e, fiscal, revisao e geracao de fechamento. Falta massa operacional real apos vincular servicos/competencias/tarefas.

## 11. Ordem recomendada de execucao

1. Formalizar arquitetura single-tenant por ambiente e documentar whitelabel.
2. Corrigir seguranca critica: tenant fixo, Rules, Functions, Storage e leitura de usuarios.
3. Corrigir NFS-e: idempotencia fiscal real, recuperacao de lote, homologacao e confirmacao forte.
4. Corrigir base operacional pendente: `clientes_servicos`, competencias, tarefas e cenarios reais.
5. Completar auditoria, timeline e redacao LGPD.
6. Otimizar performance/paginacao restante.
7. Rodar testes, smoke test e 5 dias de uso interno.
