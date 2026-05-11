# Codex-protocol adapter on OpenCode

> Goal: keep `codexUI`'s App.vue + every sidebar/file/chat panel byte-for-byte,
> and serve them from the Bynot CLI (OpenCode fork) instead of OpenAI's Codex
> desktop app-server.

## What the UI needs

Inventory of the JSON-RPC methods codexUI calls (`callRpc` in
`src/api/codexGateway.ts`), grouped by criticality.

### P0 — chat surface, must work for v1

| Method | Purpose |
|---|---|
| `thread/start` | Create a new conversation |
| `thread/list` | List user's conversations for the sidebar |
| `thread/read` | Fetch a single conversation + its messages |
| `thread/resume` | Reload state for an existing thread |
| `turn/start` | Send a user message, stream an AI response |
| `generate-thread-title` | Title the conversation after the first turn |

### P1 — workspace context, needed for file picker / project view

| Method | Purpose |
|---|---|
| `config/read` | Initial UI config (theme, defaults, etc.) |
| `model/list` | Populate the model dropdown |
| `collaborationMode/list` | Plan / Build / Ask modes |
| `account/rateLimits/read` | Show usage / limits in the sidebar |

### P2 — features we can stub or disable on day one

| Method | Stub behaviour |
|---|---|
| `thread/fork` | 501 Not Implemented (button greyed in UI) |
| `thread/rollback` | 501 (button greyed) |
| `app/list` | `[]` |
| `plugin/list` | `[]` |
| `plugin/read` | 404 |
| `plugin/install` | 501 |
| `skills/list` | `[]` (drops Composio dependency cleanly) |
| `mcpServerStatus/list` | `[]` (drops MCP servers panel) |
| `mcpServer/oauth/login` | 501 |

Plus **WebSocket notifications** the UI subscribes to via
`subscribeRpcNotifications`. The exact set isn't enumerated in
`codexGateway.ts` — it comes from upstream Codex's documented
protocol. We will need to map at least:

- `thread.updated` — sidebar list refresh
- `turn.delta` — streaming AI response chunks
- `turn.completed` — turn finished
- `turn.failed` — turn errored

Concrete shapes need a reverse-engineering pass against the upstream
codexUI codebase + a packet capture against a real Codex desktop run.

## Server side — what we have to build into the Bynot CLI

The Bynot CLI today is **OpenCode** with a sponsor-banner plugin and
a few branding tweaks. It exposes:

- A TUI on stdio
- Nothing else

To serve the codexUI it must additionally expose:

```
HTTP/1.1 + WebSocket on a local port, with two endpoints:

  POST /codex-api/rpc        JSON-RPC 2.0 over HTTP
  WS   /codex-api/ws         JSON notifications + server-pushed
                             responses for streaming RPCs

```

This is a NEW subsystem inside OpenCode. The cleanest implementation
shape:

```
packages/opencode/src/app-server/
  index.ts            // mount the express + ws server on `bynot serve --port N`
  protocol.ts         // request/response/notification types
  state/
    threadStore.ts    // persistent thread storage (SQLite or Supabase)
    sessionStore.ts   // map threadId → live OpenCode session
  methods/
    thread.ts         // thread/start, thread/list, thread/read, thread/resume
    turn.ts           // turn/start (the hard one — streaming)
    config.ts         // config/read, model/list, collaborationMode/list
    stubs.ts          // every P2 method, returns 501 / []
  notifications/
    emitter.ts        // central pub/sub; OpenCode chat events → notifications
```

A `bynot serve` command:

```bash
bynot serve --port 18923 --workspace ~/projects/foo
```

becomes the thing the bynot-app server spawns instead of streaming
stdio. It is, effectively, "OpenCode with a Codex-protocol skin".

## Thread persistence — what to do about it

Codex assumes durable threads. OpenCode is per-session. We need to
pick a story:

| Option | Pros | Cons |
|---|---|---|
| SQLite local file in `~/.bynot/threads.db` | Zero-network, simple | Doesn't sync between devices |
| Supabase `bynot_threads` table | Multi-device, free tier | Requires online + auth on every read |
| Hybrid (local cache + Supabase sync) | Best UX | More complex, conflict resolution |

Recommendation: **SQLite local for v1, Supabase sync as a v2 feature**.

## Effort estimate

| Slice | Weeks |
|---|---|
| App-server scaffolding (`bynot serve` command, express + ws plumbing) | 1 |
| P0 methods (thread/* + turn/*) — and SQLite store | 1.5 |
| P1 methods (config/read, model/list, collaborationMode/list, rateLimits/read) | 0.5 |
| Notifications (turn.delta streaming, thread.updated) | 1 |
| P2 stubs + frontend graceful-degradation testing | 0.5 |
| Reverse-engineer / mock the actual Codex JSON shapes from upstream | 0.5 |
| QA + edge cases (long threads, fork, rollback, abort, reconnect) | 1 |
| **Total** | **~6 weeks (1 engineer, full-time)** |

This is a real product project. Compressed timelines and partial
deliveries are possible but will leave panels broken (a stubbed
`plugin/list` shows an empty Skills Hub, etc.).

## Decision points before we start coding

1. **Where does the OpenCode app-server live?** Inside the existing
   `drape-cli` fork as a new `packages/opencode/src/app-server` tree?
   That keeps the binary unified but bloats the CLI for users who
   just want the TUI.

2. **What binary name?** Same `bynot` with a `serve` subcommand, or
   a separate `bynot-server` binary that bynot-app spawns directly?
   Subcommand is cleaner.

3. **Auth: who issues the token?** When bynot-app spawns `bynot serve`,
   should it pass an env-var token, a CLI arg, or rely on localhost-only
   binding? Localhost-only is simplest for v1 — codexapp upstream does
   the same.

4. **Thread storage location.** `~/.bynot/threads.db`? Or a project-
   scoped `.bynot/threads.db` per workspace?

5. **Notifications protocol.** We can either (a) match Codex's exact
   notification shapes (more work, future-proof) or (b) define our
   own and patch the few `subscribeRpcNotifications` consumers in
   codexUI to use them (less reverse-engineering, but diverges from
   upstream codexUI evolution).

None of these are blocking, but they shape the architecture and
should be answered before week 1.

## What can ship in week 1 to prove the loop

Smallest possible "it works":

1. `bynot serve --port 18923` runs an HTTP+WS server
2. Implements only `thread/list` (returns `[]`) and `thread/start`
3. Codex UI loads, sidebar shows "No threads yet", "New thread" button works
4. Nothing else; every other panel shows graceful empty state

That alone is ~3-5 days of work and validates that codexUI's
front-end is happy enough to render against a fake backend.

From there each subsequent slice unlocks more panels.

## Decision

Open. Next session: pick answers to the 5 decision points above
and start week 1 (the smallest-loop deliverable). Until that is
green, every other piece is wasted work.
