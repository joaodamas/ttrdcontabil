# Plano Final de Execução - Pré Go-live (Fase 1)

Objetivo desta etapa: garantir consistência, confiança e fluidez antes de abrir Fase 2.

## Bloco Final B - Teste real de permissões

**Objetivo:** garantir que nenhum usuário veja ou execute o que não deve.

### Perfis obrigatórios

- Admin
- Operacional
- Financeiro

### Checklist executável

1) Navegação completa
- [ ] Acessar todos os itens de menu por perfil
- [ ] Validar que só aparece o que pode ver
- [ ] Validar ausência de menu vazio/quebrado

2) Acesso direto por URL (crítico)
- [ ] Copiar URL de telas restritas (ex.: admin)
- [ ] Tentar acessar com perfil sem permissão
- [ ] Validar redirect correto ou tela de sem acesso
- [ ] Confirmar ausência de erro 500 / tela quebrada / dados visíveis indevidos

3) Quick actions
- [ ] Validar visibilidade por perfil
- [ ] Executar ações com perfil limitado
- [ ] Validar tratamento correto de erro (nunca silencioso)

4) Ações inline
- [ ] Concluir tarefa
- [ ] Editar
- [ ] Reatribuir
- [ ] Validar bloqueio + feedback visual quando não permitido

### Evidência obrigatória

- [ ] Print por cenário
- [ ] Registro de falha (se houver)
- [ ] Checklist marcado por perfil

**Prazo:** 3 dias

---

## Bloco Final D - Design System consistente

**Objetivo:** eliminar sensação de sistema remendado.

### Checklist executável

1) Estados padrão (todas as telas)
- [ ] Loading com skeleton/spinner consistente
- [ ] Erro com mensagem clara e ação de retry
- [ ] Vazio com mensagem + CTA

2) Auditoria visual
- [ ] Clientes
- [ ] Tarefas
- [ ] Financeiro
- [ ] IR
- [ ] Fechamento
- [ ] Admin

Validar:
- [ ] Tipografia consistente
- [ ] Espaçamento padrão
- [ ] Cores coerentes
- [ ] Botões iguais

3) Remoção de legado
- [ ] Eliminar classes antigas
- [ ] Remover estilos duplicados
- [ ] Evitar exceções visuais

### Evidência

- [ ] Print antes/depois (quando possível)
- [ ] Lista de telas revisadas

**Prazo:** 4-6 dias

---

## Bloco Final E - Regressão funcional

**Objetivo:** garantir que o sistema não perdeu funcionalidade.

### Fluxos obrigatórios (E2E manual)

1) Tarefas
- [ ] Criar tarefa
- [ ] Editar
- [ ] Concluir

2) Cliente
- [ ] Criar cliente
- [ ] Editar dados
- [ ] Vincular serviço

3) Competência
- [ ] Gerar competência
- [ ] Validar status

4) Financeiro
- [ ] Criar lançamento
- [ ] Dar baixa
- [ ] Validar atraso

5) NFS-e (crítico)
- [ ] Emitir nota individual
- [ ] Emitir em lote (quando aplicável)
- [ ] Validar retorno

### Critérios

- [ ] Sem erro de console
- [ ] Sem travamento
- [ ] Sem inconsistência de dados

### Evidência

- [ ] Log de execução
- [ ] Prints por fluxo
- [ ] Erros registrados

**Prazo:** 3-4 dias

---

## Bloco Final - Go-live reforçado

**Objetivo:** tomada de decisão objetiva, sem achismo.

### Checklist decisório

- [ ] Permissões 100% validadas
- [ ] Cockpit funcional sem fricção
- [ ] Cliente 360 utilizável
- [ ] Zero erro crítico
- [ ] Fluxos operacionais OK

### Documento obrigatório

- `docs/GO-LIVE-INTERNO-FASE1.md` deve conter:
  - [ ] Resumo dos testes
  - [ ] Lista de problemas
  - [ ] Decisão final: GO / NO-GO

**Prazo:** 1 dia (após testes)

---

## Bloco Final - Validação real (mais importante)

**Objetivo:** validar comportamento humano (não apenas código).

### Execução

- [ ] 2 a 5 usuários internos
- [ ] Uso real por 5 a 7 dias

### Observar

- [ ] Onde travam
- [ ] Onde perguntam
- [ ] Onde ignoram funcionalidades
- [ ] Onde clicam errado

### Registro diário

- [ ] Lista de fricções
- [ ] Sugestões
- [ ] Tempo de execução das tarefas principais

### Saída esperada

- [ ] Top 5 problemas reais
- [ ] Ajustes obrigatórios antes da Fase 2

---

## Cronograma final (realista)

- Permissões: 3 dias (paralelo com regressão)
- Regressão: 3-4 dias (paralelo com permissões)
- Design System: 4-6 dias (parcialmente paralelo)
- Go-live decisão: 1 dia (após testes)
- Uso real: 5-7 dias (contínuo)

---

## Regra final

Se o usuário precisar perguntar "o que faço agora?", não abrir Fase 2.
