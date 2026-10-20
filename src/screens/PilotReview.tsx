import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { useHousehold } from '../app/household'
import { useAgenda } from '../app/useAgenda'
import { SectionTitle } from '../components/bits'
import { TextArea } from '../components/TaskSheet'
import { Button, Card } from '../components/ui'
import type { AgendaTask } from '../domain/agenda'
import { addDays, dateRange } from '../domain/dates'
import { firebase } from '../lib/firebase'
import { longDate } from '../lib/format'

interface WeekStats {
  done: number
  total: number
  skipped: number
  optionalDone: number
  notTracked: number
  byDay: { date: string; done: number; total: number }[]
  byCategory: { category: string; done: number; total: number }[]
}

/**
 * Counts only days on or after the household's first use. Optional tasks count only when done
 * or activated. Totals are for the household; nobody is scored against anyone.
 */
function stats(tasks: AgendaTask[], days: string[], firstUse: string | undefined, today: string): WeekStats {
  const tracked = (d: string) => Boolean(firstUse && d >= firstUse && d <= today)
  const inWeek = tasks.filter((t) => days.includes(t.occ.date) && t.occ.kind === 'task')
  const counted = inWeek.filter((t) => tracked(t.occ.date) && !t.state?.skipped && (!t.occ.optional || t.completed || t.override?.activated))
  const tally = (list: AgendaTask[]) => ({ done: list.filter((t) => t.completed).length, total: list.length })
  const categories = [...new Set(counted.map((t) => t.occ.category))].sort()
  return {
    ...tally(counted),
    skipped: inWeek.filter((t) => t.state?.skipped).length,
    optionalDone: inWeek.filter((t) => t.occ.optional && t.completed).length,
    notTracked: days.filter((d) => !tracked(d)).length,
    byDay: days.map((d) => ({ date: d, ...tally(counted.filter((t) => t.occ.date === d)) })),
    byCategory: categories.map((c) => ({ category: c, ...tally(counted.filter((t) => t.occ.category === c)) })),
  }
}

export function PilotReview() {
  const { versions, household, timezone, today } = useHousehold()
  const pilot = versions[0]?.plan.frontmatter.household.pilot
  const { tasks, loading } = useAgenda(pilot?.start ?? today, pilot?.end ?? today)
  if (!pilot) return <p className="text-ink-muted">The plan has no pilot dates.</p>
  const weeks = [dateRange(pilot.start, addDays(pilot.start, 6)), dateRange(addDays(pilot.start, 7), pilot.end)]
  const [a, b] = weeks.map((w) => stats(tasks, w, household.firstUseDate, today))

  return (
    <div>
      <p className="text-[14px] text-ink-muted">
        Week 1 is {longDate(weeks[0][0], timezone, { month: 'short', day: 'numeric' })} – {longDate(weeks[0][6], timezone, { month: 'short', day: 'numeric' })}, week 2 is{' '}
        {longDate(weeks[1][0], timezone, { month: 'short', day: 'numeric' })} – {longDate(weeks[1].at(-1)!, timezone, { month: 'short', day: 'numeric' })}. Days before you
        started using the app and future days aren’t counted.
      </p>
      {loading && <p className="mt-4 text-ink-muted">Loading…</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[a, b].map((s, i) => (
          <Card key={i}>
            <p className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">Week {i + 1}</p>
            <p className="mt-1 text-[28px] font-semibold">
              {s.done}
              <span className="text-[17px] font-normal text-ink-muted"> of {s.total} done</span>
            </p>
            <p className="text-[13px] text-ink-muted">
              {s.skipped} skipped · {s.optionalDone} optional done{s.notTracked ? ` · ${s.notTracked} days not counted` : ''}
            </p>
            <table className="mt-3 w-full text-[13px]">
              <tbody>
                {s.byDay.map((d) => (
                  <tr key={d.date} className="border-t border-line">
                    <td className="py-1">{longDate(d.date, timezone, { weekday: 'short', day: 'numeric' })}</td>
                    <td className="py-1 text-right tabular-nums">{d.total ? `${d.done}/${d.total}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="mt-3 w-full text-[13px]">
              <tbody>
                {s.byCategory.map((c) => (
                  <tr key={c.category} className="border-t border-line">
                    <td className="py-1 capitalize">{c.category}</td>
                    <td className="py-1 text-right tabular-nums">
                      {c.done}/{c.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
      {weeks.map((w, i) => (
        <Reflection key={w[0]} weekId={w[0]} label={`Week ${i + 1} reflection`} />
      ))}
    </div>
  )
}

function Reflection({ weekId, label }: { weekId: string; label: string }) {
  const { actor } = useHousehold()
  const [worked, setWorked] = useState('')
  const [friction, setFriction] = useState('')
  const [change, setChange] = useState('')
  const [status, setStatus] = useState('')
  const ref = doc(firebase().db, 'households', actor.hid, 'pilotReviews', weekId)

  useEffect(() => {
    getDoc(ref)
      .then((s) => {
        const d = s.data()
        if (!d) return
        setWorked(d.worked ?? '')
        setFriction(d.friction ?? '')
        setChange(d.change ?? '')
      })
      .catch(() => {})
    // The document path only depends on the household and week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor.hid, weekId])

  async function save() {
    await setDoc(ref, { worked, friction, change, updatedBy: actor.uid, updatedAt: serverTimestamp() })
    setStatus('Saved')
  }

  return (
    <>
      <SectionTitle>{label}</SectionTitle>
      <Card className="space-y-3">
        <TextArea label="What worked?" value={worked} onChange={(v) => { setWorked(v); setStatus('') }} rows={2} />
        <TextArea label="What caused friction?" value={friction} onChange={(v) => { setFriction(v); setStatus('') }} rows={2} />
        <TextArea label="What should change in the plan next week?" value={change} onChange={(v) => { setChange(v); setStatus('') }} rows={2} />
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={save}>
            Save notes
          </Button>
          {status && <span className="text-sm text-sage-ink">{status}</span>}
        </div>
      </Card>
    </>
  )
}
