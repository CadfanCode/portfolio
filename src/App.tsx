import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { PortfolioWorld } from './scene/PortfolioWorld'
import { ExhibitOverlay } from './scene/exhibits/ExhibitOverlay'
import './App.css'

function App() {
  return (
    <>
      {/* `shadows` turns on the shadow map the sun light needs. The camera prop
          matches the ocean stop's pose so the first frame is already framed —
          see `cameraStops.ts`. Loading the boat GLB suspends, so the whole world
          sits behind a Suspense boundary. */}
      <Canvas shadows camera={{ position: [9, 5, 13], fov: 50 }}>
        <Suspense fallback={null}>
          <PortfolioWorld />
        </Suspense>
      </Canvas>
      <ExhibitOverlay />
    </>
  )
}

export default App
