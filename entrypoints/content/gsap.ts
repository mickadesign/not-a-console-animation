// Layer 2 — GSAP Global Timeline
// Covers: all GSAP v2 (TweenMax) and v3 (gsap) tweens and timelines.
// One call to globalTimeline.timeScale() affects every animation GSAP manages.

// Captured once on first activation. Stored so "off" restores the site's
// original timeScale (which may not be 1 — e.g. some sites set it to 0.8 or 2).
let originalGSAPTimeScale: number | null = null

let pollInterval: ReturnType<typeof setInterval> | null = null

function getGSAPTimeline(): { timeScale: (n?: number) => number } | null {
  const gsap = (window as any).gsap
  const TweenMax = (window as any).TweenMax
  return gsap?.globalTimeline ?? TweenMax?.globalTimeline ?? null
}

export function detectGSAP(): boolean {
  return getGSAPTimeline() !== null
}

export function applyGSAP(speed: number): boolean {
  const tl = getGSAPTimeline()
  if (!tl) return false

  if (originalGSAPTimeScale === null) {
    originalGSAPTimeScale = tl.timeScale() // capture baseline on first touch
  }

  tl.timeScale(originalGSAPTimeScale * speed)
  return true
}

export function resetGSAP(): void {
  if (originalGSAPTimeScale === null) return
  getGSAPTimeline()?.timeScale(originalGSAPTimeScale)
  originalGSAPTimeScale = null
}

// Poll for GSAP for up to 5 seconds after content script runs.
// Needed because some sites lazy-load GSAP via dynamic import or script loaders.
export function startGSAPPolling(onDetected: (detected: boolean) => void): void {
  if (detectGSAP()) {
    onDetected(true)
    return
  }

  let elapsed = 0
  const POLL_INTERVAL = 250
  const MAX_WAIT = 5000

  pollInterval = setInterval(() => {
    elapsed += POLL_INTERVAL
    if (detectGSAP()) {
      stopGSAPPolling()
      onDetected(true)
    } else if (elapsed >= MAX_WAIT) {
      stopGSAPPolling()
      onDetected(false)
    }
  }, POLL_INTERVAL)
}

export function stopGSAPPolling(): void {
  if (pollInterval !== null) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
