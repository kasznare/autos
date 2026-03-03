#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/setup-worktrees.sh [base_ref]
# Example:
#   scripts/setup-worktrees.sh main

BASE_REF="${1:-main}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PARENT_DIR="$(cd "${REPO_ROOT}/.." && pwd)"

if ! git show-ref --verify --quiet "refs/heads/${BASE_REF}" && ! git rev-parse --verify --quiet "${BASE_REF}" >/dev/null; then
  echo "Base ref '${BASE_REF}' not found. Falling back to current branch."
  BASE_REF="$(git branch --show-current)"
fi

declare -a BRANCHES=(
  "codex/team-01-physics-destruction"
  "codex/team-02-worlds-maps-gravity"
  "codex/team-03-vehicle-builder"
  "codex/team-04-immersion-audio-visual"
  "codex/integration"
)

declare -a DIRS=(
  "${PARENT_DIR}/autos-team-01"
  "${PARENT_DIR}/autos-team-02"
  "${PARENT_DIR}/autos-team-03"
  "${PARENT_DIR}/autos-team-04"
  "${PARENT_DIR}/autos-integration"
)

for i in "${!BRANCHES[@]}"; do
  branch="${BRANCHES[$i]}"
  dir="${DIRS[$i]}"

  if git worktree list --porcelain | rg -q "^branch refs/heads/${branch}$"; then
    echo "Skipping ${branch}: already attached to a worktree."
    continue
  fi

  if [ -e "${dir}" ] && [ -n "$(ls -A "${dir}" 2>/dev/null || true)" ]; then
    echo "Skipping ${branch}: target dir is non-empty: ${dir}"
    continue
  fi

  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "Adding existing branch ${branch} -> ${dir}"
    git worktree add "${dir}" "${branch}"
  else
    echo "Creating branch ${branch} from ${BASE_REF} -> ${dir}"
    git worktree add -b "${branch}" "${dir}" "${BASE_REF}"
  fi
done

echo
echo "Worktree setup complete."
git worktree list
