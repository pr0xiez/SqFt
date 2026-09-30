#!/usr/bin/env bash
# Vercel's ignore command: 0 skips deployment, 1 builds it.
# A merge from main can have an unchanged first-parent tree while the PR still
# carries app changes relative to the second parent. Check both parents.
set -euo pipefail

if ! git diff --quiet HEAD^ HEAD -- . ':(exclude)www'; then
  exit 1
fi
if git rev-parse --verify HEAD^2 >/dev/null 2>&1; then
  git diff --quiet HEAD^2 HEAD -- . ':(exclude)www'
fi
