# Provider-Scoped Model Selection and Zen Receive Verification

Date: 2026-05-10

## Problem

Codex Web Local could show a provider selection such as OpenRouter or OpenCode Zen while the composer model was stale, blank, or inherited from another provider/thread. In one observed flow:

- The sidebar Provider dropdown showed OpenRouter.
- The composer still showed the Zen model `big-pickle`.
- A later Codex-thread route showed the model placeholder `Model` instead of a usable model.
- Send-path testing initially verified only the outgoing `turn/start` request and did not wait for an assistant reply.

This made provider/model state hard to trust when changing threads and switching between OpenRouter, OpenCode Zen, and Codex-started threads.

## Root Causes

Provider/model state had several different authorities:

- Backend `thread/resume` can report a model for the resumed thread.
- Free-mode status reports the active free-mode provider and current provider model.
- Frontend local state stores provider-scoped model choices by thread and by provider default.
- The visible composer selection is the model actually sent in the current turn.

The frontend needed the visible provider-scoped composer model to win for sends, but it also needed free-mode status to hydrate provider-scoped state after provider switches and startup. Without that hydration, switching from OpenRouter to OpenCode Zen could leave the composer on the `Model` placeholder until another refresh path corrected it.

Another review finding was accepted: provider switching should not overwrite an existing per-thread/per-provider model selection with the provider's new-thread default. Existing thread/provider choices must be preserved.

`getCurrentModelConfig()` also called `/codex-api/free-mode/status`; that request needed a timeout so a stalled status endpoint could not hang model refresh or startup.

## Fix

Relevant commits:

- `dc7871a8 Send visible provider model from composer`
- `28f76372 Hydrate provider model from free-mode status`
- `6ecfed96 Preserve thread model during provider status sync`

Implementation details:

- `ThreadComposer.vue` includes the visible `selectedModel` in the submit payload.
- `App.vue` passes that model into `sendMessageToSelectedThread()`.
- `useDesktopState.ts` uses the selected model override for pending details and `turn/start`, so a resumed backend model cannot silently replace the visible provider model at send time.
- `loadFreeModeStatus()` now derives the active provider, previews the provider model selection, and stores `status.currentModel` into the provider-scoped new-thread context.
- If a selected thread has no model for the current provider, `loadFreeModeStatus()` seeds that thread/provider model from `status.currentModel`.
- `onProviderChange()` calls `loadFreeModeStatus()` immediately after provider write, before the broader refresh.
- `onProviderChange()` only seeds the active existing thread from the provider default when the thread lacks a provider-scoped model already.
- `getFreeModeStatus()` uses `AbortSignal.timeout(8000)` and throws on non-OK status.

## Verification

Unit/build:

```bash
pnpm vitest run src/composables/useDesktopState.test.ts src/api/codexGateway.test.ts
pnpm run build:frontend
```

Browser fallback testing used Playwright against:

```text
http://127.0.0.1:5174
```

Browser Use was attempted first, but the in-app browser could not open localhost/127.0.0.1 in that run because navigation failed with `net::ERR_BLOCKED_BY_CLIENT`.

Successful send-and-receive checks:

| Case | Thread | Provider | Sent model | Received reply? |
|------|--------|----------|------------|-----------------|
| OpenRouter existing thread | `019e0aef-f2ca-7d61-8345-efd4aac9ea7b` | OpenRouter | `openrouter/free` | Yes |
| Zen provider test thread | `019e0d1c-41e0-7670-a55a-664fe46f80a8` | OpenCode Zen | `big-pickle` | Yes |
| Zen older thread | `019dc7fa-5291-7670-8b9b-d06ae0548d01` | OpenCode Zen | `big-pickle` | Yes |

Each browser test filled the composer, clicked the send button, captured the outgoing `/codex-api/rpc` `turn/start` model, and waited for an assistant message row containing the exact marker.

Screenshot artifacts:

- `output/playwright/openrouter-receive-received.png`
- `output/playwright/zen-receive-primary-received.png`
- `output/playwright/zen-receive-older-received.png`

Dark theme check:

- Thread `019dc7fa-5291-7670-a55a-664fe46f80a8`
- Provider: `OpenCode Zen`
- Composer model: `big-pickle`
- Screenshot: `output/playwright/provider-zen-dark-model.png`

## Operational Rule

Provider/model browser tests must wait for a received assistant reply, not only a submitted `turn/start` request. A send-only check proves payload wiring, but it does not prove the selected provider/model can complete a user-visible turn.
