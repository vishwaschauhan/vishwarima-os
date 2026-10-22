import { TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { useEventRange } from '../data/live'
import { createEvent, deleteEvent, updateEvent, type EventInput } from '../data/mutations'
import { coverageGaps, expandEvents, formatMinutes, personConflicts, type Coverage, type FamilyEvent, type PersonId } from '../domain/agenda'
import { minutesOfDay, WEEKDAYS, weekdayOf, type Weekday } from '../domain/dates'
import { friendlyError } from '../lib/errors'
import { Button, ErrorText, Field } from './ui'
import { Segmented, Sheet } from './bits'
import { EVENT_TYPES, useEventTitle } from './eventLabels'
import { TextArea } from './TaskSheet'

export type EventSheetMode =
  | { kind: 'new'; date: string; busy?: boolean; title?: string; notes?: string; start?: string; end?: string; who?: 'vishwas' | 'garima' | 'both' }
  | { kind: 'edit'; event: FamilyEvent }

export function EventSheet({ mode, onClose }: { mode: EventSheetMode | null; onClose: () => void }) {
  const title = mode?.kind === 'edit' ? 'Edit event' : mode?.busy ? 'Busy time' : 'New event'
  return (
    <Sheet open={mode !== null} onClose={onClose} title={title}>
      {mode && <EventForm key={mode.kind === 'edit' ? mode.event.id : 'new'} mode={mode} onDone={onClose} />}
    </Sheet>
  )
}

const DAY_LABEL: Record<Weekday, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' }

function EventForm({ mode, onDone }: { mode: EventSheetMode; onDone: () => void }) {
  const { actor, myId, user, privateDetails, household } = useHousehold()
  const existing = mode.kind === 'edit' ? mode.event : undefined
  const details = existing ? privateDetails.get(existing.id) : undefined
  const isOwner = !existing || existing.ownerUid === user.uid
  const busyDefault = mode.kind === 'new' ? Boolean(mode.busy) : false

  const preset = mode.kind === 'new' ? mode : undefined
  const [title, setTitle] = useState(details?.title ?? (existing?.visibility === 'private' ? '' : (existing?.title ?? preset?.title ?? '')))
  const [type, setType] = useState<FamilyEvent['type']>(existing && existing.type !== 'busy' ? existing.type : busyDefault ? 'gym' : 'appointment')
  const [date, setDate] = useState(existing?.date ?? (mode.kind === 'new' ? mode.date : ''))
  const [allDay, setAllDay] = useState(existing ? !existing.start : false)
  const [start, setStart] = useState(existing?.start ?? preset?.start ?? (busyDefault ? '17:30' : '09:00'))
  const [end, setEnd] = useState(existing?.end ?? preset?.end ?? (busyDefault ? '19:00' : '10:00'))
  // A new event defaults to the signed-in member, who may not be known yet on first render.
  const [chosenWho, setWho] = useState<'vishwas' | 'garima' | 'both' | null>(
    existing ? (existing.participants.length === 2 ? 'both' : (existing.participants[0] ?? 'both')) : (preset?.who ?? null),
  )
  const who = chosenWho ?? myId ?? 'both'
  const [busy, setBusyFlag] = useState(existing?.busy ?? true)
  const [visibility, setVisibility] = useState<FamilyEvent['visibility']>(existing?.visibility ?? 'shared')
  const [coverage, setCoverage] = useState<Coverage>(existing?.coverage ?? 'unassigned')
  const [repeat, setRepeat] = useState<FamilyEvent['recurrence']['type']>(existing?.recurrence.type ?? 'none')
  const [days, setDays] = useState<Weekday[]>(
    existing?.recurrence.type === 'weekly' ? existing.recurrence.days : date ? [weekdayOf(date)] : [],
  )
  const [until, setUntil] = useState(existing && existing.recurrence.type !== 'none' ? (existing.recurrence.until ?? '') : '')
  const [location, setLocation] = useState(details?.location ?? existing?.location ?? '')
  const [notes, setNotes] = useState(details?.notes ?? existing?.notes ?? preset?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const participants: PersonId[] = who === 'both' ? ['vishwas', 'garima'] : [who]
  // A private block is a personal busy time: only for yourself.
  const canBePrivate = isOwner && myId !== undefined && who === myId
  const isPrivate = visibility === 'private' && canBePrivate

  // Live overlap and coverage warnings against what's already on that day. Saving is still allowed.
  const range = useEventRange(household.id, date || '0000-00-00', date || '0000-00-00')
  const draft: FamilyEvent = {
    id: existing?.id ?? '__draft__',
    title: title || 'This event',
    type,
    date,
    start: allDay ? null : start,
    end: allDay ? null : end,
    participants,
    busy,
    visibility: isPrivate ? 'private' : 'shared',
    coverage,
    recurrence: { type: 'none' },
    ownerUid: existing?.ownerUid ?? user.uid,
    createdBy: existing?.createdBy ?? user.uid,
  }
  const others = range.events.filter((e) => e.id !== draft.id)
  const instances = date ? expandEvents([...others, draft], date, date) : []
  const eventTitle = useEventTitle()
  const conflicts = participants.flatMap((p) => personConflicts(instances, p)).filter((o) => o.events.includes(draft))
  const gaps = coverageGaps(instances).filter((g) => g.events.includes(draft) || g.events.some((e) => e.id === draft.id))

  function input(): EventInput {
    return {
      title: title.trim(),
      type: isPrivate ? 'busy' : type,
      date,
      start: allDay ? null : start,
      end: allDay ? null : end,
      participants,
      busy,
      visibility: isPrivate ? 'private' : 'shared',
      coverage,
      recurrence:
        repeat === 'none'
          ? { type: 'none' }
          : repeat === 'daily'
            ? { type: 'daily', until: until || null }
            : { type: 'weekly', days, until: until || null },
      location: location.trim(),
      notes: notes.trim(),
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give it a title.')
    if (!date) return setError('Pick a date.')
    if (!allDay && (!start || !end || minutesOfDay(end) <= minutesOfDay(start))) return setError('The end time must be after the start time.')
    if (repeat === 'weekly' && days.length === 0) return setError('Pick at least one day.')
    setSaving(true)
    setError('')
    try {
      // Don't wait for the server: the change is already on this device and syncs later.
      if (existing) background(updateEvent(actor, existing, input()))
      else background(createEvent(actor, input()))
      onDone()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={isPrivate ? 'Title (only you see this)' : 'Title'} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />

      <div>
        <span className="mb-1.5 block text-sm text-ink-muted">Who</span>
        <Segmented
          label="Who"
          value={who}
          options={[
            { value: 'vishwas', label: 'Vishwas' },
            { value: 'garima', label: 'Garima' },
            { value: 'both', label: 'Both' },
          ]}
          onChange={setWho}
        />
      </div>

      {canBePrivate && (
        <div>
          <span className="mb-1.5 block text-sm text-ink-muted">Your partner sees</span>
          <Segmented
            label="Your partner sees"
            value={visibility}
            options={[
              { value: 'shared', label: 'All details' },
              { value: 'private', label: 'Just “Busy”' },
            ]}
            onChange={setVisibility}
          />
        </div>
      )}

      {!isPrivate && (
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-muted">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FamilyEvent['type'])}
            className="min-h-11 w-full rounded-2xl border border-line bg-surface px-3 text-[16px]"
          >
            {EVENT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}

      <Field label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />

      <label className="flex min-h-11 items-center justify-between">
        <span className="text-[15px]">All day</span>
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
      </label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          <Field label="End" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      )}

      <label className="flex min-h-11 items-center justify-between">
        <span className="text-[15px]">Blocks time (busy)</span>
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={busy} onChange={(e) => setBusyFlag(e.target.checked)} />
      </label>

      <div>
        <span className="mb-1.5 block text-sm text-ink-muted">Kids are with</span>
        <Segmented
          label="Childcare coverage"
          value={coverage}
          options={[
            { value: 'unassigned', label: 'Not set' },
            { value: 'vishwas', label: 'Vishwas' },
            { value: 'garima', label: 'Garima' },
            { value: 'both', label: 'Both' },
          ]}
          onChange={setCoverage}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm text-ink-muted">Repeats</span>
        <Segmented
          label="Repeats"
          value={repeat}
          options={[
            { value: 'none', label: 'Once' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
          ]}
          onChange={setRepeat}
        />
        {repeat === 'weekly' && (
          <div className="mt-2 flex justify-between gap-1">
            {WEEKDAYS.map((d) => (
              <button
                type="button"
                key={d}
                aria-pressed={days.includes(d)}
                aria-label={d}
                onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                className={`press size-11 rounded-full text-sm font-semibold ${days.includes(d) ? 'bg-primary text-on-primary' : 'bg-line/60 text-ink-muted'}`}
              >
                {DAY_LABEL[d]}
              </button>
            ))}
          </div>
        )}
        {repeat !== 'none' && (
          <div className="mt-3">
            <Field label="Until (optional)" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        )}
      </div>

      <Field label="Location (optional)" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />

      {(conflicts.length > 0 || gaps.length > 0) && (
        <div className="space-y-1 rounded-xl bg-garima/50 px-3.5 py-3 text-[13px] text-garima-ink" role="status">
          {conflicts.map((c, i) => {
            const other = c.events.find((e) => e !== draft)!
            return (
              <p key={`c${i}`} className="flex gap-1.5">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
                Overlaps “{eventTitle(other)}” ({formatMinutes(c.start)} – {formatMinutes(c.end)}). You can still save it.
              </p>
            )
          })}
          {gaps.map((g, i) => (
            <p key={`g${i}`} className="flex gap-1.5">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              You’re both busy {formatMinutes(g.start)} – {formatMinutes(g.end)}. Set who has the kids.
            </p>
          ))}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={saving}>
          {existing ? 'Save' : 'Add to calendar'}
        </Button>
        {existing && (existing.visibility === 'shared' || isOwner) && (
          <Button type="button" variant="secondary" onClick={() => { background(deleteEvent(actor, existing)); onDone() }}>
            Delete
          </Button>
        )}
      </div>
    </form>
  )
}
