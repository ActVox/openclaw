#!/bin/bash
# Sync custom branch with upstream openclaw/openclaw
set -e

cd "$(dirname "$0")/.."

echo "🔄 Fetching upstream..."
git fetch upstream

echo "📥 Updating main..."
git checkout main
git merge upstream/main --ff-only

echo "🔀 Rebasing custom on main..."
git checkout custom
git rebase main

echo "📦 Installing & building..."
pnpm install
pnpm build

echo "🚀 Pushing to fork..."
git push origin main
git push origin custom --force-with-lease

echo "✅ Done! Restart gateway to apply."
