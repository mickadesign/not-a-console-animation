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
// viewBox: 0 0 W TOTAL_H  (W=100, H=60 is the 0–1 range, PAD=8 on each side)
// preserveAspectRatio="none" fills the container without letterboxing.
const W   = 100
const H   = 60
const PAD = 8

function svgY(v: number) { return PAD + H * (1 - v) }
function svgX(p: number) { return p * W }

function buildPath(easing: ParsedEasing): string {
  switch (easing.type) {
    case 'cubic-bezier': {
      const { x1, y1, x2, y2 } = easing
      return (
        `M 0,${svgY(0)} ` +
        `C ${svgX(x1)},${svgY(y1)} ${svgX(x2)},${svgY(y2)} ${W},${svgY(1)}`
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
        let d = `M 0,${svgY(1 / count)}`
        for (let i = 0; i < count; i++) {
          const xNext = svgX((i + 1) / count)
          d += ` H ${xNext}`
          if (i < count - 1) d += ` V ${svgY((i + 2) / count)}`
        }
        return d
      } else {
        let d = `M 0,${svgY(0)}`
        for (let i = 0; i < count; i++) {
          d += ` H ${svgX((i + 1) / count)} V ${svgY((i + 1) / count)}`
        }
        return d
      }
    }

    default:
      return `M 0,${svgY(0)} L ${W},${svgY(1)}`
  }
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

// ── SVG curve ─────────────────────────────────────────────────────────

function EasingCurve({ easing }: { easing: ParsedEasing }) {
  const d = buildPath(easing)
  return (
    <svg
      viewBox={`0 0 ${W} ${H + PAD * 2}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 90, display: 'block' }}
      aria-hidden="true"
    >
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
          >‹</button>
          <span className="easing-nav-count">{index + 1} / {anims.length}</span>
          <button
            className="easing-nav-btn"
            onClick={() => onIndexChange(Math.min(anims.length - 1, index + 1))}
            disabled={index === anims.length - 1}
            aria-label="Next animation"
          >›</button>
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
