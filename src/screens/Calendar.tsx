import { CalendarPlus, CircleSlash, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { useStoredState } from '../app/useStoredState'
import { Empty, OwnerFilterBar, Skeleton, StepNav } from '../components/bits'
import { EventRow } from '../components/EventRow'
import { useEventTitle } from '../components/eventLabels'
import { EventSheet, type EventSheetMode } from '../components/EventSheet'
import { useEventRange } from '../data/live'
import { coverageGaps, eventMatchesOwner, expandEvents, formatMinutes, personConflicts, type OwnerFilter } from '../domain/agenda'
import { addDays, dateRange, isLocalDate, startOfWeek } from '../domain/dates'
import { longDate } from '../lib/format'
import { QuickAdd } from './Today'
import { MicButton } from '../components/AddMenu'

/** The family calendar: events and busy blocks two weeks at a time, with overlap and childcare warnings. */
export function Calendar() {
  const { household, today, timezone, myId } = useHousehold()
  const [params, setParams] = useSearchParams()
  const from = startOfWeek(isLocalDate(params.get('d') ?? '') ? params.get('d')! : today)
  const to = addDays(from, 13)
  const go = (d: string) => setParams(startOfWeek(d) === startOfWeek(today) ? {} : { d }, { replace: true })
  const [owner, setOwner] = useStoredState<OwnerFilter>('calendar.owner', 'everyone')
  const [sheet, setSheet] = useState<EventSheetMode | null>(null)
  const { events, loading } = useEventRange(household.id, from, to)
  const instances = expandEvents(events, from, to)
  const eventTitle = useEventTitle()
  const addDate = today >= from && today <= to ? today : from

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">Family calendar</p>
          <h1 className="font-serif text-[28px] leading-tight tracking-tight">
            {longDate(from, timezone, { month: 'short', day: 'numeric' })} – {longDate(to, timezone, { month: 'short', day: 'numeric' })}
          </h1>
        </div>
        <StepNav label="Change dates" prevLabel="Previous two weeks" nextLabel="Next two weeks" onPrev={() => go(addDays(from, -14))} onNext={() => go(addDays(from, 14))} />
      </div>

      <div className="mt-4">
        <OwnerFilterBar value={owner} onChange={setOwner} myId={myId} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <QuickAdd icon={<CalendarPlus size={18} />} label="Event" onClick={() => setSheet({ kind: 'new', date: addDate })} />
        <QuickAdd icon={<CircleSlash size={18} />} label="Busy" onClick={() => setSheet({ kind: 'new', date: addDate, busy: true })} />
        <MicButton />
      </div>
      <p className="mt-3 text-[13px] text-ink-muted">
        This calendar lives inside VishwarimaOS. It doesn’t sync with Google Calendar, and there are no push notifications yet.
      </p>

      <div className="mt-5 space-y-6">
        {loading && instances.length === 0 ? (
          <Skeleton />
        ) : (
          dateRange(from, to).map((d) => {
            const all = instances.filter((i) => i.date === d)
            const shown = all.filter((i) => eventMatchesOwner(i.event, owner, myId))
            const gaps = coverageGaps(all)
            const conflicts = (['vishwas', 'garima'] as const).flatMap((p) => personConflicts(all, p))
            if (shown.length === 0 && d !== today) return null
            return (
              <section key={d}>
                <h2 className={`mb-2 text-[15px] font-semibold ${d === today ? '' : 'text-ink-muted'}`}>
                  {d === today ? 'Today · ' : ''}
                  {longDate(d, timezone, { weekday: 'long', month: 'short', day: 'numeric' })}
                </h2>
                {gaps.map((g, i) => (
                  <p key={i} role="status" className="mb-2 flex gap-2 rounded-xl bg-garima/60 px-3.5 py-2.5 text-[13px] text-garima-ink">
                    <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
                    You’re both busy {formatMinutes(g.start)} – {formatMinutes(g.end)}. Who has the kids?
                  </p>
                ))}
                {shown.length === 0 ? (
                  <Empty>Nothing on the calendar.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {shown.map((i) => {
                      const conflict = conflicts.find((c) => c.events.includes(i.event))
                      const other = conflict?.events.find((e) => e !== i.event)
                      return (
                        <li key={`${i.event.id}-${d}`}>
                          <EventRow
                            instance={i}
                            onOpen={(event) => setSheet({ kind: 'edit', event })}
                            warning={
                              other
                                ? `Overlaps ${eventTitle(other)}`
                                : gaps.some((g) => g.events.includes(i.event))
                                  ? 'Nobody set for the kids'
                                  : undefined
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })
        )}
      </div>

      <EventSheet mode={sheet} onClose={() => setSheet(null)} />
    </div>
  )
}
