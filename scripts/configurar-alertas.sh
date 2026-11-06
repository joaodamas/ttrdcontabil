#!/usr/bin/env bash
# Alertas acionáveis no Cloud Monitoring (projeto TTRD / JP Fiscal).
#
# Cria (ou atualiza, se já existir — idempotente):
#   1. canal de notificação por e-mail;
#   2. métricas baseadas em log:
#        ttrd_functions_erros      — severity>=ERROR em qualquer Cloud Function/Cloud Run do projeto
#        ttrd_nfse_falhas          — erros da emissão/reconciliação de NFS-e
#        ttrd_agendadas_falhas     — execução de função agendada que falhou (Cloud Scheduler)
#   3. políticas de alerta (janela de 10 min) para cada métrica, notificando o canal.
#
# Padrão = DRY-RUN: só imprime os comandos e os arquivos que seriam aplicados,
# sem chamar a API. Com --aplicar executa (precisa de `gcloud auth login` com
# papel Monitoring Editor + Logs Configuration Writer no projeto).
#
# Uso:
#   scripts/configurar-alertas.sh --email voce@exemplo.com            # dry-run
#   scripts/configurar-alertas.sh --email voce@exemplo.com --aplicar  # aplica
#
# Opções:
#   --email ENDERECO        destino dos alertas (obrigatório)
#   --projeto ID            padrão: ttrdcontabil-jpproject
#   --limiar-erros N        (a) alerta se houver MAIS de N erros em 10 min (padrão 5)
#   --limiar-nfse N         (b) alerta se houver MAIS de N falhas de NFS-e em 10 min (padrão 0 = qualquer)
#   --limiar-agendadas N    (c) alerta se houver MAIS de N falhas de agendadas em 10 min (padrão 0 = qualquer)
#   --aplicar               executa de verdade
#
# Documentação: docs/OPERACAO-ALERTAS.md
set -euo pipefail

PROJETO="ttrdcontabil-jpproject"
EMAIL=""
LIMIAR_ERROS=5
LIMIAR_NFSE=0
LIMIAR_AGENDADAS=0
APLICAR=0

uso() { sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="${2:-}"; shift 2 ;;
    --projeto) PROJETO="${2:-}"; shift 2 ;;
    --limiar-erros) LIMIAR_ERROS="${2:-}"; shift 2 ;;
    --limiar-nfse) LIMIAR_NFSE="${2:-}"; shift 2 ;;
    --limiar-agendadas) LIMIAR_AGENDADAS="${2:-}"; shift 2 ;;
    --aplicar) APLICAR=1; shift ;;
    -h|--help) uso; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; uso >&2; exit 2 ;;
  esac
done

if [[ ! "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "Informe --email com um endereço válido." >&2; exit 2
fi
for n in "$LIMIAR_ERROS" "$LIMIAR_NFSE" "$LIMIAR_AGENDADAS"; do
  [[ "$n" =~ ^[0-9]+$ ]] || { echo "Limiar inválido: $n (inteiro >= 0)" >&2; exit 2; }
done
[[ "$PROJETO" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || { echo "Projeto inválido: $PROJETO" >&2; exit 2; }

# ── Nomes reais (functions/src/index.ts) ─────────────────────────────────────
# Functions gen2 viram serviços Cloud Run com o nome em minúsculas; o job do
# Cloud Scheduler de uma onSchedule chama-se firebase-schedule-<nome>-<região>.
# O teste __tests__/lib/configurar-alertas.test.ts confere estas listas contra
# o código (uma agendada nova sem entrada aqui reprova o vitest).
NFSE_FUNCTIONS=(emitirNfse emitirNfseLote retryNfse reconciliarNfsePendentes processarNfseRecorrenteDiaria gerarRascunhosNfseMensais)
AGENDADAS=(
  exportarFirestoreSemanal
  reconciliarNfsePendentes
  processarNfseRecorrenteDiaria
  criarCompetenciasMensais
  criarLancamentosMensais
  enviarAlertasDiarios
  alertasPrazoCritico
  detectarInadimplencia
  recalcularDashboardKpisAgendado
)

minusculas() { tr '[:upper:]' '[:lower:]' <<<"$1"; }
juntar_ou() { local sep="" out=""; for x in "$@"; do out+="${sep}${x}"; sep=" OR "; done; printf '%s' "$out"; }

servicos_nfse=()
for f in "${NFSE_FUNCTIONS[@]}"; do servicos_nfse+=("\"$(minusculas "$f")\""); done
jobs_agendadas=()
for f in "${AGENDADAS[@]}"; do jobs_agendadas+=("resource.labels.job_id:\"firebase-schedule-${f}-\""); done

FILTRO_ERROS='resource.type="cloud_run_revision" AND severity>=ERROR'
# console.error em código antigo (functions/src/nfse/**) sai como texto; o
# logErro (functions/src/log.ts) sai com severity ERROR. Os dois contam.
FILTRO_NFSE="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=($(juntar_ou "${servicos_nfse[@]}")) AND (severity>=ERROR OR textPayload:\"[emitirNfse]\" OR textPayload:\"[processarEmissao]\" OR textPayload:\"[nfse-reconciliacao]\" OR jsonPayload.message:\"[nfse-reconciliacao]\")"
FILTRO_AGENDADAS="resource.type=\"cloud_scheduler_job\" AND severity>=ERROR AND ($(juntar_ou "${jobs_agendadas[@]}"))"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/ttrd-alertas.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

yaml_str() { printf "'%s'" "${1//\'/\'\'}"; }   # string YAML entre aspas simples

executar() {
  printf '+'; printf ' %q' "$@"; printf '\n'
  if [[ $APLICAR -eq 1 ]]; then "$@"; fi
}

if [[ $APLICAR -eq 1 ]]; then
  command -v gcloud >/dev/null || { echo "gcloud não encontrado." >&2; exit 1; }
  echo "== APLICANDO no projeto $PROJETO =="
else
  echo "== DRY-RUN (nada é alterado). Projeto: $PROJETO. Rode com --aplicar para executar. =="
fi
G=(gcloud --project="$PROJETO" --quiet)

# ── 0. APIs ──────────────────────────────────────────────────────────────────
executar "${G[@]}" services enable monitoring.googleapis.com logging.googleapis.com

# ── 1. Canal de e-mail ───────────────────────────────────────────────────────
CANAL="projects/$PROJETO/notificationChannels/<ID-DO-CANAL>"
if [[ $APLICAR -eq 1 ]]; then
  CANAL="$("${G[@]}" beta monitoring channels list \
    --filter="type=\"email\" AND labels.email_address=\"$EMAIL\"" --format='value(name)' | head -n1)"
fi
if [[ -n "$CANAL" && "$CANAL" != *"<ID-DO-CANAL>"* ]]; then
  echo "Canal de e-mail já existe: $CANAL"
else
  executar "${G[@]}" beta monitoring channels create \
    --display-name="TTRD alertas ($EMAIL)" --type=email --channel-labels="email_address=$EMAIL"
  if [[ $APLICAR -eq 1 ]]; then
    CANAL="$("${G[@]}" beta monitoring channels list \
      --filter="type=\"email\" AND labels.email_address=\"$EMAIL\"" --format='value(name)' | head -n1)"
    [[ -n "$CANAL" ]] || { echo "Canal não encontrado após a criação." >&2; exit 1; }
    echo "Canal criado: $CANAL (o Google envia um e-mail de verificação)"
  fi
fi

# ── 2. Métricas baseadas em log ──────────────────────────────────────────────
metrica() { # nome descrição filtro rótulo extrator
  local nome="$1" descricao="$2" filtro="$3" rotulo="$4" extrator="$5" arq="$TMP/metrica-$1.yaml"
  cat >"$arq" <<EOF
name: $nome
description: $(yaml_str "$descricao")
filter: $(yaml_str "$filtro")
metricDescriptor:
  metricKind: DELTA
  valueType: INT64
  unit: '1'
  labels:
    - key: $rotulo
      valueType: STRING
labelExtractors:
  $rotulo: $(yaml_str "$extrator")
EOF
  echo "--- $arq"; cat "$arq"
  local acao=create
  if [[ $APLICAR -eq 1 ]] && "${G[@]}" logging metrics describe "$nome" >/dev/null 2>&1; then acao=update; fi
  executar "${G[@]}" logging metrics "$acao" "$nome" --config-from-file="$arq"
}

metrica ttrd_functions_erros "Logs severity>=ERROR nas Cloud Functions/Cloud Run" \
  "$FILTRO_ERROS" servico 'EXTRACT(resource.labels.service_name)'
metrica ttrd_nfse_falhas "Falhas da emissão/reconciliação de NFS-e" \
  "$FILTRO_NFSE" servico 'EXTRACT(resource.labels.service_name)'
metrica ttrd_agendadas_falhas "Execuções de funções agendadas com falha (Cloud Scheduler)" \
  "$FILTRO_AGENDADAS" job 'EXTRACT(resource.labels.job_id)'

# ── 3. Políticas de alerta ───────────────────────────────────────────────────
politica() { # chave nome-exibição métrica tipo-recurso rótulo limiar documentação
  local chave="$1" exibicao="$2" metrica="$3" recurso="$4" rotulo="$5" limiar="$6" doc="$7"
  local arq="$TMP/politica-$chave.yaml"
  cat >"$arq" <<EOF
displayName: $(yaml_str "$exibicao")
combiner: OR
severity: ERROR
userLabels:
  app: ttrd
  gerenciado_por: configurar-alertas
conditions:
  - displayName: $(yaml_str "$exibicao — mais de $limiar em 10 min")
    conditionThreshold:
      filter: $(yaml_str "metric.type=\"logging.googleapis.com/user/$metrica\" AND resource.type=\"$recurso\"")
      comparison: COMPARISON_GT
      thresholdValue: $limiar
      duration: 0s
      trigger:
        count: 1
      aggregations:
        - alignmentPeriod: 600s
          perSeriesAligner: ALIGN_SUM
          crossSeriesReducer: REDUCE_SUM
          groupByFields:
            - metric.label.$rotulo
alertStrategy:
  autoClose: 1800s
notificationChannels:
  - $CANAL
documentation:
  mimeType: text/markdown
  content: $(yaml_str "$doc")
EOF
  echo "--- $arq"; cat "$arq"
  local existente=""
  if [[ $APLICAR -eq 1 ]]; then
    existente="$("${G[@]}" monitoring policies list --filter="displayName=\"$exibicao\"" --format='value(name)' | head -n1)"
  fi
  if [[ -n "$existente" ]]; then
    executar "${G[@]}" monitoring policies update "$existente" --policy-from-file="$arq"
  else
    executar "${G[@]}" monitoring policies create --policy-from-file="$arq"
  fi
}

politica erros "TTRD — erros nas Cloud Functions" ttrd_functions_erros cloud_run_revision servico "$LIMIAR_ERROS" \
  "Erros (severity>=ERROR) acima do limiar em 10 min. Abra o Logs Explorer com o filtro da métrica ttrd_functions_erros e o serviço do rótulo. Runbook: docs/OPERACAO-ALERTAS.md#a-erros-nas-functions"
politica nfse "TTRD — falha na emissão de NFS-e" ttrd_nfse_falhas cloud_run_revision servico "$LIMIAR_NFSE" \
  "Falha em emitirNfse/lote/retry ou na reconciliação de rascunhos. Confira os rascunhos em erro_integracao/processando antes de reenviar (nunca reenviar sem consultar a DPS). Runbook: docs/OPERACAO-ALERTAS.md#b-falha-na-emissao-de-nfs-e"
politica agendadas "TTRD — função agendada falhou" ttrd_agendadas_falhas cloud_scheduler_job job "$LIMIAR_AGENDADAS" \
  "Uma execução agendada (backup semanal, reconciliação de NFS-e, rotinas mensais/diárias, KPIs do Painel) terminou com erro. Runbook: docs/OPERACAO-ALERTAS.md#c-funcao-agendada-falhou"

echo
if [[ $APLICAR -eq 1 ]]; then
  echo "Pronto. Confirme o e-mail de verificação do canal em $EMAIL."
else
  echo "Dry-run concluído. Nada foi alterado."
fi
