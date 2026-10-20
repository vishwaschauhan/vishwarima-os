import { ChevronLeft, ChevronRight, CloudOff, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useToasts } from '../app/toast'
import { useOnline } from '../app/useOnline'
import { usePendingWrites } from '../data/live'
import type { OwnerFilter, PersonId } from '../domain/agenda'
import type { Owner } from '../domain/plan'
import { OWNER_LABEL, OWNER_STYLE } from './owners'

export function OwnerBadge({ owner, className = '' }: { owner: Owner; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${OWNER_STYLE[owner]} ${className}`}>
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
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-line/60 p-1">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 flex-1 rounded-full px-3 text-sm font-medium whitespace-nowrap transition ${
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'
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
      className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-line/50 hover:text-ink"
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
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/30 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-[19px] font-semibold">{title}</h2>
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
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-line/60 px-3 py-1 text-xs font-medium text-ink-muted">
      {online ? <RefreshCw size={13} className="animate-spin [animation-duration:2s]" /> : <CloudOff size={13} />}
      {online ? 'Syncing…' : pending ? 'Offline — changes pending' : 'Offline'}
    </span>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-7 mb-2 flex items-baseline justify-between">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">{children}</h2>
      {aside}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">{children}</p>
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-line/40" />
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
        <p key={t.id} role="alert" className="rounded-2xl bg-ink px-4 py-3 text-[14px] text-canvas shadow-lg">
          {t.text}
        </p>
      ))}
    </div>
  )
}
