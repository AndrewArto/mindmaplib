import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mindmaplib/react/styles.css'
import './style.css'
import { App } from './App'

const app = document.getElementById('app')

if (!app) {
  throw new Error('Missing #app mount point')
}

// eslint-disable-next-line no-console
console.log(
  `%c mindmaplib demo %c ${__BUILD_TIME__} `,
  'background:#1a1a2e;color:#8be9fd;padding:2px 6px;border-radius:3px 0 0 3px',
  'background:#16213e;color:#50fa7b;padding:2px 6px;border-radius:0 3px 3px 0',
)

createRoot(app).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
