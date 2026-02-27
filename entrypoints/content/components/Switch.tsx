import { forwardRef, useRef, useEffect, type HTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import { springs } from '../lib/springs'

const TRACK_WIDTH = 34
const TRACK_HEIGHT = 20
const THUMB_SIZE = 16
const THUMB_OFFSET = 2
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET * 2

interface SwitchProps extends HTMLAttributes<HTMLButtonElement> {
  label?: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ label, checked, onToggle, disabled = false, style, ...props }, ref) => {
    const hasMounted = useRef(false)

    useEffect(() => {
      hasMounted.current = true
    }, [])

    return (
      <button
        ref={ref}
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onToggle()}
        disabled={disabled}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: label ? 8 : 0,
          width: label ? undefined : TRACK_WIDTH,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
          outline: 'none',
          ...style,
        }}
        {...props}
      >
        {/* Track */}
        <span
          style={{
            position: 'relative',
            display: 'inline-block',
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            background: checked ? '#6B97FF' : 'var(--toolbar-track-off)',
            transition: 'background 80ms',
            flexShrink: 0,
          }}
        >
          {/* Thumb */}
          <motion.span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              display: 'block',
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: '50%',
              background: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
            animate={{
              x: checked ? THUMB_OFFSET + THUMB_TRAVEL : THUMB_OFFSET,
              y: THUMB_OFFSET,
            }}
            transition={hasMounted.current ? springs.fast : { duration: 0 }}
          />
        </span>

        {/* Optional label */}
        {label && (
          <span
            style={{
              fontSize: 13,
              color: checked ? 'var(--toolbar-fg)' : 'var(--toolbar-muted)',
              transition: 'color 80ms',
              fontFamily: 'inherit',
            }}
          >
            {label}
          </span>
        )}
      </button>
    )
  }
)

Switch.displayName = 'Switch'

export { Switch }
export type { SwitchProps }
