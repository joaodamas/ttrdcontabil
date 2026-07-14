#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# provision.sh — publica um escritório white-label (Contábil) no projeto
# Firebase isolado dele. Modelo "Caminho A": 1 projeto por escritório.
#
#   scripts/provision.sh <slug>          # pede confirmação antes do deploy
#   scripts/provision.sh <slug> --yes    # sem prompt (CI)
#
# Pré-requisitos (uma vez por escritório) — docs_dev/guia-whitelabel-single-tenant.md:
#   - Projeto Firebase criado (Auth/Firestore/Functions/Hosting/Storage).
#   - clients/<slug>/client.mjs preenchido (cp -r clients/_template clients/<slug>).
#   - Secrets das Functions setados no projeto (CREDENTIAL_KEY, SMTP_*, EMAIL_*).
#
# SEGURANÇA: não cria projetos nem apaga dados. Só aponta a marca, builda e
# publica no projeto do <slug>.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SLUG="${1:-}"
ASSUME_YES="no"
for arg in "$@"; do
  case "$arg" in --yes|-y) ASSUME_YES="yes" ;; esac
done

if [ -z "$SLUG" ] || [ "$SLUG" = "--yes" ] || [ "$SLUG" = "-y" ]; then
  echo "✗ Faltou o slug do cliente." >&2
  echo "  Uso: scripts/provision.sh <slug> [--yes]" >&2
  if [ -d clients ]; then
    disp="$(find clients -maxdepth 2 -name client.mjs -exec dirname {} \; 2>/dev/null | xargs -n1 basename 2>/dev/null | grep -v '^_' | sort | tr '\n' ' ')"
    echo "  Clientes disponíveis: ${disp:-(nenhum)}" >&2
  fi
  exit 1
fi

CLIENT_FILE="clients/$SLUG/client.mjs"
if [ ! -f "$CLIENT_FILE" ]; then
  echo "✗ Identidade do cliente não encontrada: $CLIENT_FILE" >&2
  echo "  Crie a partir do template:  cp -r clients/_template clients/$SLUG" >&2
  exit 1
fi

echo "══ [1/4] Selecionando cliente \"$SLUG\" ══"
node scripts/use-client.mjs "$SLUG"

echo "══ [2/4] Build (next build → out/) ══"
npm run build

PROJECT="$(node -e "import('./clients/$SLUG/client.mjs').then(m=>process.stdout.write(m.default.firebaseProject))")"

echo "══ [3/4] Deploy → projeto \"$PROJECT\" ══"
echo "  Alvos: hosting, firestore:rules, firestore:indexes, storage, functions"
if [ "$ASSUME_YES" != "yes" ]; then
  read -r -p "Confirmar deploy em $PROJECT? [s/N] " RESP
  case "$RESP" in
    s|S|sim|SIM|y|Y|yes) ;;
    *) echo "Deploy cancelado pelo usuário. Nada foi publicado."; exit 0 ;;
  esac
fi
firebase deploy --project "$PROJECT" --only hosting,firestore:rules,firestore:indexes,storage,functions

echo "══ [4/4] Concluído ══"
echo "✓ Escritório \"$SLUG\" publicado em $PROJECT."
echo "  Próximos passos (docs_dev/guia-whitelabel-single-tenant.md):"
echo "   1. Secrets das Functions (CREDENTIAL_KEY, SMTP_*, EMAIL_*) — se ainda não setados."
echo "   2. Semear dados iniciais do escritório (seed) — cria admin + parâmetros + serviços base."
echo "   3. Apontar o domínio no Hosting e restringir a API key por domínio no Google Cloud."
