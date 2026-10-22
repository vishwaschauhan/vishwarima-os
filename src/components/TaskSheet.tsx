import { useState, type FormEvent } from 'react'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { archiveAdHoc, clearOverride, createAdHoc, setOverride, splitAdHoc, updateAdHoc, type AdHocInput } from '../data/mutations'
import { applyPlanVersion, nextVersionId } from '../data/plans'
import type { AdHocRecurrence, AgendaTask, Priority } from '../domain/agenda'
import { isLocalTime, minutesOfDay, WEEKDAYS, type Weekday } from '../domain/dates'
import { versionForDate } from '../domain/occurrences'
import { serializePlan, type Owner, type TaskTime } from '../domain/plan'
import { friendlyError } from '../lib/errors'
import { Button, ErrorText, Field } from './ui'
import { Segmented, Sheet } from './bits'

export type TaskSheetMode = { kind: 'new'; date: string | null } | { kind: 'edit'; item: AgendaTask }

const OWNERS: { value: Owner; label: string }[] = [
  { value: 'vishwas', label: 'Vishwas' },
  { value: 'garima', label: 'Garima' },
  { value: 'both', label: 'Both' },
  { value: 'unassigned', label: 'Anyone' },
]

const DAY_LABEL: Record<Weekday, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' }

export function TaskSheet({ mode, onClose }: { mode: TaskSheetMode | null; onClose: () => void }) {
  return (
    <Sheet open={mode !== null} onClose={onClose} title={mode?.kind === 'edit' ? 'Edit task' : 'New task'}>
      {mode && <TaskForm key={mode.kind === 'edit' ? mode.item.occ.key : 'new'} mode={mode} onDone={onClose} />}
    </Sheet>
  )
}

function TaskForm({ mode, onDone }: { mode: TaskSheetMode; onDone: () => void }) {
  const { actor, adHoc, versions, isAdmin, myId } = useHousehold()
  const item = mode.kind === 'edit' ? mode.item : undefined
  const source = adHoc.find((t) => t.id === item?.occ.taskId)
  const isPlan = item?.source === 'plan'
  const recurring = isPlan || (source ? source.recurrence.type !== 'none' : false)

  const time = item?.occ.time ?? source?.time ?? undefined
  const [title, setTitle] = useState(item?.occ.title ?? '')
  // New tasks default to the signed-in member, who may not be known yet on first render.
  const [chosenOwner, setOwner] = useState<Owner | null>(item?.occ.owner ?? null)
  const owner = chosenOwner ?? myId ?? 'unassigned'
  const [date, setDate] = useState<string>(item ? item.occ.date : (mode.kind === 'new' ? (mode.date ?? '') : ''))
  const [start, setStart] = useState(time && 'start' in time ? time.start : '')
  const [end, setEnd] = useState(time && 'start' in time ? (time.end ?? '') : '')
  const slot = time && 'slot' in time ? time : undefined
  const [notes, setNotes] = useState(item?.occ.notes ?? '')
  const [priority, setPriority] = useState<Priority>(source?.priority ?? 'normal')
  const [repeat, setRepeat] = useState<AdHocRecurrence['type']>(source?.recurrence.type ?? 'none')
  const [days, setDays] = useState<Weekday[]>(source?.recurrence.type === 'weekly' ? source.recurrence.days : [])
  const [checklist, setChecklist] = useState(source?.checklist.map((c) => c.title).join('\n') ?? '')
  const [scope, setScope] = useState<'one' | 'future'>('one')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function buildTime(): TaskTime | null | undefined {
    if (!start) return slot ?? null
    return end ? { start, end } : { start }
  }

  function validate(): string {
    if (!title.trim()) return 'Give the task a title.'
    if (start && !isLocalTime(start)) return 'Enter a valid start time.'
    if (end && (!start || minutesOfDay(end) <= minutesOfDay(start))) return 'The end time must be after the start time.'
    if (repeat !== 'none' && !date) return 'A repeating task needs a start date.'
    if (repeat === 'weekly' && days.length === 0) return 'Pick at least one day.'
    return ''
  }

  function adHocInput(): AdHocInput {
    const lines = checklist.split('\n').map((l) => l.trim()).filter(Boolean)
    const previous = source?.checklist ?? []
    return {
      title: title.trim(),
      details: notes.trim(),
      owner,
      priority,
      date: date || null,
      time: buildTime() ?? null,
      durationMinutes: null,
      recurrence: repeat === 'weekly' ? { type: 'weekly', days } : { type: repeat },
      until: source?.until ?? null,
      // Keep IDs of unchanged lines so their ticks survive edits.
      checklist: lines.map((l, i) => previous.find((p) => p.title === l) ?? { id: `c${Date.now().toString(36)}${i}`, title: l }),
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      // Local writes apply at once; don't hold the sheet open waiting for the server (or for
      // reconnection when offline). A rejected write shows as a toast.
      if (!item) {
        background(createAdHoc(actor, adHocInput()))
      } else if (scope === 'one' && recurring) {
        background(setOverride(
          actor,
          item,
          {
            title: title.trim(),
            // Only a real reassignment records who assigned it.
            ...(owner !== item.occ.owner ? { owner } : {}),
            notes: notes.trim(),
            time: buildTime() ?? null,
            movedTo: date && date !== item.originalDate ? date : null,
          },
          `${item.occ.title} on ${item.originalDate}: changed for that day`,
        ))
      } else if (isPlan) {
        // A plan version is checked by the server before it counts, so wait for it.
        await changePlanFromDate()
      } else if (source && recurring) {
        background(splitAdHoc(actor, source, item.occ.date, adHocInput()))
      } else if (source) {
        background(updateAdHoc(actor, source, adHocInput()))
      }
      onDone()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  /** "This and future" for a plan task: a new plan version effective from this occurrence's date. */
  async function changePlanFromDate() {
    if (!item) return
    const base = versionForDate(versions, item.originalDate)
    if (!base) throw new Error('No plan version applies to this date.')
    const plan = structuredClone(base.plan)
    const task = plan.frontmatter.tasks.find((t) => t.id === item.occ.taskId)
    if (!task) throw new Error('This task is no longer in the plan.')
    task.title = title.trim()
    task.owner = owner
    const t = buildTime()
    if (t) task.time = t
    else delete task.time
    if (notes.trim()) task.notes = notes.trim()
    else delete task.notes
    await applyPlanVersion(actor, nextVersionId(versions), serializePlan(plan), item.originalDate, `Changed “${task.title}”`)
  }

  const scopeOptions = [
    { value: 'one' as const, label: 'This day only' },
    { value: 'future' as const, label: 'This and future' },
  ]

  return (
    <form onSubmit={submit} className="space-y-4">
      {item && recurring && (
        <div>
          <Segmented label="Apply changes to" value={scope} options={scopeOptions} onChange={setScope} />
          {scope === 'future' && isPlan && !isAdmin && (
            <p className="mt-2 text-sm text-danger">Only a household admin can change the family plan.</p>
          )}
          {scope === 'future' && isPlan && isAdmin && (
            <p className="mt-2 text-[13px] text-ink-muted">Saves a new plan version from {item.originalDate}. Earlier days keep their history.</p>
          )}
        </div>
      )}

      <Field label="Title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />

      <div>
        <span className="mb-1.5 block text-sm text-ink-muted">Who</span>
        <Segmented label="Who" value={owner} options={OWNERS} onChange={setOwner} />
      </div>

      {!(item && recurring && scope === 'future') && (
        <Field
          label={item && recurring ? 'Date (move this one)' : 'Date (leave empty for a to-do)'}
          type="date"
          value={date}
          required={Boolean(item?.occ.date)}
          onChange={(e) => setDate(e.target.value)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={slot ? `Start (now: ${slot.slot})` : 'Start time'} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <Field label="End time" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      {(!item || (!isPlan && !(recurring && scope === 'one'))) && (
        <>
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
          </div>
          <div>
            <span className="mb-1.5 block text-sm text-ink-muted">Priority</span>
            <Segmented
              label="Priority"
              value={priority}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
              ]}
              onChange={setPriority}
            />
          </div>
          <TextArea label="Checklist (one step per line)" value={checklist} onChange={setChecklist} rows={3} />
        </>
      )}

      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />

      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={busy || (scope === 'future' && isPlan && !isAdmin)} className="flex-1">
          {item ? 'Save' : 'Add task'}
        </Button>
        {item?.override && scope === 'one' && (
          <Button type="button" variant="secondary" onClick={() => { background(clearOverride(actor, item)); onDone() }}>
            Undo changes
          </Button>
        )}
        {source && !recurring && (
          <Button type="button" variant="secondary" onClick={() => { background(archiveAdHoc(actor, source)); onDone() }}>
            Delete
          </Button>
        )}
        {source && recurring && scope === 'future' && (
          <Button type="button" variant="secondary" onClick={() => { background(archiveAdHoc(actor, source)); onDone() }}>
            Delete all
          </Button>
        )}
      </div>
    </form>
  )
}

export function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-muted">{label}</span>
      <textarea
        rows={rows}
        value={value}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-[16px] text-ink outline-none transition focus:border-teal-ink focus:ring-3 focus:ring-teal-ink/15"
      />
    </label>
  )
}
