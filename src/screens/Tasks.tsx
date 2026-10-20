import { ListPlus } from 'lucide-react'
import { useState } from 'react'
import { useHousehold } from '../app/household'
import { useAgenda } from '../app/useAgenda'
import { useStoredState } from '../app/useStoredState'
import { Empty, OwnerFilterBar, SectionTitle, Skeleton } from '../components/bits'
import { TaskRow } from '../components/TaskRow'
import { TaskSheet, type TaskSheetMode } from '../components/TaskSheet'
import { Button } from '../components/ui'
import { matchesOwner, type AgendaTask, type OwnerFilter } from '../domain/agenda'
import { addDays } from '../domain/dates'

/** Everything that needs doing, across days: overdue, upcoming, unscheduled to-dos, and what needs discussing. */
export function Tasks() {
  const { today, myId } = useHousehold()
  const [owner, setOwner] = useStoredState<OwnerFilter>('tasks.owner', 'mine')
  const [sheet, setSheet] = useState<TaskSheetMode | null>(null)
  const from = addDays(today, -14)
  const to = addDays(today, 7)
  const { tasks, undated, loading } = useAgenda(from, to)

  const mine = (t: AgendaTask) => t.occ.kind === 'task' && matchesOwner(t.occ.owner, owner, myId)
  const discuss = tasks.filter((t) => mine(t) && t.state?.response === 'discuss' && !t.completed)
  const overdue = tasks.filter((t) => mine(t) && t.overdue && t.state?.response !== 'discuss')
  const todayOpen = tasks.filter((t) => mine(t) && t.occ.date === today && !t.completed && !t.state?.skipped)
  const upcoming = tasks.filter((t) => mine(t) && t.occ.date > today && !t.completed && !(t.occ.optional && !t.override?.activated))
  const todos = undated.filter((t) => mine(t) && !t.completed)
  const edit = (item: AgendaTask) => setSheet({ kind: 'edit', item })

  // A plain function, not a component, so rows keep their expanded state across renders.
  const list = (items: AgendaTask[], showDate = true) => (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.occ.key}>
          <TaskRow item={t} onEdit={edit} showDate={showDate} />
        </li>
      ))}
    </ul>
  )

  return (
    <div>
      <div className="flex items-end justify-between">
        <h1 className="font-serif text-[30px] leading-tight tracking-tight">Tasks</h1>
        <Button onClick={() => setSheet({ kind: 'new', date: null })} className="px-4">
          <ListPlus size={18} aria-hidden /> New task
        </Button>
      </div>
      <div className="mt-4">
        <OwnerFilterBar value={owner} onChange={setOwner} myId={myId} />
      </div>

      {loading && tasks.length === 0 ? (
        <div className="mt-6">
          <Skeleton />
        </div>
      ) : (
        <>
          {discuss.length > 0 && (
            <>
              <SectionTitle>To discuss</SectionTitle>
              {list(discuss)}
            </>
          )}
          {overdue.length > 0 && (
            <>
              <SectionTitle>Overdue</SectionTitle>
              {list(overdue)}
            </>
          )}
          <SectionTitle>Today</SectionTitle>
          {todayOpen.length ? list(todayOpen, false) : <Empty>All done for today.</Empty>}
          <SectionTitle>To-dos</SectionTitle>
          {todos.length ? list(todos, false) : <Empty>No open to-dos. Add one without a date.</Empty>}
          <SectionTitle>Next 7 days</SectionTitle>
          {upcoming.length ? list(upcoming) : <Empty>Nothing coming up.</Empty>}
        </>
      )}

      <TaskSheet mode={sheet} onClose={() => setSheet(null)} />
    </div>
  )
}
