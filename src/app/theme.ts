import { useStoredState } from './useStoredState'

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'theme'
const COLORS = { light: '#FCF7EF', dark: '#1D1916' }

/** Applies the theme to <html> and the browser chrome colour. Called before the first render to avoid a flash. */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.dataset.theme = choice
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light'
    meta.content = COLORS[choice === 'system' ? scheme : choice]
  }
}

export function storedTheme(): ThemeChoice {
  try {
    const v = JSON.parse(localStorage.getItem(`vishwarima.${KEY}`) ?? '"system"') as unknown
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useStoredState<ThemeChoice>(KEY, storedTheme())
  return [
    theme,
    (t) => {
      setTheme(t)
      applyTheme(t)
    },
  ]
}
