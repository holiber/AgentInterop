# 📘 Agnet Glossary


---

| Word | Meaning (in Agnet) | Mapping to other systems |
|-----|-------------------|--------------------------|
| 🧩 **Agent** | A logical AI entity capable of executing work. An Agent exposes capabilities (skills) and executes Tasks. Defined by an **AgentCard**. Aligned with **A2A Agent** concept. | Cursor Cloud: agent / worker<br>OpenHands: agent instance<br>Continue / Cline / Roo: implicit agent |
| 🪪 **AgentCard** | Declarative metadata describing an Agent: id, name, version, skills, auth shape, etc. Used for registration and discovery. Part of **A2A**. | Cursor/OpenHands: agent metadata (often implicit)<br>Other APIs: custom config |
| 🛠️ **Skill** | A named capability exposed by an Agent. In Agnet, **skills and commands are the same concept**. Part of AgentCard. | Cursor: **Command**<br>OpenHands: action / tool<br>Copilot: capability |
| 📥 **Task** | The primary unit of execution in Agnet. Represents a single run/chat/conversation. Has lifecycle and status; may be unary or streaming. Core **A2A Task** concept. | Cursor Cloud: chat / run<br>OpenHands: conversation<br>OpenAI: request / thread (best-effort) |
| 📡 **Task Stream** | Incremental output channel for a Task. Clients subscribe to receive updates/events. Supported when providers allow streaming. | OpenAI: streaming responses<br>Cursor/OpenHands: streaming updates |
| 📜 **TaskEvent** | Discrete event emitted during Task execution (delta, completed, failed, cancelled, etc.). Part of Task lifecycle. | Cursor: message chunks / status updates<br>OpenHands: step events |
| 💬 **Message** | A conversational turn inside a Task (user or agent message). Stored as Task history when applicable. | OpenAI: message object<br>Cursor/OpenHands: chat turn |
| 🧱 **Part** | A piece of message content (text, file, structured data). Corresponds to multi-part messages. Part of **A2A message model**. | OpenAI: multi-part content<br>OpenHands: attachments |
| 🧾 **Artifact** | Output produced by a Task (files, patches, structured results). Compatible with **A2A Artifact** concept. | Cursor: diffs / patches<br>OpenHands: file outputs |
| 🧷 **Rule** | Constraints or policies governing agent behavior (e.g. coding rules, safety constraints). Defined in `.agent.mdx` or config. | Cursor: rules / instructions<br>OpenHands: system guidelines |
| 🧠 **System Prompt** | High-priority instructions configuring agent behavior. Applied before user input. | OpenAI: system message<br>Cursor/OpenHands: instructions |
| 🧰 **Tool** | An externally callable operation available to an agent (filesystem, search, repo ops, etc.). Tools may be represented as Skills or via MCP integration. | OpenAI: tools / function calling<br>OpenHands: tools |
| 🧩 **MCP** | **Model Context Protocol** — a standard for exposing tools and external context to agents. In Agnet, MCP configs may be attached to Agents and adapted into Skills/Tools. | MCP servers → Agent tools via adapters |
| 🔌 **Transport** | How Agnet communicates with an agent runtime (`cli`/stdio, `ipc`, `http/ws`). Transport is an implementation detail, not a user concept. | OpenAI: HTTP<br>Cursor/OpenHands: HTTP / WebSocket |
| 🧲 **Provider** | An external system that hosts agents and executes tasks (e.g. Cursor Cloud, OpenHands). Providers define auth, paging, lifecycle behavior. | Cursor Cloud, OpenHands, OpenAI |
| 🧩 **Adapter** | Integration layer mapping a Provider’s API into Agnet’s canonical model (Agents, Tasks, Events). Provider-specific data is preserved in `_rawData`. | Cursor adapter<br>OpenHands adapter |
| 📍 **Execution Hint** | Metadata describing *where and how* a Task runs (local/remote, ephemeral/durable). Used for UX and safety warnings. Agnet-specific extension. | Cursor Cloud: remote + durable<br>Local agents: local + ephemeral |
| 💻 **Local Execution** | Task executed on the developer machine (in-process or child process). Usually ephemeral and stops when the process exits. | Mock agent, local CLI agents |
| ☁️ **Remote Execution** | Task executed by a provider service and survives local process exit. Usually durable. | Cursor Cloud, hosted OpenHands |
| 🧪 **Mock Agent** | Deterministic local Agent used for tests. Supports streaming on/off toggles. | Testing-only |
| 🧵 **Trajectory** | A recorded trace of agent steps, tool calls, and decisions over time. Planned for Tier2+. | OpenHands: step logs<br>LangGraph/LangSmith: traces |
| 📈 **Telemetry** | Metrics and logs about agent/task execution (I/O, timings, usage, cost). Planned for Tier2+. | Cursor/OpenHands usage & logs |
| 🔐 **Auth Requirement** | Declarative description of required auth *shape* (bearer/apiKey). Secrets are injected at runtime and never persisted. | OpenAI/Cursor/OpenHands auth configs |
| 🧠 **A2A** | **Agent-to-Agent protocol** defining Agents, AgentCards, Tasks, and lifecycle semantics. Agnet aligns with A2A where possible. | Reference model / protocol |

---

