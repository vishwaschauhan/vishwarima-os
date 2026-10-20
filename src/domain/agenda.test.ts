import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildAgenda,
  coverageGaps,
  expandEvents,
  matchesOwner,
  personConflicts,
  undatedTasks,
  type AdHocTask,
  type FamilyEvent,
  type TaskOverride,
  type TaskState,
} from './agenda'
import { generateOccurrences, type PlanVersion } from './occurrences'
import { parsePlanMarkdown } from './plan'

const parsed = parsePlanMarkdown(readFileSync(new URL('../../config/family-plan.md', import.meta.url), 'utf8'))
if (!parsed.ok) throw new Error(parsed.errors.join('\n'))
const v1: PlanVersion = { id: 'v1', effectiveFrom: '2026-10-19', plan: parsed.plan }
const plan = generateOccurrences([v1], '2026-10-05', '2026-11-01')

const base = { states: new Map<string, TaskState>(), overrides: new Map<string, TaskOverride>(), adHoc: [] as AdHocTask[] }
const ctx = { ...base, planOccurrences: plan, today: '2026-10-23', firstUseDate: '2026-10-19' }

function adHoc(partial: Partial<AdHocTask>): AdHocTask {
  return {
    id: 't-1',
    title: 'Call the pediatrician',
    owner: 'vishwas',
    priority: 'normal',
    date: '2026-10-23',
    recurrence: { type: 'none' },
    checklist: [],
    createdBy: 'uid-g',
    assignedBy: 'uid-g',
    ...partial,
  }
}

function event(partial: Partial<FamilyEvent>): FamilyEvent {
  return {
    id: 'e1',
    title: 'Busy',
    type: 'gym',
    date: '2026-10-20',
    start: '17:30',
    end: '19:00',
    participants: ['garima'],
    busy: true,
    visibility: 'private',
    coverage: null,
    recurrence: { type: 'none' },
    ownerUid: 'uid-g',
    createdBy: 'uid-g',
    ...partial,
  }
}

describe('agenda', () => {
  it('marks a completed occurrence and keeps it in place', () => {
    const states = new Map([['car-wash_2026-10-23_0', { key: 'car-wash_2026-10-23_0', completed: true, completedBy: 'uid-v' }]])
    const day = buildAgenda({ ...ctx, states }, '2026-10-23', '2026-10-23')
    const carWash = day.find((t) => t.occ.taskId === 'car-wash')!
    expect(carWash.completed).toBe(true)
    expect(carWash.overdue).toBe(false)
  })

  it('reassigns a single occurrence without touching the next week', () => {
    const overrides = new Map([['car-wash_2026-10-23_0', { key: 'car-wash_2026-10-23_0', owner: 'garima' as const, assignedBy: 'uid-v' }]])
    const days = buildAgenda({ ...ctx, overrides }, '2026-10-23', '2026-10-30')
    const washes = days.filter((t) => t.occ.taskId === 'car-wash')
    expect(washes.map((t) => [t.occ.date, t.occ.owner, t.assignedBy])).toEqual([
      ['2026-10-23', 'garima', 'uid-v'],
      ['2026-10-30', 'vishwas', undefined],
    ])
  })

  it('moves a snoozed task to its new day under its original key', () => {
    const overrides = new Map([['fridge-reset_2026-10-22_0', { key: 'fridge-reset_2026-10-22_0', movedTo: '2026-10-24' }]])
    const thu = buildAgenda({ ...ctx, overrides }, '2026-10-22', '2026-10-22')
    const sat = buildAgenda({ ...ctx, overrides }, '2026-10-24', '2026-10-24')
    expect(thu.some((t) => t.occ.taskId === 'fridge-reset')).toBe(false)
    const moved = sat.find((t) => t.occ.taskId === 'fridge-reset')!
    expect(moved.occ.key).toBe('fridge-reset_2026-10-22_0')
    expect(moved.originalDate).toBe('2026-10-22')
  })

  it('makes an activated Costco run count as overdue, and a skipped task not', () => {
    const overrides = new Map([['costco-run_2026-10-24_0', { key: 'costco-run_2026-10-24_0', activated: true }]])
    const states = new Map([['kids-bath_2026-10-21_0', { key: 'kids-bath_2026-10-21_0', completed: false, skipped: true }]])
    const week = buildAgenda({ ...ctx, overrides, states, today: '2026-10-26' }, '2026-10-19', '2026-10-25')
    expect(week.find((t) => t.occ.taskId === 'costco-run')!.overdue).toBe(true)
    expect(week.find((t) => t.occ.key === 'kids-bath_2026-10-21_0')!.overdue).toBe(false)
    expect(week.find((t) => t.occ.key === 'kids-bath_2026-10-19_0')!.overdue).toBe(true)
  })

  it('includes ad-hoc tasks with who assigned them, and recurring ones on their days', () => {
    const tasks = [
      adHoc({}),
      adHoc({ id: 't-2', title: 'Water plants', owner: 'garima', recurrence: { type: 'weekly', days: ['mon', 'thu'] }, date: '2026-10-19', until: '2026-10-29' }),
    ]
    const days = buildAgenda({ ...ctx, adHoc: tasks }, '2026-10-19', '2026-11-01')
    expect(days.find((t) => t.occ.taskId === 't-1')).toMatchObject({ source: 'adhoc', assignedBy: 'uid-g', occ: { date: '2026-10-23', owner: 'vishwas' } })
    expect(days.filter((t) => t.occ.taskId === 't-2').map((t) => t.occ.date)).toEqual(['2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29'])
  })

  it('lists unscheduled to-dos separately', () => {
    const list = undatedTasks([adHoc({ date: null }), adHoc({ id: 't-3', archived: true, date: null })], new Map())
    expect(list.map((t) => t.occ.key)).toEqual(['t-1_undated_0'])
  })

  it('filters by owner, counting shared tasks for each person', () => {
    expect(matchesOwner('both', 'mine', 'garima')).toBe(true)
    expect(matchesOwner('vishwas', 'garima')).toBe(false)
    expect(matchesOwner('vishwas', 'everyone')).toBe(true)
  })
})

describe('events and coverage', () => {
  it('expands weekly events and stops at their end date', () => {
    const gym = event({ recurrence: { type: 'weekly', days: ['tue', 'thu'], until: '2026-10-27' } })
    expect(expandEvents([gym], '2026-10-19', '2026-11-01').map((i) => i.date)).toEqual(['2026-10-20', '2026-10-22', '2026-10-27'])
  })

  it('warns when both adults are busy and nobody has the kids, without assigning anyone', () => {
    const gym = event({})
    const work = event({ id: 'e2', title: 'Late meeting', type: 'work', start: '18:00', end: '20:00', participants: ['vishwas'], visibility: 'shared', ownerUid: 'uid-v' })
    const gaps = coverageGaps(expandEvents([gym, work], '2026-10-20', '2026-10-20'))
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ start: 18 * 60, end: 19 * 60 })
    expect(gaps[0].events.every((e) => !e.coverage)).toBe(true)
  })

  it('does not warn once coverage is set on either event', () => {
    const gym = event({ coverage: 'unassigned' })
    const work = event({ id: 'e2', start: '18:00', end: '20:00', participants: ['vishwas'], coverage: 'vishwas' })
    expect(coverageGaps(expandEvents([gym, work], '2026-10-20', '2026-10-20'))).toHaveLength(0)
  })

  it('does not warn when only one adult is busy', () => {
    expect(coverageGaps(expandEvents([event({})], '2026-10-20', '2026-10-20'))).toHaveLength(0)
  })

  it('finds overlapping events for one person but allows saving them', () => {
    const a = event({ participants: ['vishwas'] })
    const b = event({ id: 'e2', start: '18:30', end: '19:30', participants: ['vishwas'] })
    expect(personConflicts(expandEvents([a, b], '2026-10-20', '2026-10-20'), 'vishwas')).toHaveLength(1)
    expect(personConflicts(expandEvents([a, b], '2026-10-20', '2026-10-20'), 'garima')).toHaveLength(0)
  })
})
