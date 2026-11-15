# How can an MCP tool follow work that runs for hours?

Research for [#58](https://github.com/evalve-app/evalve-ui/issues/58), part of the map [#55 Evalve MCP v1](https://github.com/evalve-app/evalve-ui/issues/55).
All sources were checked on 2026-11-14.

## Question

A Loop runs for hours on the remote Evalve service. The Evalve MCP is a local stdio server. Claude Code starts it, and it stops when the Claude Code session ends. The Loop must keep running on the service in any case.

Which ways to follow long work do the MCP spec and Claude Code support today? What does each one mean for a stdio process that can stop at any time? What is the simplest pattern that works?

## Short answer

Use a status tool that the agent calls. `start_loop` asks the service to start the Loop and returns the Loop ID at once. `get_loop` asks the service for the Loop's state each time it is called. The MCP process keeps no state. The Loop ID is the only handle, and the service owns it.

MCP tasks are the "right" protocol feature for this. Claude Code supports them, but only as a public beta, behind a feature flag, on the newest protocol revision, and not in every kind of session. Add tasks later on top of the same Loop ID. Do not depend on them in v1.

## The spec has moved since 2025-11-25

- The current protocol revision is **2026-07-28**, not 2025-11-25. ([Versioning](https://modelcontextprotocol.io/specification/versioning))
- 2026-07-28 removes the `initialize` handshake and protocol sessions. Each request carries its own protocol version and client capabilities. ([Changelog, major changes 1–2](https://modelcontextprotocol.io/specification/2026-07-28/changelog))
- It moves tasks out of the core spec into an official extension, `io.modelcontextprotocol/tasks`. The extension drops `tasks/result` and `tasks/list`, polls with `tasks/get`, and adds `tasks/update` for input. ([Changelog, major change 6](https://modelcontextprotocol.io/specification/2026-07-28/changelog))
- It replaces `resources/subscribe` with one `subscriptions/listen` stream. Progress notifications still flow only on the response of the request they belong to. ([Changelog, major change 4](https://modelcontextprotocol.io/specification/2026-07-28/changelog))
- It replaces server-to-client requests such as `elicitation/create` with "multi round-trip requests": the server returns `resultType: "input_required"`, and the client retries with the answers. ([Changelog, major change 7](https://modelcontextprotocol.io/specification/2026-07-28/changelog))
- Claude Code speaks both revisions. Its "v2 runtime" is built on MCP TypeScript SDK 2.0 and adds 2026-07-28. It asks stdio servers whether they support the newer revision and uses it when they do. ([Claude Code: MCP client runtimes](https://code.claude.com/docs/en/mcp#mcp-client-runtimes))

## The options, one by one

### 1. Status tool that the agent polls

- This is plain tool use. Every MCP client supports it, in every revision.
- It needs nothing from the stdio process between calls. A new process in a new session can answer `get_loop(loopId)` the same way, because it only asks the service.
- Cost: the agent must decide to call it again. In a long session it may poll too often or forget. The tool result can say when to check next.

### 2. MCP tasks

What the spec says:

- In 2025-11-25, tasks are **experimental**. A client adds a `task` field to `tools/call`. The server returns a task handle and the client polls `tasks/get`, then gets the result from `tasks/result`. ([2025-11-25 Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks))
- In 2026-07-28, tasks are an extension. The **server** decides per request to answer with `resultType: "task"`. "The task is durably created before the response is sent." A task ID "survives disconnects" and lets a client "resume polling with the same ID". ([Tasks extension overview](https://modelcontextprotocol.io/extensions/tasks/overview))
- The extension lists "External job systems" as a fit: "return a task when you create the job and resolve it when the job completes". ([Tasks extension overview](https://modelcontextprotocol.io/extensions/tasks/overview))

What Claude Code does:

- MCP tasks are "in public beta in the Claude Code CLI and require Claude Code v2.1.304 or later". ([Claude Code: MCP tasks that run on the server](https://code.claude.com/docs/en/mcp#mcp-tasks-that-run-on-the-server))
- The tool call returns once the server accepts the job. Claude keeps working. Claude Code polls `tasks/get`, and Claude gets the result when the job ends. ([same section](https://code.claude.com/docs/en/mcp#mcp-tasks-that-run-on-the-server))
- A call becomes a task only when all of these hold: the server is on revision 2026-07-28; the session fetches feature flags (so **not** on Amazon Bedrock, and not with telemetry off); Anthropic has turned tasks on for that kind of session (terminal CLI, Agent SDK, GitHub Actions; **not** the VS Code extension or the desktop app); the call comes from the main conversation, **not a subagent**; and the session is interactive or a stream-json run. A one-shot `claude -p "<prompt>"` run does not get tasks. ([Claude Code: What a call needs to become an MCP task](https://code.claude.com/docs/en/mcp#requirements-for-mcp-tasks))
- Claude Code uses `tasks/get`, `tasks/update` and `tasks/cancel`. It does **not** use `tasks/result`, `tasks/list` or `notifications/tasks`. It polls every 2 s by default; a server can set `pollIntervalMs` between 250 ms and 30 s. ([Claude Code: MCP tasks for server authors](https://code.claude.com/docs/en/mcp#mcp-tasks-for-server-authors))
- On `-32602` from `tasks/get` it treats the ID as unknown, retries for five minutes, then tells Claude "outcome unknown". The docs warn: "A second call may repeat the work." ([same section](https://code.claude.com/docs/en/mcp#mcp-tasks-for-server-authors); [Status messages on an MCP task](https://code.claude.com/docs/en/mcp#status-messages-on-an-mcp-task))
- Server authors must "Keep the ID answerable across connections, because after a resume Claude Code asks about it on a new connection". ([Claude Code: Answer the call with a task](https://code.claude.com/docs/en/mcp#answer-the-call-with-a-task))

What it means for a stdio server:

- "A stdio server's process stops when Claude Code exits, though its tasks show `runs on the server; survives exiting this session` in `/tasks`. Unless that server's documentation says the work outlives the process, let those tasks finish or stop them". ([Claude Code: Exit, clear, or resume while an MCP task runs](https://code.claude.com/docs/en/mcp#exit-clear-or-resume-while-an-mcp-task-runs))
- Exiting does not send `tasks/cancel`. ([Claude Code: MCP tasks for server authors](https://code.claude.com/docs/en/mcp#mcp-tasks-for-server-authors))
- After `claude --resume` of the same session, Claude Code follows the task again once the server connects. A **new** session, or `--fork-session`, does not follow it. ([Exit, clear, or resume](https://code.claude.com/docs/en/mcp#exit-clear-or-resume-while-an-mcp-task-runs))
- So tasks work for Evalve only if the task ID is the Loop ID (or maps to it on the service), and `tasks/get` asks the service. Then a fresh stdio process can answer for a Loop that an earlier process started.

SDK support:

- The TypeScript SDK v2 is "the stable release line implementing the 2026-07-28 spec". To serve 2026-07-28 over stdio, a server must use `serveStdio(...)`. A hand-built `Server` on `StdioServerTransport` "still serves only the 2025 protocol". ([SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/); [Support for 2026-07-28](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html))
- SDK v2 removes "the experimental tasks interception layer" and keeps 2025-11-25 task types only as deprecated wire vocabulary. ([Support for 2026-07-28](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html))
- The `@modelcontextprotocol/ext-tasks` package gives requester APIs and "2025-11-25 Tasks receiver support". I found no server helper for answering with a 2026-07-28 task. A server would build the JSON in Claude Code's "server authors" section by hand. ([ext-tasks README](https://github.com/modelcontextprotocol/ext-tasks); [ext-tasks TypeScript guide](https://modelcontextprotocol.github.io/ext-tasks/typescript/))

### 3. Progress notifications

- A progress notification refers to a `progressToken` from an **active** request. It can carry a `progress` number, an optional `total` and a `message`. ([2025-11-25 Progress](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress))
- So progress needs a tool call that stays open. For a Loop, that means one call that blocks for hours.
- In Claude Code, progress resets the idle timeout (30 min for stdio). It does not extend the wall-clock limit (about 28 h by default). ([Claude Code: Time limits on MCP tool calls](https://code.claude.com/docs/en/mcp#time-limits-on-mcp-tool-calls))
- A main-conversation call still running after two minutes moves to a background task. That background task "doesn't survive exiting the session". Subagent calls and one-shot `-p` calls are not backgrounded. ([Claude Code: Automatic backgrounding of long tool calls](https://code.claude.com/docs/en/mcp#automatic-backgrounding-of-long-tool-calls))
- Meaning for Evalve: a blocking "wait for the Loop" tool would work while the session lives, but it ends with the stdio process. It is fine for a short, optional `wait_for_loop(loopId, maxMinutes)` that returns at a cap. It is not a way to follow a Loop for hours.

### 4. Resource subscriptions and list-changed notifications

- 2026-07-28 replaced `resources/subscribe` with `subscriptions/listen`. A client opts in to `toolsListChanged`, `promptsListChanged`, `resourcesListChanged` or `resourceSubscriptions`. ([Changelog, major change 4](https://modelcontextprotocol.io/specification/2026-07-28/changelog))
- Claude Code documents support for `list_changed` only. On the v2 runtime it holds a stream open to receive them. It documents no support for resource subscriptions or `resources/updated`. ([Claude Code: Dynamic tool updates](https://code.claude.com/docs/en/mcp#dynamic-tool-updates); [Notification streams on the v2 runtime](https://code.claude.com/docs/en/mcp#notification-streams-on-the-v2-runtime))
- Even when delivered, a notification only refreshes a list. It does not wake the model. And it needs the stdio process alive.
- Meaning for Evalve: not usable to follow a Loop.

### 5. Elicitation

- Elicitation asks the **person** for input. It is not a way to report status. ([Claude Code: Respond to MCP elicitation requests](https://code.claude.com/docs/en/mcp#respond-to-mcp-elicitation-requests))
- Inside a task, Claude Code serves `elicitation/create` only in interactive terminal sessions. In a non-interactive session it asks the server to cancel the task. ([Claude Code: MCP tasks for server authors](https://code.claude.com/docs/en/mcp#mcp-tasks-for-server-authors))
- Meaning for Evalve: maybe useful later to confirm a costly start. Not for following a Loop.

### 6. Channels (Claude Code only)

- A server can push messages into the session with the `claude/channel` capability, if the person starts Claude Code with `--channels`. ([Claude Code: Push messages with channels](https://code.claude.com/docs/en/mcp#push-messages-with-channels))
- A channel server on revision 2026-07-28 "can't deliver channel messages", so Claude Code does not register it as a channel. ([same section](https://code.claude.com/docs/en/mcp#push-messages-with-channels))
- Meaning for Evalve: needs an opt-in flag, the old protocol, and a live process. Not for v1.

## What Claude Code implements today

| Option | Claude Code support | Survives the stdio process ending? |
| - | - | - |
| Status tool, polled by the agent | Yes, everywhere | Yes, if the service owns the state |
| MCP tasks (2026-07-28 extension) | Public beta, v2.1.304+, flag-gated; not Bedrock, VS Code, desktop, subagents, or one-shot `-p` | Only if the task ID is answerable by a new process; followed again only after `--resume` of the same session |
| Progress notifications | Yes; reset the idle timeout, shown in `/tasks` | No; tied to one open call |
| Resource subscriptions | Not documented | No |
| `list_changed` | Yes | No |
| Elicitation | Yes, interactive sessions only | No |
| Channels | Yes, opt-in `--channels`, not on 2026-07-28 | No |

Sources: [Claude Code MCP docs](https://code.claude.com/docs/en/mcp), checked 2026-11-14.

## Recommendation

Build v1 on a status tool. The Evalve service is the only place that holds Loop state.

1. `start_loop(...)` asks the service to start the Loop and returns at once with the Loop ID and its first state.
2. `get_loop(loopId)` returns the Loop status, the newest Experiment, and a hint such as "check again in 10 minutes".
3. `list_loops(...)` lets a new session find a Loop that an earlier session started.
4. The MCP process keeps nothing in memory between calls. Any process, in any session, gives the same answer.

Later, add MCP tasks as an extra, without changing the service:

- Answer `start_loop` with `resultType: "task"` when the request carries the tasks extension, and use the Loop ID as `taskId`.
- Map `tasks/get` to the same service call as `get_loop`. Set `ttlMs: null` and a `pollIntervalMs` near 30 s.
- Keep `get_loop` for every session where tasks do not apply.

Do not build a tool that blocks until the Loop ends. If one is wanted, cap it (for example `wait_for_loop(loopId, maxMinutes)`) and send progress notifications while it waits.

## What this asks of the Evalve service

- Return a Loop ID as soon as a Loop is accepted, before the first Experiment runs.
- Answer "get Loop by ID" cheaply. Claude Code can poll a task every 30 s for hours.
- List a Teammate's Loops, so a new session can find them.
- Make "start Loop" safe to retry, for example with a client-made key. Claude Code warns that after "outcome unknown", "A second call may repeat the work."
- Give the Loop status, or enough data for the MCP to compute it the way the dashboard does. The Kitaru server keeps no Loop status today (see `GLOSSARY.md`).
