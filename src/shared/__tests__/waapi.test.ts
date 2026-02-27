import { describe, test, expect, beforeEach } from 'vitest'

// ── Inline the WAAPI logic for unit testing ───────────────────────────
// We re-implement the WeakMap logic here so it can run in Node (no DOM).
// The real waapi.ts calls document.getAnimations() which needs a browser.

function createWAAPIController() {
  const originalRates = new WeakMap<{ playbackRate: number }, number>()

  function applyWAAPI(speed: number, animations: { playbackRate: number }[]) {
    animations.forEach((a) => {
      if (!originalRates.has(a)) {
        originalRates.set(a, a.playbackRate)
      }
      a.playbackRate = originalRates.get(a)! * speed
    })
  }

  function resetWAAPI(animations: { playbackRate: number }[]) {
    animations.forEach((a) => {
      if (originalRates.has(a)) {
        a.playbackRate = originalRates.get(a)!
        originalRates.delete(a)
      }
    })
  }

  function hasBaseline(anim: { playbackRate: number }) {
    return originalRates.has(anim)
  }

  return { applyWAAPI, resetWAAPI, hasBaseline }
}

describe('WAAPI rate preservation (WeakMap logic)', () => {
  let ctrl: ReturnType<typeof createWAAPIController>

  beforeEach(() => {
    ctrl = createWAAPIController()
  })

  test('captures original rate on first touch', () => {
    const anim = { playbackRate: 1 }
    ctrl.applyWAAPI(0.25, [anim])
    expect(anim.playbackRate).toBeCloseTo(0.25)
  })

  test('correctly multiplies non-1 original rate', () => {
    const anim = { playbackRate: 2 }
    ctrl.applyWAAPI(0.25, [anim])
    expect(anim.playbackRate).toBeCloseTo(0.5) // 2 * 0.25
  })

  test('does not re-capture baseline on second applyWAAPI call', () => {
    const anim = { playbackRate: 2 }
    ctrl.applyWAAPI(0.25, [anim])     // baseline = 2, rate = 0.5
    anim.playbackRate = 99             // simulate external mutation
    ctrl.applyWAAPI(0.5, [anim])     // should still use original baseline of 2
    expect(anim.playbackRate).toBeCloseTo(1.0) // 2 * 0.5, not 99 * 0.5
  })

  test('reset restores original rate', () => {
    const anim = { playbackRate: 2 }
    ctrl.applyWAAPI(0.25, [anim])
    ctrl.resetWAAPI([anim])
    expect(anim.playbackRate).toBe(2)
  })

  test('reset clears WeakMap entry', () => {
    const anim = { playbackRate: 2 }
    ctrl.applyWAAPI(0.25, [anim])
    ctrl.resetWAAPI([anim])
    expect(ctrl.hasBaseline(anim)).toBe(false)
  })

  test('reset on animation without baseline is a no-op', () => {
    const anim = { playbackRate: 1 }
    expect(() => ctrl.resetWAAPI([anim])).not.toThrow()
    expect(anim.playbackRate).toBe(1)
  })

  test('handles multiple animations independently', () => {
    const a1 = { playbackRate: 1 }
    const a2 = { playbackRate: 3 }
    ctrl.applyWAAPI(0.5, [a1, a2])
    expect(a1.playbackRate).toBeCloseTo(0.5)  // 1 * 0.5
    expect(a2.playbackRate).toBeCloseTo(1.5)  // 3 * 0.5
    ctrl.resetWAAPI([a1, a2])
    expect(a1.playbackRate).toBe(1)
    expect(a2.playbackRate).toBe(3)
  })
})
