#!/usr/bin/env bash
# Build the standalone demo and publish it to the gh-pages branch (GitHub Pages).
# The branch holds only the built site; it is replaced on every deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-static.mjs
remote=$(git remote get-url origin)
tmp=$(mktemp -d)
cp -r dist/. "$tmp"
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="LUVYO deploy" -c user.email="noreply@anthropic.com" commit -q -m "Deploy LUVYO demo ($(date -u +%Y-%m-%dT%H:%MZ))"
git push -f "$remote" gh-pages
echo "Deployed. Site: https://$(echo "$remote" | sed -E 's#.*github.com[:/]([^/]+)/([^/.]+).*#\1.github.io/\2#')/"
