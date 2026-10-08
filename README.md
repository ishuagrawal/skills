# skills

Open-source [Agent Skills](https://agentskills.io) by [Ishu Agrawal](https://github.com/ishuagrawal).
Each skill is a folder with a `SKILL.md` plus the scripts, references, and assets it needs. They work in
Claude Code and in any other agent that supports the open Agent Skills format.

## Skills

| Skill | What it's for |
| --- | --- |
| [`video-by-reference`](skills/video-by-reference/SKILL.md) | Turns a video you love into an original animated short in the same style, with its own soundtrack. |
| [`image-by-reference`](skills/image-by-reference/SKILL.md) | Draws whatever you prompt in the exact art style of a reference image, measured trait by trait. |

## Install

### Claude Code (recommended)

Inside a Claude Code session:

```
/plugin marketplace add ishuagrawal/skills
/plugin install skills@ishuagrawal
/reload-plugins
```

Or from your shell:

```bash
claude plugin marketplace add ishuagrawal/skills
```

```bash
claude plugin install skills@ishuagrawal --scope user
```

Claude picks a skill up automatically when your request matches it. You can also call one directly,
for example `/skills:video-by-reference`.

### Other agents (Cursor, Codex, OpenCode, Gemini CLI, and others)

This uses the third-party [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add ishuagrawal/skills
```

Add `--skill video-by-reference` to install a single skill, `-a claude-code` (or another agent) to
pick the target, and `-g` to install for your user instead of the current project.

<details>
<summary>claude.ai and Claude API</summary>

**claude.ai:** download the skill's zip from the
[latest release](https://github.com/ishuagrawal/skills/releases/latest) (for example
`video-by-reference.zip`), then open **Settings**, find the **Skills** section, and upload it. This needs
a Pro, Max, Team, or Enterprise plan with code execution turned on.

**Claude API:** upload the same zip through the Skills API (`/v1/skills`) and use it with the
code-execution tool. See the
[Agent Skills docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).

To update, download the new zip from the latest release and upload it again.

</details>

### Manual

Copy `skills/<name>/` into `~/.claude/skills/` for all your projects, or into `.claude/skills/` for a
single project.

## Updating

- **Claude Code:** run `/plugin marketplace update ishuagrawal`, then `/reload-plugins`. You can also
  turn on auto-update: open `/plugin`, go to **Marketplaces**, select **ishuagrawal**, and choose
  **Enable auto-update**. Third-party marketplaces have it off by default.
- **`npx skills`:** `npx skills update`

## Requirements per skill

**video-by-reference** renders real video files, so it needs a machine where it can run code:

- Node.js 22+
- `ffmpeg` and `ffprobe` on `PATH`
- Python 3 with `numpy` (used for analysis)
- A headless Chromium. Playwright's `chrome-headless-shell` is preferred; Google Chrome also works.

It works best in Claude Code or another local agent. The claude.ai and API sandboxes have no network
access and may lack Chrome or ffmpeg, so they can read the skill but may not be able to render.

**image-by-reference** renders PNGs in a headless browser and measures images in Python:

- Node.js 22+
- A headless Chromium (Playwright's `chrome-headless-shell` preferred; Google Chrome also works)
- Python 3 with `numpy` and `Pillow`
- `ffmpeg` (optional, only for contact sheets of seed variants)

The same sandbox caveat applies on claude.ai and the API.

## Repository layout

```
.claude-plugin/
  marketplace.json   # makes this repo a Claude Code marketplace ("ishuagrawal")
  plugin.json        # the "skills" plugin and its version
skills/
  <skill-name>/      # one folder per skill (SKILL.md + references/, scripts/, assets/)
scripts/
  check_skills.py    # checks every SKILL.md against the Agent Skills spec
  package_skills.sh  # builds dist/<skill>.zip for claude.ai or the API
  release.sh         # bumps the version, tags, and pushes a release
.github/workflows/   # validate on every push; attach zips to each tagged release
```

## Maintaining (for the author)

**Add a skill.** Create `skills/<name>/SKILL.md`. The frontmatter `name` must match the folder name
(lowercase letters, digits, and hyphens). The `description` can be at most 1024 characters. Keep the
frontmatter to `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools`, so
the same file also uploads to claude.ai and the API. Then add a row to the table above and run:

```bash
python3 scripts/check_skills.py
```

```bash
claude plugin validate . --strict
```

**Release an update.** Commit your changes, then run:

```bash
./scripts/release.sh 1.1.0
```

This bumps `version` in `.claude-plugin/plugin.json`, validates, commits, tags `v1.1.0`, and pushes.
Claude Code users get the new version on their next marketplace update, or automatically if
auto-update is on. The tag also triggers a GitHub release that attaches a fresh zip for every skill.
Use semver: patch for fixes, minor for new skills or features, major for breaking changes.

Claude Code only treats a push as a new version when the `version` string changes, so always release
through the script.

## License

[MIT](LICENSE)
