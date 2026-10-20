import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dateRange, startOfWeek, weekdayOf, zonedInstant, todayIn } from './dates'
import { generateOccurrences, isOverdue, type PlanVersion } from './occurrences'
import { diffPlans, parsePlanMarkdown, serializePlan, type FamilyPlan } from './plan'

const markdown = readFileSync(new URL('../../config/family-plan.md', import.meta.url), 'utf8')

function seedPlan(): FamilyPlan {
  const result = parsePlanMarkdown(markdown)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.plan
}

const PILOT_START = '2026-10-19'
const PILOT_END = '2026-11-01'
const v1: PlanVersion = { id: 'v1', effectiveFrom: PILOT_START, plan: seedPlan() }
const pilot = generateOccurrences([v1], PILOT_START, PILOT_END)
const on = (date: string) => pilot.filter((o) => o.date === date).map((o) => o.taskId)

describe('family plan', () => {
  it('parses the seeded Markdown plan', () => {
    expect(v1.plan.frontmatter.household.timezone).toBe('America/Chicago')
    expect(v1.plan.frontmatter.tasks.length).toBeGreaterThan(15)
  })

  it('round-trips through serialize and parse', () => {
    const again = parsePlanMarkdown(serializePlan(v1.plan))
    expect(again.ok && again.plan.frontmatter).toEqual(v1.plan.frontmatter)
  })

  it('rejects duplicate IDs', () => {
    const result = parsePlanMarkdown(markdown.replace('id: kitchen-cleanup', 'id: living-area-cleanup'))
    expect(result.ok ? '' : result.errors.join('\n')).toMatch(/Duplicate task ID "living-area-cleanup"/)
  })

  it('rejects bad owners, impossible times and HTML', () => {
    const bad = markdown
      .replace('owner: garima\n    category: meals', 'owner: grandma\n    category: meals')
      .replace('{ start: "18:30" }', '{ start: "25:30" }')
      .replace('title: Car wash', 'title: <script>alert(1)</script>')
    const result = parsePlanMarkdown(bad)
    expect(result.ok).toBe(false)
    const errors = result.ok ? [] : result.errors.join('\n')
    expect(errors).toMatch(/owner/)
    expect(errors).toMatch(/24-hour time/)
    expect(errors).toMatch(/HTML is not allowed/)
  })

  it('rejects oversized uploads and missing frontmatter', () => {
    expect(parsePlanMarkdown('# just text').ok).toBe(false)
    expect(parsePlanMarkdown(markdown + 'x'.repeat(200_000)).ok).toBe(false)
  })
})

describe('pilot schedule', () => {
  it('generates kitchen and living-area resets every pilot day', () => {
    for (const date of dateRange(PILOT_START, PILOT_END)) {
      expect(on(date)).toEqual(expect.arrayContaining(['living-area-cleanup', 'kitchen-cleanup']))
    }
  })

  it('generates Monday, Wednesday and Friday kids baths for both weeks', () => {
    const baths = pilot.filter((o) => o.taskId === 'kids-bath').map((o) => o.date)
    expect(baths).toEqual(['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30'])
  })

  it('places each weekly routine on its day', () => {
    expect(on('2026-10-20')).toContain('cook-fresh-food')
    expect(on('2026-10-21')).toContain('laundry-wash-dry')
    expect(on('2026-10-22')).toEqual(
      expect.arrayContaining(['fridge-reset', 'sams-club-order', 'laundry-fold', 'laundry-put-away']),
    )
    expect(on('2026-10-23')).toEqual(expect.arrayContaining(['sams-club-pickup', 'car-wash', 'family-evening']))
    expect(on('2026-10-24')).toEqual(expect.arrayContaining(['meal-prep', 'costco-run']))
    expect(on('2026-10-25')).toContain('weekly-family-reset')
    expect(on('2026-11-01')).toContain('weekly-family-reset')
  })

  it('keeps Sunday reset subtasks independently checkable', () => {
    const reset = pilot.find((o) => o.taskId === 'weekly-family-reset')!
    expect(reset.owner).toBe('both')
    expect(reset.subtasks).toHaveLength(7)
    expect(new Set(reset.subtasks.map((s) => s.id)).size).toBe(7)
  })

  it('orders a day by suggested time with unscheduled items last', () => {
    const thursday = pilot.filter((o) => o.date === '2026-10-22').map((o) => o.taskId)
    expect(thursday.indexOf('laundry-fold')).toBeLessThan(thursday.indexOf('kitchen-cleanup'))
    expect(thursday.slice(-2).sort()).toEqual(['fridge-reset', 'sams-club-order'])
  })
})

describe('optional and cleaning tasks', () => {
  const costco = pilot.find((o) => o.taskId === 'costco-run')!
  const carWash = pilot.find((o) => o.taskId === 'car-wash')!
  const ctx = { today: '2026-10-28', firstUseDate: PILOT_START, completed: false }

  it('never marks Costco overdue unless activated', () => {
    expect(isOverdue(costco, ctx)).toBe(false)
    expect(isOverdue(costco, { ...ctx, activated: true })).toBe(true)
    expect(isOverdue(carWash, ctx)).toBe(true)
  })

  it('does not count days before first use as missed', () => {
    expect(isOverdue(carWash, { ...ctx, firstUseDate: '2026-10-24' })).toBe(false)
    expect(isOverdue(carWash, { ...ctx, firstUseDate: undefined })).toBe(false)
  })

  it('keeps the cleaning team inactive until an anchor date is set', () => {
    expect(pilot.some((o) => o.taskId.startsWith('cleaning-'))).toBe(false)

    const plan = structuredClone(v1.plan)
    plan.frontmatter.cleaningService.anchorDate = '2026-10-23'
    const occ = generateOccurrences([{ ...v1, plan }], PILOT_START, '2026-11-30')
    expect(occ.filter((o) => o.taskId === 'cleaning-visit').map((o) => o.date)).toEqual(['2026-10-23', '2026-11-13'])
    expect(occ.filter((o) => o.taskId === 'cleaning-prep').map((o) => o.date)).toEqual(['2026-10-22', '2026-11-12'])
  })
})

describe('plan versions', () => {
  it('applies a revision from its effective date and leaves earlier dates alone', () => {
    const plan = structuredClone(v1.plan)
    plan.frontmatter.tasks = plan.frontmatter.tasks.filter((t) => t.id !== 'car-wash')
    const v2: PlanVersion = { id: 'v2', effectiveFrom: '2026-10-26', plan }
    const occ = generateOccurrences([v1, v2], PILOT_START, PILOT_END)
    expect(occ.filter((o) => o.taskId === 'car-wash').map((o) => [o.date, o.planVersionId])).toEqual([
      ['2026-10-23', 'v1'],
    ])
    expect(diffPlans(v1.plan, v2.plan).removed.map((t) => t.id)).toEqual(['car-wash'])
  })

  it('lets a newer version with an earlier effective date replace an older one', () => {
    const noCar = structuredClone(v1.plan)
    noCar.frontmatter.tasks = noCar.frontmatter.tasks.filter((t) => t.id !== 'car-wash')
    const v2: PlanVersion = { id: 'v2', effectiveFrom: '2026-10-30', plan: noCar }
    const v3: PlanVersion = { id: 'v3', effectiveFrom: '2026-10-26', plan: v1.plan }
    const occ = generateOccurrences([v1, v3, v2], PILOT_START, PILOT_END)
    expect(occ.filter((o) => o.taskId === 'car-wash').map((o) => [o.date, o.planVersionId])).toEqual([
      ['2026-10-23', 'v1'],
      ['2026-10-30', 'v3'],
    ])
  })
})

describe('dates', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19')
    expect(startOfWeek('2026-10-26')).toBe('2026-10-26')
    expect(weekdayOf('2026-11-01')).toBe('sun')
  })

  it('handles the November 1 DST change in Chicago', () => {
    // 7:30 PM is CDT (UTC-5) on Oct 31 and CST (UTC-6) on Nov 1.
    expect(zonedInstant('2026-10-31', '19:30', 'America/Chicago').toISOString()).toBe('2026-11-01T00:30:00.000Z')
    expect(zonedInstant('2026-11-01', '19:30', 'America/Chicago').toISOString()).toBe('2026-11-02T01:30:00.000Z')
    // The repeated 1:30 AM resolves to the first (CDT) occurrence.
    expect(zonedInstant('2026-11-01', '01:30', 'America/Chicago').toISOString()).toBe('2026-11-01T06:30:00.000Z')
  })

  it('uses the household date around midnight', () => {
    // 11:30 PM Saturday in Chicago is already Sunday in UTC.
    expect(todayIn('America/Chicago', new Date('2026-10-25T04:30:00Z'))).toBe('2026-10-24')
  })
})
