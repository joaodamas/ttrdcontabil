# Pendências — 30/07/2026

Estado real do repositório nesta data, verificado com os comandos rodando (não
de memória). Serve para retomar sem reabrir a investigação inteira.

---

## Verificação executada em 30/07

| | Resultado |
| --- | --- |
| `npx tsc --noEmit` (frontend) | limpo |
| `npx tsc --noEmit` (functions) | limpo |
| `npx vitest run` | **219 passando**, 0 falhando |
| Regras do Firestore, com emulador | **67 passando** |
| `npx playwright test` | 3 falhando |

**As 67 regras nunca tinham rodado até esta data.** O arquivo
`__tests__/rules/firestore.rules.test.ts` usa
`process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip`, então na suíte
normal elas aparecem como "skipped" e passam despercebidas. São 105 linhas novas
de `firestore.rules` que estavam sem nenhuma execução. Para rodar:

```
npx firebase emulators:exec --only firestore --project ttrdcontabil-rules-test "npx vitest run __tests__/rules"
```

As 3 falhas de Playwright são timeout de `page.waitForURL` no login. É o bug
conhecido do dev server local (o submit vira GET nativo, ver `CLAUDE.md`), não
regressão do código novo.

---

## P0 — bloqueia o deploy da entrega não commitada

### 1. `tomadores` e `nfse_recorrentes` fora do escopo de tenant

`src/lib/firestore-client.ts:40`, no `TENANT_SCOPED_COLLECTIONS`.

Sem estar nessa lista, `listDocuments` não injeta o `where('tenantId','==',...)`
(ver a linha 231 do mesmo arquivo), e as regras novas exigem
`sameTenantExisting()`. O efeito é assimétrico e traiçoeiro:

- **escrita funciona**: `createDocument` chama `getAuditActor()`
  incondicionalmente e o `withActorMetadata` injeta o `tenantId`
- **leitura é negada**: a query de lista sai sem o filtro e a regra rejeita

Ou seja, o contador cadastra o tomador, recebe confirmação, e ele não aparece na
tela. Correção: acrescentar as duas coleções ao Set. Duas linhas.

### 2. `SPEDY_WEBHOOK_SECRET` não provisionado

`functions/src/nfse/webhook-spedy.ts:61` declara `defineSecret('SPEDY_WEBHOOK_SECRET')`
e a função está exportada no `index.ts`.

O CLI do Firebase resolve os segredos durante a análise de código, **antes** de
filtrar por `--only`. Então mesmo um deploy de uma função só falha. É a mesma
armadilha que já obrigou a comentar os exports do WhatsApp no commit `3c8dfe6`.

```
firebase functions:secrets:set SPEDY_WEBHOOK_SECRET
```

---

## P0 — risco de perda de trabalho

### 3. A branch não existe no GitHub

`correcoes/p0-piloto` é **local**. O remoto tem apenas `master`,
`chore/npm-audit-fix-security`, `docs/entregas-comerciais-2026-07-13` e
`fix/bloco3-ux-podas`.

São **12 commits que só existem nesta máquina**, 9 deles já em produção e em uso
pelo escritório. O `master` remoto está parado em `ca9495d`, nove commits atrás
do que o cliente realmente usa.

Se o disco falhar, a versão em produção não é reconstituível a partir do
repositório.

### 4. 35 arquivos não commitados

Saída do time de agentes, cerca de 2.805 linhas em 18 arquivos rastreados mais
17 novos. Compila limpo e passa nos testes, mas ainda **não foi revisada linha a
linha**. Entrega:

- **Tomadores**: `src/features/tomadores/`, `src/components/tomadores/`, telas em
  `src/app/(dashboard)/clientes/[id]/tomadores/`, importação por planilha
- **NFS-e recorrente**: `src/features/nfse-recorrentes/`,
  `functions/src/nfse/selecao-recorrentes.ts` (414 linhas)
- **Webhook da Spedy**: `functions/src/nfse/webhook-spedy.ts` (619 linhas) e
  `spedy-evento.ts` (316) — resolve o `enqueued` que hoje fica no ar
- **Financeiro**: `src/features/financeiro/aging.ts`, agregados corrigidos
- **WhatsApp**: `functions/src/whatsapp/decisao.ts`, confirmação de pagamento e
  teto por cliente
- 105 linhas de `firestore.rules`, 247 de teste de regra, índices para
  `tomadores`, `nfse_recorrentes` e `ir_declaracoes`

Os bloqueios 1 e 2 impedem o **deploy**, não o **commit**. Commitar antes de
consertar é o mais seguro: tira o trabalho do limbo.

---

## P1 — dívida em produção

### 5. `/premium` mostra dados financeiros fabricados

`src/app/(dashboard)/premium/page.tsx`. Rota autenticada. Se o contador abrir,
vê números inventados como se fossem da carteira dele.

### 6. `scripts/reset-clientes-lista-cnpj.mjs`

Com `--write` apaga a base de clientes e recria 47 dos 119. Não deveria coexistir
com uma base de produção real.

### 7. Nove senhas em texto puro na coleção `clientes`

O tipo já está correto (`src/types/firestore.ts:311`, `senhaReferencia` com o
comentário "referência ao vault, nunca a senha em si"). O problema está no dado
gravado, não no schema.

### 8. `master` nove commits atrás da produção

Quem clonar o repositório hoje pega uma versão que não existe mais em lugar
nenhum. É o risco mais silencioso da lista.

---

## Bloqueado no cliente

Nada disso avança sem o escritório:

| Insumo | Trava o quê |
| --- | --- |
| Credenciais Twilio | Todo o WhatsApp (exports comentados desde `3c8dfe6`) |
| Decisão do gateway de pagamento | Confirmação automática de recebimento |
| Planilha preenchida pelo contador | Cadastro completo (municipio, IM, CNAE, endereço) |
| Certificados A1 | Emissão real |
| Último RPS por prefeitura | Emissão de NFS-e sem colidir numeração |
| Códigos da reforma dos 17 de Lucro Presumido | Prazo **03/08/2026** |

Sobre a reforma: são **17 clientes de Lucro Presumido e 102 do Simples**
(apurado em `clientes-de-para-existentes.xlsx`). O prazo de 03/08 atinge os 17,
não os 119. O Simples entra só em 2027.

---

## Ordem sugerida

1. Enviar `correcoes/p0-piloto` ao GitHub (tira o risco de perda)
2. Commitar os 35 arquivos (revisando ou não, mas tirando do limbo)
3. Corrigir o `TENANT_SCOPED_COLLECTIONS` (duas linhas)
4. Provisionar o `SPEDY_WEBHOOK_SECRET`
5. Deployar
6. Remover `/premium` e o script de reset
7. Fazer o `master` alcançar a produção
