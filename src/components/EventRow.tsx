import { CalendarClock, Lock, MapPin, TriangleAlert } from 'lucide-react'
import { useHousehold } from '../app/household'
import type { EventInstance, FamilyEvent } from '../domain/agenda'
import { eventTimeLabel, TYPE_LABEL, useEventTitle } from './eventLabels'
import { OwnerBadge } from './bits'
import { shortDate } from '../lib/format'

export function EventRow({
  instance,
  onOpen,
  warning,
  showDate = false,
}: {
  instance: EventInstance
  onOpen?: (e: FamilyEvent) => void
  warning?: string
  showDate?: boolean
}) {
  const { user, privateDetails } = useHousehold()
  const title = useEventTitle()
  const e = instance.event
  const mine = e.ownerUid === user.uid
  const editable = e.visibility === 'shared' || mine
  const details = e.visibility === 'private' && mine ? privateDetails.get(e.id) : undefined
  const location = details?.location || e.location
  const Tag = editable && onOpen ? 'button' : 'div'

  return (
    <Tag
      {...(Tag === 'button' ? { onClick: () => onOpen?.(e) } : {})}
      className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left ${
        e.busy ? 'bg-[repeating-linear-gradient(135deg,var(--line)_0_1px,transparent_1px_8px)] ring-1 ring-line ring-inset' : 'bg-sage/60'
      }`}
    >
      <span className="mt-0.5 shrink-0 text-ink-muted" aria-hidden>
        {e.visibility === 'private' ? <Lock size={18} /> : <CalendarClock size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-snug font-medium">{title(e)}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-muted">
          {showDate && <span>{shortDate(instance.date)}</span>}
          <span>{eventTimeLabel(e)}</span>
          <span>{e.visibility === 'private' ? (mine ? 'Private · partner sees “Busy”' : 'Private') : TYPE_LABEL[e.type]}</span>
          {e.busy && <span>Busy</span>}
          {e.recurrence.type !== 'none' && <span>Repeats</span>}
          {location && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin size={12} aria-hidden />
              {location}
            </span>
          )}
          {e.coverage && e.coverage !== 'unassigned' && <span>Kids with {e.coverage === 'both' ? 'both' : e.coverage === 'vishwas' ? 'Vishwas' : 'Garima'}</span>}
          {e.pending && <span className="italic">Saving…</span>}
        </span>
        {warning && (
          <span className="mt-1 flex items-center gap-1 text-[13px] font-medium text-danger">
            <TriangleAlert size={13} aria-hidden /> {warning}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {e.participants.length === 2 ? <OwnerBadge owner="both" /> : e.participants.map((p) => <OwnerBadge key={p} owner={p} />)}
      </span>
    </Tag>
  )
}
