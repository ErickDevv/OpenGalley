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

# Unit tests (API + Web), via turbo
run "Unit tests" bash -c "cd '$ROOT' && pnpm turbo run test"

# E2E
run "Web E2E tests" bash -c "cd '$ROOT' && pnpm turbo run test:e2e --filter=opengalley-web"

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "All tests passed."
else
  echo "One or more test suites failed."
  exit 1
fi
