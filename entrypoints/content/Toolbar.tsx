import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SlowMoSpeed } from '../../src/shared/types'
import { SpeedSelector } from './SpeedSelector'
import { StatusBadges } from './StatusBadges'

interface ToolbarProps {
  onSpeedChange: (speed: SlowMoSpeed | null) => void
}

interface Status {
  rafIntercepted: boolean
  gsapDetected: boolean
  animationCount: number
}

export function Toolbar({ onSpeedChange }: ToolbarProps) {
  const [enabled, setEnabled] = useState(true)
  const [speed, setSpeed] = useState<SlowMoSpeed>(0.25)
  const [status, setStatus] = useState<Status>({
    rafIntercepted: false,
    gsapDetected: false,
    animationCount: 0,
  })

  // Drag state — stored in refs so pointer handlers don't need re-registration
  const [position, setPosition] = useState<{ bottom: number; right: number }>({ bottom: 20, right: 20 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, bottom: 20, right: 20 })
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

  // Refresh WAAPI animation count every second while enabled
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => {
      setStatus((prev) => ({ ...prev, animationCount: document.getAnimations().length }))
    }, 1000)
    return () => clearInterval(interval)
  }, [enabled])

  // Notify parent of current effective speed whenever state changes
  useEffect(() => {
    onSpeedChange(enabled ? speed : null)
  }, [enabled, speed, onSpeedChange])

  const handleToggle = useCallback(() => {
    setEnabled((prev) => !prev)
  }, [])

  const handleSpeedSelect = useCallback((newSpeed: SlowMoSpeed) => {
    setSpeed(newSpeed)
    if (!enabled) setEnabled(true) // selecting a speed implicitly enables
  }, [enabled])

  // Pointer-based drag (works for mouse and touch)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from the header, not from buttons
    if ((e.target as HTMLElement).tagName === 'BUTTON') return
    dragging.current = true
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      bottom: position.bottom,
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
      bottom: Math.max(0, dragStart.current.bottom - dy),
    })
  }

  const onPointerUp = () => {
    dragging.current = false
  }

  return (
    <div
      ref={toolbarRef}
      className={`toolbar${enabled ? ' active' : ''}`}
      style={{ bottom: position.bottom, right: position.right }}
    >
      {/* Drag handle doubles as header row */}
      <div
        className="header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="logo">SlowMo</span>
        {!enabled && <span className="hint">activate before interacting</span>}
        <button
          className={`toggle ${enabled ? 'on' : 'off'}`}
          onClick={handleToggle}
          title={enabled ? 'Click to disable slow-mo' : 'Click to enable slow-mo'}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <SpeedSelector
        currentSpeed={speed}
        enabled={enabled}
        onSelect={handleSpeedSelect}
      />

      <StatusBadges
        rafIntercepted={status.rafIntercepted}
        gsapDetected={status.gsapDetected}
        animationCount={status.animationCount}
        enabled={enabled}
      />
    </div>
  )
}
