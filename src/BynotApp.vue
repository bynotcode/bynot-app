<script setup lang="ts">
/**
 * Top-level Bynot app shell — used when the URL contains `?bynot=1`.
 * Mounts the new terminal-centric layout completely separate from the
 * upstream codex App.vue so the two can coexist during migration.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  topbar: brand · ModelPicker · credits · logout            │
 *   ├────────────────────────────────────────────────────────────┤
 *   │                                                            │
 *   │           BynotTerminal (xterm streaming bynot CLI)        │
 *   │                                                            │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  footer: "Sponsor-supported. Privacy-aware."               │
 *   └────────────────────────────────────────────────────────────┘
 *
 *   When the user tries a premium model with no credits, AdUnlock
 *   overlays the whole shell.
 */
import { computed, onMounted, ref } from "vue"

import BynotTerminal from "./components/Bynot/BynotTerminal.vue"
import ModelPicker from "./components/Bynot/ModelPicker.vue"
import AdUnlock from "./components/Bynot/AdUnlock.vue"

const TOKEN_KEY = "bynot.token"

const token = ref<string>(localStorage.getItem(TOKEN_KEY) ?? "")
const tokenInput = ref<string>("")
const tokenError = ref<string | null>(null)

const currentModel = ref<string>("qwen/qwen-2.5-coder-32b-instruct:free")
const credits = ref<number>(0)
const pendingUnlock = ref<{
  modelId: string
  modelLabel: string
} | null>(null)

const sponsorForUnlock = ref<{
  id: string
  title: string
  adText: string
  cta: string
  clickUrl: string
  sponsorName: string
} | null>(null)

const isAuthed = computed(() => token.value.length > 0)

function saveToken() {
  const trimmed = tokenInput.value.trim()
  if (!trimmed) {
    tokenError.value = "Token is empty"
    return
  }
  if (!trimmed.startsWith("byn_")) {
    tokenError.value = "Bynot tokens start with byn_"
    return
  }
  token.value = trimmed
  localStorage.setItem(TOKEN_KEY, trimmed)
  tokenError.value = null
  tokenInput.value = ""
}

function logout() {
  localStorage.removeItem(TOKEN_KEY)
  token.value = ""
}

async function onUnlockRequest(model: {
  id: string
  label: string
}) {
  pendingUnlock.value = { modelId: model.id, modelLabel: model.label }
  // Best-effort fetch of a sponsor card from the bynot.it backend so
  // the ad modal shows a real ad rather than the static placeholder.
  // Failure is non-fatal — the modal falls back to a generic Bynot
  // placeholder copy.
  try {
    const baseUrl = (import.meta as { env?: { VITE_BYNOT_WEB_URL?: string } })
      .env?.VITE_BYNOT_WEB_URL ?? "https://www.bynot.it"
    const res = await fetch(
      `${baseUrl}/api/sponsor/active?placement=session_message_below_assistant`,
    )
    if (res.ok) {
      const body = (await res.json()) as {
        sponsors?: Array<{
          id: string
          title: string
          adText: string
          cta: string
          clickUrl: string
          sponsorName: string
        }>
      }
      sponsorForUnlock.value = body.sponsors?.[0] ?? null
    } else {
      sponsorForUnlock.value = null
    }
  } catch {
    sponsorForUnlock.value = null
  }
}

function onClaim() {
  if (!pendingUnlock.value) return
  // Placeholder grant — server-side endpoint will replace this with a
  // signed transaction once it ships. For now: bump local credits so
  // the user can pick the premium model in the same session.
  credits.value += 10
  currentModel.value = pendingUnlock.value.modelId
  pendingUnlock.value = null
  sponsorForUnlock.value = null
}

function onClickSponsor(sponsorId: string) {
  // Best-effort impression record. Server already exposes this.
  const baseUrl = (import.meta as { env?: { VITE_BYNOT_WEB_URL?: string } })
    .env?.VITE_BYNOT_WEB_URL ?? "https://www.bynot.it"
  void fetch(`${baseUrl}/api/sponsor/impression`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId: sponsorId }),
  }).catch(() => {})
}

function onClose() {
  pendingUnlock.value = null
  sponsorForUnlock.value = null
}

onMounted(() => {
  // Quietly drop the upstream codex route hash so reload doesn't
  // bounce us back into the old UI.
  if (window.location.hash && window.location.hash !== "#/") {
    window.location.hash = "#/"
  }
})
</script>

<template>
  <div class="bynot-app">
    <!-- Topbar -->
    <header class="topbar">
      <div class="brand">
        <span class="brand-dot">▌</span>
        <span class="brand-name">Bynot</span>
        <span class="brand-tag">free AI coding</span>
      </div>
      <div class="topbar-spacer"></div>
      <ModelPicker
        v-if="isAuthed"
        v-model="currentModel"
        :credits="credits"
        @unlock-request="onUnlockRequest"
      />
      <div v-if="isAuthed" class="credits-pill" :class="{ low: credits === 0 }">
        {{ credits }} cred
      </div>
      <button v-if="isAuthed" class="logout" type="button" @click="logout">
        Sign out
      </button>
    </header>

    <!-- Login -->
    <main v-if="!isAuthed" class="login">
      <div class="login-card">
        <h1>Sign in to Bynot</h1>
        <p class="hint">
          Paste your <code>byn_…</code> token. You can get one from
          <a href="https://www.bynot.it/cli-auth" target="_blank" rel="noreferrer">
            bynot.it/cli-auth
          </a>
          or by running <code>bynot login</code> in your terminal.
        </p>
        <input
          v-model="tokenInput"
          type="password"
          placeholder="byn_…"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          class="token-input"
          @keydown.enter="saveToken"
        />
        <button class="primary" type="button" @click="saveToken">
          Continue
        </button>
        <p v-if="tokenError" class="token-error">{{ tokenError }}</p>
      </div>
    </main>

    <!-- Terminal -->
    <main v-else class="workspace">
      <BynotTerminal :token="token" />
    </main>

    <!-- Ad unlock overlay -->
    <AdUnlock
      v-if="pendingUnlock"
      :model-label="pendingUnlock.modelLabel"
      :sponsor="sponsorForUnlock"
      :watch-seconds="15"
      :credits-on-claim="10"
      @close="onClose"
      @claim="onClaim"
      @click-sponsor="onClickSponsor"
    />

    <!-- Footer -->
    <footer class="footer">
      <span>Bynot · sponsor-supported · privacy-aware</span>
      <span class="footer-right">
        <a href="https://bynot.it" target="_blank" rel="noreferrer">bynot.it</a>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.bynot-app {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: #07050d;
  color: #e5e7eb;
  font-family:
    ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.brand {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
}
.brand-dot {
  color: #c4b5fd;
}
.brand-name {
  font-weight: 700;
  letter-spacing: -0.01em;
}
.brand-tag {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
}
.topbar-spacer {
  flex: 1 1 auto;
}
.credits-pill {
  font-size: 0.75rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: rgba(196, 181, 253, 0.12);
  border: 1px solid rgba(196, 181, 253, 0.3);
  color: #ddd6fe;
}
.credits-pill.low {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}
.logout {
  font-size: 0.8rem;
  padding: 0.35rem 0.7rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}
.logout:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}
.login {
  display: grid;
  place-items: center;
  padding: 2rem;
}
.login-card {
  width: min(420px, 100%);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
}
.login-card h1 {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
  font-weight: 700;
}
.hint {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 1rem;
}
.hint a {
  color: #c4b5fd;
}
.hint code {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.05rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}
.token-input {
  width: 100%;
  padding: 0.65rem 0.8rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #07050d;
  color: #fff;
  font-family:
    ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas,
    monospace;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.token-input:focus {
  outline: none;
  border-color: rgba(196, 181, 253, 0.6);
}
.primary {
  width: 100%;
  padding: 0.65rem 0.8rem;
  border: 0;
  border-radius: 0.6rem;
  background: #c4b5fd;
  color: #07050d;
  font-weight: 600;
  cursor: pointer;
}
.primary:hover {
  background: #ddd6fe;
}
.token-error {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: #fda4af;
}
.workspace {
  padding: 0.5rem 0.75rem;
  min-height: 0;
}
.workspace > * {
  height: 100%;
}
.footer {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.footer a {
  color: rgba(255, 255, 255, 0.55);
  text-decoration: none;
}
.footer a:hover {
  color: #fff;
}
</style>
