import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { warmSoundscape } from './scene/audio/engine.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Build the audio graph now, while the boat's GLB is still downloading, so the
// sound is ready and silent by the time the world mounts instead of being
// constructed after it. See `scene/audio/engine.ts` — this is the whole reason
// that file exists, and calling it here is what keeps the audio off the GLB's
// Suspense boundary.
warmSoundscape()
