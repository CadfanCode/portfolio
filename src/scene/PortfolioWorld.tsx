import { Boat } from './Boat'
import { Cabin } from './Cabin'
import { CabinHatch } from './CabinHatch'
import { CameraRig } from './CameraRig'
import { Ocean } from './Ocean'
import { Exhibits } from './exhibits/Exhibits'

/** Root of the 3D world. Rendered inside a <Canvas>. */
export function PortfolioWorld() {
  return (
    <>
      <CameraRig />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} />
      <Ocean />
      <Boat />
      <Cabin />
      <CabinHatch />
      <Exhibits />
    </>
  )
}
