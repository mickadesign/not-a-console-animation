import React, { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SlooowSpeed, SLOOOW_SPEEDS } from '../../src/shared/types'
import { SubtleTab, SubtleTabItem } from './components/SubtleTab'
import { Switch } from './components/Switch'
import { StatusBadges } from './StatusBadges'
import { AnimHistory, type HistoryGroup } from './components/AnimHistory'
import { type AnimInfo } from './components/EasingPanel'
import { parseEasing } from './lib/easing-parser'
import { springs } from './lib/springs'

// ── Animation capture helpers ─────────────────────────────────────────

const KEYFRAME_META = new Set(['offset', 'computedOffset', 'easing', 'composite'])

function extractProperties(effect: KeyframeEffect): string[] {
  try {
    const props = new Set<string>()
    for (const kf of effect.getKeyframes()) {
      for (const key of Object.keys(kf)) {
        if (!KEYFRAME_META.has(key)) props.add(key)
      }
    }
    return Array.from(props)
  } catch {
    return []
  }
}

function extractAnimInfo(anim: Animation): AnimInfo | null {
  const effect = anim.effect
  if (!(effect instanceof KeyframeEffect)) return null
  const timing     = effect.getTiming()
  const rawEasing  = timing.easing ?? 'ease'
  const rawDuration = timing.duration
  const duration: number | 'auto' = typeof rawDuration === 'number' ? rawDuration : 'auto'
  const delay      = typeof timing.delay === 'number' ? timing.delay : 0
  const properties = extractProperties(effect)
  return { rawEasing, easing: parseEasing(rawEasing), duration, delay, properties }
}

function collectAnimations(target: Element): AnimInfo[] {
  const seen   = new Set<Animation>()
  const result: AnimInfo[] = []
  let el: Element | null = target
  for (let depth = 0; depth < 5 && el; depth++, el = el.parentElement) {
    for (const anim of el.getAnimations()) {
      if (seen.has(anim)) continue
      seen.add(anim)
      const info = extractAnimInfo(anim)
      if (info) result.push(info)
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────

interface ToolbarProps {
  onSpeedChange: (speed: SlooowSpeed | null) => void
  onStateChange?: (state: { enabled: boolean; speed: SlooowSpeed }) => void
  initialEnabled?: boolean
  initialSpeed?: SlooowSpeed
}

interface Status {
  rafIntercepted: boolean
  gsapDetected: boolean
  animationCount: number
}

export function Toolbar({ onSpeedChange, onStateChange, initialEnabled = false, initialSpeed = 0.25 }: ToolbarProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [speed, setSpeed]     = useState<SlooowSpeed>(initialSpeed)
  const [status, setStatus]   = useState<Status>({
    rafIntercepted: false,
    gsapDetected: false,
    animationCount: 0,
  })

  // History ring — persists across enable/disable cycles, max 10 entries
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([])
  const [openGroupId, setOpenGroupId]     = useState<number | null>(null)
  const historyIdRef = useRef(0)

  // Drag state
  const [position, setPosition] = useState<{ top: number; right: number }>({ top: 16, right: 16 })
  const dragging  = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, top: 16, right: 16 })
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Listen for status updates relayed from inject.ts via CustomEvent
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Partial<Status>>).detail
      setStatus((prev) => ({ ...prev, ...detail }))
    }
    document.addEventListener('slooow:status', handler)
    return () => document.removeEventListener('slooow:status', handler)
  }, [])

  // Enable slow-mo whenever the toolbar is shown via the extension icon
  useEffect(() => {
    const handler = () => setEnabled(true)
    document.addEventListener('slooow:set-enabled', handler)
    return () => document.removeEventListener('slooow:set-enabled', handler)
  }, [])

  // Refresh WAAPI animation count every second while enabled
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => {
      setStatus((prev) => ({ ...prev, animationCount: document.getAnimations().length }))
    }, 1000)
    return () => clearInterval(interval)
  }, [enabled])

  // History capture — debounced pointermove, only while enabled
  // Pointer settling on a new element for 80 ms triggers a snapshot.
  useEffect(() => {
    if (!enabled) return

    let lastTarget: Element | null = null
    let captureTimer: ReturnType<typeof setTimeout> | null = null

    const handlePointerMove = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target || target === lastTarget) return
      lastTarget = target

      if (captureTimer) clearTimeout(captureTimer)
      captureTimer = setTimeout(() => {
        captureTimer = null
        const current = lastTarget
        if (!current) return

        const anims = collectAnimations(current)
        if (!anims.length) return

        const id    = ++historyIdRef.current
        const group: HistoryGroup = { id, anims }
        setHistoryGroups(prev => [group, ...prev].slice(0, 10))
        setOpenGroupId(id)
      }, 80)
    }

    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      if (captureTimer) clearTimeout(captureTimer)
    }
  }, [enabled])

  // Notify parent of current effective speed and full state whenever they change
  useEffect(() => {
    onSpeedChange(enabled ? speed : null)
    onStateChange?.({ enabled, speed })
  }, [enabled, speed, onSpeedChange, onStateChange])

  const handleToggle = useCallback(() => {
    setEnabled((prev) => !prev)
  }, [])

  const handleSpeedSelect = useCallback((newSpeed: SlooowSpeed) => {
    setSpeed(newSpeed)
    if (!enabled) setEnabled(true)
  }, [enabled])

  // Pointer-based drag
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, top: position.top, right: position.right }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPosition({
      right: Math.max(0, dragStart.current.right - dx),
      top:   Math.max(0, dragStart.current.top   + dy),
    })
  }

  const onPointerUp = () => { dragging.current = false }

  return (
    <div
      ref={toolbarRef}
      className="toolbar"
      style={{ top: position.top, right: position.right }}
    >
      {/* Drag handle / header row */}
      <div
        className="header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="logo">Slooow</span>
        <Switch
          checked={enabled}
          onToggle={handleToggle}
          title={enabled ? 'Click to disable Slooow' : 'Click to enable Slooow'}
        />
      </div>

      {/* Speed selector + status — collapses when disabled */}
      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: springs.moderate,
              opacity: { type: 'tween', duration: 0.15, ease: 'easeInOut' },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingTop: 9 }}>
              <SubtleTab
                selectedIndex={SLOOOW_SPEEDS.indexOf(speed)}
                onSelect={(idx) => handleSpeedSelect(SLOOOW_SPEEDS[idx])}
                style={{ marginBottom: 8 }}
              >
                {SLOOOW_SPEEDS.map((s, idx) => (
                  <SubtleTabItem
                    key={s}
                    index={idx}
                    label={s === 1 ? '1×' : `${s}×`}
                  />
                ))}
              </SubtleTab>

              <StatusBadges
                rafIntercepted={status.rafIntercepted}
                gsapDetected={status.gsapDetected}
                animationCount={status.animationCount}
                enabled={enabled}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Captured easing history — persists across enable/disable, max 10 entries */}
      <AnimatePresence initial={false}>
        {historyGroups.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: springs.moderate,
              opacity: { type: 'tween', duration: 0.15, ease: 'easeInOut' },
            }}
            style={{ overflow: 'hidden' }}
          >
            <AnimHistory
              groups={historyGroups}
              openId={openGroupId}
              onOpenChange={setOpenGroupId}
              onClear={() => {
                setHistoryGroups([])
                setOpenGroupId(null)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
