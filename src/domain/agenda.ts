import { addDays, minutesOfDay, weekdayOf, type LocalDate, type Weekday } from './dates'
import { isOverdue, occurrenceKey, sortMinutes, type Occurrence } from './occurrences'
import type { Owner, TaskTime } from './plan'

export type PersonId = 'vishwas' | 'garima'
export type Priority = 'low' | 'normal' | 'high'

/** Completion record for one occurrence (`taskStates/{key}`). */
export interface TaskState {
  key: string
  completed: boolean
  completedBy?: string | null
  completedAt?: Date | null
  skipped?: boolean
  /** Subtask id → done. A shared parent is complete when either member completes it. */
  subtasks?: Record<string, { done: boolean; by?: string }>
  /** The assignee's response to a task assigned to them. */
  response?: 'accepted' | 'discuss' | null
  /** True while the write is only on this device. */
  pending?: boolean
}

/** "This occurrence only" change (`taskOverrides/{key}`). Never rewrites the plan. */
export interface TaskOverride {
  key: string
  owner?: Owner
  assignedBy?: string
  time?: TaskTime | null
  /** Snooze or move: the occurrence shows on this date instead. */
  movedTo?: LocalDate | null
  /** Turns on an optional task for its day, so it can become overdue. */
  activated?: boolean
  title?: string
  notes?: string
  subtaskOwners?: Record<string, Owner>
}

export type AdHocRecurrence = { type: 'none' } | { type: 'daily' } | { type: 'weekly'; days: Weekday[] }

/** A task created in the app (`adHocTasks/{id}`). */
export interface AdHocTask {
  id: string
  title: string
  details?: string
  owner: Owner
  priority: Priority
  /** First (or only) date; null for an unscheduled to-do. */
  date: LocalDate | null
  time?: TaskTime | null
  durationMinutes?: number | null
  recurrence: AdHocRecurrence
  /** Last date of a recurring task (set when it is ended or split for "this and future"). */
  until?: LocalDate | null
  checklist: { id: string; title: string; owner?: Owner }[]
  archived?: boolean
  createdBy: string
  assignedBy: string
}

export type EventType = 'appointment' | 'gym' | 'work' | 'kids' | 'outing' | 'school' | 'busy' | 'other'
export type Coverage = 'vishwas' | 'garima' | 'both' | 'unassigned'

export interface FamilyEvent {
  id: string
  title: string
  type: EventType
  date: LocalDate
  /** Absent for all-day events. */
  start?: string | null
  end?: string | null
  /** Adults taking part; busy events block their time. */
  participants: PersonId[]
  busy: boolean
  visibility: 'shared' | 'private'
  /** Who has the kids while this is happening. */
  coverage?: Coverage | null
  recurrence: { type: 'none' } | { type: 'daily'; until?: LocalDate | null } | { type: 'weekly'; days: Weekday[]; until?: LocalDate | null }
  location?: string | null
  notes?: string | null
  ownerUid: string
  createdBy: string
  updatedBy?: string
  pending?: boolean
}

export interface EventInstance {
  event: FamilyEvent
  date: LocalDate
}

// ---------------------------------------------------------------------------
// Ad-hoc tasks

export function adHocOccursOn(task: AdHocTask, date: LocalDate): boolean {
  if (task.archived || !task.date || date < task.date) return false
  if (task.until && date > task.until) return false
  switch (task.recurrence.type) {
    case 'none':
      return date === task.date
    case 'daily':
      return true
    case 'weekly':
      return task.recurrence.days.includes(weekdayOf(date))
  }
}

export function adHocOccurrence(task: AdHocTask, date: LocalDate | null): Occurrence {
  return {
    key: date ? occurrenceKey(task.id, date) : `${task.id}_undated_0`,
    taskId: task.id,
    planVersionId: 'adhoc',
    date: date ?? '',
    title: task.title,
    kind: 'task',
    owner: task.owner,
    category: 'adhoc',
    time: task.time ?? undefined,
    durationMinutes: task.durationMinutes ?? undefined,
    optional: false,
    notes: task.details,
    subtasks: task.checklist.map((c) => ({ id: c.id, title: c.title, owner: c.owner ?? 'unassigned' })),
  }
}

export function generateAdHocOccurrences(tasks: AdHocTask[], from: LocalDate, to: LocalDate): Occurrence[] {
  const out: Occurrence[] = []
  for (const task of tasks) {
    for (let d = task.date && task.date > from ? task.date : from; d <= to; d = addDays(d, 1)) {
      if (adHocOccursOn(task, d)) out.push(adHocOccurrence(task, d))
      if (task.recurrence.type === 'none') break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Agenda

export interface AgendaTask {
  occ: Occurrence
  /** The date it was generated for; differs from occ.date when moved or snoozed. */
  originalDate: LocalDate
  source: 'plan' | 'adhoc'
  priority: Priority
  state?: TaskState
  override?: TaskOverride
  assignedBy?: string
  completed: boolean
  overdue: boolean
}

export interface AgendaInput {
  planOccurrences: Occurrence[]
  adHoc: AdHocTask[]
  states: Map<string, TaskState>
  overrides: Map<string, TaskOverride>
  today: LocalDate
  firstUseDate?: LocalDate
}

/**
 * Merge plan and ad-hoc occurrences with their overrides and completion states.
 * `planOccurrences` should cover a little more than the visible range so tasks snoozed
 * from earlier days are found; the result is not filtered by date.
 */
export function buildAgenda(input: AgendaInput, from: LocalDate, to: LocalDate): AgendaTask[] {
  const adHocById = new Map(input.adHoc.map((t) => [t.id, t]))
  const all = [
    ...input.planOccurrences.map((occ) => ({ occ, source: 'plan' as const })),
    ...generateAdHocOccurrences(input.adHoc, addDays(from, -14), to).map((occ) => ({ occ, source: 'adhoc' as const })),
  ]
  const out: AgendaTask[] = []
  for (const { occ: base, source } of all) {
    const override = input.overrides.get(base.key)
    const occ = applyOverride(base, override)
    if (occ.date < from || occ.date > to) continue
    const state = input.states.get(base.key)
    const completed = Boolean(state?.completed)
    const adHoc = source === 'adhoc' ? adHocById.get(base.taskId) : undefined
    out.push({
      occ,
      originalDate: base.date,
      source,
      priority: adHoc?.priority ?? 'normal',
      state,
      override,
      assignedBy: override?.assignedBy ?? adHoc?.assignedBy,
      completed,
      overdue: isOverdue(occ, {
        today: input.today,
        firstUseDate: input.firstUseDate,
        completed,
        skipped: state?.skipped,
        activated: override?.activated,
      }),
    })
  }
  return out.sort(compareAgendaTasks)
}

export function applyOverride(occ: Occurrence, override?: TaskOverride): Occurrence {
  if (!override) return occ
  return {
    ...occ,
    date: override.movedTo ?? occ.date,
    owner: override.owner ?? occ.owner,
    title: override.title ?? occ.title,
    notes: override.notes ?? occ.notes,
    time: override.time === null ? undefined : (override.time ?? occ.time),
    subtasks: occ.subtasks.map((s) => ({ ...s, owner: override.subtaskOwners?.[s.id] ?? s.owner })),
  }
}

function compareAgendaTasks(a: AgendaTask, b: AgendaTask): number {
  if (a.occ.date !== b.occ.date) return a.occ.date < b.occ.date ? -1 : 1
  const am = sortMinutes(a.occ.time) ?? Infinity
  const bm = sortMinutes(b.occ.time) ?? Infinity
  if (am !== bm) return am - bm
  const pr = { high: 0, normal: 1, low: 2 }
  if (a.priority !== b.priority) return pr[a.priority] - pr[b.priority]
  return a.occ.title.localeCompare(b.occ.title)
}

/** Unscheduled ad-hoc to-dos that are still open (or completed on `today`, so they don't vanish). */
export function undatedTasks(adHoc: AdHocTask[], states: Map<string, TaskState>): AgendaTask[] {
  return adHoc
    .filter((t) => !t.archived && !t.date)
    .map((t) => {
      const occ = adHocOccurrence(t, null)
      const state = states.get(occ.key)
      return {
        occ,
        originalDate: '',
        source: 'adhoc' as const,
        priority: t.priority,
        state,
        assignedBy: t.assignedBy,
        completed: Boolean(state?.completed),
        overdue: false,
      }
    })
}

// ---------------------------------------------------------------------------
// Filters

export type OwnerFilter = 'everyone' | 'mine' | PersonId

/** "Mine" and a person's filter include tasks owned by both. */
export function matchesOwner(owner: Owner, filter: OwnerFilter, me?: PersonId): boolean {
  if (filter === 'everyone') return true
  const person = filter === 'mine' ? me : filter
  return owner === person || owner === 'both'
}

export function eventMatchesOwner(event: FamilyEvent, filter: OwnerFilter, me?: PersonId): boolean {
  if (filter === 'everyone') return true
  const person = filter === 'mine' ? me : filter
  return Boolean(person && event.participants.includes(person)) || event.participants.length === 0
}

// ---------------------------------------------------------------------------
// Events, overlaps and childcare coverage

export function eventOccursOn(event: FamilyEvent, date: LocalDate): boolean {
  const r = event.recurrence
  if (date < event.date) return false
  if (r.type === 'none') return date === event.date
  if (r.until && date > r.until) return false
  return r.type === 'daily' || r.days.includes(weekdayOf(date))
}

export function expandEvents(events: FamilyEvent[], from: LocalDate, to: LocalDate): EventInstance[] {
  const out: EventInstance[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const event of events) if (eventOccursOn(event, d)) out.push({ event, date: d })
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.event.start ?? '').localeCompare(b.event.start ?? '') ||
      a.event.title.localeCompare(b.event.title),
  )
}

interface Interval {
  start: number
  end: number
}

function interval(e: FamilyEvent): Interval {
  // All-day events span the whole day.
  if (!e.start) return { start: 0, end: 24 * 60 }
  const start = minutesOfDay(e.start)
  const end = e.end ? minutesOfDay(e.end) : start + 60
  return { start, end: Math.max(end, start + 1) }
}

export interface Overlap {
  start: number
  end: number
  events: FamilyEvent[]
}

/** Pairs of one person's busy events on the same day that overlap in time. */
export function personConflicts(instances: EventInstance[], person: PersonId): Overlap[] {
  const mine = instances.filter((i) => i.event.busy && i.event.participants.includes(person)).map((i) => i.event)
  const out: Overlap[] = []
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      const a = interval(mine[i])
      const b = interval(mine[j])
      const start = Math.max(a.start, b.start)
      const end = Math.min(a.end, b.end)
      if (start < end) out.push({ start, end, events: [mine[i], mine[j]] })
    }
  }
  return out
}

/**
 * Times on one day when both adults are busy and none of the overlapping events says
 * who has the kids. Only flags the gap; it never assigns anyone.
 */
export function coverageGaps(instances: EventInstance[]): Overlap[] {
  const busy = instances.filter((i) => i.event.busy).map((i) => i.event)
  const v = busy.filter((e) => e.participants.includes('vishwas'))
  const g = busy.filter((e) => e.participants.includes('garima'))
  const gaps: Overlap[] = []
  for (const a of v) {
    for (const b of g) {
      const ia = interval(a)
      const ib = interval(b)
      const start = Math.max(ia.start, ib.start)
      const end = Math.min(ia.end, ib.end)
      if (start >= end) continue
      const events = a === b ? [a] : [a, b]
      const covered = events.some((e) => e.coverage && e.coverage !== 'unassigned')
      if (!covered) gaps.push({ start, end, events })
    }
  }
  return gaps
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24
  const min = m % 60
  return `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function formatTime(t: string): string {
  return formatMinutes(minutesOfDay(t))
}

export function timeLabel(time?: TaskTime): string {
  if (!time) return 'Anytime'
  if ('slot' in time) return time.slot[0].toUpperCase() + time.slot.slice(1)
  return time.end ? `${formatTime(time.start)} – ${formatTime(time.end)}` : formatTime(time.start)
}

/** Tasks that count toward a day's progress: not skipped, and optional ones only when needed or done. */
export function dayProgress(tasks: AgendaTask[], date: string): { done: number; total: number } {
  const counted = tasks.filter((t) => t.occ.date === date && t.occ.kind === 'task' && !t.state?.skipped && (!t.occ.optional || t.override?.activated || t.completed))
  return { done: counted.filter((t) => t.completed).length, total: counted.length }
}
