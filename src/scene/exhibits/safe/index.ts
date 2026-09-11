import { Safe } from './Safe'
import { SafeChrome } from './SafeChrome'
import { SafeHotspot } from './SafeHotspot'
import type { Exhibit } from '../types'

/**
 * The safe on the chart table: the authentication exhibit.
 *
 * A staged exhibit, like `about` — `Safe` owns the 3D (the door, the two cards,
 * what is inside) and `SafeChrome` is the DOM over the canvas (the keypad, and
 * the decoded tokens afterwards, which are the actual point of the thing).
 *
 * It hangs off the `desk` close-up rather than being reachable from the cabin
 * stop directly. `cameraFocus.ts` has flown the camera to this table since
 * before there was anything here to look at, and the hotspot only exists once
 * the visitor is already leaning over it — a 220 mm safe seen across a cabin is
 * not a click target, which is the same argument `FocusTargets` makes at length
 * about book spines.
 *
 * The backend is `safe-auth/` in this repo, and the exhibit works whether or not
 * one is running: `safeAuthClient` tries live and `recordedFlow` covers the rest.
 * When a backend does go up somewhere, the one thing worth adding is a call to
 * `warm()` from the cockpit stop rather than from here — a container that sleeps
 * wants the length of the authored walk to the cabin to wake up in, and by the
 * time this module mounts the visitor is already reaching for a card.
 */
export const safe: Exhibit = {
  id: 'safe',
  label: 'The safe',
  scene: 'cabin',
  focus: 'desk',
  // Centred on the safe itself, not on the desk group the close-up frames.
  // Measured off the built GLB: the body spans x -1.158…-0.945, y 0.49…0.72,
  // z 1.118…1.339, so this is its middle.
  position: [-1.05, 0.605, 1.229],
  HotspotMesh: SafeHotspot,
  Scene: Safe,
  Content: SafeChrome,
}
