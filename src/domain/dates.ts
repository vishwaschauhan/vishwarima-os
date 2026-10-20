// Calendar dates are plain `YYYY-MM-DD` strings in the household timezone.
// Recurrence works on these strings only, so DST never shifts a task to another day.
// Instants (Date / epoch ms) are used only when converting a local date + time to a real moment.

export type LocalDate = string
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isLocalDate(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

export function isLocalTime(value: string): boolean {
  return TIME_RE.test(value)
}

export function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function toUtcDate(date: LocalDate): Date {
  const m = DATE_RE.exec(date)
  if (!m) throw new Error(`Invalid date: ${date}`)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
}

function fromUtcDate(d: Date): LocalDate {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toUtcDate(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtcDate(d)
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000)
}

export function weekdayOf(date: LocalDate): Weekday {
  // getUTCDay: 0 = Sunday
  return WEEKDAYS[(toUtcDate(date).getUTCDay() + 6) % 7]
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)))
}

export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

function partsIn(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** The calendar date at `instant` in `timeZone`. */
export function localDateAt(instant: Date, timeZone: string): LocalDate {
  const p = partsIn(instant, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return localDateAt(now, timeZone)
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Chicago CDT = -300). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = partsIn(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/**
 * The instant at which the wall clock in `timeZone` reads `date time`.
 * Times skipped by a spring-forward jump resolve to the later offset;
 * repeated times in a fall-back hour resolve to the first occurrence.
 */
export function zonedInstant(date: LocalDate, time: string, timeZone: string): Date {
  const d = toUtcDate(date)
  const wall = d.getTime() + minutesOfDay(time) * 60_000
  const first = offsetMinutes(new Date(wall), timeZone)
  let guess = wall - first * 60_000
  const second = offsetMinutes(new Date(guess), timeZone)
  if (second !== first) guess = wall - Math.min(first, second) * 60_000
  return new Date(guess)
}
