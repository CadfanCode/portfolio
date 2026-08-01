import { SceneCanvas } from './SceneCanvas'
import { CabinHint } from './CabinHint'
import { FocusExit } from './FocusExit'
import { IntroVeil } from './IntroVeil'
import { SoundToggle } from './SoundToggle'
import { ExhibitOverlay } from './scene/exhibits/ExhibitOverlay'
import './App.css'

function App() {
  return (
    <>
      {/* The whole 3D scene, including the Canvas itself. It lives in its own
          component because the quality system drives the Canvas's `dpr` and
          shadow filter from the store, and R3F re-applies every Canvas prop on
          every render of whatever owns it — so that owner has to be something
          small with a tightly controlled set of subscriptions, not this file.
          See the note at the top of `SceneCanvas.tsx`. */}
      <SceneCanvas />
      <ExhibitOverlay />
      {/* The way out of a close-up. Only control on screen while one is open,
          because the camera is locked in there. */}
      <FocusExit />
      {/* Outside the Canvas, and outside the Suspense boundary with it: the
          mute must be there while the boat is still loading, because the audio
          graph is not waiting for the boat either — `main.tsx` warms it at
          boot. See `scene/audio/engine.ts`. */}
      <SoundToggle />
      {/* A nudge toward the bookshelf, not a control — bottom-centre, below
          everything else that floats over the scene. */}
      <CabinHint />
      {/* Above the exhibit backdrop and the corner chrome — it has to hide the
          blank canvas behind everything while the boat GLB is still loading. */}
      <IntroVeil />
    </>
  )
}

export default App
