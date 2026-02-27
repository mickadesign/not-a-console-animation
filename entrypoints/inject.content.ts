// MAIN world content script — runs at document_start, before any page JS.
// Patches requestAnimationFrame to scale timestamps, enabling real-time slooow
// for Framer Motion springs, layout animations, and any custom rAF loops.
//
// CRITICAL: This file must have zero imports from chrome.* APIs.
// It runs in the MAIN execution world alongside page scripts.

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // Top-frame only — avoid duplicate patches in iframes
    if (window !== window.top) return

    // Idempotency guard — safe against double-injection on HMR or re-navigation
    if ((window as any).__slooowPatched) return
    ;(window as any).__slooowPatched = true

    const _originalRAF = window.requestAnimationFrame
    let speedFactor = 1
    let lastRealTime: number | null = null
    let virtualTime: number | null = null
    const MAX_DELTA = 100 // ms — caps timestamp jumps after tab switch

    window.requestAnimationFrame = function slooowRAF(callback: FrameRequestCallback): number {
      return _originalRAF.call(window, (realTimestamp: number) => {
        // At 1x: pass through real timestamps — zero observable difference
        if (speedFactor === 1) {
          callback(realTimestamp)
          return
        }

        if (lastRealTime === null) {
          lastRealTime = realTimestamp
          virtualTime = realTimestamp
        }

        const delta = Math.min(realTimestamp - lastRealTime, MAX_DELTA)
        lastRealTime = realTimestamp
        virtualTime! += delta * speedFactor
        callback(virtualTime!)
      })
    }

    // Per-session random token — prevents page scripts from forging SET_SPEED messages.
    // Generated once here, exposed two ways:
    //   1. window.__slooowToken  — read synchronously by content script at document_idle
    //   2. SLOOOW_STATUS_REPORT  — postMessage for SPA re-navigations where content
    //      script might re-mount after inject.ts already ran
    const SESSION_TOKEN = Math.random().toString(36).slice(2)
    ;(window as any).__slooowToken = SESSION_TOKEN

    window.addEventListener('message', (e: MessageEvent) => {
      // Only accept messages from the same window (not iframes, not other origins)
      if (e.source !== window) return
      const d = e.data
      if (!d || d.tag !== '__slooow__') return
      if (d.token !== SESSION_TOKEN) return // reject forgeries

      if (d.type === 'SET_SPEED') {
        speedFactor = d.speed as number
        // Reset virtual time anchor on speed change to avoid a timestamp jump
        lastRealTime = null
        virtualTime = null
      }
    })

    // Announce readiness to the content script (isolated world)
    window.postMessage({
      tag: '__slooow__',
      type: 'SLOOOW_STATUS_REPORT',
      token: SESSION_TOKEN,
      rafIntercepted: true,
      gsapDetected: typeof (window as any).gsap !== 'undefined',
    }, '*')
  },
})
