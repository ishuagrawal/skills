#!/usr/bin/env bash
# Publish an update: ./scripts/release.sh 1.1.0
# Bumps .claude-plugin/plugin.json, validates, commits, tags vX.Y.Z and pushes. Claude Code users
# get the new version on their next marketplace update (or automatically with auto-update on);
# the tag triggers .github/workflows/release.yml, which attaches one zip per skill for claude.ai.
set -euo pipefail
cd "$(dirname "$0")/.."
v="${1:?usage: scripts/release.sh X.Y.Z}"
[[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must be X.Y.Z"; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "commit or stash your changes first"; exit 1; }
python3 - "$v" <<'PY'
import json, sys
p = ".claude-plugin/plugin.json"; d = json.load(open(p)); d["version"] = sys.argv[1]
json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")
PY
python3 scripts/check_skills.py
if command -v claude >/dev/null; then claude plugin validate . --strict; fi
git add .claude-plugin/plugin.json
git commit -m "Release v$v"
git tag "v$v"
git push origin HEAD "v$v"
echo "Released v$v"
