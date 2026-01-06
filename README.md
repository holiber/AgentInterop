# AgentInterop
An Network for your AI agents

## CLI (local)

This repo ships a small CLI that can talk to local stdio agents.

```bash
# List built-in demo agents
agentinterop agents list

# Describe an agent (skills/capabilities)
agentinterop agents describe mock-agent

# One-shot invocation
agentinterop agents invoke --agent mock-agent --skill chat --prompt "hello"

# Session lifecycle (state persisted in ./.cache/agentinterop/sessions)
SESSION_ID="$(agentinterop agents session open --agent mock-agent)"
agentinterop agents session send --session "$SESSION_ID" --prompt "hello"
agentinterop agents session send --session "$SESSION_ID" --prompt "world"
agentinterop agents session close --session "$SESSION_ID"
```
