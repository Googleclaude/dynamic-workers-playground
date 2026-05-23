#!/usr/bin/env bash
# Provision the LGPD-related bindings and secrets required by /api/lgpd/*.
# Idempotent: re-running on an already-configured deployment is a no-op
# (KV creation will refuse to clobber; existing secrets stay as-is unless
# you opt to rotate).
#
# Run from the repo root:
#   bash scripts/setup-lgpd.sh
#
# After this script:
#   1. Paste the printed KV id into wrangler.jsonc as documented at the
#      top of that file.
#   2. Replace the placeholders in src/client/lgpd/constants.ts
#      (CONTROLLER_INFO, DPO_INFO, POLICY_LAST_UPDATED) with your real
#      organisation data.
#   3. Put the playground behind Cloudflare Access before exposing it
#      publicly — the LGPD endpoints accept unauthenticated POSTs by design.

set -euo pipefail

KV_NAME="lgpd_storage"
SECRET_NAME="LGPD_HASH_SECRET"
WRANGLER="${WRANGLER:-npx wrangler}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
warn() { printf "\033[33m! %s\033[0m\n" "$*"; }
ok()   { printf "\033[32m✓ %s\033[0m\n" "$*"; }
note() { printf "  %s\n" "$*"; }

bold "1/3 — checking for existing KV namespace '${KV_NAME}'"
if $WRANGLER kv namespace list 2>/dev/null | grep -q "\"title\":\s*\"${KV_NAME}\""; then
  ok "KV namespace already exists"
  EXISTING_ID=$($WRANGLER kv namespace list 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((n['id'] for n in d if n['title']=='${KV_NAME}'), ''))" )
  note "id: ${EXISTING_ID}"
else
  bold "  creating KV namespace '${KV_NAME}'…"
  $WRANGLER kv namespace create "${KV_NAME}"
  ok "created — copy the id printed above into wrangler.jsonc"
fi

echo
bold "2/3 — checking for secret '${SECRET_NAME}'"
if $WRANGLER secret list 2>/dev/null | grep -q "\"name\":\s*\"${SECRET_NAME}\""; then
  ok "${SECRET_NAME} already set"
  note "to rotate: $WRANGLER secret put ${SECRET_NAME}"
else
  warn "${SECRET_NAME} is unset — endpoints will return 503 until provisioned"
  bold "  prompting for ${SECRET_NAME} now (use 32+ random bytes)…"
  $WRANGLER secret put "${SECRET_NAME}"
  ok "secret written"
fi

echo
bold "3/3 — manual checks"
PLACEHOLDER_HIT=0
for placeholder in "Razão Social do Controlador" "CNPJ" "Endereço Postal" "Nome do Encarregado" "contato@example.com" "dpo@example.com"; do
  if grep -q "${placeholder}" src/client/lgpd/constants.ts 2>/dev/null; then
    warn "placeholder still present in src/client/lgpd/constants.ts: \"${placeholder}\""
    PLACEHOLDER_HIT=1
  fi
done
if [[ "${PLACEHOLDER_HIT}" -eq 0 ]]; then
  ok "src/client/lgpd/constants.ts: no known placeholders remaining"
fi

if grep -q "REPLACE_WITH_KV_NAMESPACE_ID\|REPLACE_WITH_KV" wrangler.jsonc 2>/dev/null; then
  warn "wrangler.jsonc still contains a placeholder KV id — paste the real id printed above"
else
  if ! grep -q "LGPD_KV" wrangler.jsonc 2>/dev/null; then
    warn "wrangler.jsonc has no LGPD_KV binding yet — add one (see the comment in that file)"
  else
    ok "wrangler.jsonc: LGPD_KV binding present"
  fi
fi

echo
bold "Reminder: place the deployment behind Cloudflare Access before exposing publicly."
note "https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/"
