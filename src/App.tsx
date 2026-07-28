import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { PortfolioWorld } from './scene/PortfolioWorld'
import { FocusExit } from './FocusExit'
import { IntroVeil } from './IntroVeil'
import { SoundToggle } from './SoundToggle'
import { ExhibitOverlay } from './scene/exhibits/ExhibitOverlay'
import './App.css'

function App() {
  return (
    <>
      {/* `shadows` turns on the shadow map the sun light needs. The camera prop
          matches the ocean stop's pose so the first frame is already framed —
          see `cameraStops.ts`. Loading the boat GLB suspends, so the whole world
          sits behind a Suspense boundary. */}
      <Canvas shadows camera={{ position: [11, 6, -9], fov: 50 }}>
        <Suspense fallback={null}>
          <PortfolioWorld />
        </Suspense>
      </Canvas>
      <ExhibitOverlay />
      {/* The way out of a close-up. Only control on screen while one is open,
          because the camera is locked in there. */}
      <FocusExit />
      {/* Outside the Canvas, and outside the Suspense boundary with it: the
          mute must be there while the boat is still loading, because the audio
          graph is not waiting for the boat either — `main.tsx` warms it at
          boot. See `scene/audio/engine.ts`. */}
      <SoundToggle />
      {/* Above the exhibit backdrop and the corner chrome — it has to hide the
          blank canvas behind everything while the boat GLB is still loading. */}
      <IntroVeil />
    </>
  )
}

export default App
