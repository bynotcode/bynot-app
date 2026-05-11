# Bynot · App

> Free AI coding agent with a browser-accessible UI.
> One command to launch, no install, no subscription.

[![license](https://img.shields.io/badge/License-MIT_(see_LICENSE)-yellow?style=for-the-badge)](./LICENSE)
[![status](https://img.shields.io/badge/Status-Pre--alpha-orange?style=for-the-badge)](#)

---

## Status

Pre-alpha. The fork from [codexUI](https://github.com/friuns2/codexui) is the
visual + UX starting point. We are swapping the OpenAI Codex app-server
backend for an OpenCode/Bynot CLI bridge (see `docs/architecture.md`,
to be written).

The shipping target is "Cursor for free":
- Browser-accessible UI (LAN / desktop / mobile-friendly)
- Backed by OpenCode CLI through a thin WebSocket+stdio bridge
- Free models (DeepSeek V3, Qwen Coder, Llama 3.3 70B via OpenRouter free + self-hosted Qwen 32B fallback) with **zero ads**
- Premium models (DeepSeek V4 Pro, Kimi K2.6, GLM 5.1) unlocked by viewing **terminal-style sponsor ads** — never invasive banners
- GDPR-aware data handling, no subscription, sponsor-supported

## What stays from codexUI

We keep the UI shell as-is:
- Chat area + streaming markdown renderer
- xterm.js terminal embed
- File explorer + project picker
- Mobile-responsive drawer sidebar
- Theming and layout

## What we replace

- `src/api/codex*` and `src/server/codexAppServerBridge.*` → new Bynot CLI bridge
- `src/composables/skills*` (Composio-coupled) → disabled in v1, replaced later
- Firebase auth → Supabase auth (matching the rest of the Bynot stack)

## What we drop in v1

- Skills Hub (Composio integration)
- Codex thread persistence (we use Supabase `cli_sessions` instead)
- Codex worktree management
- Voice dictation (rebuild later if there is demand)
- Telegram bridge (optional plugin in a future version)

## Run locally

```bash
npm install

# 1. Make sure the bynot CLI is on PATH (or pass BYNOT_CLI_BIN)
#    Pre-launch: cd /private/tmp/drape-cli && bun link --bin

# 2. Start the dev server (bridge + Vite HMR)
BYNOT_WEB_URL=https://www.bynot.it npm run dev
```

Open the printed `localhost` URL. The default view is the new Bynot
shell. To compare against the upstream codex view, append `?codex=1`
to the URL.

When prompted, paste your `byn_…` token. You can issue one with
`bun scripts/issue-cli-token.ts <email>` from the main Bynot web repo.

## Status

| Slice | State |
|---|---|
| WS bridge (`bynotCliBridge.ts`) | ✅ |
| xterm.js terminal (`BynotTerminal.vue`) | ✅ |
| Free/premium model picker | ✅ scaffold (hardcoded model list) |
| Ad-unlock modal | ✅ wired to real `/api/v1/credits/grant` |
| Credits balance via API | ✅ |
| Token login screen | ✅ |
| **DEFAULT shell** | ✅ Bynot (codex behind `?codex=1`) |
| Strip codex source | ⏳ Defer — kept as fallback for now |
| Firebase → Supabase | ⏳ BynotApp doesn't load Firebase; codex fallback still does |
| `npx @bynot/app` publish | ⏳ See `docs/deploy.md` |

See [`docs/architecture.md`](./docs/architecture.md) for the deep
architecture write-up and [`docs/deploy.md`](./docs/deploy.md) for
the distribution plan.

## Credit

This project is a fork of [codexUI](https://github.com/friuns2/codexui) by
Pavel Voronin and Igor Levochkin, distributed under the MIT License. The
upstream license is preserved in `LICENSE`. Bynot-specific changes (CLI
bridge, branding, sponsor system, auth integration) are © 2026 Bynot
contributors — see `LICENSE.bynot` for terms (to be added).

## License

This repository contains:
- Upstream codexUI code under the **MIT License** (see `LICENSE`)
- Bynot-specific additions under a proprietary license (see `LICENSE.bynot`
  once added; until then, all Bynot-specific files are © 2026 Bynot
  contributors with rights reserved)

See [bynot.it](https://bynot.it) for the broader Bynot project.
