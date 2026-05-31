#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    printf 'Installing uv with Homebrew...\n'
    brew install uv
  else
    printf 'Homebrew is required to install uv automatically on macOS.\n' >&2
    printf 'Install Homebrew from https://brew.sh, then rerun this script.\n' >&2
    exit 1
  fi
fi

if ! command -v graphify >/dev/null 2>&1; then
  printf 'Installing Graphify...\n'
  uv tool install graphifyy
fi

cd "$repo_root"

printf 'Configuring Codex integration...\n'
graphify codex install

printf 'Configuring VS Code Copilot Chat integration...\n'
graphify vscode install

git_dir="$(git rev-parse --git-dir)"
post_merge_hook="$git_dir/hooks/post-merge"
marker='# expense-tracker Graphify refresh'

if [[ ! -f "$post_merge_hook" ]]; then
  mkdir -p "$(dirname "$post_merge_hook")"
  printf '#!/usr/bin/env bash\n' > "$post_merge_hook"
fi

if ! grep -Fq "$marker" "$post_merge_hook"; then
  cat >> "$post_merge_hook" <<'EOF'

# expense-tracker Graphify refresh
repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
"$repo_root/scripts/refresh-ai-context.sh" --quiet
EOF
fi

chmod +x "$post_merge_hook"

printf 'Building local Graphify context...\n'
"$repo_root/scripts/refresh-ai-context.sh"

printf '\nAI context setup complete.\n'
printf 'Future git pulls refresh Graphify automatically through .git/hooks/post-merge.\n'
