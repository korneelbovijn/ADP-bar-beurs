#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# nvm laden zodat 'node' beschikbaar is in non-login shells
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "=== Bar-Beurs starten ==="

# --- Bestaande processen opruimen ---
echo "[0/4] Poorten vrijmaken (5000, 5001, 3000, 3001, 3004)..."
for PORT in 5000 5001 3000 3001 3004; do
  if command -v fuser &>/dev/null; then
    fuser -k "${PORT}/tcp" &>/dev/null || true
  elif command -v lsof &>/dev/null; then
    PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
    [ -n "$PIDS" ] && kill -9 $PIDS 2>/dev/null || true
  fi
done
echo "      Wachten 2 seconden zodat poorten vrijkomen..."
sleep 2

# --- Backend ---
echo "[1/4] bar-management starten (poort 5000 / 5001)..."
(cd "$SCRIPT_DIR/bar-management" && npm start > /tmp/bar-management.log 2>&1) &
BACKEND_PID=$!

echo "      Wachten 5 seconden tot backend klaar is..."
sleep 5

# --- Frontends ---
echo "[2/4] bar-app starten (poort 3000)..."
(cd "$SCRIPT_DIR/bar-app" && npm start -- --host > /tmp/bar-app.log 2>&1) &

echo "[3/4] bar-admin starten (poort 3001)..."
(cd "$SCRIPT_DIR/bar-admin" && npm start -- --host > /tmp/bar-admin.log 2>&1) &

echo "[4/4] bar-visual starten (poort 3004)..."
(cd "$SCRIPT_DIR/bar-visual" && npm start -- --host > /tmp/bar-visual.log 2>&1) &

echo ""
echo "=== Alle apps gestart ==="
echo ""
echo "  Backend API : http://localhost:5000"
echo "  Kassa       : http://localhost:3000"
echo "  Admin panel : http://localhost:3001"
echo "  Gastscherm  : http://localhost:3004"
echo ""
echo "Logs:"
echo "  /tmp/bar-management.log"
echo "  /tmp/bar-app.log"
echo "  /tmp/bar-admin.log"
echo "  /tmp/bar-visual.log"
echo ""
echo "Stop alle processen met: kill \$(cat /tmp/barbeurs.pids)"

# PID-bestand opslaan voor gemakkelijk stoppen
echo "$BACKEND_PID" > /tmp/barbeurs.pids
jobs -p | tail -n +2 >> /tmp/barbeurs.pids

wait
