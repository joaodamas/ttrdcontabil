# Plano de Guerra Go-live (D1-D7) - Fase 1

Objetivo: executar go-live interno com critério objetivo, evidência e decisão sem achismo.

## Papéis (owners)

- Produto/Ops: coordenação diária, decisão de prioridade, aceite final.
- QA: execução dos cenários de permissão e regressão, registro de incidentes.
- Engenharia: correção de bloqueios técnicos (P0/P1), estabilidade de build.
- UX: revisão de consistência visual e clareza de estados.
- Usuários-chave: validação real de uso (operacional e financeiro).

## Classificação de incidentes

- P0 (bloqueia GO): falha de permissão com exposição indevida, quebra em fluxo crítico sem workaround, erro crítico recorrente.
- P1 (bloqueia GO): fluxo crítico com inconsistência relevante, risco de operação diária.
- P2 (não bloqueia GO): problema com workaround conhecido e baixo impacto.
- P3 (backlog): ajuste cosmético sem impacto funcional.

## Gate obrigatório de GO

- 0 incidentes P0/P1 abertos.
- 100% PASS nos cenários críticos de permissão.
- 100% PASS nos fluxos críticos de regressão.
- Evidências registradas:
  - `docs/VALIDACAO-PERMISSOES.md`
  - `docs/REGRESSAO-FUNCIONAL-LOG.md`
  - `docs/GO-LIVE-INTERNO-FASE1.md`

---

## D1 - Baseline técnico + preparação de teste

**Owner principal:** Engenharia  
**Apoio:** QA, Produto/Ops

### Entrada
- Código atualizado da Fase 1
- Ambientes e perfis de teste disponíveis

### Execução
- [ ] Confirmar ambiente de homologação funcional *(pendente: validação humana no ambiente alvo)*
- [ ] Garantir usuários de teste: admin, operacional, financeiro *(pendente: criação/credenciais no Firebase)*
- [x] Rodar validação técnica mínima (build/lint aplicável) *(executado no repositório local — ver registro D1 abaixo)*
- [x] Registrar bloqueios técnicos iniciais e classificar P0-P3

### Saída (aceite)
- [ ] Ambiente apto para homologação *(bloqueado até API key válida no build e ambiente definido)*
- [x] Lista de bloqueios técnicos criada com severidade *(ver seção “Registro de execução — D1”)*
- [ ] Sem P0 técnico impeditivo para iniciar D2 *(não atendido: ver P1 abaixo; D2 pode iniciar em ambiente já configurado com `dev` se política permitir)*

---

## Registro de execução — D1 (preenchido automaticamente na auditoria técnica)

**Data do registro:** 2026-04-29  
**Ambiente:** workspace local (Windows), branch conforme repositório do projeto.

### Comandos executados e resultado

| Comando | Pasta | Resultado |
|--------|-------|-----------|
| `npm run lint` | raiz (`ttrdcontabil`) | **FALHOU** — ~89 erros (inclui `functions/lib/*.js` no escopo do ESLint, regras `react-hooks/set-state-in-effect`, `no-explicit-any`, etc.) |
| `npm run build` | raiz | **FALHOU no prerender** — `FirebaseError: auth/invalid-api-key` em `/admin/servicos` (variáveis Firebase ausentes ou inválidas no ambiente de build) |
| `npm run build && npm run lint` | `functions/` | **TypeScript build OK**; ESLint em `src/` sem falha bloqueante reportada na execução |

### Correção já aplicada no código (baseline)

- Ajuste de tipagem em `src/lib/firestore-client.ts` (`ClienteTimelineEvento.severidade`) para o typecheck passar.

### Incidentes técnicos — classificação

| ID | Descrição | Severidade | Owner sugerido | Próxima ação |
|----|-----------|------------|----------------|--------------|
| D1-T01 | `next build` falha sem credenciais Firebase válidas (`auth/invalid-api-key`) | **P1** | Engenharia | Garantir `.env.local` / secrets de CI com `NEXT_PUBLIC_*` e demais chaves corretas; ou documentar build só em ambiente com secrets |
| D1-T02 | ESLint na raiz acusa centenas de problemas; inclui artefatos `functions/lib` | **P1** | Engenharia | Excluir `functions/lib` do eslint da raiz ou rodar lint só em `src/`; corrigir erros prioritários ou ajustar pipeline |
| D1-T03 | Usuários de teste (admin / operacional / financeiro) não confirmados neste registro | **P2** | Produto/Ops + Eng | Criar contas e documentar e-mails/senhas de homologação |
| D1-T04 | Ambiente de homologação “oficial” não validado neste registro | **P2** | Produto/Ops | Confirmar URL, versão deployada e janela de teste |

### Veredito D1 (para avanço)

- **D1 técnico (repo):** parcialmente executado — baseline registrada, **há P1 abertos** para release/build limpo.
- **Recomendação:** em paralelo ao fechamento de D1-T01/D1-T02, **D2 pode começar** assim que existir ambiente acessível com Firebase válido (ex.: `npm run dev` com `.env` correto), desde que incidentes de permissão sejam rastreados como P0.

---

## D2 - Permissões (menu + URL + quick actions)

**Owner principal:** QA  
**Apoio:** Engenharia

### Entrada
- D1 aprovado

### Execução
- [ ] Rodar `docs/VALIDACAO-PERMISSOES.md` por perfil
- [ ] Validar menu por perfil
- [ ] Validar URL direta (rotas permitidas e proibidas)
- [ ] Validar quick actions por perfil

### Saída (aceite)
- [ ] Evidência por cenário (print + URL + resultado)
- [ ] 0 falha P0/P1 de autorização
- [ ] Itens pendentes documentados com owner e prazo

---

## D3 - Permissões avançadas (ações inline) + reteste

**Owner principal:** QA  
**Apoio:** Engenharia

### Entrada
- D2 executado

### Execução
- [ ] Testar concluir/editar/reatribuir com perfis limitados
- [ ] Confirmar bloqueio com feedback claro (sem erro silencioso)
- [ ] Retestar correções abertas em D2

### Saída (aceite)
- [ ] Matriz de permissões fechada
- [ ] 0 incidente P0/P1 aberto em permissão

---

## D4 - Regressão funcional core

**Owner principal:** QA  
**Apoio:** Produto/Ops

### Entrada
- D3 aprovado

### Execução (em `docs/REGRESSAO-FUNCIONAL-LOG.md`)
- [ ] Tarefas: criar e concluir
- [ ] Cliente: criar
- [ ] Competência: gerar e validar status
- [ ] Financeiro: lançamento + baixa + atraso
- [ ] NFS-e: emissão individual (e lote se aplicável)
- [ ] Confirmar ausência de erro crítico de console

### Saída (aceite)
- [ ] PASS/FAIL preenchido para todos os cenários
- [ ] Incidentes classificados e priorizados
- [ ] Sem P0/P1 aberto nos fluxos críticos

---

## D5 - Consistência UX/UI final

**Owner principal:** UX  
**Apoio:** Produto/Ops, Engenharia

### Entrada
- D4 executado

### Execução
- [ ] Auditoria visual: Clientes, Tarefas, Financeiro, IR, Fechamento, Admin
- [ ] Validar padrão de loading/erro/vazio
- [ ] Identificar e registrar telas com visual legado
- [ ] Corrigir inconsistências P1/P2 de maior impacto operacional

### Saída (aceite)
- [ ] Lista final de telas revisadas
- [ ] Sem inconsistência crítica de interação nos módulos principais

---

## D6 - Simulação operacional (dia real)

**Owner principal:** Produto/Ops  
**Apoio:** Usuários-chave, QA

### Entrada
- D5 aprovado

### Execução
- [ ] Operar dia real com 2-5 usuários internos
- [ ] Registrar fricções: onde travam, perguntam, clicam errado
- [ ] Medir tempo de execução das tarefas principais

### Saída (aceite)
- [ ] Top 5 fricções reais registradas
- [ ] Plano de ajuste rápido (pré Fase 2) definido

---

## D7 - Comitê de decisão GO/NO-GO

**Owner principal:** Produto/Ops  
**Apoio:** QA, Engenharia, UX

### Entrada
- D1-D6 executados

### Execução
- [ ] Consolidar evidências e incidentes finais
- [ ] Confirmar critérios de gate obrigatório de GO
- [ ] Preencher decisão em `docs/GO-LIVE-INTERNO-FASE1.md`

### Saída (aceite)
- [ ] Decisão formal: GO ou NO-GO
- [ ] Se NO-GO: plano de 24h com foco em P0/P1 e reteste

---

## Quadro diário (snapshot)

### Snapshot atual — D1

- **Data:** 2026-04-29
- **Dia (D1..D7):** D1
- **Owner do dia:** Engenharia (baseline técnica registrada na auditoria)
- **Status:** [x] Em execução [ ] Concluído [ ] Bloqueado *(D1 fechado como “parcial — P1 abertos”)*
- **Bloqueios P0/P1:**
  - **P1:** `next build` com `auth/invalid-api-key` sem secrets corretos
  - **P1:** ESLint na raiz com volume alto de erros + possível inclusão de `functions/lib`
- **Decisão do dia:** Baseline documentada; **não** declarar D1 “verde para CI” até T01/T02 endereçados ou aceitos por política.
- **Próximo passo:** (1) Configurar env para build/homologação (T01). (2) Ajustar escopo do lint ou corrigir erros críticos (T02). (3) Iniciar **D2** assim que houver login funcional em homologação.

### Template (copiar para D2 em diante)

- Data:
- Dia (D1..D7):
- Owner do dia:
- Status: [ ] Em execução [ ] Concluído [ ] Bloqueado
- Bloqueios P0/P1:
- Decisão do dia:
- Próximo passo:
