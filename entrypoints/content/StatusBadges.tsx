import React from 'react'

interface StatusBadgesProps {
  rafIntercepted: boolean
  gsapDetected: boolean
  animationCount: number
  enabled: boolean
}

export function StatusBadges({ rafIntercepted, gsapDetected, animationCount, enabled }: StatusBadgesProps) {
  const hasAnything = rafIntercepted || gsapDetected || animationCount > 0

  if (!hasAnything) {
    return (
      <div className="badges">
        <span className="badge badge-inactive">No animations detected</span>
      </div>
    )
  }

  return (
    <div className="badges">
      {rafIntercepted && (
        <span className="badge badge-raf" title="requestAnimationFrame is intercepted">
          ⚡ rAF
        </span>
      )}
      {gsapDetected && (
        <span className="badge badge-gsap" title="GSAP global timeline detected">
          ✓ GSAP
        </span>
      )}
      {animationCount > 0 && (
        <span
          className="badge badge-waapi"
          title={`${animationCount} Web Animation${animationCount !== 1 ? 's' : ''} active`}
        >
          {animationCount} WAAPI
        </span>
      )}
    </div>
  )
}
