# Operação — alertas no Cloud Monitoring

Não há error tracking (Sentry etc.). O que avisa quando algo quebra em produção
são **métricas baseadas em log + políticas de alerta** do Cloud Monitoring no
projeto `ttrdcontabil-jpproject`, criadas por `scripts/configurar-alertas.sh`.

## Como aplicar

Pré-requisito: `gcloud auth login` com uma conta que tenha, no projeto,
**Monitoring Editor** (`roles/monitoring.editor`) e **Logs Configuration Writer**
(`roles/logging.configWriter`), ou Owner.

```bash
# 1) Dry-run (padrão): imprime os comandos e os YAML, não altera nada
scripts/configurar-alertas.sh --email alertas@seu-dominio.com.br

# 2) Aplica
scripts/configurar-alertas.sh --email alertas@seu-dominio.com.br --aplicar
```

Opções: `--projeto ID` (padrão `ttrdcontabil-jpproject`), `--limiar-erros N`
(padrão 5), `--limiar-nfse N` (padrão 0), `--limiar-agendadas N` (padrão 0).
O alerta dispara quando a contagem em 10 min é **maior** que o limiar.

É idempotente: rodar de novo **atualiza** métricas (`logging metrics update`) e
políticas (procuradas pelo `displayName`) e reaproveita o canal com o mesmo
e-mail. Para mais de um destinatário, rode com outro `--email` e acrescente o
canal à política no console (ou use uma lista de distribuição).

Depois de aplicar:
1. Confirme o e-mail de verificação que o Google envia ao endereço do canal.
2. Se uma política falhar logo após criar a métrica ("metric not found"), espere
   1–2 min e rode o script de novo.
3. Teste: force um erro em homologação, ou rode de novo com o limiar baixo
   (`--limiar-erros 0`) por alguns minutos e volte ao valor normal.

## O que é criado

| Recurso | Nome | O que conta |
|---|---|---|
| Canal | `TTRD alertas (<e-mail>)` | e-mail |
| Métrica | `ttrd_functions_erros` | logs `severity>=ERROR` em `cloud_run_revision` (todas as functions gen2 e demais serviços Cloud Run do projeto). Rótulo `servico`. |
| Métrica | `ttrd_nfse_falhas` | serviços `emitirnfse`, `emitirnfselote`, `retrynfse`, `reconciliarnfsependentes`, `processarnfserecorrentediaria`, `gerarrascunhosnfsemensais` com `severity>=ERROR` **ou** texto `[emitirNfse]`, `[processarEmissao]`, `[nfse-reconciliacao]`. Rótulo `servico`. |
| Métrica | `ttrd_agendadas_falhas` | `cloud_scheduler_job` com `severity>=ERROR` (tentativa que terminou em erro/timeout) dos jobs `firebase-schedule-<função>-*` de todas as `onSchedule` publicadas. Rótulo `job`. |
| Política | `TTRD — erros nas Cloud Functions` | `ttrd_functions_erros` > limiar em 10 min, por serviço |
| Política | `TTRD — falha na emissão de NFS-e` | `ttrd_nfse_falhas` > limiar em 10 min, por serviço |
| Política | `TTRD — função agendada falhou` | `ttrd_agendadas_falhas` > limiar em 10 min, por job |

Todas fecham sozinhas 30 min depois que a condição some (`autoClose`).

As listas de functions estão no topo do script e um teste
(`__tests__/lib/configurar-alertas.test.ts`) reprova o vitest se uma `onSchedule`
publicada em `functions/src/index.ts` ficar sem alerta, ou se o script citar uma
function que não existe. **Ao criar uma function agendada, acrescente-a em
`AGENDADAS` e rode o script com `--aplicar` de novo.**

## Log estruturado

`functions/src/log.ts` → `logErro(evento, contexto, err)` grava com
`logger.error` do `firebase-functions` (severity ERROR, `jsonPayload` com
`evento`, contexto, `erro`, `erroTipo`, `stack`). Usado no backup, na
reconciliação de NFS-e, nos callables de usuários, no descarte LGPD, nos KPIs
do Painel e no WhatsApp. O código de `functions/src/nfse/**` ainda usa
`console.error` (texto) — por isso o filtro de NFS-e também procura os
prefixos em `textPayload`. Regra: o evento é um rótulo fixo
(`[modulo][o-que-falhou]`), dados variáveis vão no contexto, e **nunca**
senha, certificado, token ou dado pessoal no contexto.

## Runbook

### (a) Erros nas functions

1. Logs Explorer:
   `resource.type="cloud_run_revision" AND severity>=ERROR AND resource.labels.service_name="<servico do alerta>"`.
2. Procure o `evento` no `jsonPayload` (ou o prefixo `[...]` no texto).
3. Erro de permissão/índice do Firestore costuma vir de deploy de regras ou
   índices fora de ordem (`docs/DEPLOY.md`).

### (b) Falha na emissão de NFS-e

1. Mesmo filtro, serviço `emitirnfse`/`reconciliarnfsependentes`.
2. **Nunca reenvie sem consultar a DPS**: rascunho em `processando` ou
   `erro_integracao` é reconciliado pelo `reconciliarNfsePendentes` a cada 15 min.
3. Bloqueio da pré-validação também gera log `[emitirNfse] processarEmissao
   falhou` (é um `HttpsError` de regra fiscal, não queda). Se isso gerar ruído,
   suba `--limiar-nfse`.

### (c) Função agendada falhou

1. Cloud Scheduler → job do alerta → "Logs"; depois os logs do serviço Cloud Run
   de mesmo nome (minúsculas).
2. Backup semanal (`exportarFirestoreSemanal`) também manda e-mail próprio e
   grava `logs_auditoria` (`entidade: backup`, `acao: falha`).
3. Reexecutar: Cloud Scheduler → job → "Forçar execução" (as rotinas mensais
   são idempotentes por id determinístico; confira antes de forçar uma rotina
   que envia e-mail/WhatsApp).

## Remover

```bash
gcloud monitoring policies list --project=ttrdcontabil-jpproject --filter='userLabels.gerenciado_por="configurar-alertas"' --format='value(name)' \
  | xargs -n1 gcloud monitoring policies delete --project=ttrdcontabil-jpproject --quiet
for m in ttrd_functions_erros ttrd_nfse_falhas ttrd_agendadas_falhas; do
  gcloud logging metrics delete "$m" --project=ttrdcontabil-jpproject --quiet
done
```
