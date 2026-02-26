#!/bin/bash
while true; do
  npm run dev -- --port 5173
  echo "Server died, restarting in 2s..."
  sleep 2
done
