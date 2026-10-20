import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { firebase } from './firebase'

interface AuthState {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })
  useEffect(() => onAuthStateChanged(firebase().auth, (user) => setState({ user, loading: false })), [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext)
}
