# Project: Maxi 77 Portfolio

## What this is
An interactive WebGL portfolio for a software developer, set aboard a Maxi 77 sailboat.
Visitors move through a fixed camera path (ocean → cockpit → cabin) with free-look at
each stop — not free-roam. Hotspots open "exhibits": self-contained project demos
presented as physical objects in the boat. Full narrative vision lives in
`GUIDE.md`; this file is the operational reference for coding decisions.

## Stack
- Vite + React + TypeScript
- three.js + @react-three/fiber + @react-three/drei
- zustand for state
- Oxlint for linting
- Deployed on Vercel, auto-deploy from GitHub main branch

## Architecture
- Scene state machine: current state lives in `state/useSceneStore.ts`. Camera position,
  visible objects, and interactable objects are derived from state, not routed via pages.
- Locked path, free-look: camera transitions are authored, not player-controlled. At each
  stop the user can rotate look direction within constrained limits, no free movement.
- Exhibit plugin pattern: every project demo implements a shared Exhibit interface
  (hotspot, trigger, content) and registers with a central registry. Adding a new exhibit
  should never require editing the camera rig, state machine, or other exhibits.

## Folder conventions
- `scene/` — 3D components (Ocean, Boat, Cabin, CameraRig, Hotspot, exhibits)
- `state/` — zustand stores
- `content/` — plain data (bio text, project descriptions), separate from components
- `assets/models|textures|audio` — GLB models, textures, sound

## Commands
- `npm run dev` — local dev server
- `npm run lint` — Oxlint
- `npm run build` — production build

## Current focus
Phase 3: core loop prototype. `useSceneStore` is done. Next up is `CameraRig`
interpolating camera position/target between stops, then drei's `CameraControls`
for constrained free-look on arrival.

## Conventions
- Fake cheap effects over real simulation — no real physics, bake lighting where possible.
- New exhibits go through the Exhibit registry, never wired directly into App.tsx.
