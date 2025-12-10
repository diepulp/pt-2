#!/bin/bash
# Clean up zombie/stopped Next.js processes and free ports

# Kill stopped (T) or zombie (Z) next dev parent processes and next-server children
# Excludes the current script and npm processes
for pid in $(ps -eo pid,state,cmd | awk '$2 ~ /[TZ]/ && $0 ~ /next-server|node.*next.*dev/ && $0 !~ /dev-cleanup/ {print $1}'); do
  kill -9 "$pid" 2>/dev/null
done

# Kill any process listening on ports 3000-3002
ss -tlnp 2>/dev/null | grep -E ':300[0-2]\s' | grep -oP 'pid=\K[0-9]+' | while read pid; do
  kill -9 "$pid" 2>/dev/null
done

# Remove stale lock file
rm -f .next/dev/lock

echo "Dev cleanup complete"
