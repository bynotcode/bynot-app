/**
 * Client-side helper for the Bynot CLI stream.
 *
 * Opens a WebSocket against the bynotCliBridge endpoint and exposes a
 * small typed interface: send keystrokes, listen for stdout chunks,
 * watch for exit/error. Designed to plug straight into an xterm.js
 * `Terminal` instance — see `src/components/Terminal/BynotTerminal.vue`.
 */

export type StreamInbound =
  | { type: "stdin"; data: string }
  | { type: "resize"; cols: number; rows: number }

export type StreamOutbound =
  | { type: "stdout"; data: string }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string }

export type BynotStreamHandlers = {
  onStdout?: (chunk: string) => void
  onExit?: (code: number | null) => void
  onError?: (message: string) => void
  onOpen?: () => void
  onClose?: (ev: CloseEvent) => void
}

export type BynotStreamOptions = {
  /**
   * Base URL of the Bynot app server. Defaults to the current origin
   * with `http(s)` swapped for `ws(s)`. Pass a custom value when
   * running the app over a tunnel or LAN URL.
   */
  baseUrl?: string
  /** WS path. Must match the server's `pathname`. */
  pathname?: string
  /** Auth token to send as `?token=…` query param. */
  token: string
}

/**
 * Open a stream. The returned object owns the WebSocket — call
 * `close()` to tear it down. Stdin writes are queued until the
 * socket opens, so the caller can `send()` synchronously after
 * `openBynotStream`.
 */
export function openBynotStream(
  opts: BynotStreamOptions,
  handlers: BynotStreamHandlers = {},
): {
  send: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
  readyState: () => number
} {
  const base = opts.baseUrl ?? deriveWsBase()
  const url = new URL(opts.pathname ?? "/api/cli/stream", base)
  url.searchParams.set("token", opts.token)

  const ws = new WebSocket(url.toString())
  const queue: StreamInbound[] = []

  ws.addEventListener("open", () => {
    while (queue.length) {
      const next = queue.shift()
      if (next) ws.send(JSON.stringify(next))
    }
    handlers.onOpen?.()
  })

  ws.addEventListener("message", (ev) => {
    let parsed: StreamOutbound
    try {
      parsed = JSON.parse(typeof ev.data === "string" ? ev.data : "") as StreamOutbound
    } catch {
      handlers.onError?.("invalid-frame")
      return
    }
    if (parsed.type === "stdout") handlers.onStdout?.(parsed.data)
    else if (parsed.type === "exit") handlers.onExit?.(parsed.code)
    else if (parsed.type === "error") handlers.onError?.(parsed.message)
  })

  ws.addEventListener("close", (ev) => handlers.onClose?.(ev))
  ws.addEventListener("error", () => handlers.onError?.("socket-error"))

  function dispatch(msg: StreamInbound): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      queue.push(msg)
    }
  }

  return {
    send: (data) => dispatch({ type: "stdin", data }),
    resize: (cols, rows) => dispatch({ type: "resize", cols, rows }),
    close: () => {
      try {
        ws.close()
      } catch {
        // ignored
      }
    },
    readyState: () => ws.readyState,
  }
}

function deriveWsBase(): string {
  if (typeof window === "undefined") return "ws://localhost:18923"
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}`
}
