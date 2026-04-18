#!/usr/bin/env bash
# Bootstrap a scratch workspace under ~/tmp/<dir> preloaded with one
# of the eval-stripe example suites (snake, refactor, bug-fix, hygiene).
#
# Usage:
#   ./scripts/bootstrap-demo.sh <suite> [dir]
#
# Examples:
#   ./scripts/bootstrap-demo.sh bug-fix
#   ./scripts/bootstrap-demo.sh refactor refactor-demo-2
#
# Prints the full cd command to run next.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLES_DIR="$PKG_DIR/examples"

usage() {
  echo "Usage: $0 <suite> [dir]"
  echo
  echo "Available suites:"
  for d in "$EXAMPLES_DIR"/*/; do
    [ -d "$d" ] || continue
    printf '  - %s\n' "$(basename "$d")"
  done
  exit 1
}

SUITE="${1:-}"
[ -n "$SUITE" ] || usage

SUITE_DIR="$EXAMPLES_DIR/$SUITE"
if [ ! -d "$SUITE_DIR" ]; then
  echo "error: suite '$SUITE' not found at $SUITE_DIR" >&2
  usage
fi
if [ ! -d "$SUITE_DIR/evals" ]; then
  echo "error: suite '$SUITE' has no evals/ subdirectory" >&2
  exit 1
fi

DIR_NAME="${2:-$SUITE}"
TARGET="$HOME/tmp/$DIR_NAME"

if [ -e "$TARGET" ]; then
  echo "error: $TARGET already exists. Remove it or choose a different dir." >&2
  exit 1
fi

mkdir -p "$TARGET/.pi/evals"

# Copy eval case files into .pi/evals/.
cp "$SUITE_DIR/evals/"*.md "$TARGET/.pi/evals/"

# Copy all other top-level files from the suite (source files, etc.),
# skipping DEMO.md and the evals/ directory we already handled.
shopt -s nullglob
for entry in "$SUITE_DIR"/*; do
  name="$(basename "$entry")"
  case "$name" in
    DEMO.md|evals) continue ;;
  esac
  cp -R "$entry" "$TARGET/"
done
shopt -u nullglob

# Write settings.json pointing at the built extension.
cat > "$TARGET/.pi/settings.json" <<EOF
{
  "extensions": ["$PKG_DIR"],
  "evals": {
    "enabled": true,
    "path": ".pi/evals",
    "window": 1,
    "graderModel": "claude-haiku-4-5-20251001",
    "barWidth": 24
  }
}
EOF

# Sanity check: extension must be built.
if [ ! -f "$PKG_DIR/dist/index.js" ]; then
  echo "warning: $PKG_DIR/dist/index.js not found — run 'npm run build' in $PKG_DIR first." >&2
fi

CASE_COUNT="$(ls -1 "$TARGET/.pi/evals/"*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "Bootstrapped '$SUITE' suite at $TARGET ($CASE_COUNT eval cases)."
echo "cd $TARGET"
