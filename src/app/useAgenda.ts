import { useMemo } from 'react'
import { SNOOZE_WINDOW_DAYS, useEventRange, useTaskRange } from '../data/live'
import { buildAgenda, expandEvents, undatedTasks } from '../domain/agenda'
import { addDays } from '../domain/dates'
import { generateOccurrences } from '../domain/occurrences'
import { useHousehold } from './household'

/** Everything shown for [from, to]: plan and ad-hoc tasks with their states, and events. */
export function useAgenda(from: string, to: string) {
  const { household, versions, adHoc, today, plansLoading } = useHousehold()
  const tasks = useTaskRange(household.id, from, to)
  const events = useEventRange(household.id, from, to)

  return useMemo(() => {
    const planOccurrences = generateOccurrences(versions, addDays(from, -SNOOZE_WINDOW_DAYS), to)
    const agenda = buildAgenda(
      { planOccurrences, adHoc, states: tasks.states, overrides: tasks.overrides, today, firstUseDate: household.firstUseDate },
      from,
      to,
    )
    return {
      tasks: agenda,
      undated: undatedTasks(adHoc, tasks.states),
      instances: expandEvents(events.events, from, to),
      loading: plansLoading || tasks.loading || events.loading,
      error: tasks.error ?? events.error,
    }
  }, [versions, adHoc, tasks, events, from, to, today, household.firstUseDate, plansLoading])
}
