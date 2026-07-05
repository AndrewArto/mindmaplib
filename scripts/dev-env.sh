#!/usr/bin/env sh
# Dev environment shim for machines where the system node is newer than
# dependency-cruiser supports. Activates a locally installed node 22 LTS.
#
# Usage (from repo root):
#   source scripts/dev-env.sh
#
# This is a no-op on machines that already run node 22/24/26 as default.
if command -v node >/dev/null 2>&1; then
  _v="$(node --version 2>/dev/null | sed 's/v//')"
  _major="${_v%%.*}"
  case "$_major" in
    22|24|26)
      # system node is already supported; nothing to do
      return 0 2>/dev/null || exit 0
      ;;
  esac
fi

# Locally installed node 22 LTS (see .nvmrc)
if [ -x "$HOME/.local/node22/bin/node" ]; then
  export PATH="$HOME/.local/node22/bin:$PATH"
elif [ -x "/Users/andery-mini/.local/node22/bin/node" ]; then
  export PATH="/Users/andery-mini/.local/node22/bin:$PATH"
fi
