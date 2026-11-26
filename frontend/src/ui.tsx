import { Check, LoaderCircle, X, type LucideIcon } from 'lucide-react'
import { AnimatePresence, animate, useDragControls, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from './feedback'

const dotColors = ['bg-gblue', 'bg-gred', 'bg-gyellow', 'bg-ggreen']
const chipTones = [
  'bg-gblue/12 text-primary',
  'bg-gred/10 text-danger',
  'bg-gyellow/20 text-warn',
  'bg-ggreen/12 text-success',
]
const avatarTones = [
  'from-[#1a73e8] to-[#1557b0]',
  'from-[#d93025] to-[#a50e0e]',
  'from-[#b06000] to-[#8a4b00]',
  'from-[#188038] to-[#0d652d]',
]

const spring = { type: 'spring', stiffness: 520, damping: 38 } as const

const WAVE: Keyframe[] = [
  { transform: 'none', offset: 0 },
  { transform: 'translateY(22%) scale(1.22, 0.74)', offset: 0.16 },
  { transform: 'translateY(-85%) scale(0.86, 1.22)', offset: 0.42, easing: 'ease-in' },
  { transform: 'translateY(14%) scale(1.18, 0.8)', offset: 0.68 },
  { transform: 'translateY(-16%)', offset: 0.82 },
  { transform: 'none', offset: 1 },
]
const ORBIT: Keyframe[] = [
  { transform: 'none' },
  { transform: 'translate(var(--cx), 0) rotate(0deg) translateX(var(--ox)) scale(1.25)', offset: 0.25 },
  { transform: 'translate(var(--cx), 0) rotate(540deg) translateX(var(--ox)) scale(1.25)', offset: 0.8 },
  { transform: 'translate(var(--cx), 0) rotate(720deg) translateX(var(--home)) scale(1)' },
]

/** The dots bounce for as long as the cursor stays on them, then finish their hop. A press spins them. */
export function Logo({ size = 'md', loading = false }: { size?: 'md' | 'lg'; loading?: boolean }) {
  const dots = useRef<HTMLSpanElement>(null)
  const waves = useRef<Animation[]>([])
  const reduced = useReducedMotion()
  const dot = size === 'lg' ? 'h-4 w-4' : 'h-2.5 w-2.5'
  const step = size === 'lg' ? 20 : 14

  const start = () => {
    if (reduced || loading || !dots.current) return
    if (waves.current.some((wave) => wave.playState === 'running')) {
      for (const wave of waves.current) wave.effect?.updateTiming({ iterations: Infinity })
      // A dot that already came to rest joins again from the top.
      for (const wave of waves.current) if (wave.playState === 'finished') wave.play()
      return
    }
    waves.current = [...dots.current.children].map((el, i) =>
      el.animate(WAVE, { duration: 1000, delay: i * 110, iterations: Infinity, easing: 'ease-in-out' }),
    )
  }
  const stop = () => {
    for (const wave of waves.current) {
      const at = wave.effect?.getComputedTiming().currentIteration ?? 0
      wave.effect?.updateTiming({ iterations: Math.min(at, 1e6) + 1 })
    }
  }
  const spin = () => {
    if (reduced || loading || !dots.current) return
    haptic()
    for (const el of dots.current.children) el.animate(ORBIT, { duration: 900, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' })
  }

  return (
    <span
      onPointerEnter={start}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onPointerDown={spin}
      className={`group/logo inline-flex items-center gap-2 py-1.5 font-bold tracking-tight ${loading ? 'logo-loading' : ''}`}
    >
      <span ref={dots} className="flex items-center gap-1" aria-hidden>
        {dotColors.map((c, i) => (
          <span
            key={c}
            style={{
              '--i': i,
              '--cx': `${(1.5 - i) * step}px`,
              '--ox': `${(i < 2 ? -1 : 1) * (i % 3 === 0 ? 1.15 : 0.5) * step}px`,
              '--home': `${(i - 1.5) * step}px`,
            } as CSSProperties}
            className={`logo-dot ${dot} rounded-full ${c}`}
          />
        ))}
      </span>
      <span className={`whitespace-nowrap ${size === 'lg' ? 'text-3xl' : 'text-lg'}`}>Referral Portal</span>
    </span>
  )
}

export function Chip({ children, tone = 0, className = '' }: { children: ReactNode; tone?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${chipTones[tone % chipTones.length]} ${className}`}>
      {children}
    </span>
  )
}

export function Avatar({ name, size = 'md', square = false }: { name: string; size?: 'sm' | 'md' | 'lg'; square?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  const tone = avatarTones[(name.charCodeAt(0) || 0) % avatarTones.length]
  const dim = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm'
  return (
    <span aria-hidden className={`${dim} ${tone} inline-flex shrink-0 items-center justify-center bg-gradient-to-br font-bold text-white ${square ? (size === 'sm' ? 'rounded-lg' : 'rounded-2xl') : 'rounded-full'}`}>
      {initials || '?'}
    </span>
  )
}

/** `index` staggers the entrance of cards in a list. */
export function Card({ children, className = '', index = 0, interactive = false }: {
  children: ReactNode
  className?: string
  index?: number
  interactive?: boolean
}) {
  return (
    <div
      style={{ '--i': index } as CSSProperties}
      className={`spot rise rounded-3xl border border-line p-4 shadow-card transition-[box-shadow,border-color] duration-300 sm:p-5 ${className.includes('bg-') ? '' : 'bg-surface'} ${interactive ? 'hover:border-primary/30 hover:shadow-lift' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div role="alert" className="shake flex items-center justify-between gap-3 rounded-2xl bg-gred/10 px-4 py-3 text-sm font-medium text-danger">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="press shrink-0 rounded-full px-3 py-1 font-bold underline">Try again</button>}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10" role="status" aria-label="Loading">
      <LoaderCircle className="animate-spin text-primary" size={28} />
    </div>
  )
}

export function SkeletonList({ count = 4, className = 'space-y-3' }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-5">
          <span className="skeleton h-11 w-11 shrink-0 rounded-2xl" />
          <span className="flex-1 space-y-2">
            <span className="skeleton block h-3.5 w-2/5 rounded-full" />
            <span className="skeleton block h-3 w-3/5 rounded-full" />
          </span>
          <span className="skeleton h-9 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, text, icon: Icon, action }: { title: string; text: string; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center py-10 text-center sm:py-12">
      {Icon && (
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gblue/10 text-primary">
          <Icon size={28} aria-hidden />
        </span>
      )}
      <p className="text-lg font-bold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  )
}

const buttonStyles = {
  primary: 'bg-primary-fill text-white shadow-sm hover:shadow-md hover:shadow-gblue/25 hover:brightness-108',
  success: 'bg-success-fill text-white shadow-sm hover:shadow-md hover:shadow-ggreen/25 hover:brightness-108',
  outline: 'border border-primary/35 bg-surface text-primary hover:bg-gblue/8',
  ghost: 'text-muted hover:bg-line/60',
  danger: 'border border-danger/30 bg-surface text-danger hover:bg-gred/8',
  dangerSolid: 'bg-danger-fill text-white hover:brightness-108',
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  loading = false,
  form,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: keyof typeof buttonStyles
  disabled?: boolean
  loading?: boolean
  form?: string
  className?: string
}) {
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed ${loading ? 'disabled:opacity-80' : 'disabled:opacity-45'} ripple ${buttonStyles[variant]} ${className}`}
    >
      {loading && <LoaderCircle size={16} className="shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, onClick, className = '' }: {
  icon: LucideIcon
  label: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`press inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-line/60 hover:text-ink ${className}`}>
      <Icon size={19} aria-hidden />
    </button>
  )
}

export type Segment<T extends string> = { value: T; label: string; icon?: LucideIcon; count?: number }

/** Tabs with a pill that slides between options. Panels use the id `${id}-${value}-panel`. */
export function Segmented<T extends string>({ id, label, segments, value, onChange, className = '' }: {
  id: string
  label: string
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const pick = (next: T) => {
    if (next !== value) haptic()
    onChange(next)
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line bg-line/35 p-1 ${className}`}
      onKeyDown={(event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        event.preventDefault()
        const at = segments.findIndex((s) => s.value === value)
        const next = (at + step + segments.length) % segments.length
        pick(segments[next].value)
        buttons.current[next]?.focus()
      }}
    >
      {segments.map((segment, i) => {
        const on = segment.value === value
        return (
          <button
            key={segment.value}
            ref={(el) => { buttons.current[i] = el }}
            id={`${id}-${segment.value}-tab`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${id}-${segment.value}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => pick(segment.value)}
            className={`relative min-h-11 min-w-0 rounded-xl px-1.5 text-sm font-semibold transition-colors ${on ? 'text-primary' : 'text-muted hover:text-ink'}`}
          >
            {on && <m.span layoutId={`${id}-pill`} layoutDependency={value} transition={spring} className="absolute inset-0 rounded-xl bg-raised shadow-sm" />}
            <span className="relative flex items-center justify-center gap-1.5">
              {segment.icon && <segment.icon size={16} className="shrink-0" aria-hidden />}
              <span className="truncate">{segment.label}</span>
              {segment.count !== undefined && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? 'bg-gblue/12' : 'bg-line/70'}`}>{segment.count}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ checked, onChange, title, text }: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  text?: string
}) {
  return (
    <label className="flex items-start justify-between gap-4 text-sm">
      <span>
        <span className="font-semibold">{title}</span>
        {text && <span className="mt-0.5 block text-muted">{text}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => {
            haptic()
            onChange(event.target.checked)
          }}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        />
        <span aria-hidden className="h-7 w-12 rounded-full bg-muted/40 transition-colors duration-200 peer-checked:bg-primary-fill peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40" />
        <span aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-[#fff] shadow transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

/** One box per digit, backed by a single real input so paste and SMS autofill keep working. */
export function OtpInput({ id, value, onChange, disabled }: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        required
        autoFocus
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-10 h-full w-full cursor-text text-base opacity-0"
      />
      <div aria-hidden className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && i === Math.min(value.length, 5)
          return (
            <span key={i} className={`flex h-13 items-center justify-center rounded-2xl border-2 bg-surface text-xl font-bold transition ${active ? 'border-primary ring-4 ring-primary/15' : value[i] ? 'border-primary/40' : 'border-line'}`}>
              {value[i] ? <m.span key={value[i]} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>{value[i]}</m.span> : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function AnimatedNumber({ value }: { value: number }) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const start = Number(node.textContent || 0)
    if (reduced || start === value) {
      node.textContent = String(value)
      return
    }
    const controls = animate(start, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => {
        node.textContent = String(Math.round(n))
      },
    })
    return () => controls.stop()
  }, [value, reduced])
  return <span ref={ref} className="tabular-nums" />
}

/** `value` runs from 0 to 1. */
export function ProgressRing({ value, size = 64, stroke = 7, color = 'var(--color-primary)', children }: {
  value: number
  size?: number
  stroke?: number
  color?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const length = 2 * Math.PI * r
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          initial={{ strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - Math.min(1, Math.max(0, value))), opacity: value > 0 ? 1 : 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  )
}

export function SuccessCheck() {
  return (
    <m.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 17 }}
      className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-fill text-white"
    >
      <Check size={42} strokeWidth={3} aria-hidden />
    </m.span>
  )
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])'
let openSheets = 0

type SheetProps = {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

function SheetPanel({ title, subtitle, onClose, children, footer }: SheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  const drag = useDragControls()
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    // Focus the panel, not the first field, so phones do not throw the keyboard up on open.
    panel.current?.focus({ preventScroll: true })
    const root = document.documentElement
    if (openSheets++ === 0) {
      // Keep the page from shifting sideways when the scrollbar disappears.
      root.style.paddingRight = `${window.innerWidth - root.clientWidth}px`
      root.style.overflow = 'hidden'
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      if (event.shiftKey && (at === first || at === panel.current)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && at === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (--openSheets === 0) {
        root.style.overflow = ''
        root.style.paddingRight = ''
      }
      before?.focus?.({ preventScroll: true })
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <m.div
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <m.section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 40 }}
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.8 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose()
        }}
        className="relative flex max-h-[92dvh] w-full max-w-[520px] flex-col rounded-t-[2rem] bg-surface shadow-pop outline-none sm:rounded-[2rem]"
      >
        <div onPointerDown={(event) => drag.start(event)} className="shrink-0 cursor-grab touch-none px-5 pb-3 pt-2.5 active:cursor-grabbing sm:cursor-default sm:pt-5">
          <span aria-hidden className="mx-auto mb-3 block h-1.5 w-11 rounded-full bg-line sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-extrabold tracking-tight">{title}</h2>
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
            <span onPointerDown={(event) => event.stopPropagation()}><IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" /></span>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 ${footer ? 'pb-4' : 'pb-[calc(1.25rem+env(safe-area-inset-bottom))]'}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </m.section>
    </div>
  )
}

/** Bottom sheet on phones (drag down to dismiss), centered dialog on larger screens. */
export function Sheet({ open, ...props }: { open: boolean } & SheetProps) {
  return createPortal(<AnimatePresence>{open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>, document.body)
}

export function ConfirmSheet({ open, title, text, confirmLabel, danger = false, onConfirm, onClose }: {
  open: boolean
  title: string
  text: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <p className="text-sm text-muted">{text}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={onClose}>Go back</Button>
        <Button
          variant={danger ? 'dangerSolid' : 'primary'}
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}

const statusLabels: Record<string, { label: string; tone: number }> = {
  accepted: { label: 'Accepted', tone: 3 },
  pending: { label: 'Pending', tone: 2 },
  declined: { label: 'No reply', tone: 0 },
  completed: { label: 'Completed', tone: 0 },
  interview: { label: 'Interview', tone: 3 },
  under_review: { label: 'Under review', tone: 0 },
  submitted: { label: 'Submitted', tone: 2 },
  closed: { label: 'Closed', tone: 1 },
}

export function statusLabel(status: string): { label: string; tone: number } {
  return statusLabels[status] ?? { label: status, tone: 0 }
}
