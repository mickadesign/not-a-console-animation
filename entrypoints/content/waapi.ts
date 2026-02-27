// Layer 1 — Web Animations API
// Covers: CSS animations, CSS transitions, Framer Motion WAAPI path
// (opacity, simple transforms that run through the browser's animation engine).

// WeakMap preserves each animation's original playbackRate so that "off" (1x)
// restores correctly on sites that already use non-default rates (e.g. Lottie,
// staggered timelines that set playbackRate programmatically).
const originalRates = new WeakMap<Animation, number>()

let pendingRAF = false
let observerEnabled = false
let _getSpeed: (() => number) | null = null
let _observer: MutationObserver | null = null

export function applyWAAPI(speed: number, animations?: Animation[]): void {
  const targets = animations ?? document.getAnimations()
  targets.forEach((a) => {
    if (!originalRates.has(a)) {
      originalRates.set(a, a.playbackRate) // capture baseline on first touch
    }
    a.playbackRate = originalRates.get(a)! * speed
  })
}

export function resetWAAPI(animations?: Animation[]): void {
  const targets = animations ?? document.getAnimations()
  targets.forEach((a) => {
    if (originalRates.has(a)) {
      a.playbackRate = originalRates.get(a)!
      originalRates.delete(a)
    }
  })
}

export function countWAAPI(): number {
  return document.getAnimations().length
}

export function setObserverEnabled(enabled: boolean): void {
  observerEnabled = enabled
}

export function startWAAPIObserver(getSpeed: () => number): void {
  _getSpeed = getSpeed

  if (_observer) {
    _observer.disconnect()
  }

  _observer = new MutationObserver(() => {
    if (!observerEnabled) return // no-op when disabled — zero overhead
    if (pendingRAF) return       // coalesce: one flush per frame max
    pendingRAF = true
    // Coalesce to rAF (not queueMicrotask) — rAF fires after style recalc,
    // so getAnimations() actually returns animations on freshly-added nodes.
    requestAnimationFrame(() => {
      pendingRAF = false
      if (_getSpeed && observerEnabled) {
        applyWAAPI(_getSpeed())
      }
    })
  })

  _observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    // Only watch attributes that commonly trigger CSS animations/transitions
    attributeFilter: ['class', 'style', 'data-state', 'data-open', 'aria-expanded', 'hidden'],
  })
}
