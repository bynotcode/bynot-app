import { createApp } from 'vue'
import App from './App.vue'
import BynotApp from './BynotApp.vue'
import router from './router'
import './style.css'
import { t } from './composables/useUiLanguage'

// Bynot is now the DEFAULT shell. The upstream codex view is kept
// behind `?codex=1` (or localStorage `bynot.mode=codex`) for a)
// debug comparison and b) anyone who landed on a deep link before
// the cutover. We'll remove the codex branch entirely once we're
// confident no one needs it.
function shouldUseCodexShell(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('codex')) {
      const on = params.get('codex') !== '0' && params.get('codex') !== 'off'
      localStorage.setItem('bynot.mode', on ? 'codex' : 'bynot')
      return on
    }
    // Legacy `?bynot=` query — honor it so existing bookmarks keep working
    if (params.has('bynot')) {
      const useBynot = params.get('bynot') !== '0' && params.get('bynot') !== 'off'
      localStorage.setItem('bynot.mode', useBynot ? 'bynot' : 'codex')
      return !useBynot
    }
    return localStorage.getItem('bynot.mode') === 'codex'
  } catch {
    return false
  }
}

if (shouldUseCodexShell()) {
  console.log('Codex shell active (legacy). Set ?codex=0 to switch to Bynot.')
  createApp(App).use(router).mount('#app')
} else {
  console.log('Bynot shell active. Set ?codex=1 to fall back to the codex view.')
  createApp(BynotApp).mount('#app')
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error(t('Service worker registration failed.'), error)
    })
  })
}
