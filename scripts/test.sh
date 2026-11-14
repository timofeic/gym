#!/usr/bin/env bash
# Runs every unit and integration suite in the repo. Used by /verify (it passes
# the selected test files as arguments; each suite is fast, so all run).
# The iOS UI tests are slower and separate: see ios/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."
gym-app/scripts/localdb/localdb.sh start >/dev/null
echo "== gym-app (vitest)";       (cd gym-app && npx vitest run)
echo "== agent (pytest)";         (cd agent && uv run pytest -q)
echo "== GymCore (swift test)";   (cd ios/Packages/GymCore && swift test 2>&1 | grep -E "✔ Test run|✘|error:" ; exit "${PIPESTATUS[0]}")
