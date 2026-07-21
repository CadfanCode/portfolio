/** Placeholder sea plane — to be replaced with a real water shader. */
export function Ocean() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#1b3a4b" />
    </mesh>
  )
}
