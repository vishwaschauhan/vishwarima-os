import { ChevronLeft, ChevronRight, CloudOff, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useToasts } from '../app/toast'
import { useOnline } from '../app/useOnline'
import { usePendingWrites } from '../data/live'
import type { OwnerFilter, PersonId } from '../domain/agenda'
import type { Owner } from '../domain/plan'
import { Sprig } from './paint'
import { OWNER_BAR, OWNER_LABEL, OWNER_STYLE } from './owners'

export function OwnerBadge({ owner, className = '' }: { owner: Owner; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${OWNER_STYLE[owner]} ${className}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${OWNER_BAR[owner]}`} />
      {OWNER_LABEL[owner]}
    </span>
  )
}

/** Segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-line/55 p-1 ring-1 ring-line ring-inset">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 flex-1 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition duration-200 ${
            value === o.value ? 'bg-surface text-ink shadow-paper' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function OwnerFilterBar({ value, onChange, myId }: { value: OwnerFilter; onChange: (v: OwnerFilter) => void; myId?: PersonId }) {
  const options: { value: OwnerFilter; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'vishwas', label: 'Vishwas' },
    { value: 'garima', label: 'Garima' },
  ]
  // Your own name is "mine"; a saved 'mine' filter shows as your name.
  const shown = value === 'mine' ? (myId ?? 'everyone') : value
  return <Segmented label="Show tasks for" value={shown} options={options} onChange={onChange} />
}

export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="press inline-flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-line/50 hover:text-ink"
    >
      {children}
    </button>
  )
}

export function StepNav({ label, onPrev, onNext, prevLabel, nextLabel, children }: {
  label: string
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <IconButton label={prevLabel} onClick={onPrev}>
        <ChevronLeft size={20} />
      </IconButton>
      <IconButton label={nextLabel} onClick={onNext}>
        <ChevronRight size={20} />
      </IconButton>
      {children}
    </div>
  )
}

/** Bottom sheet on phones, centered dialog on wider screens. Uses the native <dialog>. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] bg-surface bg-[radial-gradient(90%_120px_at_10%_0%,var(--marigold-wash),transparent)] p-0 text-ink shadow-lift sm:m-auto sm:max-w-lg sm:rounded-[28px]"
    >
      {open && (
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink-muted/25 sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-[22px] font-medium tracking-tight">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </div>
          <div className="mt-2">{children}</div>
        </div>
      )}
    </dialog>
  )
}

/** Offline and pending-sync state, shown in the header. */
export function SyncStatus() {
  const online = useOnline()
  const pending = usePendingWrites()
  if (online && !pending) return null
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-marigold-wash px-3 py-1 text-xs font-semibold text-ink-muted ring-1 ring-line">
      {online ? <RefreshCw size={13} className="animate-spin [animation-duration:2s]" /> : <CloudOff size={13} />}
      {online ? 'Syncing…' : pending ? 'Offline — changes pending' : 'Offline'}
    </span>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-7 mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-serif text-[19px] font-medium tracking-tight">
        <span aria-hidden className="size-2 rotate-45 rounded-[3px] bg-coral/70" />
        {children}
      </h2>
      {aside}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-surface/70 px-5 py-6 text-center">
      <Sprig className="mx-auto mb-1 h-7 w-16" />
      <p className="font-serif text-[16px] text-ink-muted italic">{children}</p>
    </div>
  )
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-[68px] rounded-card" />
      ))}
    </div>
  )
}

export function Toasts() {
  const toasts = useToasts()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-5 lg:bottom-6">
      {toasts.map((t) => (
        <p key={t.id} role="alert" className="page-enter rounded-2xl bg-ink px-4 py-3 text-[14px] font-medium text-canvas shadow-lift">
          {t.text}
        </p>
      ))}
    </div>
  )
}

/** A destructive action that asks once more before it runs. */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  className = '',
}: {
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  className?: string
}) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 4000)
    return () => clearTimeout(t)
  }, [asking])
  return (
    <button
      type="button"
      onClick={() => {
        if (!asking) return setAsking(true)
        setAsking(false)
        onConfirm()
      }}
      className={`press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold ${
        asking ? 'bg-danger text-canvas' : 'border border-line bg-surface text-ink shadow-paper hover:border-ink-muted/50'
      } ${className}`}
    >
      {asking ? confirmLabel : children}
    </button>
  )
}
