import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { nombreDe } from './pasos'
import { claveDe, PaginaCompartida } from './registro'

const e = new URLSearchParams(location.search).get('e')
const compartido = e && !claveDe(e) ? e : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {compartido ? <PaginaCompartida id={compartido} nombreCultivo={nombreDe} /> : <App />}
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js')
