// Adapted from Fluid Functionalism accordion (AccordionGroup mode).
// Tailwind classes replaced with inline styles + CSS variables.
// No cn(), no useShape() — hardcoded border-radius to match toolbar.

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
  type CSSProperties,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { springs } from '../lib/springs'
import { fontWeights } from '../lib/font-weight'
import { useProximityHover, type ItemRect } from '../hooks/use-proximity-hover'

// ─── Contexts ────────────────────────────────────────────────────────────────

interface AccordionGroupContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void
  registerFullItem: (index: number, element: HTMLElement | null) => void
  activeIndex: number | null
  grouped: true
  remeasure: () => void
  openValues: Set<string>
  openItemRects: Map<number, ItemRect>
  toggleValue: (value: string) => void
}

const AccordionGroupContext =
  createContext<AccordionGroupContextValue | null>(null)

function useAccordionGroup() {
  return useContext(AccordionGroupContext)
}

interface AccordionItemContextValue {
  index?: number
  value: string
  isOpen: boolean
  onToggle: () => void
}

const AccordionItemContext =
  createContext<AccordionItemContextValue | null>(null)

function useAccordionItemContext() {
  const ctx = useContext(AccordionItemContext)
  if (!ctx)
    throw new Error(
      'AccordionTrigger/AccordionContent must be used within an AccordionItem'
    )
  return ctx
}

// ─── AccordionGroup ──────────────────────────────────────────────────────────

const BORDER_RADIUS = 6

interface AccordionGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  collapsible?: boolean
  value?: string
  onValueChange?: (value: string) => void
}

const AccordionGroup = forwardRef<HTMLDivElement, AccordionGroupProps>(
  ({ children, collapsible = true, value, onValueChange, style, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const fullItemElementsRef = useRef<Map<number, HTMLElement>>(new Map())
    const [openItemRects, setOpenItemRects] = useState<Map<number, ItemRect>>(new Map())

    const {
      activeIndex,
      setActiveIndex,
      itemRects,
      sessionRef,
      handlers,
      registerItem,
      measureItems,
    } = useProximityHover(containerRef)

    const registerFullItem = useCallback(
      (index: number, element: HTMLElement | null) => {
        if (element) fullItemElementsRef.current.set(index, element)
        else fullItemElementsRef.current.delete(index)
      },
      []
    )

    const measureFullItems = useCallback(() => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const next = new Map<number, ItemRect>()
      fullItemElementsRef.current.forEach((el, idx) => {
        const r = el.getBoundingClientRect()
        next.set(idx, {
          top: r.top - containerRect.top,
          left: r.left - containerRect.left,
          width: r.width,
          height: r.height,
        })
      })
      setOpenItemRects(next)
    }, [])

    // Track open value
    const [internalValue, setInternalValue] = useState<string>('')

    const openValues = new Set<string>(
      (() => {
        const v = value ?? internalValue
        return v ? [v] : []
      })()
    )

    const handleValueChange = useCallback(
      (v: string) => {
        if (onValueChange) onValueChange(v)
        else setInternalValue(v)
      },
      [onValueChange]
    )

    const toggleValue = useCallback(
      (val: string) => {
        handleValueChange(openValues.has(val) ? '' : val)
      },
      [handleValueChange, openValues]
    )

    useEffect(() => {
      measureItems()
      measureFullItems()
    }, [measureItems, measureFullItems, children])

    // Remeasure when open values change
    useEffect(() => {
      measureItems()
      measureFullItems()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [...openValues].join(','),
      measureItems,
      measureFullItems,
    ])

    const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

    const isHoveringOpen = activeIndex !== null && openItemRects.has(activeIndex)
    const activeRect = (activeIndex !== null && !isHoveringOpen) ? itemRects[activeIndex] : null
    const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null
    const containerStyle: CSSProperties = {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      userSelect: 'none',
      ...style,
    }

    return (
      <AccordionGroupContext.Provider
        value={{
          registerItem,
          registerFullItem,
          activeIndex,
          grouped: true,
          remeasure: () => { measureItems(); measureFullItems() },
          openValues,
          openItemRects,
          toggleValue,
        }}
      >
        <AccordionPrimitive.Root
          type="single"
          collapsible={collapsible}
          value={value ?? internalValue}
          onValueChange={handleValueChange}
          asChild
        >
          <div
            ref={(node) => {
              (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
              if (typeof ref === 'function') ref(node)
              else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
            }}
            onMouseEnter={handlers.onMouseEnter}
            onMouseMove={handlers.onMouseMove}
            onMouseLeave={handlers.onMouseLeave}
            onFocus={(e) => {
              const indexAttr = (e.target as HTMLElement)
                .closest('[data-proximity-index]')
                ?.getAttribute('data-proximity-index')
              if (indexAttr != null) {
                const idx = Number(indexAttr)
                setActiveIndex(idx)
                setFocusedIndex(
                  (e.target as HTMLElement).matches(':focus-visible') ? idx : null
                )
              }
            }}
            onBlur={(e) => {
              if (containerRef.current?.contains(e.relatedTarget as Node)) return
              setFocusedIndex(null)
              setActiveIndex(null)
            }}
            style={containerStyle}
            {...props}
          >
            {/* Expanded item backgrounds */}
            <AnimatePresence>
              {[...openItemRects.entries()].map(([idx, rect]) => (
                <motion.div
                  key={`expanded-${idx}`}
                  style={{
                    position: 'absolute',
                    borderRadius: BORDER_RADIUS,
                    background: 'var(--toolbar-pill-sel)',
                    pointerEvents: 'none',
                  }}
                  initial={false}
                  animate={{
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    opacity: 1,
                  }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{
                    ...springs.fast,
                    opacity: { duration: 0.16 },
                  }}
                />
              ))}
            </AnimatePresence>

            {/* Hover background */}
            <AnimatePresence>
              {activeRect && (
                <motion.div
                  key={sessionRef.current}
                  style={{
                    position: 'absolute',
                    borderRadius: BORDER_RADIUS,
                    background: 'var(--toolbar-pill-hover)',
                    pointerEvents: 'none',
                  }}
                  initial={{
                    opacity: 0,
                    top: activeRect.top,
                    left: activeRect.left,
                    width: activeRect.width,
                    height: activeRect.height,
                  }}
                  animate={{
                    opacity: 1,
                    top: activeRect.top,
                    left: activeRect.left,
                    width: activeRect.width,
                    height: activeRect.height,
                  }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
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
                    borderRadius: BORDER_RADIUS,
                    pointerEvents: 'none',
                    zIndex: 20,
                    border: '1px solid var(--toolbar-muted)',
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
        </AccordionPrimitive.Root>
      </AccordionGroupContext.Provider>
    )
  }
)

AccordionGroup.displayName = 'AccordionGroup'

// ─── AccordionItem ───────────────────────────────────────────────────────────

interface AccordionItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string
  index: number
  disabled?: boolean
  children: ReactNode
}

const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, index, disabled, children, style, ...props }, ref) => {
    const internalRef = useRef<HTMLDivElement>(null)
    const groupCtx = useAccordionGroup()

    const isOpen = groupCtx ? groupCtx.openValues.has(value) : false

    const onToggle = useCallback(() => {
      groupCtx?.toggleValue(value)
    }, [groupCtx, value])

    // Register trigger element for proximity hover hit-testing
    useEffect(() => {
      if (groupCtx) {
        groupCtx.registerItem(index, internalRef.current)
        return () => groupCtx.registerItem(index, null)
      }
    }, [index, groupCtx])

    // Register full item element for expanded background measurement
    useEffect(() => {
      if (groupCtx) {
        if (isOpen) groupCtx.registerFullItem(index, internalRef.current)
        else groupCtx.registerFullItem(index, null)
        return () => groupCtx.registerFullItem(index, null)
      }
    }, [index, groupCtx, isOpen])

    return (
      <AccordionItemContext.Provider value={{ index, value, isOpen, onToggle }}>
        <AccordionPrimitive.Item
          ref={(node) => {
            (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
          }}
          value={value}
          disabled={disabled}
          data-proximity-index={index}
          style={{ position: 'relative', ...style }}
          {...props}
        >
          {children}
        </AccordionPrimitive.Item>
      </AccordionItemContext.Provider>
    )
  }
)

AccordionItem.displayName = 'AccordionItem'

// ─── AccordionTrigger ────────────────────────────────────────────────────────

interface AccordionTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ children, style, ...props }, ref) => {
    const groupCtx = useAccordionGroup()
    const { index, isOpen } = useAccordionItemContext()

    const isActive = groupCtx ? groupCtx.activeIndex === index : false

    const triggerStyle: CSSProperties = {
      position: 'relative',
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      width: '100%',
      cursor: 'pointer',
      outline: 'none',
      border: 'none',
      background: 'none',
      padding: '5px 6px',
      borderRadius: BORDER_RADIUS,
      fontFamily: 'inherit',
      textAlign: 'left',
      ...style,
    }

    const chevronColor = (isOpen || isActive) ? 'var(--toolbar-fg)' : 'var(--toolbar-muted)'

    return (
      <AccordionPrimitive.Header asChild>
        <div>
          <AccordionPrimitive.Trigger
            ref={ref}
            style={triggerStyle}
            {...(props as React.ComponentProps<typeof AccordionPrimitive.Trigger>)}
          >
            <span style={{
              display: 'inline-grid',
              fontSize: 12,
              flex: 1,
              textAlign: 'left',
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
              minWidth: 0,
            }}>
              <span
                style={{
                  gridColumn: '1', gridRow: '1',
                  visibility: 'hidden',
                  fontVariationSettings: fontWeights.semibold,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                aria-hidden="true"
              >
                {children}
              </span>
              <span style={{
                gridColumn: '1', gridRow: '1',
                color: 'var(--toolbar-fg)',
                fontVariationSettings: isOpen ? fontWeights.semibold : fontWeights.normal,
                transition: 'font-variation-settings 80ms',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {children}
              </span>
            </span>

            <motion.span
              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={springs.fast}
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor"
                strokeWidth={(isOpen || isActive) ? 2.5 : 2}
                strokeLinecap="round" strokeLinejoin="round"
                style={{ color: chevronColor, transition: 'color 80ms' }}
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </motion.span>
          </AccordionPrimitive.Trigger>
        </div>
      </AccordionPrimitive.Header>
    )
  }
)

AccordionTrigger.displayName = 'AccordionTrigger'

// ─── AccordionContent ────────────────────────────────────────────────────────

interface AccordionContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

const AccordionContent = forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ children, style, ...props }, ref) => {
    const groupCtx = useAccordionGroup()
    const { isOpen } = useAccordionItemContext()

    return (
      <AnimatePresence initial={false}>
        {isOpen && (
          <AccordionPrimitive.Content forceMount asChild {...props}>
            <motion.div
              ref={ref}
              style={{ overflow: 'hidden', ...style }}
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={springs.moderate}
              onUpdate={() => groupCtx?.remeasure()}
              onAnimationComplete={() => groupCtx?.remeasure()}
            >
              {children}
            </motion.div>
          </AccordionPrimitive.Content>
        )}
      </AnimatePresence>
    )
  }
)

AccordionContent.displayName = 'AccordionContent'

// ─── Exports ─────────────────────────────────────────────────────────────────

export { AccordionGroup, AccordionItem, AccordionTrigger, AccordionContent }
