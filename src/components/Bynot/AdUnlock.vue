<script setup lang="ts">
/**
 * Ad-unlock modal — scaffold only.
 *
 * Renders a terminal-style sponsor ad (text-only, monospace) and a
 * countdown that lets the user "claim" N premium credits after the
 * timer elapses. Backend wiring (credits API, ad selection) is a
 * follow-up — the visual contract is what matters now so the chrome
 * around the chat/terminal can be built.
 */
import { computed, onMounted, onUnmounted, ref } from "vue"

type Sponsor = {
  id: string
  title: string
  adText: string
  cta: string
  clickUrl: string
  sponsorName: string
}

const props = defineProps<{
  /** The model the user tried to access. */
  modelLabel: string
  /** The sponsor entry to display. Server picks it. */
  sponsor: Sponsor | null
  /** Total seconds the user must watch before the "Claim" CTA enables. */
  watchSeconds?: number
  /** Number of credits this unlock grants. */
  creditsOnClaim?: number
}>()

const emit = defineEmits<{
  (e: "close"): void
  (e: "claim"): void
  (e: "click-sponsor", sponsorId: string): void
}>()

const watchSeconds = computed(() => props.watchSeconds ?? 30)
const creditsOnClaim = computed(() => props.creditsOnClaim ?? 10)

const elapsed = ref(0)
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    elapsed.value = Math.min(watchSeconds.value, elapsed.value + 1)
  }, 1000)
})
onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

const remaining = computed(() => Math.max(0, watchSeconds.value - elapsed.value))
const canClaim = computed(() => remaining.value === 0)

function onClickSponsor() {
  if (props.sponsor) emit("click-sponsor", props.sponsor.id)
  if (props.sponsor?.clickUrl) window.open(props.sponsor.clickUrl, "_blank")
}
</script>

<template>
  <div class="ad-unlock-backdrop" role="dialog" aria-modal="true">
    <div class="ad-unlock">
      <div class="head">
        <div class="head-meta">
          <span class="tag">Premium unlock</span>
          <span class="model">{{ modelLabel }}</span>
        </div>
        <button class="close" type="button" @click="emit('close')">✕</button>
      </div>

      <div class="ad-frame">
        <div v-if="sponsor" class="sponsor-card">
          <div class="sponsor-title">◆ {{ sponsor.title }}</div>
          <div class="sponsor-text">{{ sponsor.adText }}</div>
          <button
            class="sponsor-cta"
            type="button"
            @click="onClickSponsor"
          >
            {{ sponsor.cta }} →
          </button>
          <div class="sponsor-url">{{ sponsor.clickUrl }}</div>
          <div class="sponsor-byline">by {{ sponsor.sponsorName }}</div>
        </div>
        <div v-else class="sponsor-card sponsor-placeholder">
          <div class="sponsor-title">◆ Bynot</div>
          <div class="sponsor-text">
            No sponsor ad available right now. You can still claim free credits.
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="timer">
          <span v-if="!canClaim">Watch · {{ remaining }}s</span>
          <span v-else class="ready">Ready to claim · +{{ creditsOnClaim }} credits</span>
        </div>
        <button
          class="claim"
          :disabled="!canClaim"
          type="button"
          @click="emit('claim')"
        >
          Claim {{ creditsOnClaim }} credits
        </button>
      </div>

      <p class="legal">
        Sponsor ads keep Bynot free. We never share your data with sponsors.
      </p>
    </div>
  </div>
</template>

<style scoped>
.ad-unlock-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: grid;
  place-items: center;
  z-index: 100;
}
.ad-unlock {
  width: min(520px, 92vw);
  background: #07050d;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1rem;
  padding: 1.25rem;
  color: rgba(255, 255, 255, 0.9);
  font-family:
    ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas,
    monospace;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.head-meta {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.tag {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #c4b5fd;
}
.model {
  font-weight: 600;
}
.close {
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  border: 0;
  font-size: 1rem;
  cursor: pointer;
}
.close:hover {
  color: rgba(255, 255, 255, 0.85);
}
.ad-frame {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 1rem;
}
.sponsor-title {
  color: #c4b5fd;
  font-weight: 600;
  margin-bottom: 0.4rem;
}
.sponsor-text {
  margin-bottom: 0.6rem;
}
.sponsor-cta {
  background: transparent;
  color: #c4b5fd;
  border: 0;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
  font-weight: 500;
}
.sponsor-cta:hover {
  color: #ddd6fe;
  text-decoration: underline;
}
.sponsor-url {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
  margin-top: 0.3rem;
  word-break: break-all;
}
.sponsor-byline {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.75rem;
  margin-top: 0.3rem;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.timer {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}
.ready {
  color: #34d399;
}
.claim {
  background: #c4b5fd;
  color: #07050d;
  border: 0;
  border-radius: 0.5rem;
  padding: 0.55rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.claim:disabled {
  background: rgba(196, 181, 253, 0.25);
  color: rgba(7, 5, 13, 0.5);
  cursor: not-allowed;
}
.claim:hover:not(:disabled) {
  background: #ddd6fe;
}
.legal {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 0.9rem;
  margin-bottom: 0;
}
</style>
