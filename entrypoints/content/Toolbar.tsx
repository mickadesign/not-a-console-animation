import React, { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SlooowSpeed, SLOOOW_SPEEDS } from '../../src/shared/types'
import { SubtleTab, SubtleTabItem } from './components/SubtleTab'
import { Switch } from './components/Switch'
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

export function Toolbar({ onSpeedChange, onStateChange, initialEnabled = false, initialSpeed = 0.25 }: ToolbarProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [speed, setSpeed]     = useState<SlooowSpeed>(initialSpeed)

  // History ring — persists across enable/disable cycles, max 10 entries
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([])
  const [openGroupId, setOpenGroupId]     = useState<number | null>(null)
  const historyIdRef = useRef(0)

  // Drag state
  const [position, setPosition] = useState<{ top: number; right: number }>({ top: 16, right: 16 })
  const dragging  = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, top: 16, right: 16 })
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Enable slow-mo whenever the toolbar is shown via the extension icon
  useEffect(() => {
    const handler = () => setEnabled(true)
    document.addEventListener('slooow:set-enabled', handler)
    return () => document.removeEventListener('slooow:set-enabled', handler)
  }, [])

  // History capture — pointermove (hover settle) + pointerdown (click), only while enabled
  useEffect(() => {
    if (!enabled) return

    // Dedup: skip if the same animation fingerprint was captured in the last 500 ms
    let lastFp  = ''
    let lastFpTs = 0

    function animFingerprint(anims: AnimInfo[]): string {
      return anims.map(a => `${a.properties.join(',')}|${a.duration}|${a.rawEasing}`).join(';')
    }

    function captureFromTarget(target: Element) {
      const anims = collectAnimations(target)
      if (!anims.length) return
      const fp  = animFingerprint(anims)
      const now = Date.now()
      if (fp === lastFp && now - lastFpTs < 500) return
      lastFp  = fp
      lastFpTs = now
      const id = ++historyIdRef.current
      setHistoryGroups(prev => [...prev, { id, anims }].slice(-10))
    }

    // Hover: capture after pointer settles on a new element for 80 ms
    let lastTarget: Element | null = null
    let captureTimer: ReturnType<typeof setTimeout> | null = null

    const handlePointerMove = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target || target === lastTarget) return
      lastTarget = target

      if (captureTimer) clearTimeout(captureTimer)
      captureTimer = setTimeout(() => {
        captureTimer = null
        if (lastTarget) captureFromTarget(lastTarget)
      }, 80)
    }

    // Click: wait 2 rAF cycles (~32 ms) so click-triggered animations have started
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { captureFromTarget(target) })
      })
    }

    document.addEventListener('pointermove',  handlePointerMove,  { passive: true })
    document.addEventListener('pointerdown',  handlePointerDown,  { passive: true })
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerdown', handlePointerDown)
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
