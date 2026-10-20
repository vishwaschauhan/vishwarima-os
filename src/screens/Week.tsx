import { CalendarClock, Lock } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { useAgenda } from '../app/useAgenda'
import { useStoredState } from '../app/useStoredState'
import { OwnerFilterBar, Segmented, Skeleton, StepNav } from '../components/bits'
import { OWNER_BAR } from '../components/owners'
import { DayAgenda, type KindFilter, type StatusFilter } from '../components/DayAgenda'
import { EventSheet, type EventSheetMode } from '../components/EventSheet'
import { useEventTitle } from '../components/eventLabels'
import { TaskSheet, type TaskSheetMode } from '../components/TaskSheet'
import { coverageGaps, dayProgress, eventMatchesOwner, matchesOwner, type OwnerFilter } from '../domain/agenda'
import { addDays, dateRange, isLocalDate, startOfWeek } from '../domain/dates'
import { longDate } from '../lib/format'

export function Week() {
  const { today, timezone, myId, versions } = useHousehold()
  const [params, setParams] = useSearchParams()
  const pilot = versions[0]?.plan.frontmatter.household.pilot
  const [pilotMode, setPilotMode] = useStoredState('week.pilot', false)
  const anchor = isLocalDate(params.get('d') ?? '') ? params.get('d')! : today
  const from = pilotMode && pilot ? pilot.start : startOfWeek(anchor)
  const to = pilotMode && pilot ? pilot.end : addDays(from, 6)
  const selected = anchor >= from && anchor <= to ? anchor : from
  const select = (d: string) => setParams(d === today ? {} : { d }, { replace: true })

  const [owner, setOwner] = useStoredState<OwnerFilter>('week.owner', 'everyone')
  const [kind, setKind] = useStoredState<KindFilter>('week.kind', 'all')
  const [status, setStatus] = useStoredState<StatusFilter>('week.status', 'all')
  const [taskSheet, setTaskSheet] = useState<TaskSheetMode | null>(null)
  const [eventSheet, setEventSheet] = useState<EventSheetMode | null>(null)
  const { tasks, instances, loading } = useAgenda(from, to)
  const eventTitle = useEventTitle()
  const days = dateRange(from, to)

  const visibleTasks = (d: string) =>
    tasks.filter(
      (t) =>
        t.occ.date === d &&
        kind !== 'events' &&
        matchesOwner(t.occ.owner, owner, myId) &&
        (status === 'all' || (status === 'done' ? t.completed : !t.completed)),
    )
  const visibleEvents = (d: string) =>
    instances.filter((i) => i.date === d && kind !== 'tasks' && status !== 'done' && eventMatchesOwner(i.event, owner, myId))

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">{pilotMode ? 'Pilot' : 'Week of'}</p>
          <h1 className="font-serif text-[28px] leading-tight tracking-tight">
            {longDate(from, timezone, { month: 'short', day: 'numeric' })} – {longDate(to, timezone, { month: 'short', day: 'numeric' })}
          </h1>
        </div>
        {!pilotMode && (
          <StepNav label="Change week" prevLabel="Previous week" nextLabel="Next week" onPrev={() => select(addDays(from, -7))} onNext={() => select(addDays(from, 7))}>
            {(today < from || today > to) && (
              <button onClick={() => select(today)} className="ml-1 min-h-9 rounded-full bg-ink px-3.5 text-[13px] font-medium text-canvas">
                Today
              </button>
            )}
          </StepNav>
        )}
      </div>

      {pilot && (
        <label className="mt-3 flex min-h-11 items-center justify-between rounded-2xl border border-line bg-surface px-4">
          <span className="text-[14px]">Show both pilot weeks</span>
          <input type="checkbox" className="size-5 accent-[var(--ink)]" checked={pilotMode} onChange={(e) => setPilotMode(e.target.checked)} />
        </label>
      )}

      <div className="mt-3 space-y-2">
        <OwnerFilterBar value={owner} onChange={setOwner} myId={myId} />
        <div className="grid grid-cols-2 gap-2">
          <Segmented
            label="Show"
            value={kind}
            options={[
              { value: 'all', label: 'All' },
              { value: 'tasks', label: 'Tasks' },
              { value: 'events', label: 'Events' },
            ]}
            onChange={setKind}
          />
          <Segmented
            label="Status"
            value={status}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'open', label: 'To do' },
              { value: 'done', label: 'Done' },
            ]}
            onChange={setStatus}
          />
        </div>
      </div>

      {/* Phones: a date strip plus the selected day's agenda. */}
      <div className="-mx-5 mt-4 overflow-x-auto px-5 lg:hidden">
        <div className="flex gap-1.5" role="tablist" aria-label="Days">
          {days.map((d) => {
            const p = dayProgress(tasks, d)
            const hasGap = coverageGaps(instances.filter((i) => i.date === d)).length > 0
            const isSel = d === selected
            return (
              <button
                key={d}
                role="tab"
                aria-selected={isSel}
                aria-label={longDate(d, timezone)}
                onClick={() => select(d)}
                className={`flex min-w-[46px] flex-1 flex-col items-center rounded-2xl py-2 transition ${
                  isSel ? 'bg-ink text-canvas' : d === today ? 'bg-surface ring-1 ring-ink/40' : 'bg-surface ring-1 ring-line'
                }`}
              >
                <span className={`text-[11px] font-medium uppercase ${isSel ? 'text-canvas/70' : 'text-ink-muted'}`}>
                  {longDate(d, timezone, { weekday: 'narrow' })}
                </span>
                <span className="text-[17px] font-semibold">{Number(d.slice(8))}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {p.total > 0 && <span className={`size-1.5 rounded-full ${p.done === p.total ? 'bg-sage-ink' : isSel ? 'bg-canvas/60' : 'bg-ink-muted/50'}`} />}
                  {hasGap && <span className="size-1.5 rounded-full bg-danger" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5 lg:hidden">
        <h2 className="mb-3 text-[17px] font-semibold">{longDate(selected, timezone)}</h2>
        {loading && tasks.length === 0 ? (
          <Skeleton />
        ) : (
          <DayAgenda
            date={selected}
            tasks={tasks}
            instances={instances}
            filters={{ owner, kind, status }}
            onEditTask={(item) => setTaskSheet({ kind: 'edit', item })}
            onOpenEvent={(event) => setEventSheet({ kind: 'edit', event })}
          />
        )}
      </div>

      {/* Desktop: seven columns per week. */}
      <div className="mt-5 hidden lg:grid lg:grid-cols-7 lg:gap-2">
        {days.map((d) => {
          const p = dayProgress(tasks, d)
          return (
            <section key={d} className={`min-h-48 rounded-2xl border p-2 ${d === today ? 'border-ink/40 bg-surface' : 'border-line bg-surface/70'}`}>
              <button onClick={() => select(d)} className="mb-2 w-full px-1 text-left">
                <span className="block text-[11px] font-medium text-ink-muted uppercase">{longDate(d, timezone, { weekday: 'short' })}</span>
                <span className="text-[18px] font-semibold">{Number(d.slice(8))}</span>
                {p.total > 0 && (
                  <span className="ml-2 text-[11px] text-ink-muted">
                    {p.done}/{p.total}
                  </span>
                )}
              </button>
              <ul className="space-y-1">
                {visibleEvents(d).map((i) => (
                  <li key={`${i.event.id}-${d}`}>
                    <button
                      onClick={() => setEventSheet({ kind: 'edit', event: i.event })}
                      className="flex w-full items-start gap-1 rounded-lg bg-sage/60 px-1.5 py-1 text-left text-[12px] leading-tight"
                    >
                      {i.event.visibility === 'private' ? <Lock size={11} className="mt-0.5 shrink-0" /> : <CalendarClock size={11} className="mt-0.5 shrink-0" />}
                      <span>
                        {i.event.start ? `${i.event.start} ` : ''}
                        {eventTitle(i.event)}
                      </span>
                    </button>
                  </li>
                ))}
                {visibleTasks(d)
                  .filter((t) => t.occ.kind === 'task')
                  .map((t) => (
                    <li key={t.occ.key}>
                      <button
                        onClick={() => setTaskSheet({ kind: 'edit', item: t })}
                        className={`relative w-full overflow-hidden rounded-lg bg-canvas py-1 pr-1.5 pl-2.5 text-left text-[12px] leading-tight ${
                          t.completed ? 'text-ink-muted line-through' : ''
                        } ${t.overdue ? 'text-danger' : ''}`}
                      >
                        <span className={`absolute inset-y-0 left-0 w-1 ${OWNER_BAR[t.occ.owner]}`} />
                        {t.occ.title}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )
        })}
      </div>
      <div className="mt-6 hidden lg:block">
        <h2 className="mb-3 text-[17px] font-semibold">{longDate(selected, timezone)}</h2>
        <DayAgenda
          date={selected}
          tasks={tasks}
          instances={instances}
          filters={{ owner, kind, status }}
          onEditTask={(item) => setTaskSheet({ kind: 'edit', item })}
          onOpenEvent={(event) => setEventSheet({ kind: 'edit', event })}
        />
      </div>

      <TaskSheet mode={taskSheet} onClose={() => setTaskSheet(null)} />
      <EventSheet mode={eventSheet} onClose={() => setEventSheet(null)} />
    </div>
  )
}
