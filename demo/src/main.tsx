import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mindmaplib/react/styles.css'
import './style.css'
import { App } from './App'

const app = document.getElementById('app')

if (!app) {
  throw new Error('Missing #app mount point')
}

createRoot(app).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
