import { addDays, daysBetween, minutesOfDay, weekdayOf, type LocalDate } from './dates'
import type { FamilyPlan, Owner, PlanTask, Slot, TaskTime } from './plan'

/** A plan version as stored in Firestore: the plan applies from `effectiveFrom` onward. */
export interface PlanVersion {
  id: string
  effectiveFrom: LocalDate
  plan: FamilyPlan
}

export interface Occurrence {
  /** `${taskId}_${date}_${n}`: the Firestore document ID for this occurrence's state and override. */
  key: string
  taskId: string
  planVersionId: string
  date: LocalDate
  title: string
  kind: PlanTask['kind']
  owner: Owner
  category: string
  time?: TaskTime
  durationMinutes?: number
  optional: boolean
  notes?: string
  subtasks: PlanTask['subtasks']
}

export function occurrenceKey(taskId: string, date: LocalDate, n = 0): string {
  return `${taskId}_${date}_${n}`
}

/** The version in effect on `date`: the latest one whose effectiveFrom is on or before it. */
export function versionForDate(versions: PlanVersion[], date: LocalDate): PlanVersion | undefined {
  let best: PlanVersion | undefined
  for (const v of versions) {
    if (v.effectiveFrom <= date && (!best || v.effectiveFrom >= best.effectiveFrom)) best = v
  }
  return best
}

function occursOn(task: PlanTask, plan: FamilyPlan, date: LocalDate): boolean {
  const r = task.recurrence
  switch (r.type) {
    case 'daily':
      return true
    case 'weekly':
      return r.days.includes(weekdayOf(date))
    case 'once':
      return r.date === date
    case 'cleaningCycle': {
      const { anchorDate, intervalWeeks } = plan.frontmatter.cleaningService
      if (!anchorDate) return false
      const visit = addDays(date, -r.offsetDays)
      const diff = daysBetween(anchorDate, visit)
      return diff % (intervalWeeks * 7) === 0
    }
  }
}

/**
 * Generate the plan's occurrences for each date in [from, to], using whichever
 * plan version was in effect on that date. Nothing is persisted; only completions
 * and overrides are written to Firestore, keyed by `Occurrence.key`.
 */
export function generateOccurrences(versions: PlanVersion[], from: LocalDate, to: LocalDate): Occurrence[] {
  const out: Occurrence[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const version = versionForDate(versions, date)
    if (!version) continue
    for (const task of version.plan.frontmatter.tasks) {
      if (!task.enabled || !occursOn(task, version.plan, date)) continue
      out.push({
        key: occurrenceKey(task.id, date),
        taskId: task.id,
        planVersionId: version.id,
        date,
        title: task.title,
        kind: task.kind,
        owner: task.owner,
        category: task.category,
        time: task.time,
        durationMinutes: task.durationMinutes,
        optional: task.optional,
        notes: task.notes,
        subtasks: task.subtasks,
      })
    }
  }
  return out.sort(compareOccurrences)
}

const SLOT_MINUTES: Record<Slot, number> = { morning: 9 * 60, afternoon: 13 * 60, evening: 20 * 60 + 30 }

/** Minutes after midnight used to order a day's items; undefined means unscheduled. */
export function sortMinutes(time?: TaskTime): number | undefined {
  if (!time) return undefined
  return 'slot' in time ? SLOT_MINUTES[time.slot] : minutesOfDay(time.start)
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const am = sortMinutes(a.time) ?? Infinity
  const bm = sortMinutes(b.time) ?? Infinity
  if (am !== bm) return am - bm
  return a.title.localeCompare(b.title)
}

export interface OverdueContext {
  today: LocalDate
  /** First day the household actually used the app; earlier days are never counted as missed. */
  firstUseDate?: LocalDate
  completed: boolean
  skipped?: boolean
  /** An optional task the household explicitly activated for this date. */
  activated?: boolean
}

export function isOverdue(occ: Occurrence, ctx: OverdueContext): boolean {
  if (occ.kind === 'info' || ctx.completed || ctx.skipped) return false
  if (occ.optional && !ctx.activated) return false
  if (!ctx.firstUseDate || occ.date < ctx.firstUseDate) return false
  return occ.date < ctx.today
}
