<script setup lang="ts">
/**
 * Bynot model picker — scaffold only.
 * Renders the free/premium split that the chrome of the app will use.
 * Backend wiring (credits balance, ad-unlock trigger, gating) is
 * intentionally placeholder so we can iterate the visual side first.
 */
import { computed, ref } from "vue"

type Tier = "free" | "premium"
type Model = {
  id: string
  label: string
  family: "DeepSeek" | "Kimi" | "GLM" | "Qwen" | "Llama" | "Mistral"
  tier: Tier
  blurb: string
}

const models: Model[] = [
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    label: "Qwen Coder 32B",
    family: "Qwen",
    tier: "free",
    blurb: "Fast, no ads, good for most coding tasks.",
  },
  {
    id: "deepseek/deepseek-chat-v3:free",
    label: "DeepSeek V3",
    family: "DeepSeek",
    tier: "free",
    blurb: "Free tier of DeepSeek, strong general coding.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B",
    family: "Llama",
    tier: "free",
    blurb: "Free, balanced general model.",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    family: "DeepSeek",
    tier: "premium",
    blurb: "Frontier coding. Watch a sponsor ad to unlock.",
  },
  {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    family: "Kimi",
    tier: "premium",
    blurb: "Long context, cache discount. Premium.",
  },
  {
    id: "z-ai/glm-5.1",
    label: "GLM 5.1",
    family: "GLM",
    tier: "premium",
    blurb: "Frontier-tier Chinese model. Premium.",
  },
]

const props = defineProps<{
  /** Currently selected model id. */
  modelValue: string
  /** Number of premium-credits the user holds. */
  credits?: number
}>()

const emit = defineEmits<{
  (e: "update:modelValue", id: string): void
  (e: "unlock-request", model: Model): void
}>()

const credits = computed(() => props.credits ?? 0)
const open = ref(false)

function pick(m: Model) {
  if (m.tier === "premium" && credits.value <= 0) {
    emit("unlock-request", m)
    return
  }
  emit("update:modelValue", m.id)
  open.value = false
}

const current = computed(
  () => models.find((m) => m.id === props.modelValue) ?? models[0],
)
</script>

<template>
  <div class="bynot-model-picker">
    <button class="trigger" type="button" @click="open = !open">
      <span class="dot" :class="`tier-${current.tier}`"></span>
      <span class="label">{{ current.label }}</span>
      <span class="chev">▾</span>
    </button>

    <div v-if="open" class="menu" role="listbox">
      <div class="section">
        <div class="section-title">Free · no ads</div>
        <button
          v-for="m in models.filter((x) => x.tier === 'free')"
          :key="m.id"
          class="row"
          :class="{ active: m.id === props.modelValue }"
          type="button"
          @click="pick(m)"
        >
          <div class="row-main">
            <span class="row-label">{{ m.label }}</span>
            <span class="row-family">{{ m.family }}</span>
          </div>
          <div class="row-blurb">{{ m.blurb }}</div>
        </button>
      </div>

      <div class="section premium">
        <div class="section-title">
          Premium ·
          <span v-if="credits > 0">{{ credits }} credit(s)</span>
          <span v-else>watch ad to unlock</span>
        </div>
        <button
          v-for="m in models.filter((x) => x.tier === 'premium')"
          :key="m.id"
          class="row premium-row"
          :class="{ active: m.id === props.modelValue, locked: credits <= 0 }"
          type="button"
          @click="pick(m)"
        >
          <div class="row-main">
            <span class="row-label">{{ m.label }}</span>
            <span class="row-family">{{ m.family }}</span>
            <span v-if="credits <= 0" class="lock">🔒</span>
          </div>
          <div class="row-blurb">{{ m.blurb }}</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bynot-model-picker {
  position: relative;
  display: inline-block;
}
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.7rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.875rem;
  cursor: pointer;
}
.trigger:hover {
  background: rgba(255, 255, 255, 0.08);
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
}
.dot.tier-free {
  background: #34d399;
}
.dot.tier-premium {
  background: #c4b5fd;
}
.chev {
  opacity: 0.5;
  font-size: 0.7rem;
}
.menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 320px;
  background: rgba(7, 5, 13, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  padding: 0.5rem;
  z-index: 50;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.section + .section {
  margin-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 0.5rem;
}
.section-title {
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.45);
}
.row {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  background: transparent;
  border: 0;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
}
.row:hover {
  background: rgba(196, 181, 253, 0.08);
}
.row.active {
  background: rgba(196, 181, 253, 0.12);
}
.row.locked {
  cursor: pointer;
  opacity: 0.85;
}
.row-main {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.row-label {
  font-weight: 500;
}
.row-family {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.lock {
  margin-left: auto;
  font-size: 0.7rem;
}
.row-blurb {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 0.15rem;
}
.premium .section-title {
  color: #c4b5fd;
}
</style>
