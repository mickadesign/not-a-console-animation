// Parses CSS animation-timing-function strings into structured data
// for rendering as bezier curves, linear segments, or staircase steps.

export type CubicBezierEasing = {
  type: 'cubic-bezier'
  x1: number
  y1: number
  x2: number
  y2: number
  name?: string
}

export type LinearEasing = {
  type: 'linear'
  stops: { value: number; position: number }[]
}

export type StepsEasing = {
  type: 'steps'
  count: number
  direction: 'start' | 'end' | 'both' | 'none'
}

export type UnknownEasing = { type: 'unknown'; raw: string }

export type ParsedEasing = CubicBezierEasing | LinearEasing | StepsEasing | UnknownEasing

const NAMED: Record<string, readonly [number, number, number, number]> = {
  ease:          [0.25, 0.1,  0.25, 1],
  'ease-in':     [0.42, 0,    1,    1],
  'ease-out':    [0,    0,    0.58, 1],
  'ease-in-out': [0.42, 0,    0.58, 1],
}

export function parseEasing(raw: string): ParsedEasing {
  const s = raw.trim()

  // Straight line
  if (s === 'linear') {
    return { type: 'cubic-bezier', x1: 0, y1: 0, x2: 1, y2: 1, name: 'linear' }
  }

  // Named keywords → resolved cubic-bezier
  const named = NAMED[s]
  if (named) {
    return { type: 'cubic-bezier', x1: named[0], y1: named[1], x2: named[2], y2: named[3], name: s }
  }

  // cubic-bezier(x1, y1, x2, y2) — y values can be outside [0,1] for overshoot
  const cb = s.match(/^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/)
  if (cb) {
    const [x1, y1, x2, y2] = cb.slice(1).map(Number)
    if (![x1, y1, x2, y2].some(isNaN)) {
      return { type: 'cubic-bezier', x1, y1, x2, y2 }
    }
  }

  // step-start / step-end shorthand
  if (s === 'step-start') return { type: 'steps', count: 1, direction: 'start' }
  if (s === 'step-end')   return { type: 'steps', count: 1, direction: 'end' }

  // steps(n) or steps(n, direction)
  const steps = s.match(/^steps\(\s*(\d+)(?:\s*,\s*(start|end|both|none))?\s*\)$/)
  if (steps) {
    return {
      type: 'steps',
      count: parseInt(steps[1], 10),
      direction: (steps[2] as StepsEasing['direction']) ?? 'end',
    }
  }

  // linear(...) — used by Framer Motion to encode spring curves as multi-stop segments
  if (s.startsWith('linear(') && s.endsWith(')')) {
    const stops = parseLinearFn(s)
    if (stops !== null) return { type: 'linear', stops }
  }

  return { type: 'unknown', raw: s }
}

function parseLinearFn(s: string): LinearEasing['stops'] | null {
  const inner = s.slice(7, -1).trim()
  if (!inner) return null

  // Each comma-separated token: "value" | "value pos%" | "value pos1% pos2%"
  const raw: { value: number; positions: number[] }[] = []
  for (const part of inner.split(',')) {
    const tokens = part.trim().split(/\s+/)
    const value = parseFloat(tokens[0])
    if (isNaN(value)) return null
    const positions = tokens.slice(1).map(t => parseFloat(t) / 100).filter(p => !isNaN(p))
    raw.push({ value, positions })
  }

  if (!raw.length) return null

  // Expand to a flat list; null means position must be auto-resolved
  const flat: { value: number; position: number | null }[] = []
  for (const entry of raw) {
    if (!entry.positions.length) {
      flat.push({ value: entry.value, position: null })
    } else {
      for (const p of entry.positions) {
        flat.push({ value: entry.value, position: p })
      }
    }
  }

  if (!flat.length) return null

  // Per CSS spec: first stop defaults to 0, last to 1
  if (flat[0].position === null) flat[0].position = 0
  if (flat[flat.length - 1].position === null) flat[flat.length - 1].position = 1

  // Linearly interpolate remaining nulls between known positions
  let i = 0
  while (i < flat.length) {
    if (flat[i].position !== null) { i++; continue }
    const prev = i - 1
    let next = i
    while (next < flat.length && flat[next].position === null) next++
    const p0 = flat[prev].position!
    const p1 = flat[next].position!
    const span = next - prev
    for (let k = prev + 1; k < next; k++) {
      flat[k].position = p0 + (p1 - p0) * ((k - prev) / span)
    }
    i = next + 1
  }

  return flat.map(f => ({ value: f.value, position: f.position! }))
}
