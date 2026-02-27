import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EasingPanel, formatMs, type AnimInfo } from './EasingPanel'
import { springs } from '../lib/springs'

export interface HistoryGroup {
  id: number
  anims: AnimInfo[]
}

interface AnimHistoryProps {
  groups: HistoryGroup[]
  openId: number | null
  onOpenChange: (id: number | null) => void
  onClear: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────

function camelToKebab(s: string): string {
  // Leave CSS custom properties (--foo) untouched
  if (s.startsWith('--')) return s
  return s.replace(/([A-Z])/g, c => '-' + c.toLowerCase())
}

function getGroupTitle(group: HistoryGroup): string {
  const first = group.anims[0]
  const props = first.properties.map(camelToKebab)

  let propLabel: string
  if (props.length === 0) {
    propLabel = 'animation'
  } else if (props.length <= 2) {
    propLabel = props.join(', ')
  } else {
    propLabel = props.slice(0, 2).join(', ') + ' \u2026'
  }

  const multiSuffix = group.anims.length > 1 ? ` +${group.anims.length - 1}` : ''
  return `${propLabel}${multiSuffix} · ${formatMs(first.duration)}`
}

// ── AnimHistory ───────────────────────────────────────────────────────

export function AnimHistory({ groups, openId, onOpenChange, onClear }: AnimHistoryProps) {
  // Per-group inner pagination index (which animation to show when expanded)
  const [innerIndex, setInnerIndex] = useState<Record<number, number>>({})

  if (groups.length === 0) return null

  return (
    <div className="anim-history">
      <div className="anim-history-hd">
        <button className="anim-history-clear" onClick={onClear}>Clear</button>
      </div>

      <AnimatePresence initial={false}>
        {groups.map((group) => {
          const isOpen = openId === group.id
          const idx    = innerIndex[group.id] ?? 0

          return (
            <motion.div
              key={group.id}
              className={`history-item${isOpen ? ' is-open' : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <button
                className={`history-item-hd${isOpen ? ' is-open' : ''}`}
                onClick={() => onOpenChange(isOpen ? null : group.id)}
              >
                <span className="history-item-title">{getGroupTitle(group)}</span>
                <motion.span
                  className="history-item-chevron"
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  style={{ display: 'inline-flex', transformOrigin: '50% 50%' }}
                  aria-hidden="true"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: springs.fast,
                      opacity: { type: 'tween', duration: 0.1 },
                    }}
                    style={{ overflow: 'hidden' }}
                  >
                    <EasingPanel
                      inset
                      anims={group.anims}
                      index={idx}
                      onIndexChange={(i) =>
                        setInnerIndex(prev => ({ ...prev, [group.id]: i }))
                      }
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
