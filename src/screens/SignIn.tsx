import { useState, type FormEvent } from 'react'
import { Button, ErrorText, Field, Portrait } from '../components/ui'
import { friendlyError } from '../lib/errors'
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/authActions'

export function SignIn() {
  const [mode, setMode] = useState<'choose' | 'signin' | 'signup'>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    run(() => (mode === 'signup' ? signUpWithEmail(email, password) : signInWithEmail(email, password)))
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="overflow-hidden sm:mt-8 sm:rounded-3xl">
        <Portrait className="aspect-[4/3]" />
      </div>
      <div className="flex flex-1 flex-col px-6 pt-8 pb-10">
        <h1 className="font-serif text-[34px] leading-tight tracking-tight">VishwarimaOS</h1>
        <p className="mt-2 text-[17px] text-ink-muted">Our days, beautifully organized.</p>

        <div className="mt-auto space-y-3 pt-10">
          {mode === 'choose' ? (
            <>
              <Button className="w-full" disabled={busy} onClick={() => run(signInWithGoogle)}>
                Continue with Google
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => setMode('signin')}>
                Use email and password
              </Button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <Field
                label="Password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
              <div className="flex justify-between">
                <Button type="button" variant="quiet" className="px-0" onClick={() => setMode('choose')}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  className="px-0"
                  onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                >
                  {mode === 'signup' ? 'I have an account' : 'Create an account'}
                </Button>
              </div>
            </form>
          )}
          <ErrorText>{error}</ErrorText>
          <p className="pt-2 text-center text-[13px] text-ink-muted">A little more organized, a lot more together.</p>
        </div>
      </div>
    </main>
  )
}
