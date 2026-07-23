/**
 * Placeholder sea plane — a real Gerstner-wave water shader replaces this next,
 * at which point the boat samples the same wave function to float on it.
 *
 * `receiveShadow` for now so the hull grounds against the water instead of
 * floating over a flat colour; it casts nothing itself. A touch of reflectivity
 * (low roughness, some metalness) lets it pick up the sky's colour off the
 * `Environment` rather than reading as flat paint.
 */
export function Ocean() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color="#183642" roughness={0.35} metalness={0.15} />
    </mesh>
  )
}
