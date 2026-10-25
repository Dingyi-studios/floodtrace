#!/bin/zsh
set -eu
PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR/app"
if [[ ! -d node_modules ]]; then npm ci --no-audit --no-fund; fi
npm run build
