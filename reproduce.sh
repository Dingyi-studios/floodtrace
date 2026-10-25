#!/bin/zsh
set -eu
PROJECT_DIR="${0:A:h}"
RUN_PYTHON='/Users/k.k./Documents/ChatGPT/个人项目制作/flood-demo-data/.venv/bin/python'
cd "$PROJECT_DIR"
# Preserve V1 base preparation as the source of mapped urban geometry/history.
"$RUN_PYTHON" scripts/prepare_scene.py
"$RUN_PYTHON" scripts/v2/prepare_city.py
# Independent executable processes: never import both engines in one process.
OMP_NUM_THREADS=2 "$RUN_PYTHON" scripts/v2/solve_urban.py
"$RUN_PYTHON" scripts/solve_network.py
"$RUN_PYTHON" scripts/v2/finalize_city.py
"$RUN_PYTHON" scripts/v2/validate_urban.py
node scripts/v2/test_tracers.mjs
./rebuild.sh
