import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ErrorText, Wordmark } from './components/ui'
import { friendlyError } from './lib/errors'
import { findInvite, findMyHousehold, type Household, type Invite } from './data/household'
import { AuthProvider, useAuth } from './lib/auth'
import { firebase, firebaseConfigured } from './lib/firebase'
import { HouseholdProvider } from './app/household'
import { Shell } from './app/Shell'
import { HouseholdSetup } from './screens/HouseholdSetup'
import { SignIn } from './screens/SignIn'

export default function App() {
  if (!firebaseConfigured) return <NotConfigured />
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}

function Root() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <SignIn />
  return <HouseholdGate key={user.uid} user={user} />
}

type GateState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'setup'; invite: Invite | null }
  | { status: 'ready'; householdId: string }

function HouseholdGate({ user }: { user: User }) {
  const [state, setState] = useState<GateState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const household = await findMyHousehold(user.uid)
        if (cancelled) return
        if (household) return setState({ status: 'ready', householdId: household.id })
        const invite = await findInvite(user)
        if (!cancelled) setState({ status: 'setup', invite })
      } catch (error) {
        if (!cancelled) setState({ status: 'error', error })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, attempt])

  if (state.status === 'loading') return <Splash />
  if (state.status === 'error')
    return (
      <Centered>
        <ErrorText>{friendlyError(state.error)}</ErrorText>
      </Centered>
    )
  if (state.status === 'setup')
    return <HouseholdSetup user={user} invite={state.invite} onDone={() => setAttempt((n) => n + 1)} />
  return <LiveHousehold user={user} householdId={state.householdId} />
}

function LiveHousehold({ user, householdId }: { user: User; householdId: string }) {
  const [household, setHousehold] = useState<Household | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(
    () =>
      onSnapshot(
        doc(firebase().db, 'households', householdId),
        (snap) => setHousehold(snap.exists() ? ({ id: snap.id, ...snap.data() } as Household) : null),
        setError,
      ),
    [householdId],
  )

  if (error)
    return (
      <Centered>
        <ErrorText>{friendlyError(error)}</ErrorText>
      </Centered>
    )
  if (!household) return <Splash />
  return (
    <HouseholdProvider user={user} household={household}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </HouseholdProvider>
  )
}

function Splash() {
  return (
    <Centered>
      <Wordmark className="animate-pulse text-[28px] text-ink-muted" />
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center px-6 text-center">{children}</main>
}

function NotConfigured() {
  return (
    <main className="mx-auto max-w-xl px-6 pt-16">
      <Wordmark className="text-2xl" />
      <h1 className="mt-6 font-serif text-[28px] leading-tight">Almost there</h1>
      <p className="mt-3 text-ink-muted">
        This build has no Firebase configuration. Copy <code>.env.example</code> to <code>.env</code>, fill in your
        Firebase web app settings and rebuild. The README walks through it.
      </p>
    </main>
  )
}
