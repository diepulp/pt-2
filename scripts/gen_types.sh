#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TYPES_FILE="$ROOT_DIR/types/database.types.ts"

supabase gen types typescript --local > "$TYPES_FILE"

if git -C "$ROOT_DIR" diff --quiet --exit-code "$TYPES_FILE"; then
  echo "types/database.types.ts unchanged. If migrations changed, regenerate types before committing." >&2
  exit 1
fi
