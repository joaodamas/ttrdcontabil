# Homologação - Roteiro de Execução (Fase 1)

Objetivo: executar homologação em ordem, com critérios de bloqueio claros, para decisão GO/NO-GO em até 1 dia.

## Janela sugerida

- Duração total: 4h a 6h
- Participantes mínimos: 1 produto/ops + 1 técnico + 2 usuários-chave (não-admin)

## Sequência obrigatória (não inverter)

## Etapa 0 — Preparação (30 min)

- [ ] Confirmar ambiente de homologação atualizado.
- [ ] Garantir usuários de teste: admin, operacional, fiscal, financeiro, leitura.
- [ ] Definir responsável por registrar evidências (prints, URLs, observações).
- [ ] Abrir documentos:
  - `docs/VALIDACAO-PERMISSOES.md`
  - `docs/GO-LIVE-INTERNO-FASE1.md`

**Bloqueio:** sem usuários de teste e sem ambiente estável, não iniciar.

## Etapa 1 — Fluxo crítico do dia (60 min)

- [ ] Validar `Hoje` (atrasadas, hoje, 7 dias, bloqueios).
- [ ] Confirmar ordenação por SLA perceptível (prioridade + atraso + responsável).
- [ ] Testar ações inline e lote (concluir, reatribuir, prazo).

**Bloqueio:** falha em ação de lote ou inconsistência de ordenação = NO-GO temporário.

## Etapa 2 — Permissões e navegação (60 min)

- [ ] Rodar checklist por perfil no `VALIDACAO-PERMISSOES`.
- [ ] Validar quick actions por perfil/tela.
- [ ] Testar acesso direto por URL (permitida e proibida).
- [ ] Confirmar redirect para `/hoje` quando sem permissão.

**Bloqueio:** qualquer rota sensível acessível por perfil não autorizado = NO-GO.

## Etapa 3 — Cliente 360 e eventos (60 min)

- [ ] Abrir cliente e verificar timeline (eventos, severidade, links).
- [ ] Gerar evento real por:
  - [ ] criar/atualizar tarefa
  - [ ] criar/atualizar lançamento
  - [ ] criar competência
  - [ ] criar NFS-e emitida
  - [ ] atualizar fiscal
- [ ] Confirmar atualização de timeline em novo carregamento.

**Bloqueio:** eventos não aparecerem ou links críticos quebrados = NO-GO.

## Etapa 4 — UX e consistência visual (30 min)

- [ ] Revisar módulos-chave: Hoje, Tarefas, Financeiro, IR, Fechamento, Cliente 360, Admin.
- [ ] Verificar padrão de títulos, subtítulos, alertas e superfícies.
- [ ] Validar legibilidade em resolução comum de operação.

**Bloqueio:** não-bloqueante para GO se impacto for apenas estético e houver plano de ajuste curto.

## Etapa 5 — Fechamento da decisão (20 min)

- [ ] Consolidar PASS/FAIL por perfil.
- [ ] Listar incidentes e classificar:
  - [ ] Crítico (bloqueia GO)
  - [ ] Médio (corrigir em hotfix curto)
  - [ ] Baixo (backlog)
- [ ] Preencher decisão em `GO-LIVE-INTERNO-FASE1.md`.

## Critério objetivo de GO

Liberar somente se:

- [ ] 0 incidentes críticos abertos
- [ ] PASS em pelo menos 2 perfis não-admin
- [ ] Fluxo crítico do dia sem regressão
- [ ] Permissões sem violação de segurança funcional

## Plano de contingência (se NO-GO)

- [ ] Congelar novas mudanças.
- [ ] Corrigir somente itens críticos.
- [ ] Reexecutar Etapas 1, 2 e 3.
- [ ] Nova decisão em até 24h.
