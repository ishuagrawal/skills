#!/usr/bin/env python3
"""Validate every skills/<name>/SKILL.md against the Agent Skills spec (agentskills.io) and the
stricter key set claude.ai / the Claude API accept, so one SKILL.md works on every surface."""
import pathlib, re, sys

ALLOWED = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
root = pathlib.Path(__file__).resolve().parent.parent / "skills"
errors = []
dirs = sorted(p for p in root.iterdir() if p.is_dir())
for d in dirs:
    f = d / "SKILL.md"
    if not f.exists():
        errors.append(f"{d.name}: missing SKILL.md"); continue
    text = f.read_text()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        errors.append(f"{d.name}: no YAML frontmatter"); continue
    fields, key = {}, None
    for line in m.group(1).splitlines():
        km = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if km: key = km.group(1); fields[key] = km.group(2).strip()
        elif key: fields[key] += " " + line.strip()
    for k in fields:
        if k not in ALLOWED: errors.append(f"{d.name}: frontmatter key '{k}' is not portable (allowed: {sorted(ALLOWED)})")
    name, desc = fields.get("name", ""), fields.get("description", "").strip().strip('"')
    if name != d.name: errors.append(f"{d.name}: name '{name}' must equal the directory name")
    if not NAME.match(name) or len(name) > 64: errors.append(f"{d.name}: name must be 1-64 chars of a-z, 0-9 and single hyphens")
    if not 1 <= len(desc) <= 1024: errors.append(f"{d.name}: description must be 1-1024 chars (is {len(desc)})")
    if len(text.splitlines()) > 500: errors.append(f"{d.name}: SKILL.md over 500 lines; move detail into references/")
    print(f"ok  {d.name}  (description {len(desc)}/1024)" if not any(e.startswith(d.name) for e in errors) else f"FAIL {d.name}")
if not dirs: errors.append("no skills found")
for e in errors: print("error:", e)
sys.exit(1 if errors else 0)
