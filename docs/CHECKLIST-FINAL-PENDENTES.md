# Checklist final — itens pendentes (TTRD Contábil)

Mapa único do que falta para go-live interno seguro e abertura da Fase 2. Complementa `REDESIGN-SAAS-CHECKLIST.md` e `FASE1-CHECKLIST-PRONTO.md`.

**Roteiro pronto para colar evidências:** [`ROTEIRO-HOMOLOGACAO-PERMISSOES.md`](./ROTEIRO-HOMOLOGACAO-PERMISSOES.md)

### Última verificação automatizada (CI local)

- **2026-04-29:** `npm run lint` (0 erros; warnings remanescentes em `page-client`, `_api_backup`, `competencia-form`) · `npm run build` OK · ajuste de lint em `hoje/page.tsx` (ordenação SLA em funções de módulo).

---

## 1. Homologação de permissões (crítico)

### Objetivo

Garantir segurança e comportamento correto por perfil.

### Preparação

- [ ] Criar usuários reais (ou contas de teste equivalentes): **Admin**, **Operacional**, **Financeiro**

### Execução

- [ ] Navegar **todas** as rotas com cada perfil
- [ ] Testar acesso direto por URL (copiar rotas restritas)
- [ ] Validar Quick Actions por perfil
- [ ] Validar ações inline (editar, concluir, baixar, etc.)

### Validação

- [ ] Nenhuma tela indevida acessível
- [ ] Nenhum erro silencioso
- [ ] Nenhum erro 500
- [ ] Redirecionamento correto ao bloquear acesso

### Evidência

- [ ] Prints (ou gravação) por cenário
- [ ] Registro de falhas encontradas
- [ ] Correções aplicadas e revalidadas

---

## 2. Design system — cobertura total

### Objetivo

Eliminar inconsistência visual e sensação de sistema legado.

### Estados obrigatórios (todas as telas)

- [ ] **Loading** padronizado (skeleton ou spinner coerente com o DS)
- [ ] **Erro** padronizado (mensagem + ação “tentar de novo” ou similar)
- [ ] **Vazio** padronizado (CTA claro)

### Padronização visual

- [ ] Aplicar tokens em **todas** as páginas secundárias
- [ ] Padronizar: cards, listas, tabelas, botões, inputs

### Limpeza de legado

- [ ] Remover classes antigas / estilos duplicados onde aparecerem
- [ ] Eliminar componentes claramente inconsistentes com o DS atual

### Validação

- [ ] Nenhuma tela “fora do padrão” óbvia
- [ ] Tipografia e espaçamento consistentes
- [ ] Cores com função (sem ruído decorativo desnecessário)

---

## 3. Regressão funcional completa (E2E)

### Objetivo

Garantir que nada quebrou após as mudanças.

### Fluxos obrigatórios

**Tarefas**

- [ ] Criar tarefa
- [ ] Editar tarefa
- [ ] Concluir tarefa

**Clientes**

- [ ] Criar cliente
- [ ] Editar cliente
- [ ] Vincular serviço

**Competências**

- [ ] Gerar competência
- [ ] Validar status

**Financeiro**

- [ ] Criar lançamento
- [ ] Baixar lançamento
- [ ] Validar atraso / regras de exibição

**NFS-e (crítico)**

- [ ] Emitir nota individual
- [ ] Emitir em lote
- [ ] Validar retorno / status

### Registro

- [ ] Preencher `docs/REGRESSAO-FUNCIONAL-LOG.md`
- [ ] Registrar erros encontrados
- [ ] Corrigir e revalidar

### Critério

- [ ] Zero regressão nos fluxos principais
- [ ] Zero erro crítico de execução nos cenários acima

---

## 4. Validação de uso real (5–7 dias)

### Objetivo

Validar comportamento humano (UX real).

### Execução

- [ ] Selecionar 2–5 usuários internos
- [ ] Uso em rotina real (não demo guiada)

### Monitoramento

- [ ] Onde o usuário trava
- [ ] Onde pede ajuda
- [ ] Onde clica errado
- [ ] Onde ignora funcionalidades

### Registro diário

- [ ] Lista de fricções
- [ ] Dúvidas recorrentes
- [ ] Sugestões

### Saída

- [ ] Top 5 problemas reais
- [ ] Ajustes obrigatórios antes da Fase 2

---

## 5. Go-live interno (decisão final)

### Objetivo

Tomada de decisão objetiva.

### Checklist obrigatório

- [ ] Cockpit resolve tarefas sem navegação extra
- [ ] Cliente 360 usado espontaneamente (ou adotado como referência no fluxo)
- [ ] Nenhum erro de permissão em perfis reais
- [ ] Timeline confiável (ator + ação)
- [ ] Zero erro crítico no console em uso típico
- [ ] Fluxos operacionais funcionando (alinhado à regressão E2E)

### Documento

- [ ] Preencher `docs/GO-LIVE-INTERNO-FASE1.md`

### Decisão

- [ ] **GO** — liberar uso interno / próxima fase com critérios definidos  
- [ ] **NO-GO** — listar bloqueadores e nova data de revisão  

---

## 6. Backlog imediato (pós go-live)

### Produto / monetização

- [ ] Negociar avançado (templates + histórico)
- [ ] CRM básico de cobrança
- [ ] Histórico de interações financeiras

### Inteligência

- [ ] Projeção receita vs orçamento
- [ ] Indicador de risco financeiro (%)

### Produto

- [ ] Melhorar recomendação automática (regras / IA simples)
- [ ] Evoluir cockpit com sugestões inteligentes

---

## Resumo executivo

**Prioridade mínima para abrir Fase 2 com segurança:**

1. Permissões testadas de ponta a ponta  
2. Regressão E2E zerada nos fluxos principais  
3. Design consistente nas telas em uso  
4. Evidência de uso real sem dependência constante de “alguém do time” para operar o dia a dia  

Documentos relacionados: `HOMOLOGACAO-ROTEIRO-EXECUCAO.md`, `PRE-GOLIVE-FASE1-PLANO-FINAL.md`, `PLANO-GUERRA-GOLIVE-D1-D7.md` (quando aplicável).
