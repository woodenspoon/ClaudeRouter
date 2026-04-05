#!/bin/bash

# Dependency checks — exit silently if tools are missing
if ! command -v jq >/dev/null 2>&1; then exit 0; fi
if ! command -v claude-router >/dev/null 2>&1; then exit 0; fi

# Read all of stdin; exit silently if empty
INPUT=$(cat) || true
if [ -z "$INPUT" ]; then exit 0; fi

# --- File-based depth guard (belt-and-suspenders for infinite loop prevention) ---
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
DEPTH_FILE="/tmp/.claude-router-guard-${SESSION_ID}"

if [ -f "$DEPTH_FILE" ]; then
  # Check if the file was modified in the last 5 seconds (stale guard cleanup)
  if [ "$(uname)" = "Darwin" ]; then
    FILE_MOD=$(stat -f %m "$DEPTH_FILE" 2>/dev/null || echo 0)
  else
    FILE_MOD=$(stat -c %Y "$DEPTH_FILE" 2>/dev/null || echo 0)
  fi
  NOW=$(date +%s)
  AGE=$(( NOW - FILE_MOD ))
  if [ "$AGE" -lt 5 ] 2>/dev/null; then
    # Recent guard file exists — likely a re-entrant call. Skip.
    exit 0
  fi
fi

# Touch the guard file so re-entrant calls within 5s are blocked
touch "$DEPTH_FILE" 2>/dev/null || true

# --- Subagent check (original guard, kept as additional safety) ---
IS_SUBAGENT=$(echo "$INPUT" | jq -r '.is_subagent // false' 2>/dev/null || echo "false")
if [ "$IS_SUBAGENT" = "true" ]; then exit 0; fi

# --- Extract prompt ---
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")
if [ -z "$PROMPT" ]; then exit 0; fi
CWD=$(echo "$INPUT" | jq -r '.cwd // ""' 2>/dev/null || echo "")

# --- Protect against very long prompts ---
PROMPT_LEN=${#PROMPT}
if [ "$PROMPT_LEN" -gt 100000 ] 2>/dev/null; then exit 0; fi

# --- Get the routing directive from the classifier ---
DIRECTIVE=$(printf '%s' "$PROMPT" | timeout 8 claude-router route --stdin --format directive ${CWD:+--cwd "$CWD"} 2>/dev/null || echo "")

if [ -z "$DIRECTIVE" ]; then
  # No directive — let Claude handle normally
  exit 0
fi

# --- Suppress HIGH tier (Claude handles these directly by default) ---
case "$DIRECTIVE" in
  *"Complexity: HIGH"*|*"Handle this task directly"*) exit 0 ;;
esac

# Output the directive as plain text stdout
# Claude Code adds plain text stdout from UserPromptSubmit hooks as context
echo "$DIRECTIVE"
exit 0
