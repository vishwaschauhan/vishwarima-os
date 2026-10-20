import type { User } from 'firebase/auth'
import { useMemo, useState, type FormEvent } from 'react'
import { Button, Card, ErrorText, Field, Wordmark } from '../components/ui'
import { friendlyError } from '../lib/errors'
import { createInvite, type Household, type PlanMemberId } from '../data/household'
import { usePlanVersions } from '../data/plans'
import { todayIn, zonedInstant } from '../domain/dates'
import { generateOccurrences, type Occurrence } from '../domain/occurrences'
import type { Owner } from '../domain/plan'
import { signOutUser } from '../lib/authActions'

const OWNER_STYLE: Record<Owner, string> = {
  vishwas: 'bg-vishwas text-vishwas-ink',
  garima: 'bg-garima text-garima-ink',
  both: 'bg-shared text-shared-ink',
  unassigned: 'bg-canvas text-ink-muted border border-line',
}
const OWNER_LABEL: Record<Owner, string> = { vishwas: 'Vishwas', garima: 'Garima', both: 'Both', unassigned: 'Unassigned' }

function timeLabel(o: Occurrence): string {
  if (!o.time) return 'Anytime'
  if ('slot' in o.time) return o.time.slot[0].toUpperCase() + o.time.slot.slice(1)
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  }
  return o.time.end ? `${fmt(o.time.start)} – ${fmt(o.time.end)}` : fmt(o.time.start)
}

/**
 * Foundation home screen: today's plan straight from the active plan versions.
 * Completing tasks, the week view and the calendar arrive with the core app.
 */
export function Home({ user, household }: { user: User; household: Household }) {
  const { versions, invalid, loading, error } = usePlanVersions(household.id)
  const today = todayIn(household.timezone)
  const items = useMemo(() => generateOccurrences(versions, today, today), [versions, today])
  const isAdmin = household.adminUids.includes(user.uid)
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: household.timezone,
  }).format(zonedInstant(today, '12:00', household.timezone))

  return (
    <main className="mx-auto max-w-xl px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <Wordmark className="text-lg" />
        <Button variant="quiet" className="px-0" onClick={() => signOutUser()}>
          Sign out
        </Button>
      </header>

      <h1 className="mt-8 font-serif text-[30px] leading-tight tracking-tight">{dateLabel}</h1>
      <p className="mt-1 text-ink-muted">{household.name}</p>

      <section className="mt-6 space-y-2" aria-label="Today’s plan">
        {loading && <p className="text-ink-muted">Loading the plan…</p>}
        <ErrorText>{error && friendlyError(error)}</ErrorText>
        {invalid.length > 0 && <ErrorText>Plan version {invalid.map((v) => v.id).join(', ')} has errors and is ignored.</ErrorText>}
        {!loading && items.length === 0 && <p className="text-ink-muted">Nothing planned today.</p>}
        {items.map((o) => (
          <div key={o.key} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-medium">{o.title}</p>
              <p className="text-sm text-ink-muted">
                {timeLabel(o)}
                {o.optional && ' · Optional'}
                {o.kind === 'info' && ' · Event'}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${OWNER_STYLE[o.owner]}`}>
              {OWNER_LABEL[o.owner]}
            </span>
          </div>
        ))}
      </section>

      {isAdmin && household.memberUids.length < 2 && <InvitePartner user={user} householdId={household.id} />}
    </main>
  )
}

function InvitePartner({ user, householdId }: { user: User; householdId: string }) {
  const [email, setEmail] = useState('')
  const [planMemberId, setPlanMemberId] = useState<PlanMemberId>('garima')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createInvite(user, householdId, email, planMemberId)
      setSent(email.trim())
      setEmail('')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-10">
      <h2 className="text-[17px] font-semibold">Invite your partner</h2>
      <p className="mt-1 text-sm text-ink-muted">
        They sign in with this exact email (Google, or email and password once verified) and join automatically.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Partner’s email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-muted">They are</span>
          <select
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px]"
            value={planMemberId}
            onChange={(e) => setPlanMemberId(e.target.value as PlanMemberId)}
          >
            <option value="garima">Garima</option>
            <option value="vishwas">Vishwas</option>
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          Create invite
        </Button>
        <ErrorText>{error}</ErrorText>
        {sent && <p className="text-sm text-sage-ink">Invite ready. Ask {sent} to open the app and sign in.</p>}
      </form>
    </Card>
  )
}
