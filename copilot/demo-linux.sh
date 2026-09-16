#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Instale Node.js 24 ou superior para executar a demonstração.' >&2
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Use Node.js 24 ou superior."); process.exit(1); }'
node demo/run.mjs "$@"
