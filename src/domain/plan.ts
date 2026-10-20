import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import { isLocalDate, isLocalTime, minutesOfDay, weekdayOf, WEEKDAYS } from './dates'

export const MAX_PLAN_BYTES = 100_000

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'IDs use lowercase letters, digits and dashes')

const localDate = z.string().refine(isLocalDate, 'Expected a date like 2026-10-19')
const localTime = z.string().refine(isLocalTime, 'Expected a 24-hour time like 19:30')
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/<\s*\/?\s*[a-z!]/i.test(s), 'HTML is not allowed')

export const ownerSchema = z.enum(['vishwas', 'garima', 'both', 'unassigned'])
export type Owner = z.infer<typeof ownerSchema>

const recurrenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({ type: z.literal('weekly'), days: z.array(z.enum(WEEKDAYS)).min(1) }),
  z.object({ type: z.literal('once'), date: localDate }),
  // Tied to cleaningService: generated only when its anchorDate is set.
  z.object({ type: z.literal('cleaningCycle'), offsetDays: z.number().int().min(-6).max(6) }),
])
export type Recurrence = z.infer<typeof recurrenceSchema>

export const slotSchema = z.enum(['morning', 'afternoon', 'evening'])
export type Slot = z.infer<typeof slotSchema>

const timeSchema = z.union([
  z.object({ slot: slotSchema }).strict(),
  z
    .object({ start: localTime, end: localTime.optional() })
    .strict()
    .refine((t) => !t.end || minutesOfDay(t.end) > minutesOfDay(t.start), 'End time must be after start time'),
])
export type TaskTime = z.infer<typeof timeSchema>

const subtaskSchema = z
  .object({
    id,
    title: text(200),
    owner: ownerSchema.default('unassigned'),
  })
  .strict()

const taskSchema = z
  .object({
    id,
    title: text(120),
    kind: z.enum(['task', 'info']).default('task'),
    owner: ownerSchema,
    category: id.default('general'),
    recurrence: recurrenceSchema,
    time: timeSchema.optional(),
    durationMinutes: z.number().int().positive().max(24 * 60).optional(),
    optional: z.boolean().default(false),
    enabled: z.boolean().default(true),
    notes: text(1000).optional(),
    subtasks: z.array(subtaskSchema).max(30).default([]),
  })
  .strict()
export type PlanTask = z.infer<typeof taskSchema>

export const frontmatterSchema = z
  .object({
    schemaVersion: z.literal(1),
    household: z
      .object({
        name: text(80),
        timezone: z.string().refine(isTimeZone, 'Unknown timezone'),
        weekStartsOn: z.literal('monday'),
        pilot: z.object({ start: localDate, end: localDate }).strict().optional(),
      })
      .strict(),
    members: z
      .array(z.object({ id: z.enum(['vishwas', 'garima']), displayName: text(40) }).strict())
      .min(1)
      .max(2),
    children: z.array(text(40)).default([]),
    cleaningService: z
      .object({
        anchorDate: localDate.nullable().default(null),
        intervalWeeks: z.number().int().min(1).max(8).default(3),
      })
      .strict()
      .default({ anchorDate: null, intervalWeeks: 3 }),
    tasks: z.array(taskSchema).max(200),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const seen = new Set<string>()
    plan.tasks.forEach((task, i) => {
      if (seen.has(task.id)) {
        ctx.addIssue({ code: 'custom', path: ['tasks', i, 'id'], message: `Duplicate task ID "${task.id}"` })
      }
      seen.add(task.id)
      const subIds = new Set<string>()
      task.subtasks.forEach((s, j) => {
        if (subIds.has(s.id)) {
          ctx.addIssue({ code: 'custom', path: ['tasks', i, 'subtasks', j, 'id'], message: `Duplicate subtask ID "${s.id}"` })
        }
        subIds.add(s.id)
      })
    })
    const pilot = plan.household.pilot
    if (pilot && pilot.end < pilot.start) {
      ctx.addIssue({ code: 'custom', path: ['household', 'pilot'], message: 'Pilot end is before its start' })
    }
    const anchor = plan.cleaningService.anchorDate
    if (anchor && weekdayOf(anchor) !== 'fri') {
      ctx.addIssue({ code: 'custom', path: ['cleaningService', 'anchorDate'], message: 'The cleaning anchor date must be a Friday' })
    }
  })

export type PlanFrontmatter = z.infer<typeof frontmatterSchema>

export interface FamilyPlan {
  frontmatter: PlanFrontmatter
  /** Human-readable Markdown below the frontmatter. Rendered as text, never as HTML. */
  body: string
}

export type ParseResult = { ok: true; plan: FamilyPlan } | { ok: false; errors: string[] }

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parsePlanMarkdown(markdown: string): ParseResult {
  if (new TextEncoder().encode(markdown).length > MAX_PLAN_BYTES) {
    return { ok: false, errors: [`The plan is larger than ${MAX_PLAN_BYTES / 1000} KB`] }
  }
  const match = FRONTMATTER_RE.exec(markdown)
  if (!match) return { ok: false, errors: ['The plan must start with YAML frontmatter between --- lines'] }

  let data: unknown
  try {
    // `uniqueKeys` rejects duplicated YAML keys; anchors/aliases are capped to block expansion bombs.
    data = parseYaml(match[1], { uniqueKeys: true, maxAliasCount: 0 })
  } catch (e) {
    return { ok: false, errors: [`YAML error: ${(e as Error).message}`] }
  }

  const result = frontmatterSchema.safeParse(data)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
    }
  }
  return { ok: true, plan: { frontmatter: result.data, body: match[2].trim() } }
}

export function serializePlan(plan: FamilyPlan): string {
  return `---\n${stringifyYaml(plan.frontmatter, { lineWidth: 0 })}---\n\n${plan.body}\n`
}

export interface PlanDiff {
  added: PlanTask[]
  removed: PlanTask[]
  changed: { before: PlanTask; after: PlanTask }[]
}

export function diffPlans(before: FamilyPlan, after: FamilyPlan): PlanDiff {
  const prev = new Map(before.frontmatter.tasks.map((t) => [t.id, t]))
  const next = new Map(after.frontmatter.tasks.map((t) => [t.id, t]))
  return {
    added: [...next.values()].filter((t) => !prev.has(t.id)),
    removed: [...prev.values()].filter((t) => !next.has(t.id)),
    changed: [...next.values()]
      .filter((t) => prev.has(t.id) && JSON.stringify(prev.get(t.id)) !== JSON.stringify(t))
      .map((t) => ({ before: prev.get(t.id)!, after: t })),
  }
}
