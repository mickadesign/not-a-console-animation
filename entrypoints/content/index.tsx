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
import toolbarStyles from './toolbar.css?inline'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Top-frame only — prevent duplicate toolbars inside iframes
    if (window !== window.top) return

    // ── State ──────────────────────────────────────────────────────────
    let visible = false
    let currentSpeed: SlowMoSpeed | null = null // null = disabled (1x)
    let gsapDetected = false

    // ── Read inject.ts status synchronously ───────────────────────────
    // inject.ts exposed the token + initial GSAP detection as window properties
    // at document_start. Safer than waiting for a postMessage that may have
    // already fired before our listener was attached.
    const rafIntercepted = !!(window as any).__slowmoToken
    const initialGSAPDetected = typeof (window as any).gsap !== 'undefined'
    gsapDetected = initialGSAPDetected

    // Relay initial GSAP detection to the toolbar via CustomEvent
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
          // Apply current speed to GSAP now that it's loaded
          if (currentSpeed !== null) {
            applyGSAP(currentSpeed)
          }
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
      // Token already set on window — no need to re-read.
      // Update GSAP detection if inject.ts now sees it.
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
        // Inject toolbar styles into the shadow root (isolated from page CSS)
        const style = document.createElement('style')
        style.textContent = toolbarStyles
        shadow.prepend(style)

        const root = createRoot(container)
        root.render(
          <Toolbar
            onSpeedChange={(speed) => {
              currentSpeed = speed
              applyAllLayers(speed)
              // Update WAAPI count badge when speed changes
              dispatchStatusEvent({ animationCount: countWAAPI() })
            }}
          />
        )
        return root
      },
      onRemove(root) {
        root?.unmount()
      },
    })

    // Start hidden — toolbar only appears on icon click / hotkey
    const hostEl = ui.shadowHost as HTMLElement
    hostEl.style.display = 'none'

    // ── Toggle toolbar visibility ──────────────────────────────────────
    function toggleToolbar(): void {
      visible = !visible
      hostEl.style.display = visible ? '' : 'none'
      if (visible) {
        ui.mount()
        // Immediately apply current layers when showing
        dispatchStatusEvent({
          rafIntercepted: !!(window as any).__slowmoToken,
          gsapDetected,
          animationCount: countWAAPI(),
        })
      }
    }

    // Listen for toggle commands from background SW
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'TOGGLE_TOOLBAR') {
        toggleToolbar()
      }
    })

    // Mount the UI element into the DOM now (hidden)
    ui.mount()
  },
})

// ── Helpers ────────────────────────────────────────────────────────────

function dispatchStatusEvent(detail: Record<string, unknown>): void {
  document.dispatchEvent(new CustomEvent('slowmo:status', { detail }))
}
