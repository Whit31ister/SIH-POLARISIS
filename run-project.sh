#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Node.js and npm are required."
  exit 1
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  PYTHON_BIN="${PYTHON_BIN:-python3}"
  if ! command -v "$PYTHON_BIN" >/dev/null; then
    echo "Python 3 is required. Set PYTHON_BIN to a compatible interpreter."
    exit 1
  fi
  echo "Creating backend virtual environment with $PYTHON_BIN"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

PYTHON="$VENV_DIR/bin/python"

if ! "$PYTHON" -c 'import fastapi, torch, numpy' >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  "$PYTHON" -m pip install --upgrade pip
  "$PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm --prefix "$FRONTEND_DIR" install
fi

if [[ -n "${API_PORT:-}" ]] && [[ "$API_PORT" != "8000" ]]; then
  echo "API_PORT is not supported by the current local launcher; use port 8000."
  exit 1
fi

echo "POLARISIS services"
echo "  Dashboard: http://localhost:5173"
echo "  API:       http://localhost:8000"
echo "  API docs:  http://localhost:8000/docs"
echo "Press Ctrl+C to stop both services."

cleanup() {
  trap - INT TERM EXIT
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

"$PYTHON" -m uvicorn app.main:app --app-dir "$BACKEND_DIR" --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

npm --prefix "$FRONTEND_DIR" run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"