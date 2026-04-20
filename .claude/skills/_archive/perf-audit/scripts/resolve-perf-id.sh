#!/usr/bin/env bash
# Compute the next PERF-NNN ID by scanning existing reports
set -euo pipefail
PERF_DIR="docs/issues/perf"
LAST=$(ls "$PERF_DIR"/PERF-*.md 2>/dev/null \
  | grep -oP 'PERF-\K\d+' \
  | sort -n \
  | tail -1)
NEXT=$(printf "%03d" $(( ${LAST:-0} + 1 )))
echo "PERF-${NEXT}"
