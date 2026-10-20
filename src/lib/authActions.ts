import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { firebase } from './firebase'

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(firebase().auth, new GoogleAuthProvider())
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebase().auth, email, password)
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { user } = await createUserWithEmailAndPassword(firebase().auth, email, password)
  // Joining by invite requires a verified email.
  await sendEmailVerification(user)
}

export async function resendVerification(user: User): Promise<void> {
  await sendEmailVerification(user)
}

export async function signOutUser(): Promise<void> {
  await signOut(firebase().auth)
}
