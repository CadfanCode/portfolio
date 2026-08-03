import { SceneCanvas } from './SceneCanvas'
import { FocusExit } from './FocusExit'
import { IntroVeil } from './IntroVeil'
import { ParrotChatDock } from './parrot'
import { SoundToggle } from './SoundToggle'
import { ComingSoonToast } from './ComingSoonToast'
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
      {/* Polly's voice below decks, where the bird himself has nothing to
          visibly hang the balloon off — bottom-centre, below everything else
          that floats over the scene. See `parrot/ParrotChatDock.tsx`. */}
      <ParrotChatDock />
      {/* The "not built yet" toast for the still-unwired exhibits (chart
          table, VHF, About Me). Top-centre — see `ComingSoonToast.tsx` for
          why that slot and not one of the corners already in use. */}
      <ComingSoonToast />
      {/* Above the exhibit backdrop and the corner chrome — it has to hide the
          blank canvas behind everything while the boat GLB is still loading. */}
      <IntroVeil />
    </>
  )
}

export default App
