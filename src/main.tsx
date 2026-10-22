import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fraunces with its soft axis for headings, Shantell Sans (informal axis) for the things you write down:
// tasks, list items, events and notes. DM Sans for labels and controls. All are SIL OFL.
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/shantell-sans/infm.css'
import '@fontsource-variable/fraunces/soft.css'
import '@fontsource-variable/fraunces/wght-italic.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, storedTheme } from './app/theme'

applyTheme(storedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
