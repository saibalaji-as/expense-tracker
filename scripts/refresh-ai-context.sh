#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

if ! command -v graphify >/dev/null 2>&1; then
  printf 'Graphify is not installed. Run: ./scripts/setup-ai-context.sh\n' >&2
  exit 0
fi

cd "$repo_root"

if [[ "${1:-}" == "--quiet" ]]; then
  if ! graphify update . --force >/dev/null 2>&1; then
    printf 'Graphify refresh failed. Run: ./scripts/refresh-ai-context.sh\n' >&2
  fi
  exit 0
fi

graphify update . --force
