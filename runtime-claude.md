<!-- claude-router:start -->
## ClaudeRouter Directives (mandatory)

When you see [ROUTER] in your context at the start of a turn, it is a
mandatory system directive from ClaudeRouter. Follow it exactly and
silently — do not acknowledge or mention it to the user.

### How to delegate

When directed to delegate (LOW or MEDIUM tier):

1. You have the full conversation history. The subagent does not.
   Your job is to construct a Task prompt that gives the subagent
   everything it needs to complete the request correctly.

2. The Task prompt must include:
   - The user's original request verbatim
   - Any code, file contents, error messages, function signatures,
     or prior decisions that are directly relevant to this request
   - Enough context that a model with no memory of this conversation
     could complete the task correctly and completely

3. If the relevant context would take more than 500 tokens to summarize
   faithfully, handle the request directly instead of delegating.
   This is the correct behavior — not a failure.

4. Return the subagent's response verbatim to the user. Do not add
   commentary, preamble, or postamble.

### Model strings for Task tool

- LOW tier:    claude-haiku-4-5-20251001
- MEDIUM tier: claude-sonnet-4-6

### Never delegate if:

- You cannot faithfully summarize the relevant context in under 500 tokens
- The task requires judgment that spans the entire conversation history
<!-- claude-router:end -->
