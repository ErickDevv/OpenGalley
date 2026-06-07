#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$ROOT/package.json"
TARGETS=("$ROOT/api/package.json" "$ROOT/web/package.json" "$ROOT/packages/eslint-config/package.json")

VERSION="$(jq -r .version "$SOURCE")"

for TARGET in "${TARGETS[@]}"; do
  TMP="$(mktemp)"
  jq --arg v "$VERSION" '.version = $v' "$TARGET" > "$TMP"
  mv "$TMP" "$TARGET"
  echo "Synced $(basename "$(dirname "$TARGET")") -> $VERSION"
done
