import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore'
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

/** Sign out and wipe this device's offline copy of the household, then start fresh. */
export async function signOutUser(): Promise<void> {
  const { auth, db } = firebase()
  await signOut(auth)
  try {
    await terminate(db)
    await clearIndexedDbPersistence(db)
  } finally {
    window.location.assign('/')
  }
}
