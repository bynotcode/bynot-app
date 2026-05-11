import { createApp } from 'vue'
import App from './App.vue'
import BynotApp from './BynotApp.vue'
import router from './router'
import './style.css'
import { t } from './composables/useUiLanguage'

// Feature-flag the new Bynot shell so we can iterate on it without
// disturbing the upstream codex flow. Three ways to enable, in order
// of precedence:
//   1. URL query: ?bynot=1  (also sticks via localStorage)
//   2. URL query: ?bynot=0  (forces the codex shell, clears stick)
//   3. localStorage `bynot.mode=on`
//
// Long-term we'll flip the default and rip out App.vue. For now this
// keeps the codex shell working for anyone who lands on a deep link
// while we build out BynotApp.
function shouldUseBynotShell(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('bynot')) {
      const on = params.get('bynot') !== '0' && params.get('bynot') !== 'off'
      localStorage.setItem('bynot.mode', on ? 'on' : 'off')
      return on
    }
    return localStorage.getItem('bynot.mode') === 'on'
  } catch {
    return false
  }
}

if (shouldUseBynotShell()) {
  console.log('Bynot shell active. Set ?bynot=0 to fall back to the codex view.')
  // BynotApp has its own routing (token-only single page), so no
  // vue-router needed. Mounts straight into #app.
  createApp(BynotApp).mount('#app')
} else {
  console.log('Codex shell active. Set ?bynot=1 to switch to the Bynot view.')
  createApp(App).use(router).mount('#app')
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error(t('Service worker registration failed.'), error)
    })
  })
}
