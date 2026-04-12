#!/usr/bin/env bash
# D-040: CI grep guard for non-goals
# Fails if codebase contains references to features explicitly excluded.
set -euo pipefail

PATTERNS=(
  "real.?time"
  "websocket"
  "file.?upload"
  "attachment"
  "notification"
  "email.?send"
  "gantt"
)

EXIT=0
for pat in "${PATTERNS[@]}"; do
  if grep -rni "$pat" ../backend/src/ ../frontend/src/ --include="*.rs" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "non_goals_guard" | grep -v "TODO.*not.*implement" | grep -v "D-040"; then
    echo "WARNING: Pattern '$pat' found in source code. Check D-040 non-goals."
    EXIT=1
  fi
done

if [ $EXIT -eq 0 ]; then
  echo "Non-goals guard: PASS"
fi
exit $EXIT
