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

# API unit tests
run "API unit tests" bash -c "cd '$ROOT/api' && pnpm test"

# Web unit tests
run "Web unit tests" bash -c "cd '$ROOT/web' && pnpm test"

# E2E
run "Web E2E tests" bash -c "cd '$ROOT/web' && pnpm test:e2e"

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "All tests passed."
else
  echo "One or more test suites failed."
  exit 1
fi
