#!/bin/bash
# Clean up stale processes and locks, then start Next.js + localtunnel

lsof -ti:3000 | xargs kill -9 2>/dev/null
rm -f .next/dev/lock
sleep 1

echo ""
echo "================================================"
echo "  Tunnel URL (use this in Colab):"
echo "  https://agentswarm-fashion.loca.lt/api"
echo "================================================"
echo ""

npx next dev &
npx lt --port 3000 --subdomain agentswarm-fashion &
wait
