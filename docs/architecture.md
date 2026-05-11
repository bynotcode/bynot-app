# Bynot App · Architecture

## Where we are

A fork of [codexUI](https://github.com/friuns2/codexui). Upstream is a
browser UI that talks to the OpenAI Codex desktop app-server over a
JSON-RPC protocol. We are keeping the Vue UI shell, dropping the RPC,
and pointing the back end at the Bynot CLI (OpenCode fork) instead.

## Foundation (committed)

```
┌───────────────────────────────────────────────────────────────┐
│ Browser (Vue + xterm.js + chat UI from codexUI shell)         │
│                                                               │
│   openBynotStream({ token })  ─ ws://…/api/cli/stream         │
│                                  ▲      ▲                     │
│                                  │      │                     │
└──────────────────────────────────┼──────┼─────────────────────┘
                                   │      │ JSON frames
                                   │      │ { stdin | resize }
                                   │      │ { stdout | exit | error }
                                   │      │
┌──────────────────────────────────┼──────┼─────────────────────┐
│ Node app server (Express + ws + the existing codexUI server)  │
│                                                               │
│   BynotBridge (src/server/bynotCliBridge.ts) — NEW            │
│     1. validate token via bynot.it /api/auth/cli/whoami       │
│     2. spawn `bynot` CLI as child                             │
│     3. pipe stdio ↔ ws                                        │
│                                                               │
│   (legacy) codexAppServerBridge.ts — still in repo, unused    │
│   for now; will be removed in the strip-codex pass            │
└───────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                       bynot CLI (drape-cli fork)
                       — OpenCode TUI with @bynot/plugin
                       — sends/receives over HTTPS to bynot.it
                         for sponsor pool, model proxy, auth
```

## Wire protocol

Trivial JSON over a single WebSocket. No binary frames.

### Client → server
```ts
{ type: "stdin",  data: string }                // keystrokes
{ type: "resize", cols: number, rows: number }  // (no-op until pty mode)
```

### Server → client
```ts
{ type: "stdout", data: string }       // child stdout/stderr
{ type: "exit",   code: number | null }
{ type: "error",  message: string }
```

The shape is intentionally narrow:
- the server never invents structured events — the CLI's TUI is what
  the user sees, full-fidelity ANSI
- xterm.js handles the entire rendering layer
- model picking / ad gating / sponsor display happen INSIDE the CLI
  (via `@bynot/plugin`), not in this server's protocol

## Auth

The WebSocket upgrade endpoint reads the token from, in order:
1. `Authorization: Bearer <token>` header
2. `?token=<token>` query string
3. `bynot_token=…` cookie

Validation hits `${BYNOT_WEB_URL}/api/auth/cli/whoami` (to be added on
the bynot.it side — currently only `/api/v1/chat/completions` validates).
Until that endpoint ships, override `validateToken` when constructing
the bridge in tests/dev.

## What we explicitly DROP from upstream

| Upstream feature | Status | Why |
|---|---|---|
| `codexAppServerBridge` | KEEP for now, REMOVE later | unused once UI calls the new bridge |
| `codexGateway` / `codexRpcClient` / `codexErrors` | REMOVE | OpenAI Codex specific |
| Skills Hub + Composio | DROP | not portable, not needed for v1 |
| Codex thread persistence | DROP | we use Supabase `cli_sessions` |
| Codex worktree management | DROP | OpenCode owns workspace state |
| Firebase auth | REPLACE with Supabase | match bynot.it stack |
| Voice dictation | DROP v1 | rebuild later if there is demand |
| Telegram bridge | DROP v1 | optional plugin in a future version |
| `node-pty` | KEEP unused | we ship without pty in v1 (xterm renders ANSI from plain stdio); reintroduce when we need true pty (resize, job control) |

## What stays from upstream

| Feature | Why we keep it |
|---|---|
| Express server + WS upgrade plumbing | works fine, hard to do better |
| Vue 3 + Vite frontend | already structured for chat/file/terminal panels |
| xterm.js terminal embed | exactly what we need |
| File explorer / project picker UI | reusable as-is |
| Mobile-responsive drawer | nice to have, free |
| Theming, layout, styling | brand-neutral enough |

## What we ADD on top

| Component | Where | Status |
|---|---|---|
| Bynot CLI bridge (server) | `src/server/bynotCliBridge.ts` | ✅ committed |
| Bynot stream client (browser) | `src/api/bynotStream.ts` | ✅ committed |
| Bridge mounted in HTTP server | `src/server/httpServer.ts` | ✅ committed |
| Bynot terminal Vue component | `src/components/Bynot/BynotTerminal.vue` | ✅ committed |
| Free vs premium model picker UI | `src/components/Bynot/ModelPicker.vue` | ✅ scaffold committed |
| Ad-unlock modal | `src/components/Bynot/AdUnlock.vue` | ✅ scaffold committed |
| `/api/auth/cli/whoami` on bynot.it | `web/src/app/api/auth/cli/whoami/route.ts` | ✅ committed |
| Wire BynotTerminal into App.vue routing | `src/App.vue` | 📋 next session |
| Strip codex bridge files | `src/api/codex*`, `src/server/codexAppServerBridge.*` | 📋 after App.vue switch |
| Supabase auth wiring | TBD `src/api/supabaseClient.ts` | 📋 after codex strip |
| Skills Hub + Composio removal | various | 📋 with Supabase swap |
| Sponsor banner overlay (web equivalent of `@bynot/plugin` TUI slots) | TBD | 📋 later — for now sponsors render inside the embedded TUI |

## Local dev

The bridge is mounted server-side but the UI still defaults to the
upstream codex flow because App.vue hasn't been touched yet. To
smoke-test JUST the new path right now:

```bash
# 1. install
npm install

# 2. run dev — also exposes /api/cli/stream via the new BynotBridge
BYNOT_WEB_URL=https://www.bynot.it npm run dev

# 3. in a browser console, sanity-check that the bridge responds
const ws = new WebSocket(
  `ws://localhost:18923/api/cli/stream?token=byn_YOUR_TOKEN`
)
ws.onmessage = (e) => console.log(JSON.parse(e.data))
ws.onopen = () => ws.send(JSON.stringify({ type: 'stdin', data: 'help\n' }))
```

You should see `{ type: 'stdout', ... }` frames as the spawned `bynot`
CLI writes its TUI to stdout. If the token is invalid you'll see
`{ type: 'error', message: 'invalid-token' }` followed by a 1008
close.

Until App.vue is rewritten the on-screen UI is still the upstream
codex view, which will fail without OpenAI auth — that's expected.

## Open questions for the next sessions

1. Should the bridge serve **one** CLI process per WS, or one **persistent** CLI shared by N WS connections? Persistent matches OpenCode's model better but complicates auth boundaries.
2. Where do we render the model picker — in the Bynot app chrome (above the terminal) or inside the CLI TUI? Probably the chrome, so we can show "free vs premium" prominently.
3. Where does the ad-unlock modal live? Almost certainly in the chrome, NOT the TUI, so we can full-screen it.
4. Auth: do we adopt Supabase magic-link from the bynot.it side, or build a fresh OAuth flow for the app? Magic-link is faster.

## Next session — concrete TODO list

In priority order, with rough sizing:

1. **Wire BynotTerminal into App.vue** (3-4h). Pick a path: either replace the
   existing thread-detail view, or add a `/bynot` route guarded by a feature
   flag. The flag path keeps codex working as a comparison while we polish.
2. **Add Bynot login flow** (1-2h). Minimum viable: a single screen that
   asks for a `byn_*` token, stores it in localStorage, and feeds it into
   BynotTerminal. Replace with proper Supabase magic-link in step 5.
3. **Mount ModelPicker + AdUnlock above the terminal** (1-2h). The picker
   doesn't need a backend yet — start with hardcoded models and a fake
   credits counter. Emit-only.
4. **Strip codex bridge files** (2-3h). Once the BynotTerminal path is the
   default, remove `src/api/codex*`, `src/server/codexAppServerBridge.*`,
   `src/server/skillsRoutes.ts`, `src/composables/useGithubSkillsSync.ts`,
   `src/composables/useDictation.ts`. Fix the import fallout.
5. **Swap Firebase for Supabase** (4-6h). Touches authStore, every
   server route that reads `req.user`, the login screen. Reuse the
   Supabase client from `bynot/web` for parity. Largest single chunk
   on this list.
6. **Real credits + ads endpoints** (3-4h). Add to bynot.it:
   `/api/v1/credits/balance`, `/api/v1/credits/grant-from-impression`,
   `/api/v1/ads/active` (could reuse the existing `/api/sponsor/active`).
   Wire the ModelPicker + AdUnlock components to consume them.
7. **Static publish** (1h). `bynot-app.vercel.app` or run `npx
   @bynot/app` from npm. Decide which packaging story we ship with.
