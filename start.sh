#!/bin/zsh
set -eu
PROJECT_DIR="${0:A:h}"
PORT="${1:-5178}"
RUN_PYTHON='/Users/k.k./Documents/ChatGPT/个人项目制作/flood-demo-data/.venv/bin/python'
if [[ ! -x "$RUN_PYTHON" ]]; then RUN_PYTHON=$(command -v python3); fi
if [[ -f "$PROJECT_DIR/results/server.pid" ]]; then
  EXISTING_PID=$(cat "$PROJECT_DIR/results/server.pid")
  EXISTING_COMMAND=$(ps -p "$EXISTING_PID" -o command= 2>/dev/null || true)
  if [[ "$EXISTING_COMMAND" == *"$PROJECT_DIR/scripts/serve.py"* ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    EXISTING_PORT="${EXISTING_COMMAND##*--port }"
    echo "FloodTrace 已运行：http://127.0.0.1:$EXISTING_PORT/"
    exit 0
  fi
fi
"$RUN_PYTHON" - "$PROJECT_DIR" "$PORT" <<'PY'
from pathlib import Path
import subprocess,sys
root=Path(sys.argv[1])
with (root/'results/server.log').open('ab',buffering=0) as log:
    proc=subprocess.Popen([sys.executable,str(root/'scripts/serve.py'),'--port',sys.argv[2]],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,close_fds=True)
(root/'results/server.pid').write_text(str(proc.pid))
PY
SERVER_PID=$(cat "$PROJECT_DIR/results/server.pid")
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  cat "$PROJECT_DIR/results/server.log"
  exit 1
fi
echo "FloodTrace 已启动：http://127.0.0.1:$PORT/"
echo "停止服务：$PROJECT_DIR/stop.sh"
