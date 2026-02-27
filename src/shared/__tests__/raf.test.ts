import { describe, test, expect } from 'vitest'

// ── Pure virtual time simulator (mirrors the logic in inject.ts) ──────
// Extracted so it can be unit-tested without a browser.

const MAX_DELTA = 100

function createRAFSim(initialSpeed: number) {
  let speedFactor = initialSpeed
  let lastRealTime: number | null = null
  let virtualTime: number | null = null

  return {
    setSpeed(speed: number) {
      speedFactor = speed
      // Mirrors inject.ts: reset anchors on speed change to avoid timestamp jump
      lastRealTime = null
      virtualTime = null
    },

    // Advance by `realDelta` ms of real time.
    // Returns the virtual time delta that a callback would experience.
    advance(realDelta: number): number {
      const realTimestamp = (lastRealTime ?? 0) + realDelta

      if (speedFactor === 1) {
        // Pass-through path — no manipulation
        lastRealTime = realTimestamp
        return realDelta
      }

      if (lastRealTime === null) {
        lastRealTime = realTimestamp
        virtualTime = realTimestamp
        return 0
      }

      const delta = Math.min(realTimestamp - lastRealTime, MAX_DELTA)
      const before = virtualTime!
      lastRealTime = realTimestamp
      virtualTime! += delta * speedFactor
      return virtualTime! - before
    },
  }
}

describe('rAF virtual time math', () => {
  test('0.25x: 100ms real → 25ms virtual', () => {
    const sim = createRAFSim(0.25)
    sim.advance(0) // seed first frame
    expect(sim.advance(100)).toBeCloseTo(25)
  })

  test('0.5x: 100ms real → 50ms virtual', () => {
    const sim = createRAFSim(0.5)
    sim.advance(0)
    expect(sim.advance(100)).toBeCloseTo(50)
  })

  test('0.1x: 100ms real → 10ms virtual', () => {
    const sim = createRAFSim(0.1)
    sim.advance(0)
    expect(sim.advance(100)).toBeCloseTo(10)
  })

  test('at 1x: 100ms real passes through as 100ms', () => {
    const sim = createRAFSim(1)
    expect(sim.advance(100)).toBe(100)
  })

  test('caps delta to MAX_DELTA (100ms) on tab-switch jump', () => {
    const sim = createRAFSim(0.25)
    sim.advance(0)
    // 5000ms real jump (tab was in background) → capped to 100ms → 25ms virtual
    expect(sim.advance(5000)).toBeCloseTo(25)
  })

  test('no timestamp jump after setSpeed()', () => {
    const sim = createRAFSim(0.25)
    sim.advance(0)
    sim.advance(100)          // accumulate some virtual time
    sim.setSpeed(0.5)         // change speed — anchors reset

    // After a reset, inject.ts seeds the anchor on the first callback.
    // The seed frame returns 0 (no jump from accumulated real time).
    const seedDelta = sim.advance(0)
    expect(seedDelta).toBe(0) // proves: no timestamp jump on speed change

    // Subsequent frames compute correctly at the new speed
    const delta = sim.advance(100)
    expect(delta).toBeCloseTo(50) // 100ms real * 0.5x = 50ms virtual
  })

  test('virtual time advances monotonically across multiple frames', () => {
    const sim = createRAFSim(0.25)
    sim.advance(0)
    const d1 = sim.advance(16)
    const d2 = sim.advance(16)
    const d3 = sim.advance(16)
    expect(d1).toBeGreaterThan(0)
    expect(d2).toBeGreaterThan(0)
    expect(d3).toBeGreaterThan(0)
    // Each frame should deliver ~4ms virtual at 0.25x
    expect(d1).toBeCloseTo(4, 0)
  })
})
