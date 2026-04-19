#!/usr/bin/env bash
# Bootstrap a scratch workspace under ~/tmp/<dir> preloaded with one
# of the eval-stripe example suites (snake, refactor, bug-fix, hygiene)
# and launch Pi in it.
#
# Usage:
#   ./scripts/bootstrap-demo.sh <suite> [dir] [-- <pi args>...]
#   ./scripts/bootstrap-demo.sh <suite> [dir] --no-start
#
# Examples:
#   ./scripts/bootstrap-demo.sh bug-fix
#   ./scripts/bootstrap-demo.sh refactor refactor-demo-2
#   ./scripts/bootstrap-demo.sh snake --no-start
#
# A bash script cannot cd its parent shell, so "cd + run Pi" is done
# by cd'ing inside the script and exec'ing pi-test.sh — when you exit
# Pi, you're back in your original shell. Pass --no-start to skip
# launching and just prep the dir.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
EXAMPLES_DIR="$PKG_DIR/examples"

usage() {
  echo "Usage: $0 <suite> [dir] [--no-start] [-- <pi args>...]"
  echo
  echo "Available suites:"
  for d in "$EXAMPLES_DIR"/*/; do
    [ -d "$d" ] || continue
    printf '  - %s\n' "$(basename "$d")"
  done
  exit 1
}

START_PI=true
POSITIONAL=()
PI_ARGS=()
SEEN_DOUBLE_DASH=false
for arg in "$@"; do
  if [ "$SEEN_DOUBLE_DASH" = true ]; then
    PI_ARGS+=("$arg")
    continue
  fi
  case "$arg" in
    --no-start) START_PI=false ;;
    --) SEEN_DOUBLE_DASH=true ;;
    -h|--help) usage ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

SUITE="${POSITIONAL[0]:-}"
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

DIR_NAME="${POSITIONAL[1]:-$SUITE}"

# Refuse path-traversal so `rm -rf "$TARGET"` below can't escape ~/tmp.
case "$DIR_NAME" in
  */*|..|.|*..*|"")
    echo "error: dir name '$DIR_NAME' must be a simple folder name (no slashes, no '..')." >&2
    exit 1
    ;;
esac

TARGET="$HOME/tmp/$DIR_NAME"

if [ -e "$TARGET" ]; then
  echo "note: $TARGET already exists — removing and recreating."
  rm -rf "$TARGET"
fi

# Before touching the filesystem, make sure the extension is built —
# otherwise Pi will start up but the stripe won't work.
if [ ! -f "$PKG_DIR/dist/index.js" ]; then
  echo "error: $PKG_DIR/dist/index.js not found." >&2
  echo "       run 'npm run build' in $PKG_DIR first." >&2
  exit 1
fi

mkdir -p "$TARGET/.pi/evals"

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

CASE_COUNT="$(ls -1 "$TARGET/.pi/evals/"*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "Bootstrapped '$SUITE' suite at $TARGET ($CASE_COUNT eval cases)."

if [ "$START_PI" = false ]; then
  echo "cd $TARGET"
  exit 0
fi

PI_TEST="$REPO_ROOT/pi-test.sh"
if [ ! -x "$PI_TEST" ]; then
  echo "error: $PI_TEST not found or not executable." >&2
  exit 1
fi

echo "Starting Pi in $TARGET..."
cd "$TARGET"
exec "$PI_TEST" ${PI_ARGS[@]+"${PI_ARGS[@]}"}
