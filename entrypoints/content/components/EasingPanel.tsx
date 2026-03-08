import { useState, useRef, useEffect } from 'react'
import type { ParsedEasing, LinearEasing, UnknownEasing } from '../lib/easing-parser'
import { camelToKebab } from '../lib/css-utils'

export interface AnimInfo {
  rawEasing: string
  easing: ParsedEasing
  duration: number | 'auto' // ms
  delay: number             // ms
  properties: string[]      // camelCase CSS property names from keyframes
}

interface EasingPanelProps {
  anims: AnimInfo[]
  index: number
  onIndexChange: (idx: number) => void
  inset?: boolean // removes border-top separator when used inside an accordion item
}

// ── SVG canvas geometry ───────────────────────────────────────────────
// viewBox: 0 0 (W+2*HPAD) (H+2*PAD+extraTop)
// HPAD adds horizontal breathing room so anchors don't touch the edges.
// extraTop grows the viewBox upward when spring overshoot exceeds y=1.
// preserveAspectRatio="none" fills the container without letterboxing.
const W    = 100
const H    = 60
const PAD  = 8   // vertical padding (top / bottom)
const HPAD = 10  // horizontal padding (left / right)
const BASE_VB_H = H + PAD * 2   // 76 — baseline viewBox height
const BASE_H_PX = 90             // baseline container height in px

// extraTop shifts the coordinate origin down so overshoot (y > 1) stays
// inside the viewBox. A spring with yMax=1.3 gets extraTop = 0.3 * H = 18.
function svgY(v: number, extraTop = 0) { return extraTop + PAD + H * (1 - v) }
function svgX(p: number) { return HPAD + p * W }

function buildPath(easing: ParsedEasing, extraTop = 0): string {
  const y = (v: number) => svgY(v, extraTop)
  switch (easing.type) {
    case 'cubic-bezier': {
      const { x1, y1, x2, y2 } = easing
      return (
        `M ${svgX(0)},${y(0)} ` +
        `C ${svgX(x1)},${y(y1)} ${svgX(x2)},${y(y2)} ${svgX(1)},${y(1)}`
      )
    }

    case 'linear': {
      if (!easing.stops.length) return ''
      return easing.stops
        .map((s, i) => `${i === 0 ? 'M' : 'L'} ${svgX(s.position)},${y(s.value)}`)
        .join(' ')
    }

    case 'steps': {
      const { count, direction } = easing
      const isStart = direction === 'start' || direction === 'both'
      if (isStart) {
        let d = `M ${svgX(0)},${y(1 / count)}`
        for (let i = 0; i < count; i++) {
          const xNext = svgX((i + 1) / count)
          d += ` H ${xNext}`
          if (i < count - 1) d += ` V ${y((i + 2) / count)}`
        }
        return d
      } else {
        let d = `M ${svgX(0)},${y(0)}`
        for (let i = 0; i < count; i++) {
          d += ` H ${svgX((i + 1) / count)} V ${y((i + 1) / count)}`
        }
        return d
      }
    }

    default:
      return `M ${svgX(0)},${y(0)} L ${svgX(1)},${y(1)}`
  }
}

// A spring is encoded by Framer Motion as a linear() function with many
// discrete stops. The threshold of 20 distinguishes springs from hand-authored
// linear() easings which rarely exceed 10 stops.
function isSpring(easing: ParsedEasing): easing is LinearEasing {
  return easing.type === 'linear' && easing.stops.length > 20
}

// ── Formatting helpers ────────────────────────────────────────────────

function getLabel(easing: ParsedEasing, raw: string): string {
  if (easing.type === 'cubic-bezier' && easing.name) {
    return easing.name
  }
  if (easing.type === 'cubic-bezier') {
    const vals = [easing.x1, easing.y1, easing.x2, easing.y2]
      .map(v => parseFloat(v.toFixed(3)).toString())
    return `cubic-bezier(${vals.join(', ')})`
  }
  if (easing.type === 'linear') {
    if (easing.stops.length > 20) return 'spring'
    return easing.stops.length > 10 ? 'linear(\u2026)' : raw
  }
  if (easing.type === 'steps') {
    return `steps(${easing.count}, ${easing.direction})`
  }
  const r = (easing as UnknownEasing).raw
  return r.length > 30 ? r.slice(0, 27) + '\u2026' : r
}

export function formatMs(ms: number | 'auto'): string {
  if (ms === 'auto') return 'auto'
  if (ms === 0) return '0s'
  const abs = Math.abs(ms)
  const sign = ms < 0 ? '\u2212' : ''
  if (abs < 1000) return `${sign}${abs}ms`
  return `${sign}${parseFloat((abs / 1000).toFixed(2))}s`
}

// ── Bezier handle dots ────────────────────────────────────────────────
// HTML divs rather than SVG circles so they stay perfectly round
// even though the SVG uses preserveAspectRatio="none" (non-uniform scale).
// Positions are computed as percentages matching the SVG coordinate system.

function BezierDot({ x, y, size, color, viewBoxH = BASE_VB_H }: { x: number; y: number; size: number; color: string; viewBoxH?: number }) {
  const left   = `${((HPAD + x * W) / (W + 2 * HPAD)) * 100}%`
  const bottom = `${((PAD  + H * y) / viewBoxH) * 100}%`
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left,
        bottom,
        transform: 'translate(-50%, 50%)',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        pointerEvents: 'none',
      }}
    />
  )
}

// ── SVG curve ─────────────────────────────────────────────────────────

function EasingCurve({ easing }: { easing: ParsedEasing }) {
  // For springs, expand the viewBox upward to show overshoot above y=1.
  // extraTop is measured in SVG units; convert to px using the base ratio.
  let extraTop = 0
  if (isSpring(easing) && easing.stops.length > 0) {
    const yMax = Math.max(1, ...easing.stops.map(s => s.value))
    extraTop = Math.max(0, yMax - 1) * H
  }
  const viewBoxH = BASE_VB_H + extraTop
  const svgH     = Math.round(BASE_H_PX * viewBoxH / BASE_VB_H)

  const d = buildPath(easing, extraTop)
  return (
    <div style={{ position: 'relative', height: svgH }}>
      <svg
        viewBox={`0 0 ${W + HPAD * 2} ${viewBoxH}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: svgH, display: 'block' }}
        aria-hidden="true"
      >
        {/* Bezier handle lines — drawn before the curve so curve renders on top */}
        {easing.type === 'cubic-bezier' && (
          <>
            <line
              x1={svgX(0)}         y1={svgY(0, extraTop)}
              x2={svgX(easing.x1)} y2={svgY(easing.y1, extraTop)}
              style={{ stroke: 'var(--toolbar-muted)' }} strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={svgX(1)}         y1={svgY(1, extraTop)}
              x2={svgX(easing.x2)} y2={svgY(easing.y2, extraTop)}
              style={{ stroke: 'var(--toolbar-muted)' }} strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {d && (
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Perfectly round dots overlaid via HTML (immune to SVG aspect-ratio distortion) */}
      {easing.type === 'cubic-bezier' && (
        <>
          {/* Anchor points at (0,0) and (1,1) — muted color, no transparency */}
          <BezierDot x={0} y={0} size={5} color="var(--toolbar-muted)" viewBoxH={viewBoxH} />
          <BezierDot x={1} y={1} size={5} color="var(--toolbar-muted)" viewBoxH={viewBoxH} />
          {/* Control points — full curve-line color */}
          <BezierDot x={easing.x1} y={easing.y1} size={8} color="currentColor" viewBoxH={viewBoxH} />
          <BezierDot x={easing.x2} y={easing.y2} size={8} color="currentColor" viewBoxH={viewBoxH} />
        </>
      )}
    </div>
  )
}

// ── EasingPanel ───────────────────────────────────────────────────────

export function EasingPanel({ anims, index, onIndexChange, inset }: EasingPanelProps) {
  const info = anims[index]

  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending timer on unmount to avoid state update on unmounted component
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  if (!info) return null

  const label = getLabel(info.easing, info.rawEasing)
  const dur   = formatMs(info.duration)
  const delay = info.delay !== 0 ? ` · ${formatMs(info.delay)}` : ''

  const canCopy = info.easing.type === 'cubic-bezier'

  function handleCopy() {
    navigator.clipboard.writeText(label).then(() => {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1500)
    }, () => {})
  }

  return (
    <div className={`easing-panel${inset ? ' easing-panel--inset' : ''}`}>
      {anims.length > 1 && (
        <div className="easing-nav">
          <button
            className="easing-nav-btn"
            onClick={() => onIndexChange(Math.max(0, index - 1))}
            disabled={index === 0}
            aria-label="Previous animation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="easing-nav-center">
            <span className="easing-nav-prop">
              {info.properties.length > 0
                ? info.properties.slice(0, 2).map(camelToKebab).join(', ')
                : 'animation'}
            </span>
            <span className="easing-nav-count">{index + 1} / {anims.length}</span>
          </div>
          <button
            className="easing-nav-btn"
            onClick={() => onIndexChange(Math.min(anims.length - 1, index + 1))}
            disabled={index === anims.length - 1}
            aria-label="Next animation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      <div className="easing-curve-bg">
        <EasingCurve easing={info.easing} />
      </div>

      <div className="easing-meta">
        <span className="easing-value" title={info.rawEasing}>{label}</span>
        <span className="easing-timing">{dur}{delay}</span>
        {canCopy && (
          <button
            className={`easing-copy-btn${copied ? ' is-copied' : ''}`}
            onClick={handleCopy}
            aria-label="Copy easing value"
          >
            {copied
              ? /* checkmark */
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              : /* copy */
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            }
          </button>
        )}
      </div>

      {isSpring(info.easing) && (
        <p className="easing-spring-hint">
          sampled CSS curve · exact shape may differ
        </p>
      )}
    </div>
  )
}
