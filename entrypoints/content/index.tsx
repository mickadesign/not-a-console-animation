// ISOLATED world content script — runs at document_idle.
// Responsibilities:
//   1. Mount the floating Shadow DOM toolbar (React)
//   2. Apply Layer 1 (WAAPI playback rates) and Layer 2 (GSAP timeScale)
//   3. Relay speed changes to Layer 3 (rAF in inject.ts) via window.postMessage
//   4. Listen for TOGGLE_TOOLBAR from the background SW

import React from 'react'
import { createRoot } from 'react-dom/client'
import { SlowMoSpeed, SLOWMO_TAG } from '../../src/shared/types'
import { applyWAAPI, resetWAAPI, countWAAPI, setObserverEnabled, startWAAPIObserver } from './waapi'
import { applyGSAP, resetGSAP, startGSAPPolling } from './gsap'
import { sendSetSpeed, readToken } from './bridge'
import { Toolbar } from './Toolbar'
import { readSessionState, writeSessionState } from './session-store'
import toolbarStyles from './toolbar.css?inline'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Top-frame only — prevent duplicate toolbars inside iframes
    if (window !== window.top) return

    // ── Restore persisted session state ───────────────────────────────
    const stored = await readSessionState()
    let visible            = stored?.visible ?? false
    let currentSpeed: SlowMoSpeed | null = stored?.enabled ? (stored.speed ?? 0.25) : null
    let persistedSpeed: SlowMoSpeed      = stored?.speed   ?? 0.25
    let gsapDetected = false

    // ── Read inject.ts status synchronously ───────────────────────────
    const rafIntercepted = !!(window as any).__slowmoToken
    const initialGSAPDetected = typeof (window as any).gsap !== 'undefined'
    gsapDetected = initialGSAPDetected

    dispatchStatusEvent({ rafIntercepted, gsapDetected, animationCount: countWAAPI() })

    // ── Layer coordination ─────────────────────────────────────────────
    function applyAllLayers(speed: SlowMoSpeed | null): void {
      const effectiveSpeed = speed ?? 1

      // Layer 1: WAAPI
      if (speed === null) {
        resetWAAPI()
        setObserverEnabled(false)
      } else {
        applyWAAPI(effectiveSpeed)
        setObserverEnabled(true)
      }

      // Layer 2: GSAP
      if (speed === null) {
        resetGSAP()
      } else {
        const applied = applyGSAP(effectiveSpeed)
        if (applied && !gsapDetected) {
          gsapDetected = true
          dispatchStatusEvent({ gsapDetected: true })
        }
      }

      // Layer 3: rAF (MAIN world — via postMessage)
      sendSetSpeed(effectiveSpeed)
    }

    // ── GSAP detection polling (lazy-loaded libraries) ─────────────────
    if (!gsapDetected) {
      startGSAPPolling((detected) => {
        if (detected) {
          gsapDetected = true
          dispatchStatusEvent({ gsapDetected: true })
          if (currentSpeed !== null) applyGSAP(currentSpeed)
        }
      })
    }

    // ── WAAPI observer for dynamically added animations ────────────────
    startWAAPIObserver(() => currentSpeed ?? 1)

    // ── Listen for status reports from MAIN world (SPA re-navigation) ──
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window) return
      const d = e.data
      if (!d || d.tag !== SLOWMO_TAG || d.type !== 'SLOWMO_STATUS_REPORT') return
      if (d.gsapDetected && !gsapDetected) {
        gsapDetected = true
        dispatchStatusEvent({ gsapDetected: true })
      }
    })

    // ── Toolbar mount via Shadow DOM ───────────────────────────────────
    const ui = await createShadowRootUi(ctx, {
      name: 'slowmo-toolbar',
      position: 'overlay',
      zIndex: 2147483647,
      onMount(container, shadow) {
        const style = document.createElement('style')
        style.textContent = toolbarStyles
        shadow.prepend(style)

        const root = createRoot(container)
        root.render(
          <Toolbar
            initialEnabled={stored?.enabled ?? false}
            initialSpeed={stored?.speed ?? 0.25}
            onSpeedChange={(speed) => {
              currentSpeed = speed
              applyAllLayers(speed)
              dispatchStatusEvent({ animationCount: countWAAPI() })
            }}
            onStateChange={({ enabled, speed }) => {
              persistedSpeed = speed
              writeSessionState({ visible, enabled, speed })
            }}
          />
        )
        return root
      },
      onRemove(root) {
        root?.unmount()
      },
    })

    // Apply layers immediately if the session had slow-mo enabled
    if (currentSpeed !== null) {
      applyAllLayers(currentSpeed)
    }

    // Show or hide based on restored visibility
    const hostEl = ui.shadowHost as HTMLElement
    hostEl.style.display = visible ? '' : 'none'

    // ── Toggle toolbar visibility ──────────────────────────────────────
    function toggleToolbar(): void {
      visible = !visible
      hostEl.style.display = visible ? '' : 'none'
      writeSessionState({ visible, enabled: currentSpeed !== null, speed: persistedSpeed })
      if (visible) {
        document.dispatchEvent(new CustomEvent('slowmo:set-enabled', { detail: { enabled: true } }))
        dispatchStatusEvent({
          rafIntercepted: !!(window as any).__slowmoToken,
          gsapDetected,
          animationCount: countWAAPI(),
        })
      }
    }

    // Listen for toggle commands from background SW
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'TOGGLE_TOOLBAR') toggleToolbar()
    })

    // ── Theme detection ────────────────────────────────────────────────
    // Page dark class takes priority; OS preference is the CSS fallback.
    function syncTheme(): void {
      const html = document.documentElement
      if (html.classList.contains('dark')) {
        hostEl.setAttribute('data-theme', 'dark')
      } else if (html.classList.contains('light')) {
        hostEl.setAttribute('data-theme', 'light')
      } else {
        hostEl.removeAttribute('data-theme')
      }
    }

    syncTheme()
    const themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    // Mount the UI element into the DOM
    ui.mount()
  },
})

// ── Helpers ────────────────────────────────────────────────────────────

function dispatchStatusEvent(detail: Record<string, unknown>): void {
  document.dispatchEvent(new CustomEvent('slowmo:status', { detail }))
}
