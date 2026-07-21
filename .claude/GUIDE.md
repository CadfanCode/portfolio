# Portfolio Build Guide

## Phase 0 — Environment (do this yourself, 15 min)

- Install Node.js (LTS) if you don't have it — Vite and the whole toolchain need it.
- Create an empty GitHub repo for the project.
- Create a free Vercel account and connect it to your GitHub.

## Phase 1 — Scaffold (delegate to Claude Code)

Open the project folder in IntelliJ, open the terminal, and prompt Claude Code with something like:

> "Scaffold a Vite + React + TypeScript project, add three, @react-three/fiber, @react-three/drei, and zustand, and set up this folder structure: [paste the structure we discussed earlier — `scene/`, `state/`, `content/`, `assets/`]."

Concretely this produces:

```bash
npm create vite@latest maxi77-portfolio -- --template react-ts
cd maxi77-portfolio
npm install three @react-three/fiber @react-three/drei zustand
```

Verify it by getting a single spinning cube rendering in the browser — that proves the whole pipeline (Vite → R3F → Three) works before anything else.

## Phase 2 — Deploy immediately, even though it's just a cube

Push to GitHub, import the repo in Vercel, let it auto-deploy. Do this now, not later — every future push auto-deploys, so from this point on "done" always means "live," and you avoid a big scary first deploy at the end.

## Phase 3 — Core loop prototype

This is the meaty phase. Prompt Claude Code to build, one at a time:

1. A `useSceneStore` (zustand) holding the current `SceneState` we defined (ocean, cockpit, cabin, etc.).
2. A `CameraRig` component that smoothly interpolates camera position/target when the state changes.
3. A free-look controller at each stop — drei's `CameraControls` with panning/dolly disabled and rotation limits set, so users can look around but not fly off.
4. A placeholder boat (box) with a click handler that transitions ocean → cockpit.

**Goal:** ocean → click box → camera glides in → free-look. Nothing else. Get this feeling good before touching art.

## Phase 4 — Exhibit plugin architecture

Prompt Claude Code to build the `Exhibit` interface we discussed (id, hotspot mesh, trigger, content panel) plus a registry that renders exhibits generically from a list. Build one dummy exhibit (a box that pops open a text panel) to prove new exhibits can be added by dropping in a module, not editing core logic. This is the piece worth getting right before content piles on — everything downstream depends on it holding up.

## Phase 5 — Art direction

- Source your boat model (purchased/kitbashed to start, or photogrammetry later if you want the exact hull).
- Model/adapt the cabin in Blender, export GLB, load via drei's `useGLTF`.
- Bake lighting, add sound.
- Swap these into the existing scene — if Phase 3/4 were built right, this is an asset swap, not a rewrite.

## Phase 6 — Real exhibits

Build About Me (book), then your two technical ones (radar replay, auth-flow drawer) through the exhibit pattern. The auth demo could even use a tiny Vercel serverless function if you want a real login flow rather than a purely client-side simulation — worth deciding once you get there.

## Phase 7 — Polish & accessibility

Compressed textures, lazy-loaded cabin, hidden HTML content layer, skip-3D option, reduced-motion mode, mobile pass.

## Phase 8 — Ongoing

New exhibits get added as you build new projects. Sailing mode slots in later as one more state.