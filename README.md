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

## Run locally (current state)

The fork is still mostly the upstream codexapp until the bridge is rewritten.
Don't expect it to work against Bynot yet.

```bash
npm install
npm run dev
```

Open the printed `localhost` URL.

## Roadmap

1. Strip Codex-specific bridge files
2. Add `src/server/bynotCliBridge.ts` — spawns Bynot CLI, pipes stdio over WebSocket to xterm
3. Wire Supabase auth (reuse `web/src/lib/supabase` from the Bynot main repo)
4. Free vs premium model picker + ads-for-credits flow
5. Cross-platform packaging (web first; native wrappers later via Tauri)

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
