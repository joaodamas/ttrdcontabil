# Fase 1 - Checklist de Pronto

Status consolidado para encerramento da Fase 1 (Valor imediato).

**Checklist único de pendências (homologação, DS, regressão, go-live):** [`CHECKLIST-FINAL-PENDENTES.md`](./CHECKLIST-FINAL-PENDENTES.md) · **Roteiro de permissões:** [`ROTEIRO-HOMOLOGACAO-PERMISSOES.md`](./ROTEIRO-HOMOLOGACAO-PERMISSOES.md)

## Bloco 1 - Cockpit Hoje

- [x] Queries principais (atrasadas, hoje, próximos 7 dias, bloqueios)
- [x] Card reutilizável de tarefa com ações inline
- [x] Ações em lote (concluir, reatribuir, alterar prazo)
- [x] Ordenação por prioridade
- [x] Filtro por usuário/equipe
- [x] Priorização avançada por SLA/criticidade (Cockpit Hoje: score por tipo de tarefa, atraso, prioridade e responsável)

## Bloco 2 - Navegação e Permissões

- [x] Novo menu principal em 6 grupos
- [x] Quick actions contextuais
- [x] Quick actions com contexto de cliente (`clienteId`)
- [x] Regra centralizada de permissão (`perfil + tela`)
- [x] Proteção de rota no guard (redirect quando sem acesso)
- [ ] Validação completa em homologação por perfil real

## Bloco 3 - Cliente 360 v1

- [x] Timeline unificada no detalhe do cliente
- [x] Agregador com múltiplas fontes (events + tarefas + financeiro + competências + NFS-e)
- [x] Severidade e link direto por evento
- [x] Triggers automáticas para criação de eventos
- [x] Exibição de responsável quando disponível
- [x] Contexto completo de ator em 100% dos eventos (agregação `getClienteTimeline`: nome sempre preenchido; `events` lê metadata + campos do doc; ids quando existirem nos documentos de origem)

## Bloco 4 - Design System v1

- [x] Tokens básicos (espaçamento, tipografia, superfícies)
- [x] Utilitários de composição (`stack`, `surface`, `text`)
- [x] Componente `InlineAlert`
- [x] Aplicação inicial em Hoje / Tarefas / Financeiro / Cliente 360
- [x] Padronização adicional em IR / Fechamento / Admin
- [ ] Padronização global de todos os módulos (restante de páginas secundárias)

## Bloco 5 - Posicionamento comercial

- [x] Headline principal
- [x] Proposta de valor
- [x] Pitch de venda

## Critério de pronto recomendado

Fase 1 pode ser considerada "pronta para go-live interno" quando:

- [ ] Blocos 1 e 2 estiverem 100% concluídos
- [ ] Bloco 3 sem pendências críticas de usabilidade
- [ ] Testes de permissão aprovados para pelo menos 2 perfis não-admin
- [ ] Não houver regressão operacional nas rotas de tarefas, clientes e financeiro

## Checklist de go-live

Documento operacional para decisão final de liberação:

- `docs/GO-LIVE-INTERNO-FASE1.md`
- `docs/HOMOLOGACAO-ROTEIRO-EXECUCAO.md`
- `docs/PRE-GOLIVE-FASE1-PLANO-FINAL.md`
- `docs/PLANO-GUERRA-GOLIVE-D1-D7.md`

## Blocos finais de fechamento (reforçado)

### Bloco Final A - Priorização inteligente no Cockpit

Objetivo: transformar o "Hoje" em diferencial real de execução.

- [x] Definir peso por tipo (`fiscal > financeiro > operacional`)
- [x] Definir peso por atraso (ex.: após 3 dias, aumentar score)
- [x] Consolidar score final (referência: `priorityScore = (tipoPeso * 2) + diasAtraso + urgencia`)
- [x] Ordenar o Cockpit pelo score final

### Bloco Final B - Teste real de permissões

Objetivo: eliminar risco de quebra de confiança por acesso incorreto.

- [ ] Criar perfis de validação: `admin`, `operacional`, `financeiro`
- [ ] Navegar todas as rotas com cada perfil
- [ ] Testar acesso direto por URL
- [ ] Testar quick actions e ações inline
- [ ] Validar bloqueio correto e ausência de erro silencioso

### Bloco Final C - Actor 100% nos eventos

Objetivo: transformar timeline em trilha de auditoria confiável.

- [x] Garantir `actorId` em todas as triggers de eventos
- [x] Definir fallback padrão quando não houver ator: `Sistema`
- [x] Exibir `nome` e `avatar` (quando houver) na timeline

### Bloco Final D - Design System mínimo consistente

Objetivo: remover sensação de produto fragmentado.

- [ ] Aplicar tokens em listas, cards e estados vazios
- [x] Padronizar estado de `loading`
- [x] Padronizar estado de `erro`
- [x] Padronizar estado de `vazio`
- [ ] Garantir ausência de telas com visual legado

### Bloco Final E - Regressão funcional completa

Objetivo: evoluir sem quebrar fluxos antigos.

- [ ] Criar tarefa
- [ ] Concluir tarefa
- [ ] Criar cliente
- [ ] Gerar competência
- [ ] Lançamento financeiro
- [ ] Emissão NFS-e
- [ ] Validar que nenhum fluxo principal regrediu
- [x] Criar log operacional de regressão (`docs/REGRESSAO-FUNCIONAL-LOG.md`)

## GO-LIVE reforçado (gates rígidos)

Liberar apenas se todos os itens abaixo estiverem aprovados:

- [ ] Cockpit resolve tarefas sem navegação extra
- [ ] Cliente 360 substitui navegação antiga no uso real
- [ ] Nenhum erro de permissão em perfis reais
- [ ] Timeline confiável (`actor + ação`)
- [ ] Zero erro crítico de console
- [ ] Fluxos principais intactos

## Janela de validação antes da Fase 2

Recomendação operacional:

- [ ] Rodar Fase 1 por 5 a 7 dias de uso interno real
- [ ] Registrar onde usuários travam
- [ ] Registrar cliques incorretos/navegação perdida
- [ ] Consolidar ajustes antes de abrir Fase 2

## Métrica de validação de produto (passagem de fase)

Avançar para Fase 2 apenas quando:

- [ ] Usuário entra e executa tarefa sem pedir ajuda
- [ ] Cliente 360 passa a ser usado espontaneamente
- [ ] Equipe não navega perdida
