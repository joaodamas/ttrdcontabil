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

### Adicionado
- **Emissão de NF-e (produto, modelo 55) via Spedy — ponta a ponta (2026-07-14).** Conector (`SpedyConector.emitirProduto`/`emitirConsumidor` + builders de item com ICMS/ST/IPI/PIS/COFINS, `functions/src/nfse/provedores/spedy.ts`), callable `emitirNfeProduto` (`functions/src/nfse/emitir-produto.ts`, com trava de produção via `producaoLiberada`), catálogo de produtos (`src/features/produtos/*`, `src/components/produtos/*`, tela `/fiscal/produtos`) e tela de emissão `/fiscal/emitir-nfe`. Tipos novos em `functions/src/nfse/types.ts` (`ItemProdutoFiscal`, `EmitirProdutoInput`, `EmitirConsumidorInput`). **Backend DEPLOYADO** (rules + functions). **Ainda NÃO validado em homologação real** — totais, agregação de imposto e o payload de item podem precisar de ajuste contra uma emissão real da Spedy. **Exige homologação.**
- **Envio do certificado A1 da plataforma → Spedy** (`enviarCertificadoSpedy` + `SpedyConector.subirCertificado`, `functions/src/nfse/spedy-certificado.ts`) — o "cofre único": lê o A1 já guardado (Storage cifrado), descriptografa a senha e faz `POST /companies/{id}/certificates` (multipart) com a chave da própria empresa; o certificado nunca passa pelo navegador. **Construído e typecheck-limpo, mas NÃO deployado** — deploy bloqueado pro assistente; o dono roda `firebase deploy --only functions:enviarCertificadoSpedy`. Pré-requisito: `spedyCompanyId` (do provisionamento) + `spedyApiKey` + certificado carregado. Nomes dos campos multipart (`file`/`password`) e o uso da chave da empresa (vs Owner) **a confirmar em homologação**.
- **Provisionamento em massa na Spedy** (`functions/src/nfse/provisionar-spedy.ts`, `provisionarEmpresasSpedy`) — dry-run por padrão, admin-only, `POST /v1/companies`. **DEFERIDO** (export comentado no `index.ts`): declara o secret `SPEDY_OWNER_API_KEY` localmente pra não travar o deploy enquanto pausado. Reativar quando for provisionar os 119.
- **Scripts de enriquecimento por CNPJ + planilha de preenchimento do contador (2026-07-14).** `scripts/exportar-clientes-cnpj.mjs` e `scripts/exportar-clientes-completo.mjs` (só-leitura; consultam a BrasilAPI e **removem toda senha/credencial** antes de gravar) geram o de-para dos 119 clientes; um gerador XLSX (scratchpad, `exceljs`) monta planilha colorida de 9 abas — uma por tela de cadastro — com verde = veio do CNPJ, azul = preencher manual, branco = já na plataforma, vermelho = irregular na Receita. Entregue ao dono em `~/Desktop/clientes-preenchimento.xlsx`. Os arquivos de dados gerados (`scripts/clientes-*.csv/json`, com PII) ficam fora do git.
- **Predeploy hooks no `firebase.json`** — `functions` e `hosting` rodam `npm run build` antes do deploy, evitando subir `lib/` desatualizado (Functions) ou `out/` velho (Hosting).
- **Spedy como provedor de emissão padrão** — `config-fiscal-form.tsx` passa a usar `provedorNfse: 'spedy'` por default; regras Firestore adicionadas para a coleção `produtos`.
- **Manual do usuário publicado em `/manual`** (`public/manual.html`, deploy já feito) — guia tela a tela das 14 telas principais (Hoje, Painel, Clientes, Tarefas, Competências, Fechamento, Emissão/Histórico NFS-e, IR, Financeiro, Produtividade, Configurações), escrito a partir de navegação real na plataforma em 2026-07-07. Documenta também 2 achados ao vivo: Cloud API do WhatsApp desligada nos Parâmetros, e erro de permissão na tela de Produtividade mesmo como Admin. Ainda sem screenshots — pendente adicionar quando o dono mandar prints manualmente.
- **Importação em massa de Clientes** (`/clientes/importar`, botão "Importar" na listagem) — sobe um único `.xlsx` (abas Clientes + Serviços, template baixável na própria tela via `gerarTemplateClientesXlsx`), valida linha a linha (CPF/CNPJ com dígito verificador, duplicidade, cliente já cadastrado, código de serviço existente) e mostra preview antes de gravar qualquer coisa. Escopo deliberadamente restrito a dados cadastrais — nenhum campo de credencial fiscal (senha de prefeitura, certificado, Meu Gov, e-CAC) entra na planilha, essas continuam só na tela individual do cliente. Vínculo de serviço é feito por **código** (`COB04`), não por nome — necessário porque o catálogo de Tipos de Serviço pode ter vários itens com o mesmo nome e valores diferentes. Testado em produção: template gerado corretamente, tela renderiza e valida; o passo final de gravação (criar clientes/serviços de verdade) ainda não foi exercitado com escrita real.

### Corrigido
- **Deploy de Functions destravado (2026-07-14)** — dois bloqueios resolvidos: (1) `lib/` desatualizado (`"function found in project but do not exist in local source"`) → predeploy `npm run build` no `firebase.json`; (2) `no value for secret SPEDY_OWNER_API_KEY` → o `defineSecret('SPEDY_OWNER_API_KEY')` saiu de `secrets.ts` (sempre carregado no deploy) e foi pra dentro de `provisionar-spedy.ts` (só carrega quando o export está ativo). Backend deployado com sucesso depois disso.
- **Scroll horizontal na listagem do Financeiro** — a coluna Ações tinha até 7 botões lado a lado, forçando a tabela a `min-w-[1480px]` (maior que a área de conteúdo em telas comuns). Consolidado em timeline + baixar (visíveis) + menu suspenso pro resto (enviar cobrança, pausar/retomar régua, reagendar, histórico, excluir). `min-w` reduzido para 1180px.
- **E-mail de alerta diário funcionando de ponta a ponta pela primeira vez (2026-07-07).** Depois do índice (Lote 11) e do secret SMTP corrigidos, o envio ainda falhava com `535 5.7.8 Authentication Failed` mesmo com usuário/senha corretos e confirmados. Causa raiz real: contas Titan Email (usadas pelo HostGator) vêm com **acesso de terceiros desligado por padrão** — SMTP/IMAP/POP de qualquer aplicativo externo (incluindo um servidor automatizado) é bloqueado até habilitar manualmente em Titan Webmail → Configurações → "Enable Titan on Other Apps" (pré-requisito: 2FA da caixa precisa estar desligado). Não era problema de código, índice, secret nem senha — as três correções anteriores eram necessárias mas não suficientes. Confirmado no log: `Email enviado. Tarefas: 0, Lançamentos: 1...`.

### Segurança
- **Correção crítica em `firestore.rules` (2026-07-14, DEPLOYADA)** — `'telas'` foi adicionado à lista de chaves bloqueadas no auto-update do próprio usuário (`usuarios/{uid}`). Sem isso, qualquer usuário podia se auto-conceder telas no array `telas` e, via `hasTela()`, ganhar leitura de coleções sensíveis (`clientes_fiscal`, `clientes_fiscal_integracao`). Agora `telas` só muda por escrita administrativa.
- **Nenhum dado sensível no git** — os scripts de export de clientes removem senha/token/credencial antes de gravar, e os arquivos de dados (`scripts/clientes-*.csv/json`, com PII dos 119 clientes) entraram no `.gitignore`. A planilha de preenchimento também não carrega senhas (a aba Credenciais é só checklist).

### Pendências que exigem decisão do dono
- **Deployar `enviarCertificadoSpedy`** — o dono roda `firebase deploy --only functions:enviarCertificadoSpedy` (função nova, aditiva, sem secret novo).
- **Deploy do Hosting pendente** — `firebase deploy --only hosting` torna `/fiscal/emitir-nfe` e `/fiscal/produtos` acessíveis e leva o white-label ao ar. Predeploy já roda `npm run build`.
- **Validar em homologação real** — configurar o 1º cliente de NF-e (Spedy API key + dados do emitente + certificado) e **emitir 1 NF-e em homologação**. Esse teste valida de uma vez o payload de produto (ST/IPI/totais) E o upload de certificado (contrato multipart). Nada de emissão de produto foi exercitado com a Spedy de verdade ainda.
- **Importador de volta da planilha** — a planilha de preenchimento (`~/Desktop/clientes-preenchimento.xlsx`) foi entregue ao dono/contador; quando voltar preenchida, construir o caminho de gravação nos 119 clientes na plataforma (escrita em produção — com backup antes + dry-run, reversível). Só o dono roda leituras/escritas de produção (o assistente é bloqueado pelo harness; export dos 119 rodou via sessão do dono).
- **Raio-x da carteira (119 clientes, 2026-07-14, via BrasilAPI):** 96 Simples Nacional / 23 Normal; por CNAE: 61 serviço (NFS-e, carga recorrente da Spedy), 46 produto (33 comércio + 10 indústria + 3 veículos → NF-e/NFC-e), **12 transporte (CT-e — Spedy NÃO emite; autoemitem)**. **6 irregulares na Receita** a revisar antes de cobrar/emitir (5 baixadas: CAMARA CONCILIACAO CMS, NATHALIA ALVES FEITOSA, LUTE CLEAN, BIMK EMBALAGENS, JOSE EDINARDO GOMES; 1 inapta: F&R TRANSPORTES). **2 razões sociais divergentes** plataforma × Receita a conferir: `64.801.001/0001-18` (plataforma "VINICIUS CAETANO ENGENHARIA" × Receita "ODARA ENGENHARIA") e `56.926.482/0001-60` (× "FERREIRA TRANSPORTES JB").
- Sentry — precisa de DSN para habilitar monitoramento de erros em produção.
- Recorrência de tarefas configurável — depende de um calendário de obrigações fiscais a ser definido.
- Bump do Next.js — fecha as 7 vulnerabilidades restantes do `npm audit`, mas é major/risco de quebra.
- TTL de documentos/coleções — precisa configuração no console do Firebase.
- Rotação de uma senha de admin que vazou no histórico do git (rotação manual, fora do código — valor não reproduzido aqui de propósito).
- **Monitorar o perfil `financeiro` em produção pós-deploy das rules (2026-07-07):** risco identificado de regressão de leitura em `clientes_fiscal`/`clientes_fiscal_integracao` se algum `usuarios/{uid}` não tiver o array `telas` (usuários criados via `seed.ts` não gravam esse campo). O dono decidiu deployar mesmo assim; falta ainda adicionar `financeiro` em `canReadFiscalConfig()` (ou confirmar que todo `financeiro` ativo tem `telas`), cobrir com teste, e colocar `.catch` nos dois `Promise.all` sem tratamento (`clientes/[id]/fiscal/page-client.tsx`, `features/fiscal/services.ts`) para que uma leitura negada não deixe a tela em branco sem aviso.

- **Cadastro em massa dos clientes na Spedy** — hoje é manual (colar a chave de API por cliente, e criar a empresa direto no painel do Stage). A Spedy suporta uma hierarquia Owner/empresas-secundárias (`POST /v1/companies`) que permite automatizar isso pros 119 clientes de uma vez — inclusive **obrigatório** pro ambiente de teste, já que lá (arquitetura "API-First") não dá pra cadastrar empresa nem certificado pelo painel, só via API. Dono confirmou que quer migrar todos os 119 pra Spedy, ambiente Stage primeiro. **Achado que bloqueia começar a construir**, lendo o guia oficial da Spedy: (1) certificado A1 é obrigatório mesmo em Sandbox — hoje só o JPProject (empresa cobaia) tem certificado carregado no sistema, os outros 118 não; (2) o plano "Desenvolvedor Grátis" lista "limite de empresas" e cobra "custo por empresa adicional" — número exato e custo não confirmados. Dono decidiu esperar resolver essas duas coisas (coletar certificados, confirmar limite/custo com a Spedy) antes de eu construir a function de provisionamento.
- **Catálogo de Tipos de Serviço** — os 7 registros atuais (`COB01`-`COB07`) são dados de teste (todos "Contabilidade Mensal", só o valor muda). Dono confirmou que são teste e pediu um catálogo real (proposta já apresentada: Contabilidade Mensal, Departamento Pessoal, IR PF, Abertura/Alteração/Baixa de Empresa, Consultoria Tributária) — decidiu esperar a planilha de importação voltar preenchida antes de ajustar.
- **Envio automático de NFS-e pro tomador** — não existe hoje (só a Spedy manda, e só se configurada, delegado pra ela). Nenhum conector (nem Spedy) devolve PDF da nota, só XML. Cenário proposto (aguardando decisão): e-mail com dados da nota + XML anexado, disparado quando `processarEmissao` retornar sucesso — depende do SMTP acima estar configurado e de dar suporte a anexo em `sendEmail` (não tem hoje).
- **Editor da régua de cobrança WhatsApp** — a régua (7/3/0/-3/-7 dias) já roda automaticamente, mas os valores só existem como dado no Firestore (`whatsapp_campaign_rules`); não há tela pra editar. Também vale confirmar que o token da Cloud API está de fato configurado (o agendamento enfileira job mesmo desligado; só falha, com retry, na hora de despachar).

### Gaps conhecidos (backlog, não bloqueiam)
- A checagem de "sem tarefas abertas" para concluir competência só existe no client — Firestore rules não faz query em coleção, só valida documento por path. Fechar de vez exige uma Cloud Function (o trigger `functions/src/triggers/tarefa-concluida.ts` já tem a lógica de referência e pode ser reaproveitado).
- Sidebar deveria ser "sempre escura" conforme `docs/design-system`, mas hoje só acompanha o tema (`bg-card`) — os tokens `--sidebar-*` existem no CSS mas nenhum componente os usa. Desvio pré-existente, não causado pelo dark mode.
- Consulta e cancelamento de NFS-e via Spedy não implementados (só emissão).

---

## [Lote 11] — 2026-07-07 (commits `5403f94`, `839b9ab`)
### Corrigido
- **Painel/"Hoje" quebrado com "Não foi possível carregar o painel"** — voltou a acontecer mesmo já tendo sido "corrigido" antes nesta mesma sessão. Causa real: a auto-injeção de `tenantId` em `listDocuments()` (`src/lib/firestore-client.ts`) só passou a valer com a ativação de RBAC, e os índices compostos com `tenantId` na frente para `tarefas`, `competencias` e `fechamentos` nunca existiam. Adicionados e deployados.
- **E-mail de alerta diário (`enviarAlertasDiarios`) falhando 100% das vezes, todo dia, desde pelo menos 2026-07-02** — confirmado via `firebase functions:log`: `Error: 9 FAILED_PRECONDITION` na consulta de "lançamentos atrasados" (`status == pendente` + `dataVencimento < hoje` + `orderBy(dataVencimento, asc)`). Só existia o índice `status ASC + dataVencimento DESC` (direção errada pro `orderBy asc` desta query específica). Índice `status ASC + dataVencimento ASC` adicionado. **Consequência direta:** as duas melhorias do Lote 10 que dependem deste e-mail (recuperação automática de rascunho travado em `processando`, seção "rascunhos gerados automaticamente hoje") nunca chegaram a rodar de fato em produção, apesar de deployadas — só passam a funcionar a partir desta correção.

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
