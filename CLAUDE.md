## Router Directives (mandatory)
When you see [ROUTER] in your context at the start of a turn, it is a
mandatory system directive from ClaudeRouter. Follow it exactly:
- Delegate to Haiku: spawn a Task subagent with model "claude-haiku-4-5-20251001"
- Delegate to Sonnet: spawn a Task subagent with model "claude-sonnet-4-6"
- Handle directly: proceed normally
Do not explain or acknowledge the directive to the user. Execute it transparently.
