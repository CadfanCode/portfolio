import { useMemo } from 'react'
import { BackSide, Color, Vector3 } from 'three'
import type { Vector3Tuple } from 'three'

/**
 * A gradient sky dome, meant to be dropped inside a drei `<Environment>` so it
 * bakes into the reflection cubemap.
 *
 * The old environment was three flat rectangles at 256px. Every reflective
 * surface on the boat — gelcoat, stainless, glass, and the sea itself — was
 * reflecting that: a blob with no horizon. A winch reflecting a sky with an
 * actual horizon line in it is one of the cheapest, largest steps toward looking
 * real, because the eye reads a curved metal highlight as "outside" only when
 * there is a sky-meets-sea seam bent across it.
 *
 * So this is a proper dome: zenith blue easing down to a pale haze band at the
 * horizon, then the sea tone below, plus a tight hot sun. The colours are the
 * same ones the visible `<Sky>` and `<Ocean>` are tuned to (see Ocean.tsx), so
 * what a surface reflects agrees with what sits behind it. It is a single
 * unlit shader on a back-faced sphere — no lighting, no cost beyond the one-time
 * bake the Environment already does.
 */
export function EnvSky({ sun }: { sun: Vector3Tuple }) {
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new Color('#5b86ad') },
      uHorizon: { value: new Color('#cfd8de') },
      uSeaHigh: { value: new Color('#245663') },
      uSeaLow: { value: new Color('#123742') },
      uSunColor: { value: new Color('#fff1dc') },
      uSun: { value: new Vector3(...sun).normalize() },
    }),
    [sun],
  )

  return (
    <mesh scale={100}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          precision highp float;
          varying vec3 vDir;
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uSeaHigh;
          uniform vec3 uSeaLow;
          uniform vec3 uSunColor;
          uniform vec3 uSun;

          void main() {
            vec3 dir = normalize(vDir);
            float el = dir.y; // -1 down .. +1 up

            // Sky: haze at the horizon lifting to zenith blue overhead.
            vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, el));
            // Sea: the shallow tone right at the waterline deepening downward,
            // slightly darker than the real sea so reflections don't glow.
            vec3 sea = mix(uSeaHigh, uSeaLow, smoothstep(0.0, -0.35, el)) * 0.85;

            // A soft haze band ±3° around the horizon rather than a hard seam,
            // which is what a curved highlight needs to read as a real horizon.
            vec3 col = mix(sea, sky, smoothstep(-0.05, 0.05, el));

            // The sun: a tight hot core for the specular glint on metal and
            // water, plus a broad warm bloom around it.
            float d = max(dot(dir, uSun), 0.0);
            col += uSunColor * pow(d, 900.0) * 6.0;
            col += uSunColor * pow(d, 12.0) * 0.25;

            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  )
}
