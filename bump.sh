#!/usr/bin/env bash
# bump.sh — bump the app version in BOTH js/version.js and sw.js atomically.
#
# Usage:  ./bump.sh 1.0.3
#
# After bumping, reload the app. Users on the old version will see the
# update banner on their next reload OR when they tap "Check for updates".

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.0.3"
  exit 1
fi

NEW="$1"

# Loose format check: must start with digits.digits.digits
if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "❌ Version must look like 1.2.3 (got: $NEW)"
  exit 1
fi

cd "$(dirname "$0")"

# BSD sed (macOS) — use '' after -i. On GNU/Linux, drop the '' arg.
sed -i '' -E "s/(self\.APP_VERSION[[:space:]]*=[[:space:]]*')[^']*(')/\1${NEW}\2/" js/version.js
sed -i '' -E "s/(const APP_VERSION[[:space:]]*=[[:space:]]*')[^']*(')/\1${NEW}\2/" sw.js

# Verify both files match
V1=$(grep -oE "self\.APP_VERSION[[:space:]]*=[[:space:]]*'[^']+'" js/version.js | grep -oE "'[^']+'" | tr -d "'")
V2=$(grep -oE "const APP_VERSION[[:space:]]*=[[:space:]]*'[^']+'" sw.js | grep -oE "'[^']+'" | tr -d "'")

if [ "$V1" != "$NEW" ] || [ "$V2" != "$NEW" ]; then
  echo "❌ Sync failed. js/version.js=$V1  sw.js=$V2"
  exit 1
fi

echo "✓ Bumped to v$NEW"
echo "  js/version.js  →  $V1"
echo "  sw.js          →  $V2"
echo ""
echo "Now reload the app to test. Users on the old version will see the update banner."
