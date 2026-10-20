import { CalendarPlus, CircleSlash, ListPlus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { useAgenda } from '../app/useAgenda'
import { OwnerFilterBar, SectionTitle, Skeleton, StepNav } from '../components/bits'
import { DayAgenda } from '../components/DayAgenda'
import { EventSheet, type EventSheetMode } from '../components/EventSheet'
import { TaskSheet, type TaskSheetMode } from '../components/TaskSheet'
import { ErrorText } from '../components/ui'
import { dayProgress, type OwnerFilter } from '../domain/agenda'
import { addDays, isLocalDate } from '../domain/dates'
import { longDate } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { useStoredState } from '../app/useStoredState'


export function Today() {
  const { today, timezone, myId } = useHousehold()
  const [params, setParams] = useSearchParams()
  const date = isLocalDate(params.get('d') ?? '') ? params.get('d')! : today
  const setDate = (d: string) => setParams(d === today ? {} : { d }, { replace: true })
  const [filter, setFilter] = useStoredState<OwnerFilter>('today.filter', 'everyone')
  const [taskSheet, setTaskSheet] = useState<TaskSheetMode | null>(null)
  const [eventSheet, setEventSheet] = useState<EventSheetMode | null>(null)

  const tomorrow = addDays(date, 1)
  const { tasks, instances, undated, loading, error } = useAgenda(date, tomorrow)
  const progress = dayProgress(tasks, date)
  const tomorrowTasks = tasks.filter((t) => t.occ.date === tomorrow && t.occ.kind === 'task' && !t.occ.optional)
  const tomorrowEvents = instances.filter((i) => i.date === tomorrow)

  const relative = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : null

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">{relative ?? longDate(date, timezone, { weekday: 'long' })}</p>
          <h1 className="font-serif text-[30px] leading-tight tracking-tight">{longDate(date, timezone, { month: 'long', day: 'numeric' })}</h1>
        </div>
        <StepNav label="Change day" prevLabel="Previous day" nextLabel="Next day" onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))}>
          {date !== today && (
            <button onClick={() => setDate(today)} className="ml-1 min-h-9 rounded-full bg-ink px-3.5 text-[13px] font-medium text-canvas">
              Today
            </button>
          )}
        </StepNav>
      </div>

      {progress.total > 0 && (
        <div className="mt-4" aria-label={`${progress.done} of ${progress.total} done`}>
          <div className="h-1.5 overflow-hidden rounded-full bg-line/70">
            <div className="h-full rounded-full bg-sage-ink/70 transition-all duration-500" style={{ width: `${(100 * progress.done) / progress.total}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {progress.done} of {progress.total} done
          </p>
        </div>
      )}

      <div className="mt-4">
        <OwnerFilterBar value={filter} onChange={setFilter} myId={myId} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <QuickAdd icon={<ListPlus size={18} />} label="Task" onClick={() => setTaskSheet({ kind: 'new', date })} />
        <QuickAdd icon={<CalendarPlus size={18} />} label="Event" onClick={() => setEventSheet({ kind: 'new', date })} />
        <QuickAdd icon={<CircleSlash size={18} />} label="Busy time" onClick={() => setEventSheet({ kind: 'new', date, busy: true })} />
      </div>

      <div className="mt-5">
        <ErrorText>{error && friendlyError(error)}</ErrorText>
        {loading && tasks.length === 0 ? (
          <Skeleton rows={4} />
        ) : (
          <DayAgenda
            date={date}
            tasks={tasks}
            instances={instances}
            undated={date === today ? undated : []}
            filters={{ owner: filter }}
            onEditTask={(item) => setTaskSheet({ kind: 'edit', item })}
            onOpenEvent={(event) => setEventSheet({ kind: 'edit', event })}
          />
        )}
      </div>

      <SectionTitle
        aside={
          <button onClick={() => setDate(tomorrow)} className="text-[13px] font-medium text-ink-muted underline-offset-2 hover:underline">
            Open
          </button>
        }
      >
        {date === today ? 'Tomorrow' : 'Next day'}
      </SectionTitle>
      <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-[14px] text-ink-muted">
        {tomorrowTasks.length === 0 && tomorrowEvents.length === 0 ? (
          'Nothing planned.'
        ) : (
          <>
            {tomorrowTasks.length} {tomorrowTasks.length === 1 ? 'task' : 'tasks'}
            {tomorrowEvents.length > 0 && `, ${tomorrowEvents.length} ${tomorrowEvents.length === 1 ? 'event' : 'events'}`}
            {': '}
            {[...tomorrowTasks.slice(0, 3).map((t) => t.occ.title)].join(', ')}
            {tomorrowTasks.length > 3 ? '…' : ''}
          </>
        )}
      </div>

      <TaskSheet mode={taskSheet} onClose={() => setTaskSheet(null)} />
      <EventSheet mode={eventSheet} onClose={() => setEventSheet(null)} />
    </div>
  )
}

export function QuickAdd({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[14px] font-medium transition hover:border-ink-muted"
    >
      <span className="text-ink-muted" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  )
}
