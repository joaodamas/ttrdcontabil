# Biblioteca de Prompts — TTRD Contábil

> Para uso com Claude Code em futuras evoluções do produto.
> Versão 1.0 — 2026-04-30

---

## USO DESTA BIBLIOTECA

Cada prompt é um template reutilizável. Substitua os `{placeholders}` antes de usar.

**Stack do projeto:**
- Next.js 16 App Router, React 19, TypeScript 5
- Tailwind CSS 4, Radix UI, shadcn/ui (base-nova)
- Firebase (Auth + Firestore + Storage + Functions)
- React Hook Form + Zod, Sonner (toasts)
- Pasta raiz: `src/`, componentes em `src/components/`, páginas em `src/app/(dashboard)/`

---

## CATEGORIA 1 — ADICIONAR FEATURES

### PROMPT-F1: Nova página de listagem

```
Você é um senior frontend engineer.

Crie a página `/src/app/(dashboard)/{rota}/page.tsx` para o módulo `{modulo}`.

Stack: Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Firebase Firestore.

Requisitos OBRIGATÓRIOS:
1. Usar `'use client'` directive
2. Loading state: skeleton animado (NÃO usar Loader2 spinner nu)
3. Erro state: InlineAlert com tone="danger" + botão "Tentar novamente"
4. Empty state: TableEmptyState com CTA para criação
5. Tabela:
   - Header com classe `section-label` (não font-medium)
   - Rows com `hover:bg-muted/20 transition-colors`
   - Badges de status: InlineBadge com CSS vars (NÃO bg-green-*, bg-red-*)
   - Coluna de ação com ChevronRight no hover
6. Filtros: padrão FilterBtn (ativo = bg-foreground, inativo = bg-background border-border)
7. Filtros de dimensões diferentes separados por `section-label` e divisor vertical
8. Suspense wrapper com fallback igual ao skeleton
9. Paginação com PAGE_SIZE = 20, buildUrl helper para URL params

Dados desta coleção Firestore:
{campos_e_tipos}

Filtros necessários:
{filtros}

Não usar cores hardcoded. Usar apenas variáveis CSS do design system.
Não usar spinner. Usar skeleton.
Não usar Badge component com variant — usar InlineBadge.
```

---

### PROMPT-F2: Novo componente de formulário

```
Você é um senior frontend engineer.

Crie o componente `{NomeDoForm}` em `src/components/{dominio}/{nome-do-form}.tsx`.

Stack: React 19, TypeScript, react-hook-form + Zod, Radix UI/shadcn.

Requisitos:
1. Schema Zod com validações específicas (não apenas z.string())
2. useForm com zodResolver
3. Campos obrigatórios com Label + Input/Select + mensagem de erro inline
4. Botão submit com estado loading (ícone Loader2 + texto "Salvando...")
5. Sucesso: toast.success() via sonner
6. Erro: toast.error() via sonner + setError no campo se erro de campo específico
7. Props: `onSaved?: () => void`, `defaultValues?: Partial<{Tipo}>`
8. Tipagem forte — sem `any`, sem `Record<string, unknown>` desnecessário

Campos do formulário:
{campos}

Regras de validação:
{validacoes}

Coleção Firestore onde gravar:
{colecao}
```

---

### PROMPT-F3: Nova Cloud Function

```
Você é um senior Firebase engineer.

Crie uma Cloud Function em `functions/src/{nome}.ts`.

Stack: Firebase Functions v2 (onDocumentUpdated / onSchedule), TypeScript, firebase-admin.

Requisitos:
1. Importar apenas o necessário do firebase-admin
2. Usar batch writes para múltiplos documentos (limite 499 ops/batch)
3. Tratar erros com try/catch e logger.error()
4. Não fazer writes desnecessários (verificar se mudança é relevante antes de agir)
5. Trigger type: {tipo_trigger} — {colecao}/{documento}

Lógica da função:
{logica_de_negocio}

Campos Firestore envolvidos:
{campos}

Considerar edge cases:
- Documento pode não existir ao buscar referências
- Batch pode precisar de múltiplos commits para > 499 operações
- Cancelar execução se dados não mudaram (early return)
```

---

## CATEGORIA 2 — CORRIGIR BUGS

### PROMPT-B1: Bug de dados incorretos

```
Você é um senior debugger.

Há um bug no módulo {modulo}: {descricao_do_bug}.

Comportamento esperado: {esperado}
Comportamento atual: {atual}
Como reproduzir: {passos}

Arquivos relevantes:
- {arquivo_1}
- {arquivo_2}

Regras para a correção:
1. NÃO mudar lógica de negócio além do necessário
2. NÃO adicionar features desnecessárias
3. NÃO refatorar código que não está relacionado ao bug
4. Adicionar comentário explicando o fix apenas se a causa não é óbvia
5. Verificar se o fix não quebra outros fluxos que usam o mesmo dado

Mostre: causa raiz → linha específica com problema → correção pontual.
```

---

### PROMPT-B2: Bug de UI/UX

```
Você é um senior frontend engineer focado em UX.

Há um problema visual no componente {componente}: {descricao}.

Arquivo: {caminho_do_arquivo}

Regras:
1. NÃO mudar lógica de dados
2. NÃO mudar props existentes (adicionar novas apenas se necessário)
3. Usar apenas CSS vars do design system (não cores hardcoded)
4. Verificar se a correção funciona em dark mode (vars devem ser as mesmas)
5. Verificar se a correção funciona em mobile (< 768px)

Contexto visual do restante do sistema:
- Background da página: bg-background (oklch 0.96)
- Cards: bg-card com border border-border/60
- Texto principal: text-foreground
- Texto secundário: text-muted-foreground
- Semântica: success=verde, warning=âmbar, destructive=vermelho, info=azul
```

---

## CATEGORIA 3 — MELHORAR UX

### PROMPT-U1: Adicionar skeleton a uma tela existente

```
Você é um senior frontend engineer.

Substitua o loading state de {arquivo} de Loader2 spinner para skeleton animado.

Regras:
1. O skeleton deve ter a mesma estrutura geral do conteúdo real
2. Usar classes: `animate-pulse`, `bg-muted`, `skeleton-pulse` (definida em globals.css)
3. Extrair como função `{NomeDaTela}Skeleton` no mesmo arquivo
4. Usar no Suspense fallback também: `<Suspense fallback={<{NomeDaTela}Skeleton />}>`
5. NÃO mudar a lógica de dados — apenas o estado de loading

Conteúdo da tela quando carregada:
{descricao_do_conteudo}
```

---

### PROMPT-U2: Adicionar indicadores de saúde na lista de clientes

```
Você é um senior frontend engineer.

Na tabela de clientes em `src/app/(dashboard)/clientes/page.tsx`,
adicione 3 status dots (operacional, financeiro, fiscal) por linha de cliente.

Os dados de saúde precisam ser computados. Use esta lógica:
- Saúde operacional: se cliente tem tarefas urgentes atrasadas → risco, senão ok
- Saúde financeiro: se cliente tem lançamentos vencidos → risco, senão ok  
- Saúde fiscal: se cliente tem NFS-e configurada → ok, senão atencao

IMPORTANTE: Os dados de saúde precisam ser carregados em batch (não por cliente individual).
Fazer 3 queries adicionais cobrindo todos os clientes carregados — não N queries para N clientes.

Visual dos dots:
- ok:      ● verde  (bg-success)
- atencao: ● âmbar  (bg-warning)  
- risco:   ● vermelho pulsante (bg-destructive animate-pulse)

Adicionar como nova coluna após "Status", com header "Saúde".
NÃO remover nenhuma coluna existente.
NÃO quebrar o modal de cliente existente.
```

---

### PROMPT-U3: Converter tabs para layout scroll único

```
Você é um senior frontend engineer.

O componente {arquivo} usa `<Tabs>` para separar seções do cliente.
Converta para layout scroll único com nav sticky.

Padrão alvo (já implementado em clientes/[id]/page-client.tsx versão pós-refactor):
- Layout 70/30: conteúdo principal (scroll) + aside fixo (sticky)
- Nav sticky com botões de scroll por seção (IntersectionObserver)
- Cada seção tem `id="sec-{nome}"` e `scroll-mt-28`
- Aside tem: saúde do cliente + próximos passos + resumo cadastral

Regras:
1. Manter TODOS os dados e funcionalidades existentes
2. Manter todos os componentes filhos intactos
3. Apenas mudar a estrutura de layout e navegação
4. Usar IntersectionObserver para destacar seção ativa no nav
```

---

## CATEGORIA 4 — REFATORAÇÃO SEGURA

### PROMPT-R1: Extrair lógica de página para hook

```
Você é um senior React engineer.

Extraia a lógica de dados de {arquivo_da_pagina} para um hook customizado
`use{NomeDoDominio}` em `src/hooks/use-{nome}.ts`.

Regras:
1. O hook deve retornar: { data, loading, error, reload }
2. NÃO mover lógica de UI para o hook (apenas dados e side effects)
3. Manter a mesma interface de dados que a página usa hoje
4. A página deve ficar limpa: apenas composição de componentes

Lógica atual na página:
{colar_o_useEffect_e_useState_relevantes}
```

---

### PROMPT-R2: Padronizar badges de status em um arquivo

```
Você é um senior frontend engineer.

O projeto tem STATUS_MAP/PRIORIDADE_MAP duplicados em múltiplas páginas.
Consolide em `src/components/ui/status-badge.tsx` que já existe.

Arquivos com duplicação:
{lista_de_arquivos}

Padrão alvo: InlineBadge com CSS vars (não Badge component com variant).
Criar funções específicas: TarefaStatusBadge, PrioridadeBadge, etc.

Regras:
1. Não quebrar importações existentes
2. Manter backward compatibility nas props
3. Usar apenas CSS vars semânticas
4. Adicionar dot animado para urgente/crítico
```

---

## CATEGORIA 5 — DEPLOY E OPERAÇÃO

### PROMPT-D1: Checklist pré-deploy

```
Antes de fazer deploy, verifique:

1. TypeScript:
   npx tsc --noEmit
   → Zero erros aceitos

2. Build:
   npm run build
   → Sem erros de prerender
   → .env.production presente com todas as NEXT_PUBLIC_* vars

3. Regras de Firestore:
   firebase deploy --only firestore:rules
   → Testar read/write para cada perfil

4. Deploy:
   firebase deploy --only hosting
   → Verificar URL: https://ttrdcontabil-jpproject.web.app

5. Smoke test pós-deploy:
   □ Login funciona
   □ Cockpit carrega
   □ Lista de clientes carrega
   □ Criar tarefa funciona
   □ Financeiro carrega
```

---

### PROMPT-D2: Rollback de emergência

```
Em caso de bug crítico em produção:

1. Identificar o último commit funcional:
   git log --oneline -10

2. Reset e redeploy:
   git reset --hard {commit_hash}
   
   # Recriar .env.production se não está no repo:
   # Variáveis estão no apphosting.yaml
   
   npm run build
   firebase deploy --only hosting

3. Notificar equipe com:
   - Qual versão foi revertida
   - Qual era o bug
   - Quando o fix estará disponível
```

---

## CATEGORIA 6 — EVOLUÇÃO DO PRODUTO

### PROMPT-E1: Adicionar novo módulo ao sistema

```
Você é um senior fullstack engineer.

Adicione o módulo {nome_do_modulo} ao sistema TTRD Contábil.

Stack: Next.js App Router, React 19, TypeScript, Firebase Firestore, Tailwind CSS 4.

O módulo precisa de:
1. Rota: `/src/app/(dashboard)/{rota}/page.tsx`
2. Tipos: adicionar interface em `/src/types/firestore.ts`
3. Query helper: adicionar função em `/src/lib/firestore-client.ts`
4. Permissão: adicionar TelaKey em `/src/lib/permissions.ts` + sidebar
5. Componente de form (se necessário): `/src/components/{dominio}/`

Funcionalidade do módulo:
{descricao_completa}

Campos da coleção Firestore:
{campos}

Quem pode acessar:
{perfis_com_acesso}

Siga os padrões existentes:
- Loading: skeleton (não spinner)
- Badges: InlineBadge com CSS vars
- Filtros: padrão FilterBtn
- Empty state: TableEmptyState com CTA
- Headers de tabela: section-label
```

---

### PROMPT-E2: Integrar Claude API para feature de IA

```
Você é um senior AI engineer.

Adicione a feature de IA: {descricao_da_feature}

Usar: Claude claude-sonnet-4-6 via Anthropic SDK com prompt caching.

Localização: Cloud Function em `functions/src/{nome}.ts`
Trigger: {tipo} — chamado quando {quando}

Estrutura obrigatória:
1. Usar @anthropic-ai/sdk (não fetch direto)
2. Adicionar cache_control: { type: 'ephemeral' } no system prompt
3. Modelo: claude-sonnet-4-6
4. max_tokens: {valor} (ajustar conforme output esperado)
5. Tratar erro de rate limit com retry exponencial
6. Logar tokens usados para controle de custo

Contexto que a IA receberá:
{dados_do_contexto}

Output esperado:
{formato_do_output}

Expor como endpoint HTTP callable para o frontend consumir.
```
