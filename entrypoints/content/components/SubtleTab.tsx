import {
  useId,
  useRef,
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
  type CSSProperties,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { springs } from '../lib/springs'
import { fontWeights } from '../lib/font-weight'
import { useProximityHover } from '../hooks/use-proximity-hover'

interface SubtleTabContextValue {
  registerTab: (index: number, element: HTMLElement | null) => void
  hoveredIndex: number | null
  selectedIndex: number
  onSelect: (index: number) => void
  idPrefix: string
}

const SubtleTabContext = createContext<SubtleTabContextValue | null>(null)

function useSubtleTab() {
  const ctx = useContext(SubtleTabContext)
  if (!ctx) throw new Error('useSubtleTab must be used within a SubtleTab')
  return ctx
}

interface SubtleTabProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  children: ReactNode
  selectedIndex: number
  onSelect: (index: number) => void
  idPrefix?: string
}

const SubtleTab = forwardRef<HTMLDivElement, SubtleTabProps>(
  ({ children, selectedIndex, onSelect, idPrefix: idPrefixProp, style, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const isMouseInside = useRef(false)
    const generatedId = useId()
    const idPrefix = idPrefixProp || generatedId

    const {
      activeIndex: hoveredIndex,
      setActiveIndex: setHoveredIndex,
      itemRects: tabRects,
      handlers,
      registerItem: registerTab,
      measureItems: measureTabs,
    } = useProximityHover(containerRef, { axis: 'x' })

    useEffect(() => {
      measureTabs()
    }, [measureTabs, children])

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        isMouseInside.current = true
        handlers.onMouseMove(e)
      },
      [handlers]
    )

    const handleMouseLeave = useCallback(() => {
      isMouseInside.current = false
      handlers.onMouseLeave()
    }, [handlers])

    const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

    const selectedRect = tabRects[selectedIndex]
    const hoverRect = hoveredIndex !== null ? tabRects[hoveredIndex] : null
    const focusRect = focusedIndex !== null ? tabRects[focusedIndex] : null
    const isHoveringSelected = hoveredIndex === selectedIndex
    const isHovering = hoveredIndex !== null && !isHoveringSelected

    const containerStyle: CSSProperties = {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      userSelect: 'none',
      overflowX: 'auto',
      maxWidth: '100%',
      padding: '4px 4px',
      margin: '-4px 0',
      ...style,
    }

    return (
      <SubtleTabContext.Provider
        value={{ registerTab, hoveredIndex, selectedIndex, onSelect, idPrefix }}
      >
        <div
          ref={(node) => {
            (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onFocus={(e) => {
            const indexAttr = (e.target as HTMLElement)
              .closest('[data-proximity-index]')
              ?.getAttribute('data-proximity-index')
            if (indexAttr != null) {
              const idx = Number(indexAttr)
              setHoveredIndex(idx)
              setFocusedIndex(
                (e.target as HTMLElement).matches(':focus-visible') ? idx : null
              )
            }
          }}
          onBlur={(e) => {
            if (containerRef.current?.contains(e.relatedTarget as Node)) return
            setFocusedIndex(null)
            if (isMouseInside.current) return
            setHoveredIndex(null)
          }}
          onKeyDown={(e) => {
            const items = Array.from(
              containerRef.current?.querySelectorAll('[role="tab"]') ?? []
            ) as HTMLElement[]
            const currentIdx = items.indexOf(e.target as HTMLElement)
            if (currentIdx === -1) return

            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault()
              const next = ['ArrowRight', 'ArrowDown'].includes(e.key)
                ? (currentIdx + 1) % items.length
                : (currentIdx - 1 + items.length) % items.length
              items[next].focus()
            } else if (e.key === 'Home') {
              e.preventDefault()
              items[0]?.focus()
            } else if (e.key === 'End') {
              e.preventDefault()
              items[items.length - 1]?.focus()
            }
          }}
          style={containerStyle}
          role="tablist"
          {...props}
        >
          {/* Selected pill */}
          {selectedRect && (
            <motion.div
              style={{
                position: 'absolute',
                borderRadius: 9999,
                background: 'rgba(108, 99, 255, 0.1)',
                pointerEvents: 'none',
              }}
              initial={false}
              animate={{
                left: selectedRect.left,
                width: selectedRect.width,
                top: selectedRect.top,
                height: selectedRect.height,
                opacity: isHovering ? 0.8 : 1,
              }}
              transition={{
                ...springs.moderate,
                opacity: { duration: 0.16 },
              }}
            />
          )}

          {/* Hover pill */}
          <AnimatePresence>
            {hoverRect && !isHoveringSelected && selectedRect && (
              <motion.div
                style={{
                  position: 'absolute',
                  borderRadius: 9999,
                  background: 'rgba(0, 0, 0, 0.04)',
                  pointerEvents: 'none',
                }}
                initial={{
                  left: selectedRect.left,
                  width: selectedRect.width,
                  top: selectedRect.top,
                  height: selectedRect.height,
                  opacity: 0,
                }}
                animate={{
                  left: hoverRect.left,
                  width: hoverRect.width,
                  top: hoverRect.top,
                  height: hoverRect.height,
                  opacity: 0.4,
                }}
                exit={
                  !isMouseInside.current && selectedRect
                    ? {
                        left: selectedRect.left,
                        width: selectedRect.width,
                        top: selectedRect.top,
                        height: selectedRect.height,
                        opacity: 0,
                        transition: { ...springs.moderate, opacity: { duration: 0.12 } },
                      }
                    : { opacity: 0, transition: { duration: 0.12 } }
                }
                transition={{
                  ...springs.moderate,
                  opacity: { duration: 0.16 },
                }}
              />
            )}
          </AnimatePresence>

          {/* Focus ring */}
          <AnimatePresence>
            {focusRect && (
              <motion.div
                style={{
                  position: 'absolute',
                  borderRadius: 9999,
                  pointerEvents: 'none',
                  zIndex: 20,
                  border: '1px solid #6B97FF',
                  background: 'transparent',
                }}
                initial={false}
                animate={{
                  left: focusRect.left - 2,
                  top: focusRect.top - 2,
                  width: focusRect.width + 4,
                  height: focusRect.height + 4,
                }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{
                  ...springs.moderate,
                  opacity: { duration: 0.16 },
                }}
              />
            )}
          </AnimatePresence>

          {children}
        </div>
      </SubtleTabContext.Provider>
    )
  }
)

SubtleTab.displayName = 'SubtleTab'

interface SubtleTabItemProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon
  label: string
  index: number
}

const SubtleTabItem = forwardRef<HTMLButtonElement, SubtleTabItemProps>(
  ({ icon: Icon, label, index, ...props }, ref) => {
    const internalRef = useRef<HTMLButtonElement>(null)
    const { registerTab, hoveredIndex, selectedIndex, onSelect, idPrefix } =
      useSubtleTab()

    useEffect(() => {
      registerTab(index, internalRef.current)
      return () => registerTab(index, null)
    }, [index, registerTab])

    const isActive = hoveredIndex === index || selectedIndex === index

    return (
      <button
        ref={(node) => {
          (internalRef as React.MutableRefObject<HTMLButtonElement | null>).current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
        }}
        data-proximity-index={index}
        id={`${idPrefix}-tab-${index}`}
        role="tab"
        aria-selected={selectedIndex === index}
        aria-controls={`${idPrefix}-panel-${index}`}
        tabIndex={selectedIndex === index ? 0 : -1}
        onClick={() => onSelect(index)}
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 9999,
          padding: '5px 10px',
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'inherit',
        }}
        {...props}
      >
        {Icon && (
          <Icon
            size={14}
            strokeWidth={isActive ? 2 : 1.5}
            style={{
              color: isActive ? '#111111' : '#aaaaaa',
              transition: 'color 80ms',
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            display: 'inline-grid',
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Ghost span reserves width at bold weight to prevent layout shift */}
          <span
            style={{
              gridColumn: '1',
              gridRow: '1',
              visibility: 'hidden',
              fontVariationSettings: fontWeights.semibold,
            }}
            aria-hidden="true"
          >
            {label}
          </span>
          <span
            style={{
              gridColumn: '1',
              gridRow: '1',
              color: isActive ? '#111111' : '#aaaaaa',
              fontVariationSettings:
                selectedIndex === index ? fontWeights.semibold : fontWeights.normal,
              transition: 'color 80ms, font-variation-settings 80ms',
            }}
          >
            {label}
          </span>
        </span>
      </button>
    )
  }
)

SubtleTabItem.displayName = 'SubtleTabItem'

export { SubtleTab, SubtleTabItem }
