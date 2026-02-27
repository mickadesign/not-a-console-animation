import React from 'react'

interface StatusBadgesProps {
  rafIntercepted: boolean
  gsapDetected: boolean
  animationCount: number
  enabled: boolean
}

export function StatusBadges({ rafIntercepted, gsapDetected, animationCount }: StatusBadgesProps) {
  const parts: string[] = []
  if (rafIntercepted) parts.push('rAF')
  if (gsapDetected) parts.push('GSAP')
  if (animationCount > 0) parts.push(`${animationCount} WAAPI`)

  if (parts.length === 0) return null

  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--toolbar-muted)',
        letterSpacing: '0.02em',
      }}
    >
      {parts.join(' · ')}
    </div>
  )
}
