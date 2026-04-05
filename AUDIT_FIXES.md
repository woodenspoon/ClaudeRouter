# ClaudeRouter Pre-Publication Fixes

Work through every item in order of severity. Each fix includes the exact
file and what to change. Do not skip items. Mark each done as you go.

Target audience: Claude Pro and Max subscribers using Claude Code.
NOT targeting API users — do not add ANTHROPIC_API_KEY checks, warnings,
or prerequisites anywhere.

---

## Critical (blocks publish)

### C1. Create LICENSE file

**FILE:** LICENSE (new file, repo root)
**ISSUE:** No LICENSE file exists. `package.json` says MIT but without the
file, code is legally all rights reserved.
**FIX:** Create `LICENSE` at repo root with MIT license text. Year: 2025.
Copyright holder: "ClaudeRouter Contributors".

### C2. Add "files" whitelist to package.json

**FILE:** package.json
**ISSUE:** No `"files"` array. `npm publish` will ship tests, CLAUDE.md,
tsconfig.json, PRD docs, and everything else in the repo.
**FIX:** Add to package.json:
```json
"files": [
  "dist/",
  "hooks/",
  ".claude-plugin/",
  "runtime-claude.md",
  "README.md",
  "LICENSE"
]
```
Note: if you fix H1 by copying prompt.md into dist/ during build, you do
NOT need to add src/ here. If you fix H1 by inlining the template, same.
Only add `"src/classifier/prompt.md"` to this array if the runtime code
still reads it from that path.

### C3. Add "prepublishOnly" script

**FILE:** package.json
**ISSUE:** No safety net preventing publish of unbuilt or broken code.
**FIX:** Add to `"scripts"`:
```json
"prepublishOnly": "npm run build && npm test"
```

---

## High (causes failures or bad UX)

### H1. prompt.md missing from dist/ after build

**FILE:** src/classifier/classifier.ts (lines 29-46), package.json
**ISSUE:** `prompt.md` lives at `src/classifier/prompt.md`. `tsc` does not
copy `.md` files. After build, the classifier looks for
`dist/classifier/prompt.md`, doesn't find it, and silently falls back to a
simplified inline template. Every npm-installed user gets degraded
classification quality.
**FIX (pick one, recommend option A):**

**Option A — copy during build:**
Change the `"build"` script in package.json to:
```json
"build": "tsc && cp src/classifier/prompt.md dist/classifier/"
```

**Option B — inline the full template:**
Replace the `loadPromptTemplate()` function in classifier.ts so that the
`cachedTemplate` fallback string contains the FULL content of prompt.md
(all tier examples, the "when uncertain" line, and the `{{PROMPT}}`
placeholder). Then delete the file-reading logic and the prompt.md file
entirely.

### H2. Add --version command to CLI

**FILE:** src/cli/index.ts
**ISSUE:** `claude-router --version` prints help text. No version handler.
**FIX:** Add cases to the switch statement in `main()`:
```typescript
case '--version':
case '-v': {
  const pkg = require('../../package.json');
  console.log(pkg.version);
  break;
}
```
Also ensure package.json is accessible at runtime by either:
- Confirming tsc output can resolve `../../package.json` from `dist/cli/`, OR
- Using a different approach (e.g. hardcode version, or read it at build time)

### H3. Add "engines" to package.json

**FILE:** package.json
**ISSUE:** No engine constraint. Users on Node 14/16 get cryptic errors from
ES2022 syntax.
**FIX:** Add:
```json
"engines": { "node": ">=18.0.0" }
```

### H4. Add Prerequisites section to README

**FILE:** README.md
**ISSUE:** Users need to know upfront what's required. Currently scattered.
**FIX:** Add a `## Prerequisites` section BEFORE the Installation section:
```markdown
## Prerequisites

- **Node.js 18+**
- **Claude Code** installed ([install guide](https://docs.anthropic.com/en/docs/claude-code))
- **Claude Pro or Max subscription** (required for subagent delegation)
- **jq** — the hook script depends on it (`brew install jq` / `apt install jq`)
```

### H5. Add Troubleshooting section to README

**FILE:** README.md
**ISSUE:** The most common failure modes are all silent. Users think the tool
is broken with no error.
**FIX:** Add a `## Troubleshooting` section after the Configuration section:
```markdown
## Troubleshooting

**Stats show zero events after using Claude Code**
The hook may not be registered. Check:
\`\`\`bash
cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit'
\`\`\`
If empty, re-run `claude-router init`.

**Hook not firing**
1. Verify `jq` is installed: `command -v jq`
2. Verify the hook script exists at the path shown in settings.json
3. Verify the hook is executable: `ls -la $(which claude-router)`

**jq not installed**
The hook exits silently without jq. Install it:
- macOS: `brew install jq`
- Ubuntu/Debian: `sudo apt install jq`
- Arch: `sudo pacman -S jq`

**claude-router command not found after install**
If installed via `npm install -g .`, ensure your npm global bin directory
is in your PATH: `npm bin -g`

**All prompts routing to Sonnet (MEDIUM)**
This is the fallback behavior when Haiku classification fails. Verify that
Claude Code can reach the Anthropic API (this requires an active Claude
Pro or Max subscription).
```

### H6. Pass prompt via stdin in hook script

**FILE:** hooks/user-prompt-submit.sh (line 46)
**ISSUE:** The prompt is passed as a CLI argument:
```bash
DIRECTIVE=$(claude-router route "$PROMPT" --format directive ...)
```
This makes the full prompt text visible in `ps aux` output to all users on
the system — a privacy concern. It can also hit ARG_MAX limits on long prompts.
**FIX:** Change to passing via stdin. In the hook:
```bash
DIRECTIVE=$(printf '%s' "$PROMPT" | claude-router route --stdin --format directive 2>/dev/null || echo "")
```
Then in src/cli/index.ts, update `handleRoute` to support `--stdin`:
```typescript
async function handleRoute(args: string[]): Promise<void> {
  let prompt: string;
  if (args.includes('--stdin')) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    prompt = Buffer.concat(chunks).toString('utf-8').trim();
  } else {
    prompt = args[0];
  }
  if (!prompt) {
    process.stderr.write('Usage: claude-router route <prompt> [--format model]\n');
    process.exit(1);
  }
  // ... rest unchanged
}
```

---

## Medium (embarrassing or confusing)

### M1. Add "repository" field to package.json

**FILE:** package.json
**FIX:** Add:
```json
"repository": { "type": "git", "url": "https://github.com/0dust/ClaudeRouter.git" }
```

### M2. Add "homepage" field to package.json

**FILE:** package.json
**FIX:** Add:
```json
"homepage": "https://github.com/0dust/ClaudeRouter#readme"
```

### M3. Add badges to README

**FILE:** README.md
**ISSUE:** No badges at top. Published packages without them look abandoned.
**FIX:** Add immediately after the `# ClaudeRouter` heading:
```markdown
[![npm version](https://img.shields.io/npm/v/claude-router.svg)](https://www.npmjs.com/package/claude-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```

### M4. Add GitHub issue template

**FILE:** .github/ISSUE_TEMPLATE/bug_report.md (new file)
**FIX:** Create:
```markdown
---
name: Bug report
about: Something isn't working as expected
labels: bug
---

**Environment**
- OS:
- Node version (`node -v`):
- Claude Code version (`claude --version`):
- claude-router version (`claude-router --version`):

**What happened?**


**What did you expect?**


**Stats output**
\`\`\`
(paste output of `claude-router stats` here)
\`\`\`

**Hook registration**
\`\`\`
(paste output of `cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit'`)
\`\`\`
```

### M5. Suppress override directive in hook

**FILE:** hooks/user-prompt-submit.sh (lines 54-56)
**ISSUE:** The override directive (`[ROUTER] User explicitly requested Opus.
Handle this task directly.`) does not match the `*"Complexity: HIGH"*`
pattern, so it gets output to stdout. This is harmless but unnecessary noise.
**FIX:** Change the case statement to also suppress overrides:
```bash
case "$DIRECTIVE" in
  *"Complexity: HIGH"*|*"Handle this task directly"*) exit 0 ;;
esac
```

### M6. Add doctor command to CLI

**FILE:** src/cli/index.ts (and new function, can be in init.ts or a new doctor.ts)
**ISSUE:** No way to verify installation health after setup.
**FIX:** Add a `doctor` command that checks:
1. Node version >= 18
2. `jq` installed
3. Hook registered in `~/.claude/settings.json`
4. CLAUDE.md has `<!-- claude-router:start -->` marker in CWD
5. `runtime-claude.md` is accessible from the package
6. `prompt.md` is accessible (or inline fallback is in use)
Print a check/cross for each item and exit 0 if all pass, 1 if any fail.

### M7. Fix CONTRIBUTING.md incorrect path

**FILE:** CONTRIBUTING.md (line 8)
**ISSUE:** Says `cd ClaudeRouter/claude-router` — no such subdirectory.
**FIX:** Change to `cd ClaudeRouter`

### M8. Add Contributing pointer in README

**FILE:** README.md
**FIX:** Add before the License section:
```markdown
## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
```

### M9. Update README install instructions for npm

**FILE:** README.md (Installation section)
**ISSUE:** Installation shows `git clone` flow. For a published npm package,
the primary path should be the npm command.
**FIX:** Change the Installation section to lead with:
```markdown
## Installation

\`\`\`bash
npm install -g claude-router
claude-router init
\`\`\`
```
Then add the git clone flow under a `### From source` subsection.

---

## Low (polish)

### L1. Add "llm" to keywords

**FILE:** package.json
**FIX:** Add `"llm"` to the `"keywords"` array.

### L2. Respect NO_COLOR / TTY in stats output

**FILE:** src/cli/stats.ts (line 91)
**ISSUE:** Uses Unicode box-drawing character. No check for terminal support.
**FIX:** At the top of `printStats`, check:
```typescript
const plain = !!process.env.NO_COLOR || !process.stdout.isTTY;
const divider = plain ? '-'.repeat(41) : '\u2500'.repeat(41);
```

### L3. Remove misleading .gitignore entry

**FILE:** .gitignore (line 20)
**ISSUE:** `~/.claude-router/` — tilde doesn't expand in .gitignore. This
line does nothing.
**FIX:** Remove the line or change to a comment explaining the telemetry
directory is in the home folder, not in the repo.

### L4. Change example API key format in CONTRIBUTING.md

**FILE:** CONTRIBUTING.md (line 40)
**ISSUE:** `ANTHROPIC_API_KEY=sk-...` may trigger secret scanners.
**FIX:** Since we're targeting Pro/Max users and not API users, remove the
entire example that shows setting ANTHROPIC_API_KEY. The hook testing
example should just say:
```bash
echo '{"prompt": "add a login endpoint", "is_subagent": false}' \
  | bash hooks/user-prompt-submit.sh
```
(The SDK will use whatever auth the user's Claude session provides.)

### L5. Verify npm name availability

**FILE:** CONTRIBUTING.md (line 19), package.json
**ISSUE:** CONTRIBUTING.md says "that name is taken on the registry by an
unrelated package". Verify by running `npm view claude-router`. If the name
IS taken, you must either use a scoped name (`@0dust/claude-router`) or
resolve the conflict before publish. If the name is NOT taken (or the
CONTRIBUTING.md note is outdated), remove that warning from CONTRIBUTING.md.

---

## Verification after all fixes

Run these commands and confirm each passes:

```bash
npm run build                    # zero errors
npm test                         # zero failures
npm pack --dry-run               # only dist/, hooks/, .claude-plugin/, runtime-claude.md, README.md, LICENSE, package.json
claude-router --version          # prints 1.0.0
claude-router doctor             # all checks pass
claude-router stats              # prints zeros (no events yet)
```
