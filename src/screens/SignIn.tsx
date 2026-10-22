import { useState, type FormEvent } from 'react'
import { BrushUnderline, PaintedHeart, Sprig } from '../components/paint'
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
      {/* The whole portrait, uncropped, fading into the paper at the bottom like a watercolor edge. */}
      <div className="relative sm:mt-8">
        <div className="overflow-hidden [mask-image:linear-gradient(to_bottom,black_78%,transparent)] sm:rounded-t-[32px]">
          <Portrait className="aspect-[4/3]" />
        </div>
      </div>
      <div className="relative flex flex-1 flex-col px-6 pt-4 pb-10">
        <Sprig className="absolute top-0 right-5 h-10 w-24" flip />
        <h1 className="relative inline-block self-start font-serif text-[38px] leading-tight font-medium tracking-tight">
          <span className="relative z-[1]">
            Vishwarima<span className="text-primary">OS</span>
          </span>
          <BrushUnderline className="absolute bottom-0 left-0 w-full" />
        </h1>
        <p className="mt-3 flex items-center gap-2 font-serif text-[19px] text-ink-muted italic">
          Our days, beautifully organized. <PaintedHeart className="size-4" />
        </p>

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
          <p className="pt-2 text-center font-serif text-[14px] text-ink-muted italic">A little more organized, a lot more together.</p>
        </div>
      </div>
    </main>
  )
}
