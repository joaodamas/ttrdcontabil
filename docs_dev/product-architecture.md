# TTRD Contábil — Arquitetura de Produto SaaS

> Versão 1.0 — 2026-04-30  
> Documento vivo. Atualizar a cada ciclo de produto.

---

## 1. VISÃO DO PRODUTO

### O problema real

Escritórios contábeis não têm problema de dados. Têm problema de **execução**.

Ferramentas como Conta Azul e Omie organizam o financeiro **do cliente**. Nenhuma organiza o **trabalho do contador**: quais clientes precisam de ação hoje, qual obrigação está prestes a vencer, qual fechamento está travado e por quê.

O contador abre o sistema, vê uma lista de clientes, e não sabe por onde começar. O sistema exibe dados. Não guia.

### A proposta

> **"O sistema que diz o que fazer — na ordem certa — todos os dias."**

TTRD Contábil é uma plataforma de **gestão operacional para escritórios contábeis**. O produto organiza o trabalho do time, não o financeiro do cliente.

### Diferencial central (unfair advantage)

| Característica | Conta Azul / Omie | TTRD Contábil |
|---|---|---|
| **Foco** | Empresa do cliente | Escritório contábil |
| **Entrada diária** | Relatórios / lançamentos | Cockpit com fila de ação |
| **Unidade de trabalho** | Nota fiscal / lançamento | Competência (período × cliente × serviço) |
| **Orientação** | Exibe o passado | Guia o próximo passo |
| **Fechamento** | Não existe | Ritual com checklist e sign-off |
| **Visão do cliente** | Financeiro isolado | 360°: fiscal + operacional + financeiro |

---

## 2. DOMÍNIOS DO SISTEMA

### 2.1 Mapa de domínios

```
┌─────────────────────────────────────────────────────────┐
│                    COCKPIT (Hoje)                        │
│         Ponto de entrada diário do time                  │
└──────────────────────┬──────────────────────────────────┘
                       │ alimenta / consome
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐
   │OPERAÇÃO │   │ CLIENTE  │   │FINANCEIRO│
   │         │   │   360°   │   │          │
   └────┬────┘   └────┬─────┘   └────┬─────┘
        │             │              │
        ▼             ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐
   │FECHAMEN-│   │  FISCAL  │   │    IR    │
   │   TO    │   │  NFS-e   │   │          │
   └─────────┘   └──────────┘   └──────────┘
```

### 2.2 Responsabilidade de cada domínio

---

#### COCKPIT — "O que fazer hoje"

**Responsabilidade única:** Eliminar a dúvida de por onde começar.

- Agrega tarefas atrasadas, vencendo hoje e nos próximos 7 dias
- Calcula score de SLA por tarefa (tipo fiscal > financeiro > operacional)
- Exibe bloqueios de fechamento do mês atual
- Permite ação em lote (concluir, reatribuir, alterar prazo)
- Filtro por responsável (visão individual ou equipe completa)

**Regra de ouro:** O cockpit não cria dados. Ele consome e exibe o estado de todos os outros domínios.

---

#### CLIENTE 360 — "Tudo sobre um cliente, num lugar"

**Responsabilidade única:** Ser o workspace do cliente.

- Dados cadastrais (CPF/CNPJ, regime tributário, contatos)
- Saúde em três dimensões: operacional, fiscal, financeiro
- Timeline unificada: todos os eventos do cliente em ordem cronológica
- Serviços contratados (honorários + escopo)
- Competências ativas e histórico
- Lançamentos financeiros (receber/pagar)
- Configuração fiscal (NFS-e, certificado A1, município)
- Próximos passos sugeridos (sistema detecta pendências e sugere ação)

**Regra de ouro:** Tudo que acontece com o cliente aparece na timeline. Nunca esconda contexto.

---

#### OPERAÇÃO — "O trabalho do time"

**Responsabilidade única:** Controlar a execução das obrigações contábeis.

- Tarefas com prioridade, responsável, prazo e SLA
- Competências como unidade de período (cliente × serviço × mês/ano)
- Status de progresso por competência
- Comentários e histórico de alterações em tarefas
- Visão por responsável (o que cada contador tem para fazer)

**Regra de ouro:** Toda tarefa tem dono, prazo e status. Tarefa sem esses três campos é ruído.

---

#### FECHAMENTO MENSAL — "O ritual de encerramento"

**Responsabilidade única:** Garantir que o mês fechou sem deixar nada para trás.

- Checklist por cliente e por obrigação (DAS, eSocial, Reinf, FGTS)
- Status granular: pendente → parcial → enviado → ok
- Geração automática de registros para todos os clientes ativos
- Bloqueios visíveis no cockpit
- Sign-off de revisão (registro local + futuramente servidor)
- Filtro por regime tributário

**Regra de ouro:** O mês só fecha quando todos os clientes estão OK. O sistema torna isso visível, não depende de planilha.

---

#### FINANCEIRO — "Centro de decisão de cobrança"

**Responsabilidade única:** Maximizar o recebimento, minimizar o atraso.

- Lançamentos de receita e despesa
- Fila de cobrança priorizada por algoritmo (atraso + proximidade + valor)
- KPIs: a receber, em atraso, janela 48h, recebido no mês
- Baixa manual e histórico de pagamentos
- Concentração de inadimplência por cliente
- Ação rápida: baixar, cobrar por e-mail

**Regra de ouro:** Mostrar quem cobrar primeiro, não uma lista de lançamentos.

---

#### FISCAL / NFS-e — "Emissão sem atrito"

**Responsabilidade única:** Emitir notas fiscais sem sair do contexto do cliente.

- Configuração por município (suporte a múltiplos municípios)
- Emissão avulsa e em lote
- Certificado digital A1 por cliente
- Histórico de notas com status (emitida, rejeitada, cancelada)
- Rascunhos para emissão manual posterior

**Regra de ouro:** A NFS-e é sempre do contexto de um cliente. Nunca emitir sem vínculo.

---

#### IR — "Controle de declarações"

**Responsabilidade única:** Rastrear o ciclo de vida das declarações de imposto de renda.

- Declarações por cliente e ano-base
- Status: pendente → em andamento → entregue → retificado
- Responsável e data de entrega
- Alertas de prazo

**Regra de ouro:** Simples e direto. IR é um registro com status, não um processo complexo.

---

#### ADMINISTRAÇÃO — "O sistema por trás do sistema"

**Responsabilidade única:** Configurar quem pode fazer o quê.

- Gestão de usuários (perfis: admin, operacional, fiscal, financeiro, leitura)
- Tipos de serviço (catálogo para vincular a clientes)
- Conectores fiscais (integrações de NFS-e por município)
- Permissões granulares por tela (TelaKeys)

**Regra de ouro:** O admin não toca o trabalho. Configura o ambiente onde o trabalho acontece.

---

## 3. JORNADAS DO USUÁRIO

### 3.1 Fluxo diário do contador (operacional)

```
08:00 — Abre o sistema
         └→ COCKPIT: "O que tem hoje?"
              ├→ Ver atrasadas (score SLA alto = tratar primeiro)
              ├→ Ver vencimentos hoje
              └→ Ver bloqueios de fechamento

08:15 — Trata fila priorizada
         ├→ Conclui tarefas já finalizadas
         ├→ Reatribui tarefa sem responsável
         └→ Registra prazo em tarefa sem data

10:00 — Entra no cliente com urgência
         └→ CLIENTE 360: Timeline + saúde
              ├→ Vê pendência fiscal (sem NFS-e configurada)
              ├→ Clica em "Configurar NFS-e" (próximo passo sugerido)
              └→ Emite NFS-e no contexto do cliente

14:00 — Recebe cobrança de um cliente
         └→ FINANCEIRO: Fila de cobrança
              ├→ Localiza lançamento atrasado do cliente
              ├→ Baixa o pagamento
              └→ Confirma que saiu da fila

17:00 — Fecha o dia
         └→ COCKPIT: Atualiza painel
              └→ Verifica se ficou algo para amanhã
```

### 3.2 Fluxo semanal do gestor/sócio

```
Segunda — Revisão de equipe
  └→ COCKPIT (filtro: equipe inteira)
       ├→ Quem tem mais atrasadas?
       ├→ Quem está sobrecarregado?
       └→ Redistribuir com ação em lote

Quarta — Revisão financeira
  └→ FINANCEIRO
       ├→ Inadimplência da semana
       ├→ Janela de vencimentos 48h
       └→ Top concentração de atraso por cliente

Sexta — Revisão de fechamento
  └→ FECHAMENTO
       ├→ Quantos clientes ainda pendentes?
       ├→ Quem está parcial e precisa de push?
       └→ Confirma previsão de encerramento do mês
```

### 3.3 Fluxo mensal (ritual de fechamento)

```
Dia 1–5 — Geração
  └→ FECHAMENTO: "Gerar Fechamento"
       └→ Sistema cria registros para todos os clientes ativos

Dia 5–20 — Execução
  ├→ OPERAÇÃO: Executar tarefas fiscais (DAS, eSocial, Reinf, FGTS)
  ├→ FECHAMENTO: Atualizar status linha a linha
  └→ COCKPIT: Bloqueios aparece para quem não atualizou

Dia 20–25 — Revisão
  ├→ FECHAMENTO: Filtrar "pendentes" e "parciais"
  ├→ CLIENTE 360: Entrar nos problemáticos e entender bloqueio
  └→ FISCAL: Emitir NFS-e pendentes antes de fechar

Dia 25–30 — Encerramento
  ├→ FECHAMENTO: Conferir 100% como enviado/ok
  └→ FECHAMENTO: "Encerrar revisão do mês" → sign-off registrado
```

---

## 4. ENTIDADES E RELACIONAMENTOS

### 4.1 Modelo de dados conceitual

```
CLIENTE (raiz do domínio)
├── id, razaoSocial, nomeFantasia, cpfCnpj
├── regimeTributario, cidade, uf
├── email, telefone, responsavelNome
├── status: ativo | inativo | suspenso
│
├──── CLIENTES_SERVICOS (contrato)
│     ├── clienteId → CLIENTE
│     ├── servicoId → SERVICO (catálogo)
│     ├── valor, dataInicio, dataFim
│     └── status: ativo | inativo
│
├──── COMPETENCIAS (período de entrega)
│     ├── clienteId → CLIENTE
│     ├── servicoId → SERVICO
│     ├── mes, ano
│     ├── status: aberta | em_andamento | concluida | cancelada
│     └── responsavelId → USUARIO
│          └──── TAREFAS (execução)
│                ├── competenciaId → COMPETENCIA (opcional)
│                ├── clienteId → CLIENTE
│                ├── titulo, descricao
│                ├── prioridade: baixa | normal | alta | urgente
│                ├── status: pendente | em_andamento | concluida | cancelada
│                ├── responsavelId → USUARIO
│                ├── dataPrazo
│                └──── TAREFAS_COMENTARIOS
│
├──── LANCAMENTOS (financeiro)
│     ├── clienteId → CLIENTE
│     ├── tipo: receita | despesa
│     ├── status: pendente | pago | atrasado | cancelado | estornado
│     ├── valor, dataVencimento, dataPagamento
│     └── competenciaId → COMPETENCIA (opcional)
│
├──── CLIENTES_FISCAL (configuração NFS-e)
│     ├── clienteId → CLIENTE
│     ├── municipioIbge, inscricaoMunicipal
│     ├── ambienteEmissao: producao | homologacao
│     └── credenciais (certificado A1, login, senha)
│
└──── IR_DECLARACOES
      ├── clienteId → CLIENTE
      ├── anoBase
      ├── status: pendente | em_andamento | entregue | retificado | cancelado
      └── responsavelId → USUARIO

FECHAMENTOS (ritual mensal — independente de COMPETENCIA)
├── clienteId → CLIENTE
├── mes, ano, regime
├── dasStatus, esocialStatus, reinfStatus, fgtsStatus
│   └── valores: pendente | enviado | parcial | ok | sm | guia | na
└── responsavel (nome desnormalizado)

NFSE_EMITIDAS / NFSE_RASCUNHOS
├── clienteId → CLIENTE
├── numeroNfse, valorServico
├── status: emitida | pendente_processamento | rejeitada | cancelada | erro_integracao
└── dataEmissao

USUARIOS
├── uid (Firebase Auth)
├── nome, email
├── perfil: admin | operacional | fiscal | financeiro | leitura
└── telas: string[] (override granular de permissões)

SERVICOS (catálogo)
└── nome, descricao, ativo
```

### 4.2 Regras de negócio críticas

```
CLIENTE → COMPETENCIA
  Uma competência é a "promessa de entrega" de um serviço num período.
  Sem competência, não há referência para agrupar tarefas de um mês.

COMPETENCIA → TAREFA
  Tarefa pode existir sem competência (tarefa avulsa).
  Mas toda tarefa ligada a um período DEVE ter competência.

CLIENTE → FECHAMENTO
  Fechamento é um snapshot mensal. Existe independente de competência.
  É gerado para todos os clientes ativos no início do mês.

LANCAMENTO → CLIENTE
  Todo lançamento deve ter clienteId.
  Lançamentos sem cliente são despesas do escritório (futuro).

COCKPIT → tudo
  O cockpit não tem coleção própria. É uma query sobre TAREFAS + FECHAMENTOS.
```

---

## 5. ESTRUTURA DE NAVEGAÇÃO

### 5.1 Hierarquia de telas

```
/ (raiz)
└── /login

/dashboard          ← Visão analítica (retrospectiva)
/hoje               ← Cockpit operacional (prospectivo) ← ENTRADA PADRÃO

/clientes           ← Lista de clientes
/clientes/novo
/clientes/[id]      ← Workspace 360°
  /clientes/[id]/editar
  /clientes/[id]/fiscal
  /clientes/[id]/servicos/novo

/tarefas            ← Lista filtrada
/tarefas/nova
/tarefas/[id]       ← Detalhe + comentários
/tarefas/[id]/editar

/competencias       ← Lista por mês/ano
/competencias/nova
/competencias/[id]
/competencias/[id]/editar

/fechamento         ← Ritual mensal (tabela + checklist)
/financeiro         ← Centro de decisão de cobrança
/financeiro/novo

/fiscal             ← Painel NFS-e
/fiscal/emitir
/fiscal/historico

/ir                 ← Declarações de IR
/ir/nova
/ir/[id]
/ir/[id]/editar

/admin              ← Configurações (admin only)
/admin/usuarios
/admin/servicos
/admin/conectores
```

### 5.2 Sidebar — lógica de navegação

```
SIDEBAR (sidebar dark, collapsível)
│
├── [Sol]      Hoje          → /hoje        (todos)
├── [Users]    Clientes      → /clientes    (telaKey: clientes)
├── [Brief]    Operação      → /tarefas     (telaKey: tarefas)
├── [Wallet]   Financeiro    → /financeiro  (perfis: admin, financeiro)
├── [Chart]    Relatórios    → /dashboard   (perfis: admin, fiscal, financeiro)
└── [Settings] Config        → /admin       (perfis: admin)
```

**Princípio de navegação:** O sidebar não lista módulos. Lista intenções de trabalho.
- "Hoje" = o que precisa de ação agora
- "Clientes" = entrar no contexto de um cliente
- "Operação" = ver todas as tarefas do time
- "Financeiro" = tratar cobranças e pagamentos
- "Relatórios" = entender o passado
- "Config" = configurar o sistema

### 5.3 Padrão de acesso a um cliente

```
Via sidebar (Clientes):
  Lista → Click → Workspace 360° → Seção específica

Via cockpit (Hoje):
  Tarefa atrasada → Link direto na tarefa → Workspace 360°

Via ação rápida (+ Ação rápida no topbar):
  Novo Cliente, Nova Tarefa, Emitir NFS-e, Novo Lançamento
```

---

## 6. MODELO DE PERMISSÕES

### 6.1 Perfis e acessos

| Tela | admin | operacional | fiscal | financeiro | leitura |
|------|-------|-------------|--------|------------|---------|
| Hoje / Cockpit | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| Tarefas | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| Competências | ✅ | ✅ | ✅ | ❌ | ✅ (read) |
| Fechamento | ✅ | ✅ | ✅ | ❌ | ✅ (read) |
| Financeiro | ✅ | ❌ | ❌ | ✅ | ❌ |
| Fiscal / NFS-e | ✅ | ❌ | ✅ | ✅ | ❌ |
| IR | ✅ | ❌ | ✅ | ❌ | ❌ |
| Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dashboard | ✅ | ❌ | ✅ | ✅ | ❌ |

### 6.2 Override granular (TelaKeys)

Cada usuário pode ter `telas: string[]` que sobrescreve os defaults do perfil.
Isso permite casos como:
- Contador operacional que também acessa financeiro de um cliente específico
- Parceiro externo com leitura apenas de IR

---

## 7. ALGORITMOS DE PRIORIZAÇÃO

### 7.1 Score SLA do cockpit

```
score = (tipoPeso × 2) + diasAtraso + urgenciaPeso + semResponsavelPenalty

tipoPeso:
  NFS-e / DAS / Fiscal / IR = 3
  Cobrança / Lançamento     = 2
  Demais                    = 1

urgenciaPeso:
  urgente = 4, alta = 3, normal = 2, baixa = 1

diasAtraso:
  Se atraso >= 3 dias: diasAtraso + 3 (escalonamento)

semResponsavelPenalty:
  Sem responsável atribuído: +2
```

### 7.2 Score de cobrança (financeiro)

```
score = pontoAtraso + pontoProximidade + pontoValor

pontoAtraso:
  > 30 dias = 50, > 14 dias = 30, > 7 dias = 20, > 0 dias = 10

pontoProximidade:
  Vence em < 2 dias = 15, < 7 dias = 8, < 14 dias = 3

pontoValor:
  > R$ 5.000 = 5, > R$ 2.000 = 3, > R$ 1.000 = 1
```

---

## 8. VISÃO DE PRODUTO — PRÓXIMOS HORIZONTES

### Horizonte 1 — Fundação (hoje)

- ✅ Cockpit com SLA e ação em lote
- ✅ Cliente 360° com timeline
- ✅ Fechamento com checklist e sign-off
- ✅ Financeiro com fila de cobrança
- ✅ NFS-e multi-município
- ✅ Permissões por perfil + TelaKey

### Horizonte 2 — Inteligência (próximos 3 meses)

- **Alertas proativos:** sistema avisa quando um cliente vai entrar em atraso antes que aconteça
- **Fila de competências:** geração automática de tarefas baseada no tipo de serviço contratado
- **Relatório de produtividade:** quem entregou o quê, em quanto tempo
- **Integração WhatsApp:** cobrar clientes diretamente do financeiro
- **Recorrência de lançamentos:** honorários mensais gerados automaticamente

### Horizonte 3 — Escala (6–12 meses)

- **Multi-escritório:** um CNPJ-mãe com vários escritórios filhos
- **Portal do cliente:** cliente vê só o que é dele (documentos, boletos, status)
- **Automação de obrigações:** DAS, eSocial e Reinf gerados com base no regime
- **API pública:** integrar com ERPs dos clientes (Conta Azul, Omie, Bling)
- **Analytics avançado:** custo por cliente, margem por serviço, gargalos do time

---

## 9. MÉTRICAS DE SUCESSO DO PRODUTO

### 9.1 Métricas operacionais (o time usa bem?)

| Métrica | Meta | Sinal |
|---------|------|-------|
| % tarefas com responsável + prazo | > 90% | Time está usando a estrutura |
| Tarefas concluídas via cockpit | > 60% | Cockpit é o ponto de entrada real |
| Dias para fechar o mês | < 5 dias úteis | Ritual de fechamento funciona |
| % clientes com NFS-e configurada | > 80% | Fiscal integrado ao fluxo |

### 9.2 Métricas financeiras (o produto gera valor?)

| Métrica | Meta | Sinal |
|---------|------|-------|
| Redução de inadimplência (dias médios) | -30% em 90 dias | Fila de cobrança funciona |
| % recebíveis baixados em < 3 dias após vencimento | > 70% | Cobrança rápida |
| Clientes ativos com fechamento 100% no mês | > 85% | Fechamento sem leaks |

### 9.3 Critérios de GO-LIVE

```
✅ Operador executa tarefas do dia sem perguntar por onde começar
✅ Cockpit é aberto antes de qualquer outra tela
✅ Cliente 360° é usado para contexto antes de ligar para o cliente
✅ Zero erros críticos em 5 dias de uso real
✅ Fechamento do mês feito 100% dentro do sistema (sem planilha paralela)
```

---

## 10. PRINCÍPIOS DE DESIGN DO SISTEMA

```
1. AÇÃO ANTES DE DADO
   Toda tela começa perguntando "o que fazer" antes de exibir uma lista.

2. CLIENTE COMO CENTRO
   Qualquer entidade (tarefa, lançamento, nota) pode ser navegada a partir do cliente.
   Mas não o contrário. O cliente é a raiz.

3. ESTADO VISÍVEL
   Nada deve estar "escondido" atrás de filtros para aparecer.
   Se tem pendência, aparece. Se está ok, mostra que está ok.

4. GUIDANÇA, NÃO LIBERDADE TOTAL
   O sistema sugere o próximo passo. O usuário pode ignorar,
   mas o sistema sempre tem uma sugestão fundamentada.

5. FECHAMENTO É UM RITUAL
   O mês não "termina sozinho". Há um ato consciente de encerramento
   com verificação e sign-off. Isso cria responsabilidade.

6. PERMISSÃO POR INTENÇÃO
   O perfil de um usuário reflete sua função, não apenas seu cargo.
   "Operacional" faz tarefas. "Financeiro" cobra. "Fiscal" emite.
   A separação é de responsabilidade, não de hierarquia.
```
