#!/usr/bin/env bash
# Publish the three workspace packages to npm in dependency order.
# Prerequisites: npm login, versions already bumped.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PACKAGES=(
  "@blockml/block-render-engine"
  "@machineblocks/render-target"
  "@machineblocks/cli"
)

echo "Building all packages..."
npm run build

for pkg in "${PACKAGES[@]}"; do
  echo "Publishing ${pkg}..."
  npm publish -w "$pkg" --access public
done

echo "Done. Published ${#PACKAGES[@]} packages."
