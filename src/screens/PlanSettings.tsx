import { Download, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useHousehold } from '../app/household'
import { SectionTitle } from '../components/bits'
import { TextArea } from '../components/TaskSheet'
import { Button, Card, ErrorText, Field } from '../components/ui'
import { applyPlanVersion, nextVersionId } from '../data/plans'
import { addDays, weekdayOf } from '../domain/dates'
import { versionForDate } from '../domain/occurrences'
import { diffPlans, MAX_PLAN_BYTES, parsePlanMarkdown, serializePlan, type PlanTask } from '../domain/plan'
import { downloadText } from '../lib/download'
import { friendlyError } from '../lib/errors'


/** Settings → Plan: download the active plan, upload a revision, preview the changes and apply them. */
export function PlanSettings() {
  const { versions, invalidVersions, isAdmin, actor, today, household } = useHousehold()
  const current = versionForDate(versions, today) ?? versions.at(-1)
  const [text, setText] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(addDays(today, 1))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState('')

  const parsed = useMemo(() => (text.trim() ? parsePlanMarkdown(text) : null), [text])
  const base = versionForDate(versions, effectiveFrom) ?? current
  const diff = parsed?.ok && base ? diffPlans(base.plan, parsed.plan) : null

  async function readFile(file: File) {
    if (file.size > MAX_PLAN_BYTES) return setError('That file is too large for a plan.')
    setText(await file.text())
    setApplied('')
  }

  async function apply() {
    if (!parsed?.ok) return
    setBusy(true)
    setError('')
    try {
      const id = nextVersionId(versions)
      await applyPlanVersion(actor, id, text, effectiveFrom, note.trim())
      setApplied(`Plan ${id} is active from ${effectiveFrom}.`)
      setText('')
      setNote('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Card>
        <p className="text-[15px] font-medium">
          Active plan: {current ? `${current.id}, from ${current.effectiveFrom}` : 'none'}
        </p>
        {current?.note && <p className="mt-1 text-sm text-ink-muted">{current.note}</p>}
        <p className="mt-1 text-sm text-ink-muted">{current?.plan.frontmatter.tasks.length ?? 0} routines</p>
        {current && (
          <Button variant="secondary" className="mt-3" onClick={() => downloadText(`family-plan-${current.id}.md`, current.markdown)}>
            <Download size={16} aria-hidden /> Download Markdown
          </Button>
        )}
        {invalidVersions.length > 0 && <ErrorText>Ignored invalid versions: {invalidVersions.map((v) => v.id).join(', ')}</ErrorText>}
      </Card>

      {isAdmin ? (
        <>
          <SectionTitle>Upload a revised plan</SectionTitle>
          <Card className="space-y-4">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-5 text-[15px] font-medium">
              <Upload size={16} aria-hidden /> Choose .md file
              <input type="file" accept=".md,text/markdown,text/plain" className="sr-only" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
            </label>
            <TextArea label="…or paste the Markdown" value={text} onChange={(v) => { setText(v); setApplied('') }} rows={6} />
            <Field label="Takes effect from" type="date" value={effectiveFrom} min={today} onChange={(e) => setEffectiveFrom(e.target.value)} />
            <Field label="Note (what changed)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />

            {parsed && !parsed.ok && (
              <div role="alert" className="rounded-xl bg-garima/50 px-3.5 py-3 text-[13px] text-garima-ink">
                <p className="font-medium">This plan can’t be used yet:</p>
                <ul className="mt-1 list-disc pl-5">
                  {parsed.errors.slice(0, 12).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {diff && (
              <div className="space-y-2 text-[14px]" aria-label="Changes">
                <p className="font-medium">
                  Compared with {base!.id}: {diff.added.length} added, {diff.changed.length} changed, {diff.removed.length} retired
                </p>
                <DiffList label="Added" tasks={diff.added} />
                <DiffList label="Changed" tasks={diff.changed.map((c) => c.after)} />
                <DiffList label="Retired from this date (history is kept)" tasks={diff.removed} />
                {diff.added.length + diff.changed.length + diff.removed.length === 0 && <p className="text-ink-muted">No routine changes.</p>}
              </div>
            )}

            <ErrorText>{error}</ErrorText>
            {applied && <p className="text-sm text-sage-ink">{applied}</p>}
            <Button disabled={!parsed?.ok || busy || effectiveFrom < today} onClick={apply}>
              Apply plan
            </Button>
          </Card>
          <CleaningSetup />
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">Only a household admin can change the plan.</p>
      )}

      <SectionTitle>Version history</SectionTitle>
      <ul className="space-y-1 text-[14px]">
        {[...versions].reverse().map((v) => (
          <li key={v.id} className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 ring-1 ring-line">
            <span>
              <span className="font-medium">{v.id}</span> from {v.effectiveFrom}
              {v.note ? <span className="text-ink-muted"> · {v.note}</span> : null}
            </span>
            <button className="text-[13px] text-ink-muted underline" onClick={() => downloadText(`family-plan-${v.id}.md`, v.markdown)}>
              Download
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-ink-muted">Household: {household.name}. Completions and events are never rewritten by plan changes.</p>
    </div>
  )
}

function DiffList({ label, tasks }: { label: string; tasks: PlanTask[] }) {
  if (!tasks.length) return null
  return (
    <div>
      <p className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      <ul className="list-disc pl-5">
        {tasks.map((t) => (
          <li key={t.id}>
            {t.title} <span className="text-ink-muted">({t.owner})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The cleaning team comes every third Friday; nothing is generated until the first visit is confirmed. */
function CleaningSetup() {
  const { versions, actor, today } = useHousehold()
  const current = versionForDate(versions, today) ?? versions.at(-1)
  const anchor = current?.plan.frontmatter.cleaningService.anchorDate ?? null
  const [date, setDate] = useState(anchor ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  if (!current) return null

  async function save() {
    if (!current) return
    if (date && weekdayOf(date) !== 'fri') return setError('Pick a Friday.')
    setBusy(true)
    setError('')
    try {
      const plan = structuredClone(current.plan)
      plan.frontmatter.cleaningService.anchorDate = date || null
      const id = nextVersionId(versions)
      await applyPlanVersion(actor, id, serializePlan(plan), today, date ? `Cleaning team from ${date}` : 'Cleaning team turned off')
      setDone(date ? `Cleaner visits and Thursday prep are scheduled every ${current.plan.frontmatter.cleaningService.intervalWeeks} weeks from ${date}.` : 'Cleaning team turned off.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle>Cleaning team</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[14px] text-ink-muted">
          {anchor
            ? `Visits every ${current.plan.frontmatter.cleaningService.intervalWeeks} weeks, counted from ${anchor}.`
            : 'Off. Enter a confirmed visit date (a Friday) to schedule the visits and the Thursday prep.'}
        </p>
        <Field label="A confirmed visit date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        {done && <p className="text-sm text-sage-ink">{done}</p>}
        <Button variant="secondary" disabled={busy || date === (anchor ?? '')} onClick={save}>
          {date ? 'Save visit schedule' : 'Turn off'}
        </Button>
      </Card>
    </>
  )
}
