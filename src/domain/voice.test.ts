import { describe, expect, it } from 'vitest'
import { parseVoiceCommand, validateForSave, type ParseContext } from './voice'

// Tuesday, October 20, 2026, 10:00 AM in Chicago (15:00 UTC).
const ctx: ParseContext = {
  now: new Date('2026-10-20T15:00:00Z'),
  timezone: 'America/Chicago',
  speaker: 'vishwas',
  lists: [
    { id: 'groceries', title: 'Groceries', type: 'shopping' },
    { id: 'costco', title: 'Costco', type: 'shopping' },
    { id: 'sams-club', title: 'Sam’s Club', type: 'shopping' },
    { id: 'household', title: 'Household', type: 'todo' },
    { id: 'errands', title: 'Errands', type: 'todo' },
    { id: 'kids', title: 'Kids', type: 'todo' },
  ],
}
const parse = (s: string, c: Partial<ParseContext> = {}) => parseVoiceCommand(s, { ...ctx, ...c })

describe('the spec’s voice commands', () => {
  it('adds a shopping item with quantity and unit', () => {
    expect(parse('Add two cartons of milk to groceries.')).toMatchObject({
      intent: 'shopping', title: 'Milk', listId: 'groceries', quantity: 2, unit: 'cartons', missingFields: [],
    })
  })

  it('adds an assigned to-do with its due date', () => {
    expect(parse('Remind Garima to order diapers by Thursday')).toMatchObject({
      intent: 'todo', title: 'Order diapers', assigneeId: 'garima', dueAt: '2026-10-22', listId: 'household', missingFields: [],
    })
  })

  it('adds my gym tomorrow 6 to 7 PM as a busy event for the speaker', () => {
    expect(parse('Put my gym on the family calendar tomorrow from 6 to 7 PM.')).toMatchObject({
      intent: 'event', title: 'Gym', date: '2026-10-21', startAt: '18:00', endAt: '19:00', endAssumed: false,
      participants: ['vishwas'], busy: true, eventType: 'gym', missingFields: [],
    })
  })

  it('adds a shared event for both of us', () => {
    expect(parse("Add Vihan's school event Saturday at 10 AM for both of us")).toMatchObject({
      intent: 'event', title: 'Vihan\'s school event', date: '2026-10-24', startAt: '10:00', endAt: '11:00', endAssumed: true,
      participants: ['vishwas', 'garima'], eventType: 'school',
    })
  })

  it('asks for the start time instead of guessing', () => {
    const a = parse('Add the appointment next Friday')
    expect(a).toMatchObject({ intent: 'event', title: 'Appointment', date: '2026-10-30', startAt: null, endAt: null, eventType: 'appointment' })
    expect(a.missingFields).toEqual(['startAt', 'endAt'])
    expect(validateForSave(a, ctx.lists).ok).toBe(false)
  })

  it('handles the acceptance phrasing', () => {
    expect(parse('Add bananas to groceries')).toMatchObject({ intent: 'shopping', title: 'Bananas', listId: 'groceries', quantity: null })
    expect(parse('Gym tomorrow 6 to 7 PM')).toMatchObject({
      intent: 'event', title: 'Gym', date: '2026-10-21', startAt: '18:00', endAt: '19:00', participants: ['vishwas'],
    })
  })
})

describe('never guessing', () => {
  it('leaves AM/PM to the person when it was not said', () => {
    const a = parse('Dentist appointment Friday at 4')
    expect(a.startAt).toBeNull()
    expect(a.hints).toContain('Say or pick AM or PM.')
    expect(a.missingFields).toContain('startAt')
  })

  it('does not invent a store, assignee or date', () => {
    const a = parse('Buy diapers')
    expect(a).toMatchObject({ intent: 'shopping', title: 'Diapers', assigneeId: 'unassigned', dueAt: null })
    expect(a.hints[0]).toMatch(/Groceries/)
    expect(parse('Add order cake to errands')).toMatchObject({ intent: 'todo', listId: 'errands', assigneeId: 'unassigned', dueAt: null })
  })

  it('says it doesn’t know what to add rather than picking', () => {
    const a = parse('Bananas')
    expect(a.intent).toBeNull()
    expect(a.missingFields).toEqual(['intent'])
  })
})

describe('dates and times in Chicago', () => {
  it('resolves "tomorrow" late at night by the local date, not UTC', () => {
    // 11:30 PM Tuesday in Chicago is already Wednesday in UTC.
    const late = new Date('2026-10-21T04:30:00Z')
    expect(parse('Remind me to call the plumber tomorrow', { now: late }).dueAt).toBe('2026-10-21')
  })

  it('handles the DST change on November 1', () => {
    // Saturday Oct 31, 11 PM CDT; tomorrow is Sunday Nov 1 when clocks fall back.
    const a = parse('Family brunch tomorrow from 10 to 11 am for both of us', { now: new Date('2026-11-01T04:00:00Z') })
    expect(a).toMatchObject({ date: '2026-11-01', startAt: '10:00', endAt: '11:00' })
  })

  it('reads month names, numeric dates and repeats', () => {
    expect(parse('Remind us to renew passports by December 3rd').dueAt).toBe('2026-12-03')
    expect(parse('Remind me to pay rent on 1/5').dueAt).toBe('2027-01-05')
    expect(parse('Swim lesson every Saturday at 9 am for Garima')).toMatchObject({
      recurrence: { type: 'weekly', days: ['sat'] }, date: '2026-10-24', startAt: '09:00', participants: ['garima'],
    })
  })

  it('crosses AM/PM in a range like "11 to 1 pm"', () => {
    expect(parse('Lunch with Garima tomorrow 11 to 1 pm for both of us')).toMatchObject({ startAt: '11:00', endAt: '13:00' })
  })
})

describe('validation before saving', () => {
  it('accepts a complete action and rejects tampered ones', () => {
    const a = parse('Add bananas to groceries')
    expect(validateForSave(a, ctx.lists).ok).toBe(true)
    expect(validateForSave({ ...a, quantity: 0 }, ctx.lists).ok).toBe(false)
    expect(validateForSave({ ...a, listId: 'household' }, ctx.lists).ok).toBe(false)
    const e = parse('Gym tomorrow 6 to 7 PM')
    expect(validateForSave({ ...e, endAt: '17:00' }, ctx.lists)).toMatchObject({ ok: false })
  })
})
