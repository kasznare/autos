import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import initRapier from '@dimforge/rapier3d-compat'
import rapierWasmUrl from '@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm?url'
import './index.css'
import { App } from './App'

await initRapier({ module_or_path: rapierWasmUrl })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
