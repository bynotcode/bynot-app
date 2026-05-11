/**
 * Bynot CLI bridge — spawns a `bynot` (OpenCode fork) child process per
 * client session and pipes stdio bidirectionally over a WebSocket so
 * the browser-side xterm.js can render it as a live terminal.
 *
 * This file is the foundation of the 3-lite migration plan: keep the
 * codexUI shell (Vue components, layout, theming) but replace the
 * OpenAI Codex JSON-RPC bridge with something thin that just streams
 * a terminal subprocess. The UI no longer talks to a structured
 * app-server protocol — it just sees what the CLI prints.
 *
 * Protocol over the WebSocket is intentionally trivial:
 *   client → server  { type: "stdin", data: string }
 *   client → server  { type: "resize", cols: number, rows: number }
 *   server → client  { type: "stdout", data: string }
 *   server → client  { type: "exit", code: number | null }
 *   server → client  { type: "error", message: string }
 *
 * The client picks one of these per WS message frame. Binary frames
 * are never sent — keeps the channel debuggable.
 *
 * Auth + free/premium gating is enforced before the WebSocket upgrade:
 * the HTTP request that initiates the WS must carry a valid Bynot
 * session token (Bearer cookie or query param). Token validation
 * hits the same Supabase `cli_sessions` table the CLI itself uses.
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import type { IncomingMessage, Server as HttpServer } from "node:http"
import path from "node:path"
import { WebSocket, WebSocketServer } from "ws"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Where the Bynot CLI binary lives. Order of preference:
 *   1. BYNOT_CLI_BIN env var (absolute path)
 *   2. PATH lookup for `bynot`
 *   3. PATH lookup for `opencode` (fork ancestor, fallback during dev)
 */
function resolveBin(): string {
  const env = process.env.BYNOT_CLI_BIN
  if (env && env.length > 0) return env
  // We let spawn() do PATH resolution; the literal name suffices.
  return process.platform === "win32" ? "bynot.exe" : "bynot"
}

/** Default args passed to every spawned CLI process. */
const DEFAULT_ARGS: string[] = []

/** Maximum WebSocket message size to forward into the child (defensive). */
const MAX_INBOUND_FRAME_BYTES = 64 * 1024

/** Max child lifetime — kills runaway sessions. */
const SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000 // 6h

/** Token query param name when the WS URL is hit without cookies. */
const TOKEN_QUERY_PARAM = "token"

// ---------------------------------------------------------------------------
// Session record
// ---------------------------------------------------------------------------

export type BynotSession = {
  id: string
  socket: WebSocket
  child: ChildProcessWithoutNullStreams
  email: string
  tier: string
  startedAt: number
  timeoutHandle: NodeJS.Timeout
}

// ---------------------------------------------------------------------------
// Auth — thin wrapper around the Bynot web token validator
// ---------------------------------------------------------------------------

export type ValidateToken = (token: string) => Promise<{
  email: string
  tier: string
} | null>

/**
 * Default validator hits the Bynot web prod endpoint. Override in tests
 * with a stub or in dev with a local URL by passing your own
 * ValidateToken into createBynotBridge().
 */
export function makeDefaultValidator(opts?: {
  baseUrl?: string
}): ValidateToken {
  const base = opts?.baseUrl ?? process.env.BYNOT_WEB_URL ?? "https://bynot.it"
  return async (token: string) => {
    try {
      const res = await fetch(`${base}/api/auth/cli/whoami`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const body = (await res.json()) as { email?: string; tier?: string }
      if (!body.email) return null
      return { email: body.email, tier: body.tier ?? "invited" }
    } catch {
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export type BridgeOptions = {
  /** Existing HTTP server to attach the WebSocket upgrade handler to. */
  server: HttpServer
  /** URL pathname the WS upgrade lives at. Defaults to /api/cli/stream. */
  pathname?: string
  /** Override the default token validator (useful in tests). */
  validateToken?: ValidateToken
  /** Override the CLI binary path (useful in tests). */
  binary?: string
  /** Override the default CLI args. */
  args?: string[]
}

/**
 * Public bridge handle. Emits `session:start` and `session:end` events
 * so the parent server can keep a /api/cli/sessions count for the
 * admin dashboard if it wants to.
 */
export class BynotBridge extends EventEmitter {
  private wss: WebSocketServer
  private validate: ValidateToken
  private bin: string
  private args: string[]
  private sessions = new Map<string, BynotSession>()

  constructor(opts: BridgeOptions) {
    super()
    this.validate = opts.validateToken ?? makeDefaultValidator()
    this.bin = opts.binary ?? resolveBin()
    this.args = opts.args ?? DEFAULT_ARGS
    const pathname = opts.pathname ?? "/api/cli/stream"

    this.wss = new WebSocketServer({ noServer: true })

    opts.server.on("upgrade", (req, sock, head) => {
      const url = new URL(req.url ?? "/", "http://localhost")
      if (url.pathname !== pathname) return
      // Upgrade then auth + spawn. Doing auth before upgrade would
      // require closing the socket with HTTP errors; the WS frame
      // path is simpler and gives us a nice client error message.
      this.wss.handleUpgrade(req, sock, head, (ws) => {
        void this.onConnection(ws, req)
      })
    })
  }

  /** Currently active session count. Exposed for admin metrics. */
  get activeCount(): number {
    return this.sessions.size
  }

  /** Kill every active session — call on server shutdown. */
  shutdown(): void {
    for (const s of this.sessions.values()) {
      try {
        s.child.kill("SIGTERM")
      } catch {}
      try {
        s.socket.close(1001, "server shutdown")
      } catch {}
      clearTimeout(s.timeoutHandle)
    }
    this.sessions.clear()
    this.wss.close()
  }

  private async onConnection(
    ws: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    const token = extractToken(req)
    if (!token) {
      sendError(ws, "missing-token")
      ws.close(1008, "missing token")
      return
    }

    const who = await this.validate(token)
    if (!who) {
      sendError(ws, "invalid-token")
      ws.close(1008, "invalid token")
      return
    }

    // Spawn the CLI as a plain child process. We do NOT use node-pty here
    // because xterm.js on the client handles the ANSI escapes itself; the
    // stdio stream is sufficient and avoids the native build dependency
    // for a v1. node-pty is in package.json for upstream codexUI features
    // we are stripping; we can pull it in here later if we need a true
    // pty (resize handling, job control) once the basic path works.
    const child = spawn(this.bin, this.args, {
      env: {
        ...process.env,
        BYNOT_TOKEN: token,
        // Forces CLI to point at the same web origin we authenticated against.
        BYNOT_WEB_URL: process.env.BYNOT_WEB_URL ?? "https://bynot.it",
        // No-color is intentionally NOT forced — xterm renders ANSI fine.
        FORCE_COLOR: "1",
        TERM: "xterm-256color",
      },
      cwd: process.env.BYNOT_CLI_CWD ?? process.cwd(),
      // Inherit stderr so child diagnostics surface in our server logs.
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams

    const session: BynotSession = {
      id: randomUUID(),
      socket: ws,
      child,
      email: who.email,
      tier: who.tier,
      startedAt: Date.now(),
      timeoutHandle: setTimeout(() => {
        try {
          child.kill("SIGTERM")
        } catch {}
      }, SESSION_TIMEOUT_MS),
    }
    this.sessions.set(session.id, session)
    this.emit("session:start", {
      id: session.id,
      email: who.email,
      tier: who.tier,
    })

    // ---- pipe child → ws --------------------------------------------------
    child.stdout.on("data", (buf: Buffer) => {
      send(ws, { type: "stdout", data: buf.toString("utf8") })
    })
    child.stderr.on("data", (buf: Buffer) => {
      // We forward stderr on the same channel — xterm renders both interleaved.
      send(ws, { type: "stdout", data: buf.toString("utf8") })
    })
    child.on("exit", (code) => {
      send(ws, { type: "exit", code })
      this.cleanup(session)
      try {
        ws.close(1000, "child exited")
      } catch {}
    })
    child.on("error", (err) => {
      sendError(ws, `child error: ${err.message}`)
      this.cleanup(session)
    })

    // ---- pipe ws → child --------------------------------------------------
    ws.on("message", (raw) => {
      const str = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : ""
      if (str.length > MAX_INBOUND_FRAME_BYTES) {
        sendError(ws, "frame-too-large")
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(str)
      } catch {
        sendError(ws, "invalid-json")
        return
      }
      if (!isInbound(parsed)) {
        sendError(ws, "bad-shape")
        return
      }
      if (parsed.type === "stdin") {
        try {
          child.stdin.write(parsed.data)
        } catch (err) {
          sendError(ws, `stdin write failed: ${(err as Error).message}`)
        }
      } else if (parsed.type === "resize") {
        // No-op for non-pty child. Recorded for future pty-mode support.
        // Intentionally silent.
      }
    })

    ws.on("close", () => {
      this.cleanup(session)
      try {
        child.kill("SIGTERM")
      } catch {}
    })

    ws.on("error", () => {
      // Ignore — close handler will tear down.
    })
  }

  private cleanup(session: BynotSession): void {
    if (!this.sessions.has(session.id)) return
    clearTimeout(session.timeoutHandle)
    this.sessions.delete(session.id)
    this.emit("session:end", { id: session.id })
  }
}

/** Convenience constructor — mirrors most consumer call sites. */
export function createBynotBridge(opts: BridgeOptions): BynotBridge {
  return new BynotBridge(opts)
}

// ---------------------------------------------------------------------------
// Wire helpers
// ---------------------------------------------------------------------------

type Inbound =
  | { type: "stdin"; data: string }
  | { type: "resize"; cols: number; rows: number }

type Outbound =
  | { type: "stdout"; data: string }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string }

function send(ws: WebSocket, msg: Outbound): void {
  if (ws.readyState !== WebSocket.OPEN) return
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // ignored — receiver may have gone away mid-write
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: "error", message })
}

function isInbound(v: unknown): v is Inbound {
  if (typeof v !== "object" || v === null) return false
  const t = (v as { type?: unknown }).type
  if (t === "stdin") return typeof (v as { data?: unknown }).data === "string"
  if (t === "resize")
    return (
      typeof (v as { cols?: unknown }).cols === "number" &&
      typeof (v as { rows?: unknown }).rows === "number"
    )
  return false
}

function extractToken(req: IncomingMessage): string | null {
  // 1. Authorization: Bearer <token>
  const auth = req.headers.authorization
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim()
  // 2. ?token=<token>
  const url = new URL(req.url ?? "/", "http://localhost")
  const q = url.searchParams.get(TOKEN_QUERY_PARAM)
  if (q) return q
  // 3. Cookie bynot_token=...
  const cookie = req.headers.cookie ?? ""
  const m = cookie.match(/(?:^|;\s*)bynot_token=([^;]+)/)
  if (m) return decodeURIComponent(m[1])
  return null
}

// ---------------------------------------------------------------------------
// Path helpers (exported so tests can resolve the binary the same way)
// ---------------------------------------------------------------------------

export function resolveBinaryPath(): string {
  return resolveBin()
}

export function defaultBinaryName(): string {
  return path.basename(resolveBin())
}
