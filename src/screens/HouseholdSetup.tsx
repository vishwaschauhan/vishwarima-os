import type { User } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { PageTitle } from '../components/paint'
import { Button, Card, ErrorText, Field, Portrait, Wordmark } from '../components/ui'
import { friendlyError } from '../lib/errors'
import { acceptInvite, foundHousehold, type Invite, type PlanMemberId } from '../data/household'
import { resendVerification, signOutUser } from '../lib/authActions'

const NAMES: Record<PlanMemberId, string> = { vishwas: 'Vishwas', garima: 'Garima' }

/** Shown to a signed-in user who is not yet in a household. */
export function HouseholdSetup({ user, invite, onDone }: { user: User; invite: Invite | null; onDone: () => void }) {
  const [planMemberId, setPlanMemberId] = useState<PlanMemberId>(invite?.planMemberId ?? 'vishwas')
  const [displayName, setDisplayName] = useState(
    user.displayName?.split(' ')[0] ?? NAMES[invite?.planMemberId ?? 'vishwas'],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (invite) await acceptInvite(user, invite, displayName.trim())
      else await foundHousehold(user, displayName.trim(), planMemberId)
      onDone()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 pt-10 pb-12">
      <Wordmark className="text-[22px]" />
      <div className="mt-6 overflow-hidden rounded-[28px] shadow-lift ring-1 ring-line">
        <Portrait className="aspect-[2/1] object-[50%_20%]" />
      </div>
      <div className="mt-8">
        <PageTitle>{invite ? 'You’re invited' : 'Set up your household'}</PageTitle>
      </div>
      <p className="mt-2 text-ink-muted">
        {invite
          ? 'Join the Singh Family household to share tasks and the family calendar.'
          : 'This creates your household and loads the family plan. Your partner joins with an invite afterwards.'}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        {!invite && (
          <fieldset>
            <legend className="mb-2 text-sm text-ink-muted">Which of you is this?</legend>
            <div className="grid grid-cols-2 gap-3">
              {(['vishwas', 'garima'] as const).map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={planMemberId === id}
                  onClick={() => {
                    setPlanMemberId(id)
                    setDisplayName(NAMES[id])
                  }}
                  className={`press min-h-14 rounded-card border text-[16px] font-semibold shadow-paper ${
                    planMemberId === id
                      ? id === 'vishwas'
                        ? 'border-vishwas-ink bg-vishwas text-vishwas-ink'
                        : 'border-garima-ink bg-garima text-garima-ink'
                      : 'border-line bg-surface'
                  }`}
                >
                  {NAMES[id]}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <Field label="Display name" required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy || !displayName.trim()}>
          {invite ? 'Join household' : 'Create household'}
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>

      {!invite && !user.emailVerified && (
        <Card className="mt-8">
          <p className="text-sm text-ink-muted">
            Joining someone else’s household? Verify your email first, then reload this page.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={async () => {
              await resendVerification(user)
              setNotice(`Verification email sent to ${user.email}.`)
            }}
          >
            Send verification email
          </Button>
          {notice && <p className="mt-2 text-sm text-ink-muted">{notice}</p>}
        </Card>
      )}

      <p className="mt-10 text-center text-sm text-ink-muted">
        Signed in as {user.email}.{' '}
        <button className="underline underline-offset-2" onClick={() => signOutUser()}>
          Sign out
        </button>
      </p>
    </main>
  )
}
