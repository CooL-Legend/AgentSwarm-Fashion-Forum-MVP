#!/bin/bash
# Start Next.js + localtunnel with accurate status reporting.

set -u

cleanup() {
  if [ -n "${NEXT_PID:-}" ] && kill -0 "$NEXT_PID" 2>/dev/null; then
    kill "$NEXT_PID" 2>/dev/null || true
  fi
  if [ -n "${LT_PID:-}" ] && kill -0 "$LT_PID" 2>/dev/null; then
    kill "$LT_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if lsof -ti:3000 >/dev/null 2>&1; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi
rm -f .next/dev/lock
sleep 1

echo ""
echo "================================================"
echo "  Starting local dev server + tunnel"
echo "  Subdomain requested: https://agentswarm-fashion.loca.lt"
echo "================================================"
echo ""

npx next dev &
NEXT_PID=$!

npx lt --port 3000 --subdomain agentswarm-fashion &
LT_PID=$!

# Give localtunnel a few seconds to establish the connection.
sleep 4

if ! kill -0 "$LT_PID" 2>/dev/null; then
  echo ""
  echo "❌ localtunnel failed to start."
  echo "   The Next.js server is still running at http://localhost:3000"
  echo "   This usually means localtunnel.me is blocked/unreachable on your network."
  echo "   Try a different network/VPN/firewall policy, then rerun npm run dev."
  echo ""
  wait "$NEXT_PID"
  exit 1
fi

echo ""
echo "✅ Tunnel process started. Look for 'your url is:' above."
echo "   Use that URL + /api in Colab."
echo ""

wait
