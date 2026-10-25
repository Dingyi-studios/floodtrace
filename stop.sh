#!/bin/zsh
set -eu
PROJECT_DIR="${0:A:h}"
if [[ -f "$PROJECT_DIR/results/server.pid" ]]; then
  SERVER_PID=$(cat "$PROJECT_DIR/results/server.pid")
  COMMAND=$(ps -p "$SERVER_PID" -o command= 2>/dev/null || true)
  if [[ "$COMMAND" == *"$PROJECT_DIR/scripts/serve.py"* ]]; then
    kill "$SERVER_PID"
    echo 'FloodTrace 已停止。'
  else
    echo '没有找到本项目的运行进程。'
  fi
  rm "$PROJECT_DIR/results/server.pid"
fi
