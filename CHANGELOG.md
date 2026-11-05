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

### Adicionado — relatório da ficha completa dos clientes ativos (2026-11-05)
- Clientes → **"Ficha completa (Excel)"** baixa um relatório de TODOS os clientes ativos (não só a página/filtro): aba **Clientes ativos** com cada campo da ficha + "Preenchidos", "% completo" e "Campos em branco" (por nome); aba **Resumo por campo** (quantos preenchidos × em branco); aba **Fiscal NFS-e** (município, se emite pelo Ambiente Nacional, inscrição municipal, regime, certificado A1, ambiente). Senhas aparecem como "✔ preenchida"; **administrador** pode baixar "Com senhas visíveis" (confirmação + registro `exportacao_sensivel` no log de auditoria, arquivo com sufixo `-COM-SENHAS`). `src/lib/clientes-relatorio.ts`, testado.

### Alterado — planilha de importação = ficha de cadastro do cliente (2026-11-05)
- A planilha passa a ter todos os campos da ficha de cadastro (78 de 79 → todos os não sigilosos): dados completos do representante (CNH, órgão emissor, data de emissão, naturalidade, pai/mãe, PIS, título, escolaridade, formação, comunhão de bens, endereço), WhatsApp e contato preferencial do financeiro, e aceite de cobrança por WhatsApp (sim/não — a importação grava data e origem "Planilha de cadastro", como a ficha).
- Inclui também logins e senhas da ficha (prefeitura, posto fiscal, PIN do certificado, Meu Gov, e-CAC), a pedido do dono, para o cliente preencher tudo numa planilha só. Nos **exemplos**, credencial nunca sai com valor — só "✔ preenchida na plataforma"; documentos pessoais do representante saem mascarados. As instruções alertam para enviar/receber o arquivo preenchido por canal protegido.
- ⚠ **Risco pré-existente registrado:** a ficha grava essas senhas em texto puro no documento do cliente, legível por qualquer usuário ativo (inclusive perfil "leitura"); só o log de auditoria as oculta. Recomendado: cifrar no servidor (como as credenciais fiscais) e restringir a leitura.
- `.serena/` (config local de ferramenta) saiu do repositório.

### Alterado — modelo de importação de clientes com exemplos reais (2026-11-05)
- "Baixar modelo com exemplos (Excel)" em Clientes → Importar gera a planilha com os dados do próprio escritório: abas **Clientes** e **Serviços** vazias (prontas para importar), **Exemplo – Clientes** e **Exemplo – Serviços** com os 3 clientes de cadastro mais completo (no formato aceito pela importação; CPF/RG/nascimento do responsável mascarados) e **Tipos de Serviço** com os códigos válidos. As abas de exemplo não são importadas. Antes, o modelo trazia um exemplo inventado na própria aba Clientes. Se a leitura falhar, baixa o modelo em branco.

### Corrigido — DPS recusada na produção com E1235 (2026-11-05)
- A primeira emissão real falhou: a DPS ia com `finNFSe` direto em `infDPS`, campo do leiaute da NT 009 que só vigora na **produção restrita**. O XSD oficial de **produção** (`v1.01-20260209`) não o tem ali. Agora `finNFSe` só sai com tpAmb=2. A DPS e o pedido de cancelamento de produção foram validados offline contra os schemas oficiais de produção (guardados em `scripts/poc-nfse-nacional/schemas-producao/`). Nenhuma nota foi gerada na tentativa recusada.

### Alterado — emissão só pelo Ambiente Nacional (2026-11-05, decisão do dono)
- O escritório não opera conectores de prefeitura: a configuração fiscal não oferece mais "Conector da prefeitura (legado)" e sempre grava `provedorNfse: 'nacional'`. Cliente de município que não aderiu ao Emissor Nacional recebe aviso para emitir no portal da prefeitura, fora da plataforma.
- `scripts/atualizar-convenios-nfse` convertido para ESM (`.mjs`) — o `.cjs` quebrava o lint (`no-require-imports`).

### Adicionado — mapa de convênios NFS-e de todos os municípios (2026-11-05)
- Consulta na **produção** do Sistema Nacional dos 5.571 municípios: 3.469 emitem pelo Emissor Nacional, 2.076 só compartilham dados (emissão no sistema da prefeitura), 26 sem convênio. Lista em `docs/nfse-nacional-convenios-2026-11-05.csv`; mapa em `src/lib/nfse-nacional-convenios.json` com `situacaoNacional()`; script `scripts/atualizar-convenios-nfse.mjs` para atualizar.
- Emissão avisa ao escolher o cliente (em Produção) quando o município não emite pelo Nacional; prontidão mostra "Município não emite pelo Ambiente Nacional".
- Prontidão deixava de fora a chave única: marcava "Município não liberado para produção" para todo cliente nacional em produção. Agora essa regra vale só para o conector da prefeitura.
- Correção de diagnóstico: Cajamar **emite** pelo Nacional em produção (o "sem convênio" anterior era só do ambiente de testes).

### Alterado — emissão pelo Ambiente Nacional sem passos manuais (2026-11-05)
- **Chave única "Ambiente Nacional — produção liberada"** em Administração → Conectores (`configuracoes/nfse_nacional`, só admin grava; confirmação ao ligar). Substitui a liberação município a município para o Nacional: ligada, clientes em Produção emitem em qualquer município aderente (o convênio continua conferido a cada emissão); desligada, nada sai em produção. O botão "Adicionar ao Ambiente Nacional" por município saiu.
- **Clientes da Spedy emitem pelo Nacional automaticamente** (sem reabrir e salvar a configuração); sai o bloqueio "Spedy descontinuada".
- **"Emitir por"** recolhido em "opções avançadas" na configuração fiscal — Nacional é sempre o padrão.
- Emissão avisa logo na escolha do cliente quando ele está em Produção e a chave do Nacional está desligada.
- Doc da chave ausente (antes da primeira liberação) não derruba a tela: conta como desligado.

### Adicionado — competência da nota e homologação do Ambiente Nacional (2026-11-05)
- **Competência vinculada vira a competência da NFS-e nacional** (`dCompet`): honorário de outubro emitido em novembro sai com competência de outubro (1º dia do mês). Sem vínculo, usa a data de emissão; nunca passa dela (regra da Sefin). `functions/src/nfse/nacional/competencia.ts`, testado.
- **Admin → Conectores:** botão "Adicionar ao Ambiente Nacional" cria o conector nacional do município (separado do da prefeitura, nasce bloqueado) e cada linha mostra o caminho (Ambiente Nacional / Prefeitura). É por ele que o admin marca "homologado" e libera a produção do Nacional.
- **Homologação do Ambiente Nacional concluída na produção restrita** com a ARTE & PRIME (São Paulo): o conector da plataforma emitiu, consultou e cancelou uma NFS-e. Ver o radar.

### Alterado — emissão pelo Ambiente Nacional como padrão de todos (2026-11-05)
- Só `provedorNfse: 'prefeitura'` (escolha explícita, opção "Conector da prefeitura (legado)") usa o webservice municipal. O valor `'municipio'` que o formulário antigo gravava à força em todo cliente passa a ir pelo **Ambiente Nacional**, como o dono decidiu — sem precisar reabrir cliente por cliente. Município sem convênio nacional (ex.: Cajamar) é recusado com mensagem clara, sem cair para a prefeitura.
- Teste real do conector na produção restrita registrado no radar: bloqueio de Cajamar ✔; em São Paulo passou convênio, código e alíquota e parou em E0084 (prestador sem estabelecimento em SP), o esperado para o certificado de teste. Traduções de E0312 (serviço não vigente na competência) e E0084 corrigidas. **Exige homologação** com cliente estabelecido em município aderente.

### Adicionado — emissão de NFS-e pelo Ambiente Nacional (Sefin Nacional/ADN) (2026-11-05) — **Exige homologação**
- **Novo provedor padrão `nacional`** (`functions/src/nfse/provedores/nacional.ts`): emite, consulta e cancela direto na API pública do governo, **sem integrador**, com mTLS e assinatura pelo certificado A1 do próprio prestador. `ambienteEmissao: 'homologacao'` só alcança a produção restrita (tpAmb=2); `'producao'` só alcança `sefin.nfse.gov.br`/`adn.nfse.gov.br` (tpAmb=1) e continua exigindo a liberação de produção (`producaoLiberada`).
- **Município sem convênio falha com mensagem clara**, sem cair na prefeitura: consulta `ADN /parametrizacao/{ibge}/convenio` antes de enviar (ex.: "Cajamar ainda não aderiu ao Emissor Nacional — não é possível emitir pelo Ambiente Nacional para este município."); E0037 da Sefin tem a mesma tradução. Códigos de rejeição comuns (E0008, E0312, E0315, E0712, E0718, E12xx…) traduzidos para pt-BR, com o código original em `codigoErro`.
- **Fonte única do leiaute:** montadores da DPS/evento e a trava de hosts saíram de `scripts/poc-nfse-nacional/lib/` para `functions/src/nfse/nacional/` (`dps.ts`, `ambiente.ts`), agora parametrizados por ambiente; o CLI da PoC importa de lá e continua travado na produção restrita. Mapeamento puro em `nacional/mapeamento.ts` (regime → opSimpNac/regApTribSN/regEspTrib, LC 116 → cTribNac, ISS retido → tpRetISSQN, tomador CPF/CNPJ).
- **Numeração sequencial da DPS** por CNPJ + ambiente + série (`dps_sequencias`, transação junto com o rascunho), no lugar do `Date.now()` para o provedor nacional; o número fica gravado no rascunho antes do envio e o retry reusa — a consulta prévia do retry procura a DPS (`GET /dps/{id}`). Coleção negada ao navegador nas `firestore.rules`.
- **Configuração fiscal:** seletor "Emitir por" — **Ambiente Nacional (padrão)** ou **Conector da prefeitura (legado)**; config sem provedor = nacional; Spedy migra para nacional ao salvar. Campos novos opcionais: código de tributação nacional, desdobro municipal (cTribMun), série da DPS, alíquota efetiva do Simples. A1 obrigatório no nacional (prontidão e emissão bloqueiam sem A1 válido). Resumo da emissão mostra o provedor.
- `fiscal_conectores` passa a distinguir o caminho homologado (`provedor: 'nacional'`; doc sem o campo = conector da prefeitura): homologar a prefeitura não libera produção no nacional.
- Configs já salvas com `provedorNfse: 'municipio'` (todas as salvas pelo formulário até hoje) **continuam no conector da prefeitura** até alguém trocar no formulário.
- Para validar ponta a ponta sem Firebase: `NFSE_PFX=… NFSE_PFX_SENHA=… npm run poc:nfse:conector -- --dados nota.json --consultar` (só produção restrita). Premissas a confirmar listadas em `docs/RADAR-NFSE-NACIONAL-2026-11-05.md`.

### Corrigido — acentos nas respostas das prefeituras (2026-11-05)
- `soapCall` lia toda resposta como UTF-8; prefeituras que respondem em ISO-8859-1 (ex.: Cajamar) apareciam como "Usu\uFFFDrio n\uFFFDo liberado". Agora o charset vem do Content-Type ou da declaração XML, com fallback para latin1 (`decodificarResposta`, testado). Vale para todos os conectores SOAP.
- Registrado: em Cajamar a emissão pela plataforma usa o webservice da prefeitura (o convênio nacional de Cajamar não está ativo — E0037 na PoC) e exige a empresa **liberada para uso do Web Service** na prefeitura (erro código 8).

### Corrigido — aviso da Spedy só no último clique (2026-11-05)
- Cliente ainda configurado com a Spedy (descontinuada) só descobria o problema no erro do backend, depois das 5 etapas da emissão. Agora a emissão mostra o bloqueio assim que o cliente é escolhido (com link para a configuração fiscal) e o botão "Emitir" fica desabilitado; o mesmo vale para cliente sem configuração fiscal. A prontidão em /fiscal lista "Configurado com a Spedy" em primeiro lugar.
- O resumo da emissão mostra o **ambiente real** (Homologação ou Produção — esta em vermelho, "a nota sai de verdade") em vez de um texto genérico.
- Valores no resumo e no diálogo de confirmação saíam como "R$ 20.00"; agora no padrão brasileiro (R$ 20,00).

### Alterado — seletor de cliente e tomador da NFS-e (2026-11-05)
- **Seletor de cliente com busca** (`ClientePicker`): a lista ficava presa na largura do botão, cortando os nomes, e não tinha filtro com 100+ clientes. Agora busca por razão social, nome fantasia ou CNPJ (com ou sem pontuação, sem diferenciar acento), mostra o nome inteiro com CNPJ e fantasia abaixo. Aplicado em Emitir NFS-e, Tarefa, Lançamento, Competência, IR e nos filtros de Histórico de NFS-e e Produtos.
- **Tomador deixa de ser preenchido com o próprio cliente.** Desde a primeira versão do módulo, escolher o cliente copiava os dados DELE para o tomador — a nota saía para o próprio CNPJ se ninguém corrigisse. Agora o tomador vem vazio e pode ser escolhido da carteira de tomadores do cliente (preenche nome, CPF/CNPJ e e-mail). **Exige atenção na homologação.**

### Corrigido — códigos IBGE errados (2026-11-05)
- **Cajamar estava como 3508900 (que é Caiabu) e Taboão da Serra como 3552502 (que é Suzano)** no formulário fiscal, no roteador de conectores, na prontidão e nos scripts de cadastro. Cliente configurado pelo "Buscar dados do CNPJ" (código certo da Receita) caía em "município sem conector"; escolhido na lista, o XML ia à prefeitura com o código de outro município. Corrigido para 3509205 e 3552809; configs e conectores já gravados com o código antigo são normalizados na leitura (`IBGE_LEGADO` em `functions/src/nfse/types.ts` e `src/lib/ibge.ts`), sem migração de dados. **Exige homologação** em Cajamar e Taboão.

### Alterado — coerência de UI/UX (2026-11-05, revisão visual de 39 telas)
- **Cabeçalho único:** todas as telas usam `PageHeader`, com um `<h1>` só e breadcrumbs no lugar dos três estilos de "Voltar". No celular, título e descrição ficam acima das ações e nada vaza para o lado (antes, /hoje e /clientes perdiam o título e cortavam botões).
- **Botões:** um tamanho de CTA (`size: 'cta'`) para a ação principal e as secundárias; "+ Novo" do topo na cor primária; rótulos em sentence case; ~27 `Link` envolvendo `Button` viraram `Link` com `buttonVariants`.
- **Nomes:** o mesmo nome em menu, busca rápida (⌘K) e título (Painel, Emitir NFS-e, Histórico de NFS-e, Administração…); a busca rápida passou a cobrir todos os destinos do menu. `layout/header.tsx` (morto) removido.
- **Status:** uma só regra de cor (`src/lib/status-semantics.ts` + `status-badge.tsx`) no lugar de ~17 mapas locais — verde concluído/pago/emitida, âmbar pendente, azul em andamento, vermelho erro/atraso, cinza cancelado.
- **Erro não vira vazio:** listas mostram erro com "Tentar novamente"; detalhe e edição mostram "não encontrado"/"erro" (`RecordUnavailable`) em vez de página em branco ou carregamento eterno; o Painel não mostra mais "internal [0]".
- **Fechamento coerente:** uma definição de pendência para banner, KPIs, cartões e tabela; KPIs somam o total.
- **Prontidão fiscal** com bloqueios em frases curtas e acentuadas.
- **Textos:** varredura de acentos nas mensagens (12× "Nao foi possivel", /hoje, bloqueios fiscais).
- **Formulários:** `CurrencyInput` (R$ no padrão brasileiro, sem mudar com o scroll) em lançamento, NFS-e, produto, serviço, contrato e recorrência; obrigatórios marcados só com `Label required`.
- **Tabelas e celular:** cartões abaixo de `md` em Financeiro, Histórico, Conectores, Fechamento e Fiscal; /clientes em uma linha por cliente; KPIs em 2 colunas no celular; linhas de Tarefas com altura igual.
- **Pendente:** o Painel lê `dashboard_kpis/{id}`, criado pela rotina `recalcularDashboardKpis`; antes da primeira execução (ambiente novo) a regra `sameTenantExisting()` nega a leitura do documento inexistente e a tela mostra erro em vez de "ainda sem dados".
- **Mensalidade:** /clientes (e o PDF) mostra o mesmo valor da Carteira — MRR dos contratos vigentes —, caindo para `cliente.mensalidade` só sem contrato.

### Adicionado
- **PoC da NFS-e pelo Ambiente Nacional** (`scripts/poc-nfse-nacional/`, `npm run poc:nfse`): consulta de convênio e parâmetros, emissão, consulta, cancelamento e DANFSe, travado na produção restrita e sem integrador; DPS validada nos XSD oficiais. Aguarda o A1 de um cliente piloto — ver o README da pasta. `signer.ts` ganhou a opção `posicao: 'after'` (padrão ABRASF inalterado).
- **Revisão local com emuladores** (`scripts/seed-emulador.mjs`, `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1`): dados fictícios para conferir telas sem tocar em produção.

### Removido — Spedy e qualquer integrador (2026-11-05, decisão do dono)
- **Spedy fora do código.** A conta foi encerrada e a decisão é não usar integrador nenhum: a emissão é direta (conector da prefeitura hoje; Ambiente Nacional em avaliação). Saíram o conector (`provedores/spedy.ts`, `spedy-evento.ts`), webhook, provisionamento, envio de certificado, a NF-e de produto (`emitir-produto.ts`, `idempotencia.ts`, tela `/fiscal/emitir-nfe` e o modal) e o script de cadastro do webhook. Clientes ainda gravados com `provedorNfse: 'spedy'` recebem `PROVEDOR_DESCONTINUADO` com instrução, e salvar a Configuração Fiscal migra para o conector do município. O catálogo `/fiscal/produtos` fica, com aviso de que a plataforma não emite NF-e.
- **Destrava o deploy:** o secret `SPEDY_WEBHOOK_SECRET` deixou de ser exigido. O deploy de functions remove `emitirNfeProduto` e `enviarCertificadoSpedy` de produção (ver `docs/DEPLOY-2026-08-03.md`).
- **⚠ IBS/CBS:** o único lugar que montava o grupo da reforma era o conector da Spedy — com ele saiu também. Nenhum conector municipal o preenche; o caminho para isso é o Ambiente Nacional.

### Corrigido — auditoria de 2026-11-05 (branch `correcoes/auditoria-2026-11-05`, sobre a `p0-piloto`)
- **Lote de NFS-e duplicava nota em retry.** `emitirNfseLote` tinha um caminho próprio que não reservava nem gravava o RPS (o conector inventava o número e `nfse_emitidas` saía sem `numeroRps`), então a consulta prévia do retry nunca achava a nota. Agora cada item passa por `processarEmissao`, o mesmo caminho da emissão unitária. **Exige homologação.**
- **Rascunho preso em `processando`.** Qualquer exceção depois da transação de RPS (config ausente, payload inválido, certificado, exceção do conector) deixava o rascunho travado até o alerta diário. `processarEmissao` agora devolve o rascunho para `erro_integracao` mantendo o RPS alocado, para o retry reusar o mesmo número.
- ~~NF-e de produto sem idempotência~~ — corrigido e depois removido junto com a Spedy (ver "Removido" acima).
- **Trava de produção contornável.** O perfil fiscal podia gravar `producaoLiberada: true` em `clientes_fiscal` pelo SDK. O campo entrou em `camposFiscalDoServidor()`; nenhuma tela o grava.
- **Perfil fiscal via telas que não conseguia salvar.** `PERFIL_DEFAULT_TELAS` dá tarefas, competências, IR e fechamento ao fiscal, mas as regras exigiam operacional. Nova `isEquipeContabil()` (admin/operacional/fiscal) nas escritas dessas coleções; exclusões continuam restritas. 3 testes de regra novos (70 passando no emulador).
- **Frontend:** relatórios (`/relatorios/carteira` e `/produtividade`) e `/servicos` passaram a ser checados pelo `AuthGuard`; login volta para a tela que o usuário tentou abrir (`?from=`); logout limpa o cache do React Query e de usuários (antes o próximo login na mesma aba via dados do anterior); ator de auditoria sem `tenantId` não fica mais em cache; kanban e edição de prazo no `/hoje` gravavam o dia seguinte depois das 21h (UTC) — agora data local ao meio-dia; formulários de tarefa, competência, lançamento e IR invalidam as listas ao salvar; editar registro de cliente inativo não apaga mais `clienteNome`/`responsavelNome`; baixa pela Fila de Cobrança passa o valor e volta a pedir confirmação acima de R$ 500; "Encerrar revisão" do fechamento fica bloqueado com filtro de regime (gravava snapshot parcial para o mês inteiro); `/tarefas/nova?clienteId=` pré-seleciona o cliente.

### Segurança
- `next` 16.2.2 → 16.4.5 (vulnerabilidades críticas). `xlsx` 0.18.5 (CVE-2023-30533, usado para ler planilhas enviadas pelo usuário) → 0.20.3 do CDN oficial da SheetJS, que parou de publicar no npm. `firebase` 12.11 → 12.19. Functions: `nodemailer` 6 → 10. Sobram 4 "high" em `@grpc/grpc-js` dentro do SDK web (falhas de TLS do lado servidor do gRPC, sem correção publicada) e moderadas que exigem `firebase-admin` 13.
- `eslint-plugin-react-hooks` fixado em 7.0.1 via `overrides`: a 7.1.1 traz `set-state-in-effect`, que acusa 12 pontos antigos — adotar a regra fica como débito.

### Alterado
- `playwright.config.ts` sobe o dev server sozinho (`webServer`, porta via `E2E_PORT`) e `e2e/auth.spec.ts` foi atualizado (login vai para `/hoje`, sidebar no lugar da topnav). Rodar com as chaves públicas: `set -a; . ./.env.production; set +a; E2E_PORT=3117 npx playwright test`.
- `/clientes/[id]` gera `placeholder` no `generateStaticParams`, como as demais rotas: o Next 16.4 recusa lista vazia com `output: 'export'`.

### Pendente — exige decisão do dono
- **Numeração de RPS** continua `Date.now()` (8 dígitos, repete a cada ~28 h, não sequencial). Trocar por contador transacional por prestador+série precisa do último RPS usado em cada município — fica para a homologação.
- **NFS-e pelo Ambiente Nacional** — ver `docs/RADAR-NFSE-NACIONAL-2026-11-05.md`.

### Alterado
- **Spedy deixa de ser o provedor padrão de NFS-e (2026-09-10).** O dono encerrou a conta na Spedy (atendimento e problema comercial de cobrança). O formulário de Configuração Fiscal (`config-fiscal-form.tsx`) nascia com `provedorNfse: 'spedy'` em quatro pontos — default do `useForm`, `reset` do `useEffect`, fallback do `watch` e fallback do payload de submit — enquanto o próprio seletor já rotulava "Conector direto do município (padrão)". Qualquer cliente fiscal configurado a partir de agora apontaria para uma conta inexistente e falharia na autenticação, sem mensagem que explicasse a causa. Padrão trocado para `'municipio'` nos quatro pontos; a opção Spedy continua no seletor (agora rotulada "sem conta ativa") com aviso explícito no texto de ajuda. **Nenhum código da Spedy foi removido** — as ~2.400 linhas do conector, webhook, provisionamento e certificado ficam em repouso até a decisão sobre o provedor definitivo. `tsc`, `eslint` e os 230 testes limpos.
- **⚠ A saída da Spedy reabre a reforma tributária, e agora com prazo curto.** O `buildIbsCbs` do commit `5e8e36c` vive em `provedores/spedy.ts` — **só o conector da Spedy monta o grupo IBS/CBS**. Nenhum dos 8 conectores municipais preenche esses campos (o `<gIBSCBS>` de `taboao-serra.ts` é esqueleto do layout ABRASF, com as tags vazias). Pelo cronograma do Ato Conjunto RFB/CGIBS nº 4 registrado em `4d4001c`, NFS-e de serviços em geral entra em **01/10/2026** para Regime Normal — o Simples só em 2027. Ou seja: o trabalho da reforma que estava pronto saiu junto com o provedor, e precisa ser refeito no caminho que sobrar antes de outubro.
- **Consequência a tratar quando houver deploy de Functions:** `municipios/router.ts` ainda desvia para o `SpedyConector` quando `config.provedorNfse === 'spedy'`, então os clientes **já gravados** com Spedy continuam roteando para lá e vão falhar com erro de credencial em vez de uma mensagem clara. Corrigir junto do próximo deploy de backend (hoje travado pelo secret `SPEDY_WEBHOOK_SECRET`, que com a saída da Spedy pode simplesmente sair da superfície de deploy, igual ao bloco do WhatsApp).

### Adicionado
- **Rascunho dos 6 templates de WhatsApp para a Twilio** (`docs/TEMPLATES-WHATSAPP-TWILIO.md`) — corpo + rodapé de cada template da régua de cobrança (D-7, D-3, D0, D+3, D+7 e confirmação de baixa), prontos pra colar no Content Template Builder da Twilio e submeter à aprovação da Meta. **Cadastro e submissão exigem o dono** (sem credenciais Twilio nesta sessão); depois de aprovados, faltam só os 6 `Content SID` pra preencher o catálogo. `cobranca_baixa_confirmada` ainda não tem nenhum gatilho no código (aprovar já não custa nada, mas o disparo automático fica pra depois).
- **Emissão de NF-e (produto, modelo 55) via Spedy — ponta a ponta (2026-07-14).** Conector (`SpedyConector.emitirProduto`/`emitirConsumidor` + builders de item com ICMS/ST/IPI/PIS/COFINS, `functions/src/nfse/provedores/spedy.ts`), callable `emitirNfeProduto` (`functions/src/nfse/emitir-produto.ts`, com trava de produção via `producaoLiberada`), catálogo de produtos (`src/features/produtos/*`, `src/components/produtos/*`, tela `/fiscal/produtos`) e tela de emissão `/fiscal/emitir-nfe`. Tipos novos em `functions/src/nfse/types.ts` (`ItemProdutoFiscal`, `EmitirProdutoInput`, `EmitirConsumidorInput`). **DEPLOYADO por completo (backend + hosting, 2026-07-15)** — `/fiscal/emitir-nfe` e `/fiscal/produtos` já acessíveis em produção. **Ainda NÃO validado em homologação real** — totais, agregação de imposto e o payload de item podem precisar de ajuste contra uma emissão real da Spedy. **Exige homologação.**
- **Envio do certificado A1 da plataforma → Spedy** (`enviarCertificadoSpedy` + `SpedyConector.subirCertificado`, `functions/src/nfse/spedy-certificado.ts`) — o "cofre único": lê o A1 já guardado (Storage cifrado), descriptografa a senha e faz `POST /companies/{id}/certificates` (multipart) com a chave da própria empresa; o certificado nunca passa pelo navegador. **DEPLOYADO (2026-07-15)**. Pré-requisito: `spedyCompanyId` (do provisionamento) + `spedyApiKey` + certificado carregado. Nomes dos campos multipart (`file`/`password`) e o uso da chave da empresa (vs Owner) **a confirmar em homologação**.
- **Provisionamento em massa na Spedy** (`functions/src/nfse/provisionar-spedy.ts`, `provisionarEmpresasSpedy`) — dry-run por padrão, admin-only, `POST /v1/companies`. **DEFERIDO** (export comentado no `index.ts`): declara o secret `SPEDY_OWNER_API_KEY` localmente pra não travar o deploy enquanto pausado. Reativar quando for provisionar os 119.
- **Scripts de enriquecimento por CNPJ + planilha de preenchimento do contador (2026-07-14).** `scripts/exportar-clientes-cnpj.mjs` e `scripts/exportar-clientes-completo.mjs` (só-leitura; consultam a BrasilAPI e **removem toda senha/credencial** antes de gravar) geram o de-para dos 119 clientes; um gerador XLSX (scratchpad, `exceljs`) monta planilha colorida de 9 abas — uma por tela de cadastro — com verde = veio do CNPJ, azul = preencher manual, branco = já na plataforma, vermelho = irregular na Receita. Entregue ao dono em `~/Desktop/clientes-preenchimento.xlsx`. Os arquivos de dados gerados (`scripts/clientes-*.csv/json`, com PII) ficam fora do git.
- **Predeploy hooks no `firebase.json`** — `functions` e `hosting` rodam `npm run build` antes do deploy, evitando subir `lib/` desatualizado (Functions) ou `out/` velho (Hosting).
- **Spedy como provedor de emissão padrão** — `config-fiscal-form.tsx` passa a usar `provedorNfse: 'spedy'` por default; regras Firestore adicionadas para a coleção `produtos`.
- **Manual do usuário publicado em `/manual`** (`public/manual.html`, deploy já feito) — guia tela a tela das 14 telas principais (Hoje, Painel, Clientes, Tarefas, Competências, Fechamento, Emissão/Histórico NFS-e, IR, Financeiro, Produtividade, Configurações), escrito a partir de navegação real na plataforma em 2026-07-07. Documenta também 2 achados ao vivo: Cloud API do WhatsApp desligada nos Parâmetros, e erro de permissão na tela de Produtividade mesmo como Admin. Ainda sem screenshots — pendente adicionar quando o dono mandar prints manualmente.
- **Importação em massa de Clientes** (`/clientes/importar`, botão "Importar" na listagem) — sobe um único `.xlsx` (abas Clientes + Serviços, template baixável na própria tela via `gerarTemplateClientesXlsx`), valida linha a linha (CPF/CNPJ com dígito verificador, duplicidade, cliente já cadastrado, código de serviço existente) e mostra preview antes de gravar qualquer coisa. Escopo deliberadamente restrito a dados cadastrais — nenhum campo de credencial fiscal (senha de prefeitura, certificado, Meu Gov, e-CAC) entra na planilha, essas continuam só na tela individual do cliente. Vínculo de serviço é feito por **código** (`COB04`), não por nome — necessário porque o catálogo de Tipos de Serviço pode ter vários itens com o mesmo nome e valores diferentes. Testado em produção: template gerado corretamente, tela renderiza e valida; o passo final de gravação (criar clientes/serviços de verdade) ainda não foi exercitado com escrita real.

### Corrigido
- **A plataforma inteira ficava lenta e o Financeiro nunca saía do "carregando" (2026-07-31, DEPLOYADO — hosting, commit `c3bbe5e`).** Sintoma relatado pelo dono: plataforma "muito lenta, muito fraca", com a tela `/financeiro` presa no skeleton sem nunca mostrar lançamento. Causa: `src/components/layout/app-sidebar.tsx` marcava `prefetch` (busca completa) em ~20 `<Link>` da navegação. O Next dispara esse prefetch quando o item **entra no viewport**, não no hover — e como a sidebar inteira aparece de uma vez, toda navegação virava uma rajada de ~20 downloads simultâneos, de 111 KB a 600 KB cada, competindo por banda e conexão com a busca de dados da tela que o usuário estava de fato olhando. Diagnóstico ao vivo: abrir o site travava a aba por 30s e o log de rede mostrava dezenas de HEAD voltando **503**, enquanto o mesmo HEAD isolado via `curl` respondia **200** — ou seja, quebrava o volume simultâneo, não a rota. Corrigido trocando para prefetch em `onMouseEnter` via `router.prefetch(href)`: mantém o ganho original (o chunk chega antes do clique) e dispara um de cada vez, só quando existe intenção real de navegar. **Verificado ao vivo depois do deploy:** `/financeiro` carrega completa (KPIs, aging, top inadimplentes, fila de cobrança, tabela), a aba responde na hora, e uma navegação gera **zero HEAD e zero 503**.
- **Login local quebrado por raiz de workspace errada (2026-07-31, commit `c3bbe5e`, NÃO VALIDADO).** `next.config.ts` ganhou `turbopack: { root: __dirname }`. A pasta pai (`JPHub/ttrdcontabil/`) tem `node_modules/`, `src/` e um `package-lock.json` soltos, resíduo de estrutura antiga, e o Turbopack inferia a raiz do workspace ali, montando o app com a árvore de módulos errada. O sintoma não parecia de build: em `npm run dev` o formulário de login não hidratava, o clique em "Entrar no painel" virava um GET nativo e a senha ia parar na query string (`/login?email=...&senha=...`), sem nunca chamar o Firebase Auth. Só afetava dev; produção nunca teve o problema. **Pendente:** ninguém rodou `npm run dev` pra confirmar que resolveu, nem a suíte Playwright que dependia do login. Cuidado ao validar — foi testar isso que travou a máquina do dono por consumo de memória; usar timeout curto e explícito.
- **Histórico de Emissões unificado (NFS-e + NF-e), filtro do Financeiro reorganizado e bug de destaque no menu lateral (2026-07-15, DEPLOYADO — hosting).** `/fiscal/historico` agora mostra NFS-e e NF-e juntas (já viviam na mesma coleção, só faltava a UI diferenciar), com filtro por tipo de documento, busca por nº e seletor de cliente; heatmap anual virou colapsável (ocupava muito espaço pra pouca informação). Financeiro: filtros de Tipo e Status ganharam rótulo e divisor visual — antes eram 9 botões numa fileira só, sem indicar que eram duas dimensões diferentes. Sidebar: corrigido bug em que "Emissão NFS-e" ficava marcado como ativo em qualquer subtela fiscal (`/fiscal/produtos`, `/fiscal/historico` etc.) porque `/fiscal` é prefixo de todas — `isActive()` agora escolhe só o item mais específico. Commit `ea83ebb`.
- **Listagem de Clientes: paginação quebrada e busca/filtro que não funcionavam de verdade (2026-07-15).** A tela só mostrava 20 de 119 clientes por página; o filtro de regime tributário era aplicado só sobre a página já cortada, então clientes de outras páginas nunca apareciam mesmo batendo com o filtro; e a busca por texto sem dígitos nunca filtrava — `documento = busca.replace(/\D/g, '')` virava `''` e `''.includes('')` é sempre `true` em JS, então a condição de match por CNPJ sempre batia e anulava (via OR) o filtro por nome. Paginação removida (lista renderiza tudo de uma vez, cliente-side), filtro de regime corrigido e busca corrigida. Validado ao vivo: lista completa (119), filtro "MEI" (14 corretos), busca "acai" (2 corretos). Commit `ef732ae`.
- **Deploy de Functions destravado (2026-07-14)** — dois bloqueios resolvidos: (1) `lib/` desatualizado (`"function found in project but do not exist in local source"`) → predeploy `npm run build` no `firebase.json`; (2) `no value for secret SPEDY_OWNER_API_KEY` → o `defineSecret('SPEDY_OWNER_API_KEY')` saiu de `secrets.ts` (sempre carregado no deploy) e foi pra dentro de `provisionar-spedy.ts` (só carrega quando o export está ativo). Backend deployado com sucesso depois disso.
- **Scroll horizontal na listagem do Financeiro** — a coluna Ações tinha até 7 botões lado a lado, forçando a tabela a `min-w-[1480px]` (maior que a área de conteúdo em telas comuns). Consolidado em timeline + baixar (visíveis) + menu suspenso pro resto (enviar cobrança, pausar/retomar régua, reagendar, histórico, excluir). `min-w` reduzido para 1180px.
- **E-mail de alerta diário funcionando de ponta a ponta pela primeira vez (2026-07-07).** Depois do índice (Lote 11) e do secret SMTP corrigidos, o envio ainda falhava com `535 5.7.8 Authentication Failed` mesmo com usuário/senha corretos e confirmados. Causa raiz real: contas Titan Email (usadas pelo HostGator) vêm com **acesso de terceiros desligado por padrão** — SMTP/IMAP/POP de qualquer aplicativo externo (incluindo um servidor automatizado) é bloqueado até habilitar manualmente em Titan Webmail → Configurações → "Enable Titan on Other Apps" (pré-requisito: 2FA da caixa precisa estar desligado). Não era problema de código, índice, secret nem senha — as três correções anteriores eram necessárias mas não suficientes. Confirmado no log: `Email enviado. Tarefas: 0, Lançamentos: 1...`.

### Segurança
- **Correção crítica em `firestore.rules` (2026-07-14, DEPLOYADA)** — `'telas'` foi adicionado à lista de chaves bloqueadas no auto-update do próprio usuário (`usuarios/{uid}`). Sem isso, qualquer usuário podia se auto-conceder telas no array `telas` e, via `hasTela()`, ganhar leitura de coleções sensíveis (`clientes_fiscal`, `clientes_fiscal_integracao`). Agora `telas` só muda por escrita administrativa.
- **Nenhum dado sensível no git** — os scripts de export de clientes removem senha/token/credencial antes de gravar, e os arquivos de dados (`scripts/clientes-*.csv/json`, com PII dos 119 clientes) entraram no `.gitignore`. A planilha de preenchimento também não carrega senhas (a aba Credenciais é só checklist).
- **`scripts/reset-clientes-lista-cnpj.mjs` removido (2026-07-31, commit `c3bbe5e`).** O script apagava a base inteira de clientes e a recriava a partir de 46 razões sociais e CNPJs reais escritos dentro do próprio arquivo, com `PROJECT_ID` apontando para **produção por padrão**. Estava a um `--write` de destruir os 119 clientes do escritório. O atalho `reset:clientes` saiu do `package.json` junto, e a nota ficou registrada em `docs_dev/documentacao-funcional-tecnica-consolidada.md`.

### Removido
- **Tela `src/app/(dashboard)/premium/page.tsx` (2026-07-31, commit `c3bbe5e`)** — órfã, sem rota de entrada em lugar nenhum da navegação.

### Pendências que exigem decisão do dono
- **Reforma Tributária (IBS/CBS) — a nota de 31/07 estava ERRADA, corrigida em 03/08/2026.** Dizia que a Spedy "não tem campo nenhum de IBS/CBS". Tem, nos dois modelos. A conclusão anterior veio do `api.spedy.com.br/llms.txt`, que está **desatualizado** (zero ocorrências de `ibsCbs`); a fonte válida é `https://api.spedy.com.br/swagger/v1/swagger.json`, onde existem `CreateServiceInvoiceDto.ibsCbs` (NFS-e) e `SefazInvoiceItemIbsCbsDto` (NF-e, por item). **Não havia bloqueio de provedor — não há chamado a abrir.** Estado agora:
  - ✅ **NFS-e transmite** — `ReformaIbsCbs` em `functions/src/nfse/types.ts` (padrão por cliente em `ConfigFiscalCliente.reformaIbsCbs`, override por nota em `Servico.reformaIbsCbs`) e `buildIbsCbs` em `provedores/spedy.ts`. Sem enquadramento configurado o grupo **não** vai no payload — de propósito, pra cair na Regra de Tributação do painel em vez de rejeitar por grupo incompleto. Coberto por `__tests__/lib/reforma-ibs-cbs.test.ts` (11 casos).
  - ⬜ **Painel da Spedy** — Configurações → Geral → "Habilitar campos da Reforma Tributária", depois Tributação → Regra de Nota de Serviço (NBS + CST + Código Indicador de Operação + Classificação Tributária). **Tarefa de configuração/contador, sem programação** — e é o caminho que fecha a conformidade mais rápido, porque vale mesmo sem preencher nada por cliente na plataforma.
  - ⬜ **NF-e de produto** — disponível na Spedy, mas são ~45 campos **por item** (`vIBS`, `pIBSUF`, `pIBSMun`, `pCBS`, monofásico, diferimento, crédito presumido). Trabalho separado, e deve andar junto com o teste em homologação que nunca foi feito.
  - **Alíquotas de transição:** IBS 0,1% / CBS 0,9%, **calculadas pela própria Spedy** — daqui só sai o enquadramento. ISS/PIS/COFINS seguem obrigatórios e inalterados. Segundo a doc da Spedy, nessa fase os valores têm finalidade de **teste operacional, sem arrecadação efetiva** — o risco de não enviar é rejeição da nota, não passivo.
  - **CRONOGRAMA OFICIAL — `Ato Conjunto RFB/CGIBS nº 4, de 30/07/2026`** (publicado 3 dias antes do prazo; é o que desfaz a confusão de "prorrogou / não prorrogou"). Não houve prorrogação geral: o prazo passou a variar **por modelo de documento** e por regime.
    | Data | Modelos |
    |---|---|
    | **03/08/2026** | NF-e, NFC-e, CT-e, MDF-e, NF3e, BP-e, CT-e OS, DC-e, GTV-e, NFS-e Via (pedágio) |
    | **01/10/2026** | **NFS-e (serviços em geral)**, NFCom, DIR, DeRE 1ª fase |
    | **01/12/2026** | NFS-e de plataformas e específicas (subitens 1.03, 1.05, 1.09, 16.01), NF-e ABI, NFAg, NFGas, NF-e p/ não contribuintes de ICMS |
    | **01/01/2027** | **TODOS os modelos emitidos por optantes do Simples Nacional e MEI**, Duimp, NF-e importação, NF-e monofásica |
  - **Tradução pra esta carteira (119 clientes):** os **96 do Simples Nacional só entram em 01/01/2027**, independentemente do modelo. Dos **23 de Regime Normal**, quem emite **NFS-e tem até 01/10/2026** — que é a maioria do escritório (61 clientes de serviço) — e só quem emite **NF-e/NFC-e está obrigado desde 03/08/2026**. O número que falta é a interseção *Regime Normal × produto*; provavelmente pequena, e é o único grupo com prazo vencido. **Confirmar com o contador antes de tratar qualquer cliente como conforme ou inadimplente.**
  - RFB e CGIBS devem publicar em até 30 dias do Ato um **Programa de Conformidade 2026**, com diretrizes para o período inicial — ou seja, a postura de fiscalização na largada ainda não está definida.
  - Por município ainda vale consultar `GET /v1/service-invoices/cities` → `provider.options.supportsTaxReform` e `nationalServiceInvoiceRegimes`.
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
