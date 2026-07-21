import type { Exhibit, ExhibitHotspotProps } from './types'

/**
 * No position of its own — <Exhibits /> wraps this in a positioned group, and
 * pointer events bubble up to it.
 */
function HotspotMesh({ hovered }: ExhibitHotspotProps) {
  return (
    <mesh>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshStandardMaterial color={hovered ? '#ffcc33' : '#b08968'} />
    </mesh>
  )
}

function Content() {
  return (
    <>
      <p>
        Placeholder content. This panel is plain DOM rendered outside the
        Canvas, so it is selectable, readable by a screen reader, and styled
        with ordinary CSS.
      </p>
      <p>
        Proving the pattern: this exhibit was added with one entry in the
        registry and this one file. Nothing in the camera rig, the scene state
        machine, or any other exhibit had to change.
      </p>
    </>
  )
}

export const dummy: Exhibit = {
  id: 'dummy',
  label: 'Dummy exhibit',
  scene: 'cabin',
  position: [0.5, -0.35, -3.2],
  HotspotMesh,
  Content,
}
