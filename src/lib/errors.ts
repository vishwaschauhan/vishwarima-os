export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'That email and password don’t match.',
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/popup-closed-by-user': '',
    'auth/network-request-failed': 'You’re offline. Try again when you’re connected.',
    'permission-denied': 'You don’t have access to that.',
  }
  if (code in messages) return messages[code]
  return (e as Error)?.message ?? 'Something went wrong.'
}
