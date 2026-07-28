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
- `npm run build` — production build (`tsc -b` then `vite build`)
- `npx tsc -b` — typecheck on its own
- `npm run model:build|model:verify|model:preview` — the Blender model pipeline

## How work gets done
This session is the **arbiter** (Opus 5, xhigh — set in `.claude/settings.json`). It
plans, delegates and reviews. The agents in `.claude/agents/` are **workers**
(Sonnet 5, medium) that do the routine reads and edits: `scout` researches,
`scene-dev` edits `src/`, `blender-dev` edits `blender/`, `scribe` edits prose,
`checker` verifies. `scout` and `checker` cannot write, so their reports are
evidence rather than claims.

Default to delegating anything that is mostly reading or mostly typing; keep the
planning and the final diff review here. Do it yourself when delegating would cost
more context than it saves — a two-line change you can already see, or a debug you
are holding state for. `.claude/ARBITER.md` has the full protocol.

## Current focus
Phase 6: real exhibits. The core loop is built — `useSceneStore`, `CameraRig` over
drei's `CameraControls` with per-stop look limits, the `focus` close-up axis, and the
Exhibit registry proven by `exhibits/dummy.tsx`. Art direction is largely in: the
boat is a parametric Blender model loaded through `useGLTF`, with interior, weather
and soundscape.

What is missing is content. `content/projects.ts` and `content/about.ts` are empty
scaffolds, and `dummy` is still the only registered exhibit. Next up is About Me
(the book), then the two technical exhibits — each one a module plus a registry
line, no core changes.

## Conventions
- Fake cheap effects over real simulation — no real physics, bake lighting where possible.
- New exhibits go through the Exhibit registry, never wired directly into App.tsx.
