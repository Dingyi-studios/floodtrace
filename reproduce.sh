#!/bin/zsh
set -eu
PROJECT_DIR="${0:A:h}"
RUN_PYTHON="${FLOODTRACE_PYTHON:-/Users/k.k./Documents/ChatGPT/个人项目制作/flood-demo-data/.venv/bin/python}"
cd "$PROJECT_DIR"
mkdir -p derived/v3 validation/v3 results/anuga-v3
"$RUN_PYTHON" scripts/prepare_scene.py
"$RUN_PYTHON" scripts/v2/prepare_city.py
# The numerical engines always run in separate executable processes.
"$RUN_PYTHON" scripts/solve_network.py
"$RUN_PYTHON" scripts/v3/prepare_rain.py
OMP_NUM_THREADS=2 "$RUN_PYTHON" scripts/v3/solve_rain.py --case historical --spacing 16
OMP_NUM_THREADS=2 "$RUN_PYTHON" scripts/v3/solve_rain.py --case compound --spacing 10
"$RUN_PYTHON" scripts/v3/finalize_compound.py
"$RUN_PYTHON" scripts/v3/prepare_operations.py --case compound
"$RUN_PYTHON" scripts/v3/prepare_operations.py --case historical
"$RUN_PYTHON" scripts/v3/validate_rain.py
node scripts/v3/test_operations.mjs
"$RUN_PYTHON" scripts/v4/prepare_missions.py
"$RUN_PYTHON" scripts/v4/validate_navigation.py
node scripts/v4/test_missions.mjs
./rebuild.sh
