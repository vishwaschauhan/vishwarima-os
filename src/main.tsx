import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fraunces with its soft axis for headings, DM Sans for everything you read and tap. Both are SIL OFL.
import '@fontsource-variable/dm-sans'
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
