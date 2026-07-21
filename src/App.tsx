import { Canvas } from '@react-three/fiber'
import { PortfolioWorld } from './scene/PortfolioWorld'
import './App.css'

function App() {
  return (
    <Canvas camera={{ position: [9, 5, 13], fov: 50 }}>
      <PortfolioWorld />
    </Canvas>
  )
}

export default App
