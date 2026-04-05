# ClaudeRouter

**Stop burning Opus tokens on grep.** ClaudeRouter classifies every prompt before it hits the model — routing simple tasks to Haiku, feature work to Sonnet, and architecture to Opus. Ships as a Claude Code plugin. Zero config.

## Motivation

93.8% of all tokens in a typical Claude Code Max session flow to Opus — even for trivial tasks like "yes, do it" or "what does this function do?" ([#27665](https://github.com/anthropics/claude-code/issues/27665), [#43326](https://github.com/anthropics/claude-code/issues/43326)). ClaudeRouter fixes this by classifying prompt complexity and delegating to the right model automatically.

## Installation

```bash
git clone https://github.com/0dust/ClaudeRouter.git
cd ClaudeRouter
npm install
npm run build
npm install -g .
claude-router init
```

This will:
- Verify dependencies (`jq`, `ANTHROPIC_API_KEY`)
- Register the `UserPromptSubmit` hook in `~/.claude/settings.json`
- Append the routing directive to your project's `CLAUDE.md` (with markers for clean removal)

You can also target a specific project directory:

```bash
claude-router init /path/to/your/project
```

## Verify It's Working

After a few prompts, check your routing stats:

```bash
claude-router stats
```

If counts are incrementing, routing is active. You can also check the hook is registered:

```bash
cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit'
```

## How It Works

ClaudeRouter intercepts every `UserPromptSubmit` hook, classifies the prompt's complexity, and injects a routing directive into Claude's context. Claude then delegates to the appropriate subagent model.

| Tier | Model | Example Prompts | Savings vs Opus |
|------|-------|----------------|-----------------|
| **LOW** | Haiku | "what does this function do?", "yes do it", file reads, grep | ~95% |
| **MEDIUM** | Sonnet | "add an endpoint for X", "fix this bug", "write tests for Y" | ~60% |
| **HIGH** | Opus | "redesign the auth layer", "review this architecture" | 0% (correct spend) |

### Classification Pipeline

1. **Pre-Haiku heuristics** (synchronous, zero cost) — catches ~30% of LOW prompts via token count, keyword matching, and confirmation detection. No API call needed.
2. **Haiku classification** (async, <$0.001) — sends the prompt to Haiku with a structured classification prompt. Returns LOW, MEDIUM, or HIGH.
3. **Context injection** — the routing directive is injected as context. Claude reads it and delegates to the appropriate subagent.

### Routing Directives

- **LOW** → Claude spawns a Haiku subagent via the Agent tool
- **MEDIUM** → Claude spawns a Sonnet subagent via the Agent tool
- **HIGH** → Claude handles the task directly with full reasoning
- **Override** → User prefixed with `//opus`, Claude handles directly

## Stats

Track your routing efficiency:

```bash
claude-router stats
```

```
ClaudeRouter — last 7 days
─────────────────────────────────────────
Prompts routed:        847
LOW  → Haiku:          312   (36.8%)
MED  → Sonnet:         431   (50.9%)
HIGH → Opus:           104   (12.3%)
Estimated Opus saved:   148.6K tokens
Follow-up rate (LOW):   4.1%    ← routing accuracy
Manual overrides:       7
─────────────────────────────────────────
```

Use `--days N` to change the window: `claude-router stats --days 30`

## Failure Behavior

ClaudeRouter is designed to never block Claude Code:

- **Classifier fails**: Falls back to MEDIUM (Sonnet) — the safe middle ground
- **API timeout**: Haiku classification has a 3-second timeout; on timeout, falls back to MEDIUM
- **No internet**: Pre-Haiku heuristics still work (catches ~30% of prompts); the rest fall back to MEDIUM
- **Missing dependencies**: Hook exits silently with no directive; Claude handles the prompt normally on whatever model the session is using
- **Any unexpected error**: The hook always exits 0 and never blocks the user's prompt

## Configuration

ClaudeRouter works with zero configuration. To customize, create `.claude-router.json` in your project root or `~/.claude-router.json` globally:

```json
{
  "tiers": {
    "LOW": "claude-haiku-4-5-20251001",
    "MEDIUM": "claude-sonnet-4-6",
    "HIGH": "claude-opus-4-6"
  },
  "fallback": "claude-sonnet-4-6",
  "conservative": false,
  "override_keyword": "//opus"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `tiers.LOW` | `claude-haiku-4-5-20251001` | Model for trivial tasks |
| `tiers.MEDIUM` | `claude-sonnet-4-6` | Model for standard engineering work |
| `tiers.HIGH` | `claude-opus-4-6` | Model for deep reasoning tasks |
| `fallback` | `claude-sonnet-4-6` | Model used when classification fails |
| `conservative` | `false` | Shift all routes one tier up (LOW→Sonnet, MEDIUM→Opus) |
| `override_keyword` | `//opus` | Prefix to force Opus on any turn |

Config is merged in order: hardcoded defaults → `~/.claude-router.json` → CWD `.claude-router.json`. Later values override earlier ones.

## Override Keyword

Prefix any prompt with `//opus` to bypass classification and force Opus:

```
//opus explain the tradeoffs between these two architectures
```

This routes directly to Opus regardless of what the classifier would have chosen. The keyword is stripped from the prompt before processing.

## SDK Usage

The routing logic is available as a standalone SDK for any Claude-based agent stack:

```typescript
import { classify, route, createRouter } from 'claude-router';

// Single classification call
const result = await classify('fix the typo on line 42');
// { tier: 'LOW', source: 'signal', latency_ms: 0, prompt_tokens: 7 }

// Full routing decision
const config = loadConfig();
const decision = await route('add user authentication', config);
// { model: 'claude-sonnet-4-6', tier: 'MEDIUM', source: 'haiku', ... }

// Stateful router with telemetry
const router = createRouter({ telemetry: true });
const d = await router.route('redesign the auth layer');
console.log(router.stats());
// { total: 1, low: 0, medium: 0, high: 1, overrides: 0, avg_latency_ms: 12 }
```

### API

- **`classify(prompt)`** — Returns `ClassificationResult` with tier, source, latency, and token count
- **`quickClassify(prompt)`** — Synchronous heuristic-only classification. Returns tier or `null`
- **`route(prompt, config)`** — Full routing decision with model, directive, and metadata
- **`loadConfig()`** — Load merged config from defaults + global + local files
- **`createRouter(options?)`** — Stateful router instance with `.route()` and `.stats()` methods

## How the Plugin Works

ClaudeRouter uses Claude Code's `UserPromptSubmit` hook to inject routing directives as context. The `CLAUDE.md` file in your project root instructs Claude to follow these directives transparently — delegating to Haiku or Sonnet subagents for lower-complexity tasks.

This approach:
- **Requires no model mutation** — works within the existing hook API
- **Is transparent to the user** — no visible routing artifacts
- **Includes an infinite loop guard** — subagents don't re-trigger the classification hook

## Uninstallation

```bash
claude-router remove
npm uninstall -g claude-router
```

This removes:
- The `UserPromptSubmit` hook from `~/.claude/settings.json`
- The `<!-- claude-router:start -->` ... `<!-- claude-router:end -->` block from your project's `CLAUDE.md`

Telemetry data in `~/.claude-router/` is preserved. Delete it manually if desired.

## License

MIT
