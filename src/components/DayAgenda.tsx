import { TriangleAlert } from 'lucide-react'
import { useHousehold } from '../app/household'
import {
  coverageGaps,
  eventMatchesOwner,
  formatMinutes,
  matchesOwner,
  personConflicts,
  type AgendaTask,
  type EventInstance,
  type FamilyEvent,
  type OwnerFilter,
} from '../domain/agenda'
import { localDateAt, minutesOfDay } from '../domain/dates'
import { sortMinutes } from '../domain/occurrences'
import { Empty, SectionTitle } from './bits'
import { EventRow } from './EventRow'
import { useEventTitle } from './eventLabels'
import { TaskRow } from './TaskRow'

export type KindFilter = 'all' | 'tasks' | 'events'
export type StatusFilter = 'all' | 'open' | 'done'

export interface DayFilters {
  owner: OwnerFilter
  kind?: KindFilter
  status?: StatusFilter
}

type Entry = { at: number; task?: AgendaTask; event?: EventInstance }

/** One day's tasks and events in time order, with unscheduled tasks after and coverage warnings on top. */
export function DayAgenda({
  date,
  tasks,
  instances,
  undated = [],
  filters,
  onEditTask,
  onOpenEvent,
}: {
  date: string
  tasks: AgendaTask[]
  instances: EventInstance[]
  undated?: AgendaTask[]
  filters: DayFilters
  onEditTask: (t: AgendaTask) => void
  onOpenEvent: (e: FamilyEvent) => void
}) {
  const { myId, timezone, today } = useHousehold()
  const eventTitle = useEventTitle()
  const kind = filters.kind ?? 'all'
  const status = filters.status ?? 'all'

  const dayTasks = tasks.filter(
    (t) =>
      t.occ.date === date &&
      kind !== 'events' &&
      matchesOwner(t.occ.owner, filters.owner, myId) &&
      (status === 'all' || (status === 'done' ? t.completed : !t.completed)),
  )
  const allDayEvents = instances.filter((i) => i.date === date)
  const dayEvents = allDayEvents.filter((i) => kind !== 'tasks' && status !== 'done' && eventMatchesOwner(i.event, filters.owner, myId))
  // Finished to-dos stay visible (crossed off) for the rest of the day they were done.
  const todo = undated.filter((t) => (!t.completed || (t.state?.completedAt && localDateAt(t.state.completedAt, timezone) === today)) && kind !== 'events' && matchesOwner(t.occ.owner, filters.owner, myId) && (status === 'all' || (status === 'done' ? t.completed : !t.completed)))

  const timed: Entry[] = [
    ...dayTasks.filter((t) => t.occ.time).map((t) => ({ at: sortMinutes(t.occ.time)!, task: t })),
    ...dayEvents.map((e) => ({ at: e.event.start ? minutesOfDay(e.event.start) : -1, event: e })),
  ].sort((a, b) => a.at - b.at)
  const unscheduled = dayTasks.filter((t) => !t.occ.time)

  // Warnings use every event that day, whatever the filter.
  const gaps = coverageGaps(allDayEvents)
  const conflicts = (['vishwas', 'garima'] as const).flatMap((p) => personConflicts(allDayEvents, p).map((c) => ({ ...c, person: p })))
  const warnFor = (e: FamilyEvent) =>
    conflicts.some((c) => c.events.includes(e)) ? 'Overlaps another event' : gaps.some((g) => g.events.includes(e)) ? 'Nobody set for the kids' : undefined

  return (
    <div>
      {gaps.length > 0 && (
        <div role="status" className="mb-3 space-y-1 rounded-2xl bg-garima/60 px-4 py-3 text-[14px] text-garima-ink">
          {gaps.map((g, i) => (
            <p key={i} className="flex gap-2">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                You’re both busy {formatMinutes(g.start)} – {formatMinutes(g.end)} ({g.events.map(eventTitle).join(' and ')}). Who has the kids?
              </span>
            </p>
          ))}
        </div>
      )}

      {timed.length === 0 && unscheduled.length === 0 && <Empty>Nothing here. Enjoy the space.</Empty>}

      <ul className="space-y-2">
        {timed.map((e) => (
          <li key={e.task ? e.task.occ.key : `${e.event!.event.id}-${e.event!.date}`}>
            {e.task ? (
              <TaskRow item={e.task} onEdit={onEditTask} />
            ) : (
              <EventRow instance={e.event!} onOpen={onOpenEvent} warning={warnFor(e.event!.event)} />
            )}
          </li>
        ))}
      </ul>

      {unscheduled.length > 0 && (
        <>
          <SectionTitle>Anytime today</SectionTitle>
          <ul className="space-y-2">
            {unscheduled.map((t) => (
              <li key={t.occ.key}>
                <TaskRow item={t} onEdit={onEditTask} />
              </li>
            ))}
          </ul>
        </>
      )}

      {todo.length > 0 && (
        <>
          <SectionTitle>To-dos</SectionTitle>
          <ul className="space-y-2">
            {todo.map((t) => (
              <li key={t.occ.key}>
                <TaskRow item={t} onEdit={onEditTask} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

