# Regressão Funcional - Log de Execução (Fase 1)

Objetivo: registrar execução manual E2E dos fluxos críticos antes da decisão de GO/NO-GO.

## Instruções rápidas

- Preencher um bloco por execução real.
- Anexar evidência (print, URL, ou referência de vídeo) em cada cenário.
- Em caso de falha, abrir incidente e registrar ID.

## Ambiente e contexto

- Data:
- Responsável:
- Ambiente (local/homolog/prod interno):
- Build/commit:
- Perfil utilizado:

## Bloco E - Cenários obrigatórios

### 1) Tarefas - Criar
- Status: [ ] PASS [ ] FAIL
- Passos executados:
- Resultado observado:
- Evidência:
- Incidente (se FAIL):

### 2) Tarefas - Concluir
- Status: [ ] PASS [ ] FAIL
- Passos executados:
- Resultado observado:
- Evidência:
- Incidente (se FAIL):

### 3) Cliente - Criar
- Status: [ ] PASS [ ] FAIL
- Passos executados:
- Resultado observado:
- Evidência:
- Incidente (se FAIL):

### 4) Competência - Gerar
- Status: [ ] PASS [ ] FAIL
- Passos executados:
- Resultado observado:
- Evidência:
- Incidente (se FAIL):

### 5) Financeiro - Lançamento e baixa
- Status: [ ] PASS [ ] FAIL
- Passos executados:
- Resultado observado:
- Evidência:
- Incidente (se FAIL):

### 6) NFS-e - Emissão
- Status: [ ] PASS [ ] FAIL
- Escopo: [ ] individual [ ] lote
- Passos executados:
- Resultado observado:
- Evidência:
- Incidente (se FAIL):

## Critérios transversais

- Console sem erro crítico: [ ] SIM [ ] NÃO
- Sem travamentos de tela: [ ] SIM [ ] NÃO
- Dados consistentes após refresh: [ ] SIM [ ] NÃO

## Resultado consolidado

- Fluxos aprovados: ___ / 6
- Decisão recomendada: [ ] GO [ ] NO-GO
- Pendências obrigatórias antes de liberar:
  - 
  - 
  - 

## Notas de implementação (CI / código)

- **2026-04-29:** `npm run lint` e `npm run build` executados com sucesso após ajustes em Cliente 360 (ordem de hooks), Financeiro (visibilidade da tabela sem `setState` síncrono no efeito; `queueMicrotask` ao limpar e-mails da fila) e timeline (`getClienteTimeline` com ator sempre preenchido). **Não substitui** os testes manuais do bloco E acima.
- **2026-04-29 (tarde):** `npm run lint` + `npm run build` OK; refatoração `hoje/page.tsx` (`slaScoreHoje` / `sortTasksBySla` no módulo para eliminar warning `react-hooks/exhaustive-deps`). **Não substitui** E2E do bloco E.
