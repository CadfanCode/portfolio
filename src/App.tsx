import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { PortfolioWorld } from './scene/PortfolioWorld'
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
      {/* Outside the Canvas, and outside the Suspense boundary with it: the
          mute must be there while the boat is still loading, because the sound
          is not waiting for the boat. */}
      <SoundToggle />
    </>
  )
}

export default App
