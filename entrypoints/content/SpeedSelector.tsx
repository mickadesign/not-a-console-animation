import React from 'react'
import { SLOWMO_SPEEDS, SlowMoSpeed } from '../../src/shared/types'

interface SpeedSelectorProps {
  currentSpeed: SlowMoSpeed
  enabled: boolean
  onSelect: (speed: SlowMoSpeed) => void
}

export function SpeedSelector({ currentSpeed, enabled, onSelect }: SpeedSelectorProps) {
  return (
    <div className="speeds">
      {SLOWMO_SPEEDS.map((speed) => (
        <button
          key={speed}
          className={`speed-btn${enabled && currentSpeed === speed ? ' active' : ''}`}
          onClick={() => onSelect(speed)}
          disabled={!enabled && speed !== 1}
          title={speed === 1 ? 'Normal speed' : `${speed}× slow motion`}
        >
          {speed === 1 ? '1×' : `${speed}×`}
        </button>
      ))}
    </div>
  )
}
