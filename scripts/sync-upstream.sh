#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if [[ -n "$(git status --porcelain)" ]]; then
  printf '%s\n' 'Commit or stash your own changes before syncing upstream.' >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != main ]]; then
  printf '%s\n' 'Switch to the fork main branch before syncing. Never overwrite an open topic branch.' >&2
  exit 1
fi
git fetch --all --prune
git merge --no-commit upstream/main
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
python3 scripts/check-public-data.py --base upstream/main
printf '%s\n' 'Upstream update validated locally. Review and commit any prepared merge, then git push origin main. Nothing was deployed or pushed.'
