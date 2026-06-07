#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
FAILED=0

run() {
  echo ""
  echo "=== $1 ==="
  shift
  if ! "$@"; then
    FAILED=1
  fi
}

run "API audit" bash -c "cd '$ROOT/api' && pnpm install --frozen-lockfile && pnpm audit"
run "Web audit" bash -c "cd '$ROOT/web' && pnpm install --frozen-lockfile && pnpm audit"

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "No vulnerabilities found."
else
  echo "One or more audits found vulnerabilities."
  exit 1
fi
