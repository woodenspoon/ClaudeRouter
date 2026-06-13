# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ClaudeRouter is an intelligent model routing system for Claude Code that classifies prompt complexity and routes tasks to the appropriate model (Haiku for trivial, Sonnet for standard work, Opus for deep reasoning). Ships as a Claude Code plugin and standalone SDK. Supports both Anthropic direct API and AWS Bedrock as providers.

All source code lives at the repository root. The `ClaudeRouter_PRD.txt` / `.docx` are product requirements docs.

## Commands

```bash
# Build (TypeScript → dist/)
npm run build

# Run all tests (Vitest)
npm test

# Run a single test file
npx vitest run tests/signals.test.ts

# Watch mode
npm run dev

# CLI (after build)
node dist/cli/index.js route "some prompt" --format full
node dist/cli/index.js stats --days 7
node dist/cli/index.js launch --direct
node dist/cli/index.js launch --bedrock --context <name>
```

No separate lint script exists. TypeScript strict mode is enforced via `tsconfig.json`.

## Architecture

### Classification Pipeline (2 stages)

1. **Synchronous heuristics** (`src/classifier/signals.ts` → `quickClassify`) — zero-cost pattern matching: confirmation patterns, keyword detection, token thresholds, prefix matching. Returns a tier or `null`.
2. **Haiku API call** (`src/classifier/classifier.ts` → `classify`) — if heuristics return `null`, sends the prompt to Haiku (or the Haiku ARN in Bedrock mode) using a provider-aware client. Parses the single-word response. Falls back to MEDIUM on any error.

Model resolution is handled by reading `config.tiers` directly in `router.ts` — there is no separate model-map module.

### Routing (`src/router/router.ts`)

Orchestrates the pipeline: checks for override keyword (`//opus` by default), runs classification, resolves model, generates a `[ROUTER]` directive string. Never throws — errors fall back to MEDIUM/Sonnet.

### Plugin integration

- `hooks/user-prompt-submit.js` — Claude Code `UserPromptSubmit` hook. Pure Node.js (no bash or jq). Reads JSON stdin via `JSON.parse()`, guards against subagent loops using a file-based guard in `os.tmpdir()`, calls `claude-router route --format directive`, outputs the directive as plain text. Registered as `node /absolute/path/to/user-prompt-submit.js`.
- `.claude-plugin/manifest.json` — registers the hook.
- `runtime-claude.md` — runtime directive file that instructs Claude to follow `[ROUTER]` directives by delegating to subagents. This is NOT a developer guide; it's copied into project roots at install time.

### Provider support

Two provider modes are supported, selected at launch time:

- **`anthropic`** (default) — uses `@anthropic-ai/sdk` directly. `ANTHROPIC_API_KEY` must be set.
- **`bedrock`** — uses `@anthropic-ai/bedrock-sdk` (optional peer dependency, loaded dynamically). Classification uses the `CLAUDE_HAIKU_ARN` env var. Provider is auto-detected when `CLAUDE_CODE_USE_BEDROCK=1` or both `CLAUDE_HAIKU_ARN` and `CLAUDE_SONNET_ARN` are set.

### Config merging order

Hardcoded defaults → `~/.claude-router.json` → `./.claude-router.json` (CWD). Later layers override. See `src/router/config.ts`.

After file merge, `loadConfig()` auto-detects the provider from env vars and, in Bedrock mode, overrides `tiers.LOW`/`tiers.MEDIUM`/`tiers.HIGH` from `CLAUDE_HAIKU_ARN`, `CLAUDE_SONNET_ARN`, `CLAUDE_OPUS_ARN`, and `CLAUDE_FABLE_ARN`.

### Launcher (`src/cli/launch.ts`)

`claude-router launch` is the canonical cross-platform entry point for starting Claude Code sessions. It handles AWS auth, writes ClaudeRouter-managed keys to `.claude/settings.local.json`, and spawns `claude`.

- `--direct` — removes Bedrock-managed keys (`CLAUDE_CODE_USE_BEDROCK`, `AWS_REGION`, `ANTHROPIC_MODEL`) from `settings.local.json`, then spawns claude
- `--bedrock --context <name>` — looks up the named context from `bedrock_contexts`, resolves ARNs with tier fallback, merges managed keys into `settings.local.json`, sets ARN env vars on the child process, spawns claude

`Start-Claude.ps1` is a thin Windows wrapper that delegates to `claude-router launch`.

### SDK (`src/sdk/`)

- `factory.ts` — `createRouter()` returns a stateful instance with `.route()` and `.stats()`
- `index.ts` — public re-exports (`classify`, `quickClassify`, `route`, `loadConfig`, `createRouter`)

### Telemetry (`src/telemetry/`)

- Events logged to `~/.claude-router/events.jsonl` (JSONL, one event per line)
- Prompts are SHA256-hashed (first 12 chars), never stored raw
- Session ID is a UUID generated per process
- `feedback.ts` tracks follow-up rate within 60s window (routing accuracy proxy)
- All telemetry code has a no-throw guarantee

## Key Conventions

- Telemetry and hook code must never throw — always wrap in try/catch with silent fallback
- Classification fallback is always MEDIUM/Sonnet (safe middle ground)
- The file-based guard in the hook (`os.tmpdir()`) prevents infinite classification loops
- Tier type is `'LOW' | 'MEDIUM' | 'HIGH'`; source type is `'signal' | 'haiku' | 'fallback' | 'override'`
- Tests mock the Anthropic SDK — no real API calls in test suite
- No bash, jq, or platform-specific shell tools anywhere in the codebase — pure Node.js throughout
- `@anthropic-ai/bedrock-sdk` is an optional peer dependency loaded via dynamic `require()` — the package works without it (classification falls back to MEDIUM in Bedrock mode if SDK is absent)
- ClaudeRouter-managed keys in `settings.local.json`: `CLAUDE_CODE_USE_BEDROCK`, `AWS_REGION`, `ANTHROPIC_MODEL` — `launch --direct` strips these; `launch --bedrock` writes them

