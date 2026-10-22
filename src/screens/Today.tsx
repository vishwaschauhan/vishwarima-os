import { CalendarPlus, CircleSlash, ListPlus, Sunrise } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { useAgenda } from '../app/useAgenda'
import { OwnerFilterBar, SectionTitle, Skeleton, StepNav } from '../components/bits'
import { DayAgenda } from '../components/DayAgenda'
import { EventSheet, type EventSheetMode } from '../components/EventSheet'
import { TaskSheet, type TaskSheetMode } from '../components/TaskSheet'
import { ErrorText, Portrait } from '../components/ui'
import { MicButton } from '../components/AddMenu'
import { PageTitle, Sprig } from '../components/paint'
import { dayProgress, type OwnerFilter } from '../domain/agenda'
import { addDays, isLocalDate } from '../domain/dates'
import { longDate } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { useStoredState } from '../app/useStoredState'
import { useNow } from '../app/useNow'

export function Today() {
  const { today, timezone, myId, me } = useHousehold()
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
      {date === today && <Hero name={me?.displayName} timezone={timezone} />}
      <div className="flex items-end justify-between gap-2">
        <PageTitle eyebrow={relative ?? longDate(date, timezone, { weekday: 'long' })}>{longDate(date, timezone, { month: 'long', day: 'numeric' })}</PageTitle>
        <StepNav label="Change day" prevLabel="Previous day" nextLabel="Next day" onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))}>
          {date !== today && (
            <button onClick={() => setDate(today)} className="press ml-1 min-h-9 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-on-primary">
              Today
            </button>
          )}
        </StepNav>
      </div>

      {progress.total > 0 && (
        <div className="mt-4" aria-label={`${progress.done} of ${progress.total} done`}>
          <div className="h-2.5 overflow-hidden rounded-full bg-line/60 ring-1 ring-line ring-inset">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sage-ink/60 via-sage-ink/75 to-marigold transition-all duration-500"
              style={{ width: `${(100 * progress.done) / progress.total}%` }}
            />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">{progress.done}</span> of {progress.total} done
            {progress.done === progress.total && ' · lovely work'}
          </p>
        </div>
      )}

      <div className="mt-4">
        <OwnerFilterBar value={filter} onChange={setFilter} myId={myId} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <QuickAdd icon={<ListPlus size={16} />} label="Task" onClick={() => setTaskSheet({ kind: 'new', date })} />
        <QuickAdd icon={<CalendarPlus size={16} />} label="Event" tone="teal" onClick={() => setEventSheet({ kind: 'new', date })} />
        <QuickAdd icon={<CircleSlash size={16} />} label="Busy" tone="lavender" onClick={() => setEventSheet({ kind: 'new', date, busy: true })} />
        <MicButton />
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
      <div className="relative flex items-start gap-3 overflow-hidden rounded-card border border-line bg-surface/80 px-4 py-3.5 text-[14px] text-ink-muted shadow-paper">
        <span aria-hidden className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-marigold-wash text-primary">
          <Sunrise size={17} />
        </span>
        <p className="font-hand min-w-0 flex-1 pt-1 text-[15px]">
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
        </p>
      </div>

      <TaskSheet mode={taskSheet} onClose={() => setTaskSheet(null)} />
      <EventSheet mode={eventSheet} onClose={() => setEventSheet(null)} />
    </div>
  )
}

const QUICK_TONE = {
  coral: 'bg-coral/20 text-primary',
  teal: 'bg-teal text-teal-ink',
  lavender: 'bg-shared text-shared-ink',
}

export function QuickAdd({ icon, label, onClick, tone = 'coral' }: { icon: React.ReactNode; label: string; onClick: () => void; tone?: keyof typeof QUICK_TONE }) {
  return (
    <button
      onClick={onClick}
      className="press flex min-h-12 items-center justify-center gap-1.5 rounded-card border border-line bg-surface px-1 text-[14px] font-semibold shadow-paper hover:border-ink-muted/60"
    >
      <span className={`inline-flex size-7 items-center justify-center rounded-full ${QUICK_TONE[tone]}`} aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  )
}

/** The family portrait as a short banner with a greeting. Cropped so all four faces stay in frame. */
function Hero({ name, timezone }: { name: string | undefined; timezone: string }) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }).format(useNow()))
  const part = hour < 5 ? 'evening' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return (
    <div className="relative mb-6 lg:max-w-2xl">
      <div className="relative overflow-hidden rounded-[28px] bg-marigold-wash shadow-lift ring-1 ring-line">
        <Portrait className="aspect-[2/1] object-[50%_20%] lg:aspect-[5/2] lg:object-[50%_24%]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#2b1a12]/70 via-[#2b1a12]/30 to-transparent px-5 pt-12 pb-3.5">
          <p className="font-serif text-[24px] leading-tight font-medium text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.35)]">
            Good {part}{name ? `, ${name}` : ''}
          </p>
          <p className="mt-0.5 font-serif text-[14px] text-white/90 italic">Our days, beautifully organized.</p>
        </div>
      </div>
      <Sprig className="absolute -right-1 -bottom-5 h-10 w-24" />
    </div>
  )
}
