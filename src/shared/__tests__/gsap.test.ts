import { describe, test, expect, beforeEach, vi } from 'vitest'

// ── Inline GSAP timeScale logic for unit testing ──────────────────────
// Mirrors gsap.ts without window/document access.

function createGSAPController() {
  let originalTimeScale: number | null = null

  function applyGSAP(speed: number, tl: { timeScale: (n?: number) => number }): boolean {
    if (originalTimeScale === null) {
      originalTimeScale = tl.timeScale()
    }
    tl.timeScale(originalTimeScale * speed)
    return true
  }

  function resetGSAP(tl: { timeScale: (n?: number) => number } | null): void {
    if (originalTimeScale === null || !tl) return
    tl.timeScale(originalTimeScale)
    originalTimeScale = null
  }

  function getOriginalTimeScale() {
    return originalTimeScale
  }

  return { applyGSAP, resetGSAP, getOriginalTimeScale }
}

function makeMockTimeline(initial: number) {
  let current = initial
  return {
    timeScale: vi.fn((n?: number) => {
      if (n !== undefined) current = n
      return current
    }),
  }
}

describe('GSAP timeScale logic', () => {
  let ctrl: ReturnType<typeof createGSAPController>

  beforeEach(() => {
    ctrl = createGSAPController()
  })

  test('captures original timeScale and applies multiplied speed', () => {
    const tl = makeMockTimeline(1)
    ctrl.applyGSAP(0.25, tl)
    // Last call to timeScale should have been with 1 * 0.25 = 0.25
    expect(tl.timeScale).toHaveBeenLastCalledWith(0.25)
  })

  test('captures non-1 original timeScale correctly', () => {
    const tl = makeMockTimeline(2)
    ctrl.applyGSAP(0.5, tl)
    expect(tl.timeScale).toHaveBeenLastCalledWith(1.0) // 2 * 0.5
  })

  test('does not re-capture baseline on second call', () => {
    const tl = makeMockTimeline(2)
    ctrl.applyGSAP(0.25, tl) // captures 2, sets 0.5
    ctrl.applyGSAP(0.5, tl)  // should still use baseline 2, sets 1.0
    expect(tl.timeScale).toHaveBeenLastCalledWith(1.0)
    expect(ctrl.getOriginalTimeScale()).toBe(2) // baseline unchanged
  })

  test('reset restores original timeScale', () => {
    const tl = makeMockTimeline(2)
    ctrl.applyGSAP(0.25, tl)
    ctrl.resetGSAP(tl)
    expect(tl.timeScale).toHaveBeenLastCalledWith(2)
  })

  test('reset clears stored baseline', () => {
    const tl = makeMockTimeline(1)
    ctrl.applyGSAP(0.25, tl)
    ctrl.resetGSAP(tl)
    expect(ctrl.getOriginalTimeScale()).toBeNull()
  })

  test('reset with null timeline is a no-op', () => {
    const tl = makeMockTimeline(1)
    ctrl.applyGSAP(0.25, tl)
    expect(() => ctrl.resetGSAP(null)).not.toThrow()
  })

  test('0.1x: baseline 1 → timeScale(0.1)', () => {
    const tl = makeMockTimeline(1)
    ctrl.applyGSAP(0.1, tl)
    expect(tl.timeScale).toHaveBeenLastCalledWith(0.1)
  })
})
