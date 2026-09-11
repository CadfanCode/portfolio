import { useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import type { Object3D } from 'three'
import type { Mesh as MeshType } from 'three'
import {
  SLOT_FORWARD_OF_CENTRE,
  SLOT_HEIGHT_FRACTION,
  SLOT_PROUD,
  findMesh,
  meshBoxInModelSpace,
} from './safeGeometry'

/**
 * The safe exhibit takes over seven nodes of a shared, globally cached
 * `useGLTF` scene — `Boat.tsx` loaded the same model long before this exhibit
 * can open, and every other consumer of that scene expects the nodes it isn't
 * animating to stay exactly as baked. This hook is the one place that finds
 * those nodes, clones the ones this component animates, hides the originals
 * for as long as the clones are standing in for them, and restores them on
 * unmount — plus everything derived from their boxes, so `Safe.tsx` itself
 * never has to know a lookup can fail soft. The Blender rebuild that adds
 * `desk_safe_door`, `desk_safe_contents`, `card_blue` and `card_red` may not
 * have landed yet, so every lookup here tolerates a `null`.
 */
export function useSafeParts(model: Object3D) {
  const safeMesh = useMemo(() => findMesh(model, 'desk_safe'), [model])
  const doorMesh = useMemo(() => findMesh(model, 'desk_safe_door'), [model])
  const brassMesh = useMemo(() => findMesh(model, 'desk_safe_brass'), [model])
  // Two objects, not one, because they carry two materials: the half-hull is
  // teak like the rest of the cabin joinery and the key is brass. That split
  // is what lets `safe:boat` and `safe:key` reveal different things — see
  // `_desk_safe_contents` in `blender/fitout.py`, which made it deliberately.
  const boatMesh = useMemo(() => findMesh(model, 'desk_safe_contents'), [model])
  const keyMesh = useMemo(() => findMesh(model, 'desk_safe_contents_brass'), [model])
  const cardBlueMesh = useMemo(() => findMesh(model, 'card_blue'), [model])
  const cardRedMesh = useMemo(() => findMesh(model, 'card_red'), [model])
  // `desk_safe` itself (the body) is never hidden or cloned — it doesn't move,
  // so the original stays exactly where it is. It is looked up because its box
  // is what the slot position is measured against: the slot's height and
  // station are fractions of the *body*, which is how Blender places them.

  // The three static clones — door, brass, contents. None of these need a
  // wrapping group of their own: their geometry is already baked in the
  // model's own space, so mounted with no added transform under this
  // component's root they render at exactly their original pose. The door is
  // the exception, handled below, because it needs to hinge.
  const doorClone = useMemo(() => (doorMesh ? doorMesh.clone() : null), [doorMesh])
  const brassClone = useMemo(() => (brassMesh ? brassMesh.clone() : null), [brassMesh])
  const boatClone = useMemo(() => (boatMesh ? boatMesh.clone() : null), [boatMesh])
  const keyClone = useMemo(() => (keyMesh ? keyMesh.clone() : null), [keyMesh])
  const cardBlueClone = useMemo(() => (cardBlueMesh ? cardBlueMesh.clone() : null), [cardBlueMesh])
  const cardRedClone = useMemo(() => (cardRedMesh ? cardRedMesh.clone() : null), [cardRedMesh])

  // Hide the originals for exactly as long as this component is mounted —
  // <Exhibits/> keeps it mounted from the moment the exhibit opens through
  // the end of its own exit animation, and unmounts it right after. Tying the
  // hide/restore to mount/unmount rather than to `active` or to `progress`
  // reaching some threshold means the restore always runs, including if this
  // component is torn down mid-animation: a left-behind invisible door would
  // be a broken cabin for every visitor after.
  useEffect(() => {
    const originals = [
      doorMesh,
      brassMesh,
      boatMesh,
      keyMesh,
      cardBlueMesh,
      cardRedMesh,
    ].filter((m): m is MeshType => m !== null)
    for (const m of originals) m.visible = false
    return () => {
      for (const m of originals) m.visible = true
    }
  }, [doorMesh, brassMesh, boatMesh, keyMesh, cardBlueMesh, cardRedMesh])

  // The hinge: the door's forward (−z) vertical edge, on its own proud outer
  // face. Read off the door clone's own bounding box, per the task brief this
  // was built from, rather than a hardcoded constant — a Blender rebuild that
  // nudges the safe by a millimetre shouldn't need a matching edit here.
  const doorBox = useMemo(
    () => (doorClone ? meshBoxInModelSpace(model, doorClone) : null),
    [model, doorClone],
  )
  /**
   * The hinge: the door's **after** vertical edge, on its own proud outer face.
   *
   * After, not forward, and the camera is the reason. The `desk` close-up in
   * `cameraFocus.ts` stands forward of the safe and inboard of it, so a leaf
   * hung on the forward edge swings straight across the line between the
   * visitor and the opening — the reveal becomes a view of the back of a door.
   * Hung aft it opens away from that sightline.
   *
   * Read off the door's own bounding box rather than hardcoded, so a Blender
   * rebuild that moves the safe needs no matching edit here.
   */
  const hinge = useMemo(() => {
    if (!doorBox) return null
    const centre = doorBox.getCenter(new Vector3())
    return new Vector3(doorBox.max.x, centre.y, doorBox.max.z)
  }, [doorBox])

  const cardBlueBox = useMemo(
    () => (cardBlueClone ? meshBoxInModelSpace(model, cardBlueClone) : null),
    [model, cardBlueClone],
  )
  const cardBlueAnchor = useMemo(
    () => (cardBlueBox ? cardBlueBox.getCenter(new Vector3()) : null),
    [cardBlueBox],
  )
  const cardRedBox = useMemo(
    () => (cardRedClone ? meshBoxInModelSpace(model, cardRedClone) : null),
    [model, cardRedClone],
  )
  const cardRedAnchor = useMemo(
    () => (cardRedBox ? cardRedBox.getCenter(new Vector3()) : null),
    [cardRedBox],
  )

  // The contents' own baked poses — where they rest in the cavity, and what
  // they must ease back to once the safe closes. Same pattern as the cards'
  // anchors above.
  const boatBox = useMemo(
    () => (boatClone ? meshBoxInModelSpace(model, boatClone) : null),
    [model, boatClone],
  )
  const boatAnchor = useMemo(() => (boatBox ? boatBox.getCenter(new Vector3()) : null), [boatBox])
  const keyBox = useMemo(
    () => (keyClone ? meshBoxInModelSpace(model, keyClone) : null),
    [model, keyClone],
  )
  const keyAnchor = useMemo(() => (keyBox ? keyBox.getCenter(new Vector3()) : null), [keyBox])

  const safeBox = useMemo(
    () => (safeMesh ? meshBoxInModelSpace(model, safeMesh) : null),
    [model, safeMesh],
  )

  /**
   * The tap point: the mouth of the card slot, with the door shut.
   *
   * Derived from the same two numbers `_desk_safe_slot` in `blender/fitout.py`
   * builds the escutcheon from — 24% of the way up the body, and 20 mm abaft
   * its middle — rather than from the brass object's bounding box. The brass
   * is one joined mesh carrying the handle, the dial, the index and the slot
   * jaws together, so its centroid sits in the middle of all four and is not
   * the slot at all: a card aimed at it parks beside the dial, which is what
   * it did. There is no dedicated slot node to measure, so the honest choice
   * is to restate the builder's own fractions here and say where they came
   * from.
   */
  const slotPos = useMemo(() => {
    if (!safeBox || !doorBox) return null
    return new Vector3(
      // Proud of the door's own outer face, so the card meets the jaws.
      doorBox.max.x + SLOT_PROUD,
      safeBox.min.y + (safeBox.max.y - safeBox.min.y) * SLOT_HEIGHT_FRACTION,
      (safeBox.min.z + safeBox.max.z) / 2 + SLOT_FORWARD_OF_CENTRE,
    )
  }, [safeBox, doorBox])

  return {
    doorClone,
    brassClone,
    boatClone,
    keyClone,
    cardBlueClone,
    cardRedClone,
    hinge,
    cardBlueAnchor,
    cardRedAnchor,
    boatAnchor,
    keyAnchor,
    slotPos,
  }
}
