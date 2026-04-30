# TTRD Contábil — UX Research Report

> Análise baseada em revisão completa do código-fonte.
> Versão 1.0 — 2026-04-30

---

## METODOLOGIA

Esta análise combina:
- **Code review com foco em UX** — o código revela intenções de design, fluxos reais e decisões de informação
- **Cognitive Walkthrough** — simulação dos fluxos diários, semanais e mensais de um contador
- **Heurísticas de Nielsen** adaptadas para ERPs de produtividade
- **Análise de carga cognitiva** — quantas decisões o usuário precisa tomar por tela

---

## PARTE 1 — PROBLEMAS POR MÓDULO

---

### 1.1 COCKPIT "HOJE"

#### O que funciona
- Algoritmo de SLA existe e é sofisticado (`tipoPeso × 2 + diasAtraso + urgência + semResponsavelPenalty`)
- Ação em lote (concluir, reatribuir, alterar prazo) está implementada
- Divisão em três seções temporais (atrasadas / hoje / próximos 7 dias) é correta

#### Problemas reais encontrados

**PROBLEMA 1 — O cockpit duplica informação sem agregar valor**

O mesmo dado aparece 3 vezes na tela:
1. KpiCard: "Atrasadas: 3"
2. RiskBanner: "3 tarefas em atraso com impacto operacional"
3. InsightStrip: "3 tarefa(s) em atraso — selecione, conclua ou reatribua em lote..."
4. Seção "Atrasadas (3)" com as tarefas

O usuário lê a mesma informação 4 vezes antes de agir. Isso não é contexto — é ruído.

**Carga cognitiva:** Alta. O usuário processa a mesma mensagem em 4 formatos diferentes antes de chegar às tarefas de fato.

---

**PROBLEMA 2 — A fila priorizada (DecisionCard) e as seções de tarefa coexistem sem hierarquia clara**

A tela tem:
- KPI grid (4 números)
- RiskBanner (aviso)
- ActionBar (3 botões)
- InsightStrip (texto longo)
- DecisionCard com PriorityList (fila SLA — top 6)
- Bloco de ações em lote (se selecionado)
- Checkbox "selecionar todas"
- Seção "Atrasadas" (lista completa)
- Seção "Vencem hoje"
- Seção "Próximos 7 dias"
- Card de bloqueios de fechamento

**11 blocos de conteúdo numa única tela.** O usuário não sabe se deve usar a fila priorizada OU as seções separadas. São duas formas de ver a mesma coisa.

**Pergunta que o sistema não responde:** "Preciso usar a PriorityList ou ir direto para a seção 'Atrasadas'? Qual é a diferença?"

---

**PROBLEMA 3 — ActionBar com ações que não fazem sentido no contexto**

```tsx
// Cockpit — ActionBar
actions={[
  { label: 'Resolver fila', onClick: resolverFila },
  { label: 'Abrir fechamento', href: `/fechamento?mes=...` },
  { label: 'Atualizar painel', onClick: () => load() },
]}
```

"Abrir fechamento" está numa ActionBar chamada "Ações rápidas do dia" — mas só faz sentido se houver bloqueios. Quando não há bloqueios, esse botão não deveria existir.

"Atualizar painel" é uma ação de debug, não de negócio. O usuário nunca pensa "preciso atualizar o painel". Ele pensa "os dados estão desatualizados?" — e não sabe quando isso acontece.

---

**PROBLEMA 4 — Checkbox de "selecionar todas" está no lugar errado**

```tsx
// Posição atual: depois do ActionBar, antes das seções
<label>
  <input type="checkbox" ... />
  Selecionar todas as tarefas listadas
</label>
```

O checkbox global aparece no meio da página, entre o bloco de ações em lote e as seções de tarefa. Mas o bloco de ações em lote (que usa as seleções) aparece **acima** do checkbox.

Fluxo atual: usuário seleciona → sobe para o bloco de ações → age. Fluxo esperado: usuário vê as tarefas → seleciona → age no mesmo nível.

---

**PROBLEMA 5 — Bloqueios de fechamento são secundários, mas são críticos**

O card de "Bloqueios de fechamento" está no **final da página**. Um usuário que só usa scroll até ver as tarefas de hoje nunca vai perceber que há um cliente bloqueando o fechamento do mês.

No sistema atual, um bloqueio de fechamento aparece:
1. No RiskBanner (se combinado com atrasadas)
2. No KpiCard "Bloqueios de fechamento" (número sem contexto)
3. No final da página como card

Nenhuma dessas posições responde à pergunta: "Qual cliente está bloqueando e por quê?"

---

### 1.2 CLIENTES

#### O que funciona
- Lista com busca por nome/CPF/CNPJ e filtro por status
- Modal de preview ao clicar na linha
- Paginação funcional

#### Problemas reais encontrados

**PROBLEMA 6 — A lista de clientes não comunica estado operacional**

A tabela tem: Nome, CPF/CNPJ, Regime, Cidade/UF, Status (ativo/inativo/suspenso).

Nenhum desses campos responde a pergunta que o contador faz todo dia: **"Quais clientes precisam de atenção agora?"**

Um cliente pode estar "Ativo" e ter 3 tarefas atrasadas, lançamento vencido há 15 dias e fechamento bloqueado. A lista mostra "Ativo" com badge verde.

**Gap:** A lista de clientes é um catálogo, não um painel operacional.

---

**PROBLEMA 7 — Clientes sem foto/avatar têm identidade visual fraca**

Numa lista com 50+ clientes com razões sociais parecidas (muitas têm "LTDA", "ME", "EPP"), a identificação visual só existe pelo nome textual.

Não há:
- Iniciais com cor consistente por cliente
- Ícone visual diferenciador por regime (MEI vs Simples vs Lucro Presumido)
- Indicador visual rápido de saúde

O usuário precisa ler cada linha para encontrar o cliente certo.

---

**PROBLEMA 8 — O modal de cliente é um atalho para um buraco negro**

Ao clicar na linha, abre um modal (`ClienteModal`). Dentro do modal, o usuário provavelmente quer navegar para o cliente completo. Mas o modal não tem um botão "Ver cliente completo" proeminente — ou se tem, está escondido.

O padrão correto: clicar na linha vai direto para `/clientes/[id]`. O modal é para preview rápido sem perder o contexto da lista. Mas o sistema atual usa o modal como rota principal.

---

**PROBLEMA 9 — Cliente 360° usa tabs, o que quebra o contexto**

```tsx
// clientes/[id]/page-client.tsx — versão do commit 0e38008
<Tabs defaultValue="servicos">
  <TabsTrigger value="servicos">Serviços</TabsTrigger>
  <TabsTrigger value="competencias">Competências</TabsTrigger>
  <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
  <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
</Tabs>
```

Tabs em ERPs criam um problema clássico: o usuário está na aba "Competências" e quer comparar com o "Financeiro". Precisa trocar de aba, perder o contexto visual, e lembrar o que estava vendo.

O layout 70/30 com scroll único (main + aside fixo) resolve isso melhor: o usuário vê tudo ao descer, sem perder a saúde do cliente no painel lateral.

---

**PROBLEMA 10 — "Próximos passos" não tem prioridade visual**

No sidebar do cliente 360 (versão pós-refactor), os próximos passos aparecem como uma lista de cards com bordas coloridas. Mas todos os itens de risco (danger, warning, default) têm o mesmo tamanho e peso visual.

Um item "Configurar NFS-e" (danger) e "Próxima entrega com o cliente" (default) parecem ter a mesma urgência na leitura rápida.

---

### 1.3 TAREFAS

#### O que funciona
- Filtros por status e prioridade
- Link direto para detalhe
- Indicação de vencimento atrasado

#### Problemas reais encontrados

**PROBLEMA 11 — A lista de tarefas é uma tabela, não um sistema de trabalho**

A tela `/tarefas` exibe uma tabela com colunas: Título, Cliente, Prioridade, Responsável, Prazo, Status.

Isso é uma **visão de relatório**. Um contador que precisa trabalhar suas tarefas quer:
1. Ver o que é mais urgente primeiro (a tabela não ordena por urgência por padrão)
2. Agir diretamente na tarefa (a tabela não tem ações inline — apenas link para detalhe)
3. Entender o contexto sem abrir o detalhe (a tabela não mostra descrição ou observação)

O fluxo atual força o contador a: ver a tabela → clicar em "abrir tarefa" → ler o detalhe → voltar para a lista → próxima tarefa. 4 interações por tarefa.

---

**PROBLEMA 12 — Prioridade e Status usam o mesmo componente visual (Badge)**

```tsx
// versão 0e38008 — mesmo componente, mesmas cores
alta    → Badge variant="destructive"  (vermelho)
urgente → Badge variant="destructive"  (vermelho)
```

`alta` e `urgente` têm o mesmo badge vermelho. O usuário não consegue distinguir visualmente qual é mais crítico sem ler o texto. Numa tabela densa, isso força leitura de cada item em vez de scanning visual.

---

**PROBLEMA 13 — Tarefas sem competência e com competência são misturadas**

Existem dois tipos de tarefa no sistema:
- **Tarefa avulsa:** criada diretamente, sem vínculo com competência
- **Tarefa de competência:** ligada a um período (cliente × serviço × mês)

Na lista `/tarefas`, esses dois tipos aparecem misturados, com a mesma visualização. O contador não consegue saber se está olhando para uma entrega do mês ou um trabalho ad-hoc.

---

**PROBLEMA 14 — Detalhe de tarefa tem "Competência" como link genérico**

```tsx
// tarefas/[id] — versão 0e38008
<Link href={`/competencias/${tarefa.competenciaId}`}>
  Ver competência
</Link>
```

O link mostra "Ver competência" — sem nome do mês/ano, sem status, sem nada. O contador precisa clicar para saber a qual período essa tarefa pertence. Informação que poderia estar inline.

---

**PROBLEMA 15 — Não há visão "minhas tarefas" separada de "todas as tarefas"**

O filtro por responsável existe, mas está na URL (`?responsavelId=xxx`). Não há um atalho "Ver minhas tarefas" no cockpit ou na lista.

Um contador que chega pela manhã e quer ver só o que é dele precisa:
1. Ir para `/tarefas`
2. Saber seu próprio `responsavelId`
3. Aplicar o filtro manualmente

Ou usar o cockpit com o select de equipe — mas esse select não persiste (se recarregar a página, volta para "Equipe inteira").

---

### 1.4 FINANCEIRO

#### O que funciona
- Fila de cobrança com algoritmo de priorização
- KPIs de exposição em atraso, janela 48h, recebido no mês
- Baixa inline pelo FilaCobrancaItem
- Insight strip com resumo contextual

#### Problemas reais encontrados

**PROBLEMA 16 — A fila de cobrança e a tabela completa coexistem sem clara separação de propósito**

O financeiro tem:
1. KPIs (3 números)
2. RiskBanner ou InsightStrip (dependendo do estado)
3. ActionBar
4. InlineAlert (se houver atrasados)
5. DecisionCard com PriorityList (top 5 clientes para cobrar)
6. FilaCobrancaItem (lista detalhada para ação)
7. Botões de filtro (tipo + status)
8. Tabela colapsável "Lista completa"

O usuário que entra no financeiro para fazer uma cobrança específica não sabe se deve usar a fila (item 6) ou a tabela (item 8). São duas visões do mesmo dado com sobreposição.

**Decisão não guiada:** "Uso a fila de cobrança ou procuro na tabela?"

---

**PROBLEMA 17 — "Baixar" um lançamento tem feedback visual insuficiente**

Quando o contador baixa um pagamento pelo `LancamentoBaixar`, o item desaparece da fila. Mas:
- Não há confirmação visual ("Pagamento registrado ✓")
- Não há log de que ação foi realizada
- Se o contador clicou sem querer, não há undo

Num sistema financeiro, toda ação de baixa deveria ter: confirmação → feedback → possibilidade de desfazer ou ver histórico.

---

**PROBLEMA 18 — Filtros de tipo (Receita/Despesa) e status (Pendente/Pago) são botões Link**

```tsx
// financeiro/page.tsx
{['', 'receita', 'despesa'].map((t) => (
  <Link key={t} href={buildUrl({ tipo: t, page: 1 })}>
    <Button variant={tipo === t ? 'default' : 'outline'} ...>
```

Cada clique em filtro é uma **navegação** (muda a URL). Isso causa:
- Reload completo dos dados a cada filtro
- Perda de posição de scroll
- Não é possível combinar filtros rapidamente (precisa de dois cliques, cada um causando reload)

O padrão correto para filtros de tabela é estado local com query param como persistência — não navegação dura.

---

**PROBLEMA 19 — Não há distinção visual entre "atrasado há 1 dia" e "atrasado há 45 dias"**

Na tabela de lançamentos, um item atrasado há 1 dia e um atrasado há 45 dias têm o mesmo visual: texto vermelho no campo de vencimento.

O risco financeiro é radicalmente diferente. O sistema trata os dois como iguais visualmente.

---

## PARTE 2 — MAPA DE FRUSTRAÇÕES DO USUÁRIO

### 2.1 O que torna o trabalho lento

| Fricção | Onde | Causa raiz |
|---------|------|------------|
| Não saber por onde começar | Cockpit | Informação duplicada sem hierarquia clara |
| Encontrar um cliente específico | Lista de clientes | Sem indicadores operacionais, só dados cadastrais |
| Entender o contexto de uma tarefa | Lista de tarefas | Tabela não mostra descrição nem observações |
| Confirmar se uma cobrança foi feita | Financeiro | Sem feedback persistente após baixa |
| Lembrar o que foi feito no mês passado | Cliente 360° | Timeline existe mas é secundária na nav |
| Trocar de responsável em várias tarefas | Cockpit / Tarefas | Ação em lote existe mas o fluxo de descoberta é obscuro |

### 2.2 O que causa erros

| Erro provável | Onde | Por quê acontece |
|---------------|------|-----------------|
| Baixar pagamento do cliente errado | Financeiro | FilaCobrancaItem sem confirmação de identidade clara |
| Criar tarefa sem prazo e sem responsável | Nova tarefa | Campos opcionais sem valor padrão sugerido |
| Fechar mês com cliente pendente | Fechamento | Sistema permite sign-off mesmo com pendências (apenas aviso, não bloqueio) |
| Emitir NFS-e com dados errados | Fiscal / Emissão | Form longo, sem preview antes de emitir |
| Marcar tarefa como concluída errada | Cockpit / TaskCard | Botão "Concluir" sem confirmação para tarefas de alto risco (urgente/fiscal) |

### 2.3 O que causa retrabalho

| Retrabalho | Causa raiz | Solução sistêmica |
|------------|------------|-------------------|
| Reatribuir tarefas toda semana porque vieram sem responsável | Não há default de responsável por tipo de serviço | Sugerir responsável com base no serviço ou competência |
| Recriar tarefas que deveriam ser recorrentes | Sistema não tem recorrência | Template de tarefa por tipo de competência |
| Conferir planilha externa para fechar o mês | Fechamento não reflete todo o trabalho real | Integrar tarefas concluídas como evidência de fechamento |
| Atualizar status de competência manualmente | Status não avança automaticamente | Regra: quando todas as tarefas da competência forem concluídas → avançar status |

---

## PARTE 3 — OPORTUNIDADES DE UX

### 3.1 Onde automação ajuda

| Oportunidade | Impacto | Complexidade |
|---|---|---|
| Gerar tarefas automaticamente ao abrir uma competência | Alto — elimina criação manual repetida | Média — precisa de template por tipo de serviço |
| Avançar status da competência quando todas as tarefas concluem | Alto — elimina atualização manual | Baixa — trigger no Firestore |
| Gerar lançamento de honorário ao vincular serviço ao cliente | Alto — elimina lançamento manual mensal | Média — precisa de recorrência |
| Alertar quando cliente entra no prazo crítico (48h antes) | Alto — previne atraso proativo | Baixa — query + notification |
| Detectar quando NFS-e não foi emitida para cliente com competência concluída | Médio — previne esquecimento | Média — cross-query NFS-e × competência |

### 3.2 Onde defaults ajudam

| Default | Onde aplicar | Benefício |
|---|---|---|
| Responsável padrão por tipo de serviço | Nova tarefa / nova competência | Elimina campo obrigatório vazio que causa caos no cockpit |
| Prazo padrão baseado no tipo de tarefa | Nova tarefa (fiscal = dia 20, DAS = dia 20) | Reduz tarefas sem prazo que "somem" do SLA |
| Regime tributário do cliente pré-preenchido no fechamento | Geração de fechamento | Já implementado, mas poderia propagar para NFS-e |
| Mês/ano atual no filtro de competências | Lista de competências | Já implementado — manter |
| "Equipe inteira" como default persistido no cockpit | Cockpit | Ou lembrar última seleção por usuário |

### 3.3 Onde o sistema pode guiar decisões

#### GUIA 1 — Próximo passo contextual no cliente

Ao entrar no cliente, o sistema já calcula `saudeFinanceiro`, `saudeFiscal` e `saudeOperacional`. Mas o usuário precisa interpretar o que fazer com essa informação.

**Oportunidade:** Transform os chips de saúde em ações diretas.
- `saudeFinanceiro: risco` → botão "Cobrar agora" direto para o lançamento atrasado
- `saudeFiscal: risco` → botão "Configurar NFS-e"
- `saudeOperacional: risco` → botão "Ver tarefa crítica"

#### GUIA 2 — Wizard de abertura de competência

Hoje: criar competência → salvar → criar tarefas manualmente → definir responsáveis → definir prazos.

**Oportunidade:** Ao criar competência, o sistema sugere as tarefas padrão daquele tipo de serviço com responsáveis e prazos pré-definidos. O usuário confirma ou ajusta. Não cria do zero.

#### GUIA 3 — Checklist de pré-fechamento

Antes do sign-off do mês, o sistema faz uma varredura:
- Há tarefas em aberto para clientes deste mês? → mostra lista
- Há competências não concluídas? → mostra lista
- Há lançamentos vencidos sem baixa? → mostra soma
- Há NFS-e pendente? → mostra quantidade

O usuário não pode ignorar — precisa resolver ou justificar cada item.

#### GUIA 4 — Fila única de decisão no cockpit

Em vez de 11 blocos de conteúdo, o cockpit deveria ter **uma fila ordenada por score SLA** com contexto suficiente para agir inline. O usuário trabalha de cima para baixo. Quando a lista zera, o dia acabou.

---

## PARTE 4 — PRINCÍPIOS DE UX PARA ESTE ERP

### PRINCÍPIO 1 — Uma decisão por tela

Cada tela principal deve responder a uma única pergunta:

| Tela | Pergunta central |
|---|---|
| Cockpit | "O que faço primeiro hoje?" |
| Cliente 360° | "Este cliente está ok?" |
| Tarefas | "O que o time tem para fazer?" |
| Financeiro | "Quem cobro agora?" |
| Fechamento | "O mês pode fechar?" |

Se a tela responde a mais de uma pergunta, está fazendo trabalho demais.

---

### PRINCÍPIO 2 — Informação que não gera ação é ruído

No cockpit atual, há 4 representações do mesmo dado de atraso. Nenhuma delas é ação — são todas representações. O usuário processa 4 mensagens para tomar 1 decisão.

**Regra:** Só exibir um dado se ele estiver acompanhado de uma ação possível. Dado sem ação é ruído.

---

### PRINCÍPIO 3 — O estado do cliente deve ser legível em 3 segundos

Quando um contador abre a lista de clientes, o objetivo é encontrar "quem precisa de atenção". Hoje, isso requer abrir cada cliente individualmente.

**Regra:** A lista de clientes deve ter 3 indicadores visuais rápidos por linha: status operacional, status financeiro, status fiscal. Semáforo — não texto.

---

### PRINCÍPIO 4 — Ações destrutivas precisam de resistência

No sistema atual:
- "Concluir tarefa" no cockpit: um clique, sem confirmação
- "Baixar pagamento" no financeiro: um clique, sem confirmação
- "Remover rascunho NFS-e": um clique, sem confirmação

Para tarefas com `prioridade: urgente` ou `tipo: fiscal`, uma ação irreversível de um clique é um risco real.

**Regra:** Ações que não têm undo devem ter confirmação proporcional ao impacto. "Concluir tarefa normal" → direto. "Baixar pagamento de R$ 5.000" → confirmação modal.

---

### PRINCÍPIO 5 — O sistema deve ser pessimista com ausência de dados

Hoje, campos como `responsavelId`, `dataPrazo`, `competenciaId` são opcionais e frequentemente ficam vazios. O sistema trata campo vazio como estado neutro.

**Regra:** Campo vazio em campo crítico (responsável, prazo) deve ser tratado como **problema**, não como estado neutro. Exibir visualmente diferente — "Sem responsável" com indicador de risco, não simplesmente "—".

A penalidade já existe no algoritmo de SLA (+2 para sem responsável), mas o usuário não vê isso visualmente na lista.

---

### PRINCÍPIO 6 — Contexto nunca deve ser perdido por navegação

O maior problema de navegação do sistema: ao clicar em uma tarefa dentro do cockpit, o usuário vai para `/tarefas/[id]` e perde o contexto do cockpit. Ao clicar em voltar, o cockpit recarrega (perdendo o scroll e a seleção).

**Regra:** Ações que podem ser feitas em contexto (concluir, reatribuir, alterar prazo) nunca devem forçar navegação. O usuário só navega quando precisa de **mais informação**, não para executar uma **ação simples**.

Isso justifica o padrão do TaskCard com ações inline em vez de links para detalhe.

---

### PRINCÍPIO 7 — Fechamento é um ritual, não uma tarefa

O fechamento mensal tem uma psicologia diferente das outras telas. Não é uma lista de itens — é um **processo com começo, meio e fim**.

Isso significa:
- Deve ter progresso visível (% concluído por obrigação)
- Deve ter um momento explícito de "encerramento" (já implementado com sign-off)
- Deve ter pré-requisitos visíveis antes de permitir o encerramento
- Deve registrar quem fez o sign-off e quando (hoje é localStorage — deveria ser servidor)

---

### PRINCÍPIO 8 — Permissão deve ser invisível quando respeitada, explícita quando violada

Hoje, se um usuário com perfil `operacional` tentar acessar `/financeiro`, é redirecionado ou a opção não aparece no sidebar. Isso funciona.

Mas há casos onde a permissão causa confusão:
- Um contador vê uma tarefa no cockpit de um cliente do colega — não sabe se pode agir
- Um usuário com `leitura` vê os mesmos formulários mas sem poder salvar — erro confuso

**Regra:** A interface deve deixar claro o nível de acesso do usuário no contexto atual. "Você está visualizando — apenas leitura" deve aparecer onde for relevante, não ser deduzido por tentativa e erro.

---

## RESUMO EXECUTIVO — TOP 5 PROBLEMAS POR IMPACTO

| # | Problema | Impacto | Esforço de correção |
|---|----------|---------|---------------------|
| 1 | Cockpit com 11 blocos de conteúdo sem hierarquia clara | Crítico — carga cognitiva máxima na tela mais usada | Médio |
| 2 | Lista de clientes sem indicadores operacionais | Alto — impede triagem rápida de quem precisa de ação | Baixo |
| 3 | Tarefas urgente/alta com mesmo visual | Alto — erro de leitura diário em lista densa | Baixo |
| 4 | Ações irreversíveis sem confirmação proporcional | Alto — risco de erro no financeiro e no fechamento | Baixo |
| 5 | Sem responsável/prazo padrão → tarefas "órfãs" | Alto — tarefas sem dono desaparecem do SLA | Médio |

---

## RECOMENDAÇÕES PRIORITÁRIAS

### Imediatas (1 sprint)

1. **Reduzir o cockpit de 11 para 4 blocos:** KPI grid → Fila única (SLA) → Ações em lote → Bloqueios de fechamento
2. **Adicionar indicadores de saúde na lista de clientes** (3 dots: operacional, financeiro, fiscal)
3. **Diferenciar visualmente urgente vs alta** (urgente = vermelho pulsante, alta = âmbar)
4. **Confirmação modal para baixa de pagamento > R$ 500**

### Médio prazo (2–4 sprints)

5. **Responsável padrão por tipo de serviço** (configurável no admin)
6. **Prazo padrão por tipo de tarefa** (fiscal = dia 20, honorário = dia 5)
7. **Status da competência avança automaticamente** quando todas as tarefas concluem
8. **Pré-checklist de fechamento** antes de permitir sign-off

### Longo prazo (roadmap)

9. **Geração automática de tarefas ao abrir competência** (baseado em template de serviço)
10. **Portal do cliente** — cliente vê seu próprio status sem precisar ligar para o escritório
