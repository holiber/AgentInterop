# Agnet API Reference

Version: **1**

---

## agents.*

### `agents.describe` (unary)

**Args**
- `agentId` (string, required)
- `json` (boolean, optional)

---

### `agents.invoke` (serverStream)

**Args**
- `agentId` (string, optional)
- `skill` (string, required)
- `prompt` (string, required)

---

### `agents.list` (unary)

**Args**
- `json` (boolean, optional)

---

### `agents.register` (unary)

**Args**
- `files` (string[], optional)
- `file` (string, optional)
- `json` (string, optional)
- `bearerEnv` (string, optional)
- `apiKeyEnv` (string, optional)
- `headerEnv` (string[], optional)

---

### `agents.session.close` (unary)

**Args**
- `sessionId` (string, required)

---

### `agents.session.open` (unary)

**Args**
- `agentId` (string, optional)
- `skill` (string, optional)

---

### `agents.session.send` (serverStream)

**Args**
- `sessionId` (string, required)
- `prompt` (string, required)

---

## Metadata

- Snapshot schema version: 1
- Profile: default
- Generated at: 1970-01-01T00:00:00.000Z

> Generated from runtime API snapshot. Do not edit manually.
