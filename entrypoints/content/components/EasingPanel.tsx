import React from 'react'
import type { ParsedEasing, UnknownEasing } from '../lib/easing-parser'

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
// viewBox: 0 0 (W+2*HPAD) (H+2*PAD)
// HPAD adds horizontal breathing room so anchors don't touch the edges.
// preserveAspectRatio="none" fills the container without letterboxing.
const W    = 100
const H    = 60
const PAD  = 8   // vertical padding (top / bottom)
const HPAD = 10  // horizontal padding (left / right)

function svgY(v: number) { return PAD + H * (1 - v) }
function svgX(p: number) { return HPAD + p * W }

function buildPath(easing: ParsedEasing): string {
  switch (easing.type) {
    case 'cubic-bezier': {
      const { x1, y1, x2, y2 } = easing
      return (
        `M ${svgX(0)},${svgY(0)} ` +
        `C ${svgX(x1)},${svgY(y1)} ${svgX(x2)},${svgY(y2)} ${svgX(1)},${svgY(1)}`
      )
    }

    case 'linear': {
      if (!easing.stops.length) return ''
      return easing.stops
        .map((s, i) => `${i === 0 ? 'M' : 'L'} ${svgX(s.position)},${svgY(s.value)}`)
        .join(' ')
    }

    case 'steps': {
      const { count, direction } = easing
      const isStart = direction === 'start' || direction === 'both'
      if (isStart) {
        let d = `M ${svgX(0)},${svgY(1 / count)}`
        for (let i = 0; i < count; i++) {
          const xNext = svgX((i + 1) / count)
          d += ` H ${xNext}`
          if (i < count - 1) d += ` V ${svgY((i + 2) / count)}`
        }
        return d
      } else {
        let d = `M ${svgX(0)},${svgY(0)}`
        for (let i = 0; i < count; i++) {
          d += ` H ${svgX((i + 1) / count)} V ${svgY((i + 1) / count)}`
        }
        return d
      }
    }

    default:
      return `M ${svgX(0)},${svgY(0)} L ${svgX(1)},${svgY(1)}`
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function camelToKebab(s: string): string {
  if (s.startsWith('--')) return s
  return s.replace(/([A-Z])/g, c => '-' + c.toLowerCase())
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

function BezierDot({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const left   = `${((HPAD + x * W) / (W + 2 * HPAD)) * 100}%`
  const bottom = `${((PAD  + H * y) / (H + 2 * PAD )) * 100}%`
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
  const d = buildPath(easing)
  return (
    <div style={{ position: 'relative', height: 90 }}>
      <svg
        viewBox={`0 0 ${W + HPAD * 2} ${H + PAD * 2}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 90, display: 'block' }}
        aria-hidden="true"
      >
        {/* Bezier handle lines — drawn before the curve so curve renders on top */}
        {easing.type === 'cubic-bezier' && (
          <>
            <line
              x1={svgX(0)}        y1={svgY(0)}
              x2={svgX(easing.x1)} y2={svgY(easing.y1)}
              style={{ stroke: 'var(--toolbar-muted)' }} strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={svgX(1)}        y1={svgY(1)}
              x2={svgX(easing.x2)} y2={svgY(easing.y2)}
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
          <BezierDot x={0} y={0} size={5} color="var(--toolbar-muted)" />
          <BezierDot x={1} y={1} size={5} color="var(--toolbar-muted)" />
          {/* Control points — full curve-line color */}
          <BezierDot x={easing.x1} y={easing.y1} size={8} color="currentColor" />
          <BezierDot x={easing.x2} y={easing.y2} size={8} color="currentColor" />
        </>
      )}
    </div>
  )
}

// ── EasingPanel ───────────────────────────────────────────────────────

export function EasingPanel({ anims, index, onIndexChange, inset }: EasingPanelProps) {
  const info = anims[index]
  if (!info) return null

  const label = getLabel(info.easing, info.rawEasing)
  const dur   = formatMs(info.duration)
  const delay = info.delay !== 0 ? ` · ${formatMs(info.delay)}` : ''

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
      </div>
    </div>
  )
}
