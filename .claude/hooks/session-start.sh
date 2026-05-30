#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:?CLAUDE_PROJECT_DIR is not set; cannot locate repo root}"

npm install --no-audit --no-fund

if [ -f workflows-starter/package.json ]; then
  (cd workflows-starter && npm install --no-audit --no-fund)
fi
