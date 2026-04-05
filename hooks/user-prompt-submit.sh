#!/bin/bash
set -euo pipefail

INPUT=$(cat)

# Infinite loop guard: if this is a subagent, skip classification entirely
IS_SUBAGENT=$(echo "$INPUT" | jq -r '.is_subagent // false')
[ "$IS_SUBAGENT" = "true" ] && echo '{}' && exit 0

PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

if [ -z "$PROMPT" ]; then
  echo "{}"
  exit 0
fi

# Get the routing directive from the classifier
# Use --format directive to get the plain text [ROUTER] directive
DIRECTIVE=$(claude-router route "$PROMPT" --format directive 2>/dev/null || echo "")

if [ -z "$DIRECTIVE" ]; then
  # Fallback: no directive, let Claude handle normally
  echo "{}"
  exit 0
fi

# Output the directive as plain text stdout
# Claude Code adds plain text stdout from UserPromptSubmit hooks as context
echo "$DIRECTIVE"
exit 0
