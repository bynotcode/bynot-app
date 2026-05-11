# Bynot App · Deploy / Distribute

## TL;DR

Bynot App is **not a hosted service**. It runs on the user's
machine. A typical session:

```bash
npx @bynot/app
# opens http://localhost:18923 in the default browser
```

The local Node process:
- serves the Vue UI on `/`
- exposes `/api/cli/stream` WebSocket
- spawns the `bynot` CLI (or `opencode` fallback) as a child
- pipes stdio between CLI and browser

## Why not Vercel / Netlify?

Vercel and Netlify host stateless functions with short execution
limits. Bynot App needs:
- long-running WebSocket connections (terminal stream)
- the ability to spawn arbitrary child processes (`bynot` CLI)
- write access to the user's filesystem (file picker, project listing)

None of those work in a serverless function. They DO work on a
self-hosted Node server, which is exactly what `npx @bynot/app`
gives the user.

## Prerequisites for users

1. Node 18+
2. The Bynot CLI binary on `PATH`, OR `BYNOT_CLI_BIN` env var
   pointing at it. While we're pre-launch:
   ```bash
   cd /private/tmp/drape-cli && bun link --bin
   ```

Once we publish `@bynot/cli` to npm:

```bash
npm install -g @bynot/cli @bynot/app
bynot-app
```

## Build pipeline

```bash
# install
npm install

# typecheck + build frontend (vite) + CLI (tsup)
npm run build

# preview built frontend without the bridge
npm run preview

# dev server with hot reload + bridge
BYNOT_WEB_URL=https://www.bynot.it npm run dev
```

`npm run build` produces:
- `dist/` — static Vue bundle, served by the Node CLI at `/`
- `dist-cli/index.js` — Node CLI entry, `npm bin` aliases `bynot-app`
  + `bynotapp`

## Publish workflow (when ready)

1. Bump `version` in `package.json`
2. `npm run build`
3. `npm publish --access public`
4. Tag the release: `git tag v0.1.0 && git push origin v0.1.0`
5. (Optional) Open a GitHub Release with the changelog

For pre-publish smoke tests:

```bash
npm pack
# inspect dist-cli/index.js + dist/ in the tarball
npm install -g ./bynot-app-0.1.0.tgz
bynot-app --help
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `BYNOT_WEB_URL` | `https://bynot.it` | Backend origin used for token validation, credits API, sponsor pool |
| `BYNOT_CLI_BIN` | `bynot` (PATH) | Override binary the bridge spawns |
| `BYNOT_CLI_CWD` | `process.cwd()` | Where the CLI runs |
| `VITE_BYNOT_WEB_URL` | `https://www.bynot.it` | Frontend hint, baked at build time |
| `PORT` | `18923` | HTTP/WS server port |

## Production checklist

- [ ] `@bynot/cli` published on npm and resolvable on PATH
- [ ] `bynot.it` `/api/v1/credits/balance` + `/api/v1/credits/grant` migrations applied
- [ ] `bynot.it` `/api/auth/cli/whoami` deployed
- [ ] Sponsor records seeded in `ad_campaigns` (used by AdUnlock fetch)
- [ ] DEFAULT mode flipped: `main.ts` should mount BynotApp by default
      (drop `?bynot=1` requirement) before publishing to npm
- [ ] Codex bridge files removed
- [ ] Firebase imports replaced or stubbed
- [ ] `npm pack` smoke test green
- [ ] Brand assets in `public/` (logo, icon) match the bynot.it set

## Optional: hosted "try it" page

Once we want a one-click demo (no install), we can:
- Wrap the app in a Docker image
- Host on Fly.io (free tier supports long-running)
- Single shared container at `app.bynot.it` with rate limits

This is NOT for the standard distribution path — it's a marketing
asset. Most users get more value out of `npx @bynot/app` locally.
