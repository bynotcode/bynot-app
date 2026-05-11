<script setup lang="ts">
/**
 * Bynot terminal — renders the Bynot CLI subprocess in an xterm.js
 * window over the WebSocket bridge exposed by bynotCliBridge on the
 * server. This component is the heart of the Bynot app shell: every
 * other panel (file explorer, sidebar, chat preview) revolves around
 * this terminal.
 *
 * Auth: the parent passes a Bynot session token. Without it the
 * stream rejects the upgrade and we surface the error inline.
 */

import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"

import { openBynotStream } from "../../api/bynotStream"

const props = defineProps<{
  /** Bynot session token. Required — empty string disables the stream. */
  token: string
  /** Optional override of the bridge base URL. Defaults to current origin. */
  baseUrl?: string
}>()

const emit = defineEmits<{
  (e: "exit", code: number | null): void
  (e: "error", message: string): void
  (e: "ready"): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const status = ref<"idle" | "connecting" | "open" | "closed" | "error">("idle")
const errorMessage = ref<string | null>(null)

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let stream: ReturnType<typeof openBynotStream> | null = null
let resizeObserver: ResizeObserver | null = null
let dataDisposable: ReturnType<Terminal["onData"]> | null = null
let resizeDisposable: ReturnType<Terminal["onResize"]> | null = null

function teardown() {
  try {
    dataDisposable?.dispose()
  } catch {}
  try {
    resizeDisposable?.dispose()
  } catch {}
  try {
    stream?.close()
  } catch {}
  try {
    resizeObserver?.disconnect()
  } catch {}
  try {
    term?.dispose()
  } catch {}
  term = null
  fitAddon = null
  stream = null
  resizeObserver = null
  dataDisposable = null
  resizeDisposable = null
}

function mountTerminal() {
  if (!containerRef.value) return
  if (term) teardown()

  errorMessage.value = null
  status.value = "connecting"

  term = new Terminal({
    fontFamily:
      'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    convertEol: true,
    theme: {
      background: "#07050d",
      foreground: "#e5e7eb",
      cursor: "#c4b5fd",
      cursorAccent: "#07050d",
      selectionBackground: "rgba(196, 181, 253, 0.25)",
    },
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  // Note: @xterm/addon-web-links is not in the workspace yet. When we
  // add it, also load it here so URLs in CLI output become clickable.

  term.open(containerRef.value)
  fitAddon.fit()

  // Track container resizes so we keep the terminal grid in sync.
  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon?.fit()
    } catch {
      // ignored — the observer may fire while the element is detached
    }
  })
  resizeObserver.observe(containerRef.value)

  if (!props.token) {
    status.value = "error"
    errorMessage.value = "No Bynot session token provided."
    term.write(
      "\x1b[31mBynot terminal: no session token. Sign in to continue.\x1b[0m\r\n",
    )
    return
  }

  stream = openBynotStream(
    { token: props.token, baseUrl: props.baseUrl },
    {
      onOpen: () => {
        status.value = "open"
        emit("ready")
        // Push the initial geometry so the child sees the right cols/rows
        // as soon as the pty is wired up server-side.
        if (term) stream?.resize(term.cols, term.rows)
      },
      onStdout: (chunk) => {
        term?.write(chunk)
      },
      onExit: (code) => {
        status.value = "closed"
        emit("exit", code)
        const tail = code === null || code === 0
          ? "\r\n\x1b[2m[Bynot CLI exited]\x1b[0m\r\n"
          : `\r\n\x1b[31m[Bynot CLI exited with code ${code}]\x1b[0m\r\n`
        term?.write(tail)
      },
      onError: (message) => {
        status.value = "error"
        errorMessage.value = message
        emit("error", message)
        term?.write(`\r\n\x1b[31mBynot bridge error: ${message}\x1b[0m\r\n`)
      },
      onClose: () => {
        if (status.value !== "closed" && status.value !== "error") {
          status.value = "closed"
        }
      },
    },
  )

  dataDisposable = term.onData((data) => {
    stream?.send(data)
  })
  resizeDisposable = term.onResize(({ cols, rows }) => {
    stream?.resize(cols, rows)
  })
}

onMounted(() => {
  mountTerminal()
})

onBeforeUnmount(() => {
  teardown()
})

// Remount on token change — covers logout/login + token rotation flows.
watch(
  () => props.token,
  (next, prev) => {
    if (next === prev) return
    teardown()
    mountTerminal()
  },
)
</script>

<template>
  <div class="bynot-terminal-shell">
    <div ref="containerRef" class="bynot-terminal-host"></div>
    <div v-if="status === 'connecting'" class="overlay">Connecting to Bynot…</div>
    <div v-else-if="status === 'error'" class="overlay overlay-error">
      <div>Bynot bridge unavailable</div>
      <div class="overlay-detail">{{ errorMessage ?? "Unknown error" }}</div>
    </div>
  </div>
</template>

<style scoped>
.bynot-terminal-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  background: #07050d;
  border-radius: 0.5rem;
  overflow: hidden;
}
.bynot-terminal-host {
  width: 100%;
  height: 100%;
  padding: 0.5rem;
}
.bynot-terminal-host :deep(.xterm),
.bynot-terminal-host :deep(.xterm-viewport) {
  background: transparent !important;
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(7, 5, 13, 0.85);
  color: rgba(255, 255, 255, 0.75);
  font-family:
    ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas,
    monospace;
  font-size: 0.85rem;
  pointer-events: none;
}
.overlay-error {
  color: #fda4af;
  flex-direction: column;
}
.overlay-detail {
  margin-top: 0.4rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}
</style>
