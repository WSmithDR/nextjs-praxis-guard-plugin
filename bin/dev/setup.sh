#!/bin/bash
# Setup de desarrollo: instala el hook post-commit (auto-bump de versión).
# Uso: bash bin/dev/setup.sh
#
# Instala SOLO post-commit (no toca el pre-commit del todo-plugin, que es otro evento).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
src="$REPO_ROOT/bin/dev/git-hooks/post-commit"
dst="$REPO_ROOT/.git/hooks/post-commit"

chmod +x "$src"
if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
  echo "✓ post-commit ya instalado"
else
  ln -sf "$src" "$dst"
  echo "✓ post-commit instalado → .git/hooks/post-commit"
fi
echo "  auto-bump de versión según el prefijo del commit (feat→minor, fix/…→patch, BREAKING→major)."
