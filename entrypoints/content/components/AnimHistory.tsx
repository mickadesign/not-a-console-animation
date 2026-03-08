import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EasingPanel, formatMs, type AnimInfo } from './EasingPanel'
import { AccordionGroup, AccordionItem, AccordionTrigger, AccordionContent } from './Accordion'
import { camelToKebab } from '../lib/css-utils'

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

  // Map openId (number | null) → Accordion value (string)
  const accordionValue = openId !== null ? String(openId) : ''

  return (
    <div className="anim-history">
      <div className="anim-history-hd">
        <span className="anim-history-label">Captured</span>
        <button className="anim-history-clear" onClick={onClear}>Clear</button>
      </div>

      <AccordionGroup
        value={accordionValue}
        onValueChange={(val) => onOpenChange(val ? Number(val) : null)}
        collapsible
      >
        <AnimatePresence initial={false}>
          {groups.map((group, i) => {
            const idx = innerIndex[group.id] ?? 0

            return (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <AccordionItem value={String(group.id)} index={i}>
                  <AccordionTrigger>{getGroupTitle(group)}</AccordionTrigger>
                  <AccordionContent>
                    <EasingPanel
                      inset
                      anims={group.anims}
                      index={idx}
                      onIndexChange={(i) =>
                        setInnerIndex(prev => ({ ...prev, [group.id]: i }))
                      }
                    />
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </AccordionGroup>
    </div>
  )
}
