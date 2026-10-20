import { z } from 'zod'
import type { EventType, PersonId } from './agenda'
import { addDays, isLocalDate, isLocalTime, localDateAt, minutesOfDay, startOfWeek, weekdayOf, WEEKDAYS, type LocalDate, type Weekday } from './dates'
import type { ListType } from './lists'
import { ownerSchema, type Owner } from './plan'

// Voice Quick Add: a deterministic parser for a narrow set of spoken commands. It never guesses a
// date, time, person or store that wasn't said; anything missing is listed in `missingFields`
// and must be filled in on the preview before anything is saved.

export type Intent = 'shopping' | 'todo' | 'event'

export interface ParseContext {
  /** The moment of speaking; dates resolve against it in `timezone`, never UTC. */
  now: Date
  timezone: string
  speaker: PersonId
  lists: { id: string; title: string; type: ListType }[]
}

const localDate = z.string().refine(isLocalDate, 'Pick a date')
const localTime = z.string().refine(isLocalTime, 'Pick a time')

/** The typed action every command becomes. Validated before the preview and again before saving. */
export const voiceActionSchema = z.object({
  intent: z.enum(['shopping', 'todo', 'event']).nullable(),
  title: z.string().trim().max(200),
  listId: z.string().nullable(),
  assigneeId: ownerSchema,
  quantity: z.number().int().min(1).max(999).nullable(),
  unit: z.string().max(20).nullable(),
  dueAt: localDate.nullable(),
  date: localDate.nullable(),
  startAt: localTime.nullable(),
  endAt: localTime.nullable(),
  /** True when the end time was filled in as start + 1 hour rather than said. */
  endAssumed: z.boolean(),
  participants: z.array(z.enum(['vishwas', 'garima'])),
  busy: z.boolean(),
  eventType: z.enum(['appointment', 'gym', 'work', 'kids', 'outing', 'school', 'busy', 'other']),
  recurrence: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('daily') }),
    z.object({ type: z.literal('weekly'), days: z.array(z.enum(WEEKDAYS)).min(1) }),
  ]),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
  /** Short notes for the preview, e.g. "Say AM or PM". */
  hints: z.array(z.string()),
})

export type VoiceAction = z.infer<typeof voiceActionSchema>

export type MissingField = 'intent' | 'title' | 'list' | 'date' | 'startAt' | 'endAt' | 'participants'

const MISSING_LABEL: Record<MissingField, string> = {
  intent: 'what to add (item, to-do or event)',
  title: 'a name',
  list: 'a list',
  date: 'a date',
  startAt: 'a start time',
  endAt: 'an end time',
  participants: 'who it’s for',
}

export function describeMissing(fields: string[]): string {
  return fields.map((f) => MISSING_LABEL[f as MissingField] ?? f).join(', ')
}

/** What still has to be filled in before the action can be saved. */
export function missingFor(a: Omit<VoiceAction, 'missingFields' | 'confidence' | 'hints'>, lists: ParseContext['lists']): MissingField[] {
  const out: MissingField[] = []
  if (!a.intent) return ['intent']
  if (!a.title.trim()) out.push('title')
  if (a.intent !== 'event') {
    const list = lists.find((l) => l.id === a.listId)
    if (!list || list.type !== (a.intent === 'shopping' ? 'shopping' : 'todo')) out.push('list')
  } else {
    if (!a.date) out.push('date')
    if (!a.startAt) out.push('startAt')
    if (!a.endAt) out.push('endAt')
    if (a.participants.length === 0) out.push('participants')
  }
  return out
}

/** Final check before writing: the schema, plus nothing missing and a sensible time range. */
export function validateForSave(action: unknown, lists: ParseContext['lists']): { ok: true; action: VoiceAction } | { ok: false; error: string } {
  const parsed = voiceActionSchema.safeParse(action)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Something isn’t filled in correctly.' }
  const a = parsed.data
  const missing = missingFor(a, lists)
  if (missing.length) return { ok: false, error: `Still needed: ${describeMissing(missing)}.` }
  if (a.intent === 'event' && a.startAt && a.endAt && minutesOfDay(a.endAt) <= minutesOfDay(a.startAt)) {
    return { ok: false, error: 'The end time must be after the start time.' }
  }
  return { ok: true, action: a }
}

// ---------------------------------------------------------------------------
// Parsing

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, 'a couple of': 2, dozen: 12,
}

const UNITS = [
  'cartons', 'carton', 'bottles', 'bottle', 'boxes', 'box', 'bags', 'bag', 'packs', 'pack', 'packets', 'packet', 'cans', 'can',
  'jars', 'jar', 'loaves', 'loaf', 'gallons', 'gallon', 'pounds', 'pound', 'lbs', 'lb', 'kilos', 'kg', 'dozen', 'bunches', 'bunch',
  'rolls', 'roll', 'tubs', 'tub', 'cases', 'case',
]

const WEEKDAY_WORD: Record<string, Weekday> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const NAMES = ['vishwas', 'garima', 'vihan', 'vyomika']
const MERIDIEM = String.raw`(a\.?\s?m\.?|p\.?\s?m\.?)`
const CLOCK = String.raw`(\d{1,2})(?::(\d{2}))?(?:\s*o'?clock)?`

/** A phrase found in the text: its value and where it was, so it can be cut out of the title. */
interface Hit<T> {
  value: T
  start: number
  end: number
}

function find<T>(text: string, re: RegExp, value: (m: RegExpExecArray) => T | null): Hit<T> | null {
  const m = re.exec(text)
  if (!m) return null
  const v = value(m)
  return v === null ? null : { value: v, start: m.index, end: m.index + m[0].length }
}

function nextWeekday(today: LocalDate, day: Weekday, nextWeek: boolean): LocalDate {
  if (nextWeek) return addDays(startOfWeek(today), 7 + WEEKDAYS.indexOf(day))
  const diff = (WEEKDAYS.indexOf(day) - WEEKDAYS.indexOf(weekdayOf(today)) + 7) % 7
  return addDays(today, diff)
}

function findDate(t: string, today: LocalDate): Hit<{ date: LocalDate; by: boolean }> | null {
  const wd = Object.keys(WEEKDAY_WORD).join('|')
  const month = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`
  const patterns: [RegExp, (m: RegExpExecArray) => LocalDate | null][] = [
    [/\b(by |on |for )?(the )?day after tomorrow\b/, () => addDays(today, 2)],
    [/\b(by |on |for )?(tomorrow)\b/, () => addDays(today, 1)],
    [/\b(by |on |for )?(today|tonight|this evening|this afternoon)\b/, () => today],
    [new RegExp(String.raw`\b(by |on |for )?(this |next |coming )?(${wd})\b`), (m) => nextWeekday(today, WEEKDAY_WORD[m[3]], m[2] === 'next ')],
    [
      new RegExp(String.raw`\b(by |on |for )?${month}\.? (\d{1,2})(?:st|nd|rd|th)?\b`),
      (m) => {
        const mi = MONTHS.indexOf(m[2].slice(0, 3))
        return calendarDate(today, mi + 1, Number(m[3]))
      },
    ],
    [/\b(by |on |for )?(\d{1,2})\/(\d{1,2})\b/, (m) => calendarDate(today, Number(m[2]), Number(m[3]))],
  ]
  for (const [re, fn] of patterns) {
    const hit = find(t, re, (m) => {
      const date = fn(m)
      return date ? { date, by: m[1] === 'by ' } : null
    })
    if (hit) return hit
  }
  return null
}

/** Month/day in the coming year: a date already past this year means next year. */
function calendarDate(today: LocalDate, month: number, day: number): LocalDate | null {
  const year = Number(today.slice(0, 4))
  const fmt = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (!isLocalDate(fmt(year))) return null
  return fmt(year) < today ? fmt(year + 1) : fmt(year)
}

function meridiem(s: string | undefined): 'am' | 'pm' | null {
  if (!s) return null
  return s.replace(/[\s.]/g, '').startsWith('p') ? 'pm' : 'am'
}

function to24(h: number, min: number, mer: 'am' | 'pm' | null): string | null {
  if (h > 23 || min > 59) return null
  let hour = h
  if (mer) {
    if (h < 1 || h > 12) return null
    hour = (h % 12) + (mer === 'pm' ? 12 : 0)
  }
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

interface TimeHit {
  start: string | null
  end: string | null
  /** A time was said, but without AM or PM and it could be either. */
  ambiguous: boolean
}

function findTime(t: string): Hit<TimeHit> | null {
  const range = new RegExp(String.raw`\b(?:from |between )?${CLOCK}\s*${MERIDIEM}?\s*(?:to|until|till|and|-|–)\s*${CLOCK}\s*${MERIDIEM}?(?![\w/])`)
  const r = find(t, range, (m) => {
    // Speech gives "6 to 7 pm"; the end's AM/PM carries to the start unless that would put it after the end.
    const endMer = meridiem(m[6])
    let startMer = meridiem(m[3]) ?? endMer
    const sh = Number(m[1])
    const eh = Number(m[4])
    if (!m[3] && endMer && sh > eh && sh <= 12) startMer = endMer === 'pm' ? 'am' : 'pm'
    if (!m[3] && !m[6] && !/\b(from|between)\b/.test(m[0])) return null
    const ambiguous = !startMer && !endMer && sh >= 1 && sh <= 12
    const start = ambiguous ? null : to24(sh, Number(m[2] ?? 0), startMer)
    const end = ambiguous ? null : to24(eh, Number(m[5] ?? 0), endMer)
    return { start, end, ambiguous }
  })
  if (r) return r
  const single = new RegExp(String.raw`\b(?:at |@ ?)${CLOCK}\s*${MERIDIEM}?(?![\w/])|\b${CLOCK}\s*${MERIDIEM}(?![\w/])`)
  const s = find(t, single, (m) => {
    const h = Number(m[1] ?? m[4])
    const min = Number(m[2] ?? m[5] ?? 0)
    const mer = meridiem(m[3] ?? m[6])
    const ambiguous = !mer && h >= 1 && h <= 12
    return { start: ambiguous ? null : to24(h, min, mer), end: null, ambiguous }
  })
  if (s) return s
  return find(t, /\b(?:at )?(noon|midday|midnight)\b/, (m) => ({ start: m[1] === 'midnight' ? '00:00' : '12:00', end: null, ambiguous: false }))
}

function findRecurrence(t: string): Hit<VoiceAction['recurrence']> | null {
  const wd = Object.keys(WEEKDAY_WORD).join('|')
  return (
    find(t, /\bevery ?(day|night|morning|evening)\b|\bdaily\b/, () => ({ type: 'daily' as const })) ??
    find(t, new RegExp(String.raw`\b(?:every|on) ((?:(?:${wd})s?(?:,? (?:and )?)?)+)\b|\b((?:${wd})s)\b`), (m) => {
      const words = (m[1] ?? m[2]).match(new RegExp(wd, 'g')) ?? []
      // A plain "on Friday" is a date, not a repeat; only "every" or a plural repeats.
      if (!/^every/.test(m[0]) && !/s\b/.test(m[0])) return null
      return { type: 'weekly' as const, days: [...new Set(words.map((w) => WEEKDAY_WORD[w]))] }
    })
  )
}

function eventTypeOf(t: string): EventType {
  if (/\b(gym|workout|yoga|run|swim)\b/.test(t)) return 'gym'
  if (/\b(school|class|teacher|pta)\b/.test(t)) return 'school'
  if (/\b(doctor|dentist|pediatrician|appointment|checkup|check-up|clinic)\b/.test(t)) return 'appointment'
  if (/\b(work|meeting|office|call)\b/.test(t)) return 'work'
  if (/\b(practice|lesson|playdate|recital|game)\b/.test(t)) return 'kids'
  if (/\b(dinner|lunch|party|outing|picnic|movie|park)\b/.test(t)) return 'outing'
  return 'other'
}

const EVENT_WORDS = /\b(appointment|meeting|gym|class|party|event|practice|lesson|game|recital|checkup|dinner|lunch|playdate|flight|trip)\b/

function cut(text: string, hits: (Hit<unknown> | null)[]): string {
  const ranges = hits.filter((h): h is Hit<unknown> => h !== null).sort((a, b) => b.start - a.start)
  let out = text
  for (const h of ranges) out = `${out.slice(0, h.start)} ${out.slice(h.end)}`
  return out
}

function tidyTitle(s: string): string {
  let t = s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:\s*(?:please|can you|could you|and|then|also|ok|okay|hey)\b[ ,]*)+/, '')
    .replace(/^(?:a|an|the|my|our|some)\s+/, '')
    .replace(/\s+(?:to|on|for|at|by|in|from|the|and|please)$/g, '')
    .replace(/[.,!?;:]+$/, '')
    .trim()
  t = t.replace(/\s+(?:to|on|for|at|by|in|from|the)$/g, '').trim()
  // Capitalize the first letter and family names.
  t = t.replace(new RegExp(String.raw`\b(${NAMES.join('|')})\b`, 'g'), (n) => n[0].toUpperCase() + n.slice(1))
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

function personFrom(word: string, speaker: PersonId): Owner | null {
  if (word === 'me' || word === 'myself' || word === 'i') return speaker
  if (word === 'us' || word === 'both' || word === 'both of us' || word === 'everyone') return 'both'
  if (word === 'vishwas' || word === 'garima') return word
  return null
}

/** Parse one spoken (or typed) command into an action draft for the preview. */
export function parseVoiceCommand(transcript: string, ctx: ParseContext): VoiceAction {
  const today = localDateAt(ctx.now, ctx.timezone)
  // Lowercase, plain spacing, common speech forms ("p.m.", "to-do") normalized.
  const t = ` ${transcript.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\bto do\b/g, 'to-do').replace(/\s+/g, ' ').trim()} `
    .replace(/[.!?]+\s*$/, ' ')
  const hints: string[] = []
  let confidence = 0.9

  // List mentions: "to groceries", "to the Costco list", "on the errands list".
  const listHit = (() => {
    for (const l of [...ctx.lists].sort((a, b) => b.title.length - a.title.length)) {
      const name = l.title.toLowerCase().replace(/[’']/g, "'?").replace(/\s+/g, ' ')
      const re = new RegExp(String.raw`\b(?:to|on|onto|in|into) (?:the |my |our )?${name}(?: list| shopping list)?\b|\b${name} (?:shopping )?list\b`, 'g')
      // The last mention is the destination ("add kids shoes to the kids list").
      let last: Hit<typeof l> | null = null
      for (let m = re.exec(t); m; m = re.exec(t)) last = { value: l, start: m.index, end: m.index + m[0].length }
      if (last) return last
    }
    return null
  })()
  const shoppingListWord = find(t, /\b(?:to|on) (?:the |our |my )?(?:shopping|grocery) list\b/, () => true)
  const calendarHit = find(t, /\b(?:on|to|in|onto) (?:the |our |my )?(?:family )?calendar\b|\bschedule\b/, () => true)
  const remindHit = find(t, /^\s*(?:please )?(?:remind|tell|ask) (me|us|both of us|both|vishwas|garima) (?:to|that|about)\b/, (m) => m[1])
  const todoWord = find(t, /\b(?:a |the )?(?:to-?do|todo|task|reminder)(?: item)?\b/, () => true)

  const date = findDate(t, today)
  const time = findTime(t)
  const recurrence = findRecurrence(t)

  // Intent, from the most explicit signal to the least.
  let intent: Intent | null = null
  if (remindHit || todoWord) intent = 'todo'
  else if (calendarHit) intent = 'event'
  else if (listHit) intent = listHit.value.type === 'shopping' ? 'shopping' : 'todo'
  else if (shoppingListWord || /^\s*(?:please )?(?:buy|get|pick up|we need|we're out of|we are out of)\b/.test(t)) intent = 'shopping'
  else if (time || (date && EVENT_WORDS.test(t))) intent = 'event'
  else if (/^\s*(?:please )?add (?:\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|a dozen|a couple of) /.test(t)) intent = 'shopping'
  else if (date) intent = 'todo'
  if (intent && !remindHit && !todoWord && !calendarHit && !listHit && !shoppingListWord) confidence -= 0.2

  // People.
  const forHit = find(t, /\bfor (both of us|both|us|me|myself|vishwas|garima|everyone)\b/, (m) => personFrom(m[1], ctx.speaker))
  const possessive = find(t, /\b(my|vishwas's|garima's|vishwas'|garima')(?= )/, (m) =>
    m[1] === 'my' ? ctx.speaker : m[1].startsWith('vishwas') ? ('vishwas' as const) : ('garima' as const),
  )
  const iHit = /\b(i|i'm|i am|i've|i have)\b/.test(t) ? ctx.speaker : null
  // "Garima has a dentist appointment…": the event is hers, and the title starts after "has".
  const subject = find(t, /^\s*(vishwas|garima) (?:has|have|is|will be|'s)(?: got)?\b/, (m) => m[1] as PersonId)
  const remindPerson = remindHit ? personFrom(remindHit.value, ctx.speaker) : null

  let assigneeId: Owner = 'unassigned'
  let participants: PersonId[] = []
  if (intent === 'event') {
    // Nobody named: the event is yours, as whoever adds an event owns it. The preview says so.
    const who = forHit?.value ?? subject?.value ?? possessive?.value ?? iHit
    participants = who === 'both' ? ['vishwas', 'garima'] : who && who !== 'unassigned' ? [who] : [ctx.speaker]
    if (!who) hints.push('Set as yours; change who it’s for if needed.')
  } else {
    assigneeId = remindPerson ?? forHit?.value ?? 'unassigned'
  }

  // The list: the one named, or the first list of the right kind for a generic "shopping list".
  let listId: string | null = null
  if (intent === 'shopping') {
    listId = listHit?.value.type === 'shopping' ? listHit.value.id : (ctx.lists.find((l) => l.type === 'shopping')?.id ?? null)
    if (!listHit) hints.push(`Added to ${ctx.lists.find((l) => l.id === listId)?.title ?? 'a shopping list'}; change it if needed.`)
  } else if (intent === 'todo') {
    listId = listHit?.value.type === 'todo' ? listHit.value.id : (ctx.lists.find((l) => l.type === 'todo')?.id ?? null)
    if (!listHit) hints.push(`Added to ${ctx.lists.find((l) => l.id === listId)?.title ?? 'a to-do list'}; change it if needed.`)
  }

  // Event times.
  let startAt: string | null = null
  let endAt: string | null = null
  let endAssumed = false
  if (intent === 'event' && time) {
    if (time.value.ambiguous) hints.push('Say or pick AM or PM.')
    startAt = time.value.start
    endAt = time.value.end
    if (startAt && !endAt && !time.value.ambiguous) {
      const m = minutesOfDay(startAt) + 60
      if (m < 24 * 60) {
        endAt = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        endAssumed = true
        hints.push('End time set to an hour later; change it if needed.')
      }
    }
  }

  // The title is what's left once commands, lists, dates, times and people are cut out.
  let rest = cut(t, [listHit, shoppingListWord, calendarHit, remindHit, todoWord, date, time, recurrence, forHit, intent === 'event' ? subject : null])
  rest = rest
    .replace(/^\s*(?:please\s+)?(?:can you\s+|could you\s+)?(?:add|put|create|make|schedule|set up|buy|get|pick up|we need|we're out of|we are out of|new)\b/, ' ')
    .replace(/^\s*to\s+/, ' ')
    .replace(/\b(?:i have|i've got|i'm going to|i am going to|there's|there is)\b/g, ' ')
  if (intent === 'event' && possessive?.value === ctx.speaker) rest = rest.replace(/\bmy\b/, ' ')

  // Quantity and unit for shopping: "two cartons of milk", "3 bananas", "a dozen eggs".
  let quantity: number | null = null
  let unit: string | null = null
  if (intent === 'shopping') {
    const words = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')
    const m = new RegExp(String.raw`^\s*(?:(\d{1,3})|(${words}))\s+(?:(${UNITS.join('|')})\s+(?:of\s+)?)?(.+)$`).exec(rest)
    if (m) {
      const n = m[1] ? Number(m[1]) : NUMBER_WORDS[m[2]]
      const u = m[3] ?? (m[2] === 'dozen' ? 'dozen' : null)
      if (n > 1 || u) {
        quantity = n
        unit = u
      }
      if (n > 1 || u || m[2] === 'a' || m[2] === 'an') rest = m[4]
    }
  }

  const title = tidyTitle(rest)
  const draft = {
    intent,
    title,
    listId,
    assigneeId,
    quantity,
    unit,
    dueAt: intent === 'todo' ? (date?.value.date ?? null) : null,
    date: intent === 'event' ? (date?.value.date ?? (recurrence ? nextOccurrence(today, recurrence.value) : null)) : null,
    startAt,
    endAt,
    endAssumed,
    participants,
    busy: true,
    eventType: intent === 'event' ? eventTypeOf(t) : ('other' as EventType),
    recurrence: intent === 'event' && recurrence ? recurrence.value : { type: 'none' as const },
  }
  const missingFields = missingFor(draft, ctx.lists)
  if (intent === 'shopping' && date) hints.push('Shopping items don’t have dates; the date was left out.')
  confidence -= 0.15 * missingFields.length
  return { ...draft, confidence: Math.max(0, Math.min(1, Math.round(confidence * 100) / 100)), missingFields, hints }
}

function nextOccurrence(today: LocalDate, r: VoiceAction['recurrence']): LocalDate | null {
  if (r.type === 'daily') return today
  if (r.type !== 'weekly') return null
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i)
    if (r.days.includes(weekdayOf(d))) return d
  }
  return null
}
