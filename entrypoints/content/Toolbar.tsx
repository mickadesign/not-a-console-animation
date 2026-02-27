import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SlowMoSpeed, SLOWMO_SPEEDS } from '../../src/shared/types'
import { SubtleTab, SubtleTabItem } from './components/SubtleTab'
import { Switch } from './components/Switch'
import { StatusBadges } from './StatusBadges'

interface ToolbarProps {
  onSpeedChange: (speed: SlowMoSpeed | null) => void
  onStateChange?: (state: { enabled: boolean; speed: SlowMoSpeed }) => void
  initialEnabled?: boolean
  initialSpeed?: SlowMoSpeed
}

interface Status {
  rafIntercepted: boolean
  gsapDetected: boolean
  animationCount: number
}

export function Toolbar({ onSpeedChange, onStateChange, initialEnabled = false, initialSpeed = 0.25 }: ToolbarProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [speed, setSpeed] = useState<SlowMoSpeed>(initialSpeed)
  const [status, setStatus] = useState<Status>({
    rafIntercepted: false,
    gsapDetected: false,
    animationCount: 0,
  })

  // Drag state — stored in refs so pointer handlers don't need re-registration
  const [position, setPosition] = useState<{ top: number; right: number }>({ top: 16, right: 16 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, top: 16, right: 16 })
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Listen for status updates relayed from inject.ts via CustomEvent
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Partial<Status>>).detail
      setStatus((prev) => ({ ...prev, ...detail }))
    }
    document.addEventListener('slowmo:status', handler)
    return () => document.removeEventListener('slowmo:status', handler)
  }, [])

  // Enable slow-mo whenever the toolbar is shown via the extension icon
  useEffect(() => {
    const handler = () => setEnabled(true)
    document.addEventListener('slowmo:set-enabled', handler)
    return () => document.removeEventListener('slowmo:set-enabled', handler)
  }, [])

  // Refresh WAAPI animation count every second while enabled
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => {
      setStatus((prev) => ({ ...prev, animationCount: document.getAnimations().length }))
    }, 1000)
    return () => clearInterval(interval)
  }, [enabled])

  // Notify parent of current effective speed and full state whenever they change
  useEffect(() => {
    onSpeedChange(enabled ? speed : null)
    onStateChange?.({ enabled, speed })
  }, [enabled, speed, onSpeedChange, onStateChange])

  const handleToggle = useCallback(() => {
    setEnabled((prev) => !prev)
  }, [])

  const handleSpeedSelect = useCallback((newSpeed: SlowMoSpeed) => {
    setSpeed(newSpeed)
    if (!enabled) setEnabled(true) // selecting a speed implicitly enables
  }, [enabled])

  // Pointer-based drag (works for mouse and touch)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from the header, not from buttons or their children
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      top: position.top,
      right: position.right,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPosition({
      right: Math.max(0, dragStart.current.right - dx),
      top: Math.max(0, dragStart.current.top + dy),
    })
  }

  const onPointerUp = () => {
    dragging.current = false
  }

  return (
    <div
      ref={toolbarRef}
      className={`toolbar${enabled ? ' active' : ''}`}
      style={{ top: position.top, right: position.right }}
    >
      {/* Drag handle doubles as header row */}
      <div
        className="header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="logo">SlowMo</span>
        <Switch
          checked={enabled}
          onToggle={handleToggle}
          title={enabled ? 'Click to disable slow-mo' : 'Click to enable slow-mo'}
        />
      </div>

      <SubtleTab
        selectedIndex={SLOWMO_SPEEDS.indexOf(speed)}
        onSelect={(idx) => handleSpeedSelect(SLOWMO_SPEEDS[idx])}
        style={{ marginBottom: 8 }}
      >
        {SLOWMO_SPEEDS.map((s, idx) => (
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
  )
}
