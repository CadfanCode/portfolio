# About Me Scrapbook Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `about` exhibit — a staged 3D scrapbook book, triggered from the `book_about` shelf spine, per `docs/superpowers/specs/2026-08-03-about-me-book-design.md` — plus a small unrelated CV file cleanup requested alongside it.

**Architecture:** New self-contained `src/scene/exhibits/about/` module mirroring the existing `resume/` exhibit's file shape exactly (own content file, own canvas page renderer, own page-turn store, own staged 3D book, own DOM chrome), registered with one import + one array entry. No changes to `CameraRig`, `useSceneStore`, or the resume exhibit.

**Tech Stack:** React + @react-three/fiber + @react-three/drei (`useGLTF`, `useTexture`), zustand, Canvas 2D (`CanvasTexture`) for page rendering, one Google Font (Caveat) for handwritten type, a `youtube-nocookie.com` iframe for the video lightbox.

## Global Constraints

- This repo has no unit test framework (per `CLAUDE.md`'s command list: `dev`, `lint`, `npm run build`, `npx tsc -b` — nothing else). Every task's "test" step is `npx tsc -b` + `npm run lint`, and — only for the task that first makes the exhibit reachable — a manual dev-server check per the project's `verifying-the-3d-scene-without-screenshots` convention (drive `useSceneStore`/`useAboutBook` from the browser console; `Page.captureScreenshot` reliably times out on this app, do not attempt it).
- `verbatimModuleSyntax` is on — always `import type { … }` for type-only imports.
- `type` aliases over `interface`. Named exports only, no default exports.
- No new runtime npm dependency. The one new asset (Caveat) is loaded as a `<link>` in `index.html`, not an npm package.
- Match the surrounding file's voice in comments: full sentences, explaining *why*, used sparingly. See any file below copied from `resume/` for the register to match.
- Per `CLAUDE.md`'s exhibit-plugin boundary: this feature must not require editing `CameraRig`, `useSceneStore`, `App.tsx`, or the `resume` exhibit. The only shared files touched are `src/scene/exhibits/registry.ts` (one import + one array entry) and `src/scene/BookSpines.tsx` (one field on one existing array entry).
- Delegation: every task below is scoped to `scene-dev` (all touch files under `src/` or `index.html`/`public/`, none are `src/content/**`-only prose — see Task 3's note on why content authorship stays with `scene-dev` here). The final task is `checker`. The arbiter (this session) reviews every diff before moving to the next task.

---

### Task 1: CV file cleanup

Unrelated to the book, bundled in because the user asked for it in the same session. Two separate PDFs are involved and both need fixing — see the design spec's session notes: `files/Cai_Birch_CV_Eng.pdf` is a stale duplicate of the new `files/Cai_Birch_CV.pdf` the user just added, and `public/Cai_Birch_CV_Eng.pdf` is the actually-served download (linked from `ResumeChrome.tsx`), a *different*, older file that still has the user's phone number in it. The user confirmed both should be brought in line with the new no-phone-number version.

**Files:**
- Delete: `files/Cai_Birch_CV_Eng.pdf`
- Delete: `public/Cai_Birch_CV_Eng.pdf`
- Create: `public/Cai_Birch_CV.pdf` (copy of `files/Cai_Birch_CV.pdf`)
- Modify: `src/content/resume.ts:4`
- Modify: `src/scene/exhibits/resume/ResumeChrome.tsx:68`

**Interfaces:** None — this task touches no shared types or exported symbols.

- [ ] **Step 1: Remove the stale duplicate and republish the live download**

```bash
git rm files/Cai_Birch_CV_Eng.pdf
git rm public/Cai_Birch_CV_Eng.pdf
cp files/Cai_Birch_CV.pdf public/Cai_Birch_CV.pdf
git add public/Cai_Birch_CV.pdf
```

- [ ] **Step 2: Fix the source-document comment**

In `src/content/resume.ts`, line 4 currently reads:

```
 * The source document is `files/Cai_Birch_CV_Eng.pdf`. A CV is laid out for A4
```

Change `files/Cai_Birch_CV_Eng.pdf` to `files/Cai_Birch_CV.pdf`.

- [ ] **Step 3: Fix the live download link**

In `src/scene/exhibits/resume/ResumeChrome.tsx`, line 68 currently reads:

```tsx
        href="/Cai_Birch_CV_Eng.pdf"
```

Change to:

```tsx
        href="/Cai_Birch_CV.pdf"
```

- [ ] **Step 4: Verify**

```bash
npx tsc -b
npm run lint
ls files/ public/  # confirm Cai_Birch_CV_Eng.pdf is gone from both, Cai_Birch_CV.pdf present in both
```

- [ ] **Step 5: Commit**

```bash
git add files/ public/ src/content/resume.ts src/scene/exhibits/resume/ResumeChrome.tsx
git commit -m "Replace Cai_Birch_CV_Eng.pdf with Cai_Birch_CV.pdf everywhere"
```

---

### Task 2: Handwriting web font

Adds the one web font the design spec calls for, so the canvas renderer in Task 4 has it available. Kept as its own task since it touches `index.html`, not `src/`.

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: the family name `"Caveat"` at weights 400 and 700, loaded and available to any `CanvasRenderingContext2D.font` string or CSS `font-family` on the page. Task 4's `renderAboutPage.ts` consumes it by name.

- [ ] **Step 1: Add the font link**

In `index.html`, insert after the viewport `<meta>` tag (before `<title>`):

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap"
      rel="stylesheet"
    />
```

Full resulting `<head>`:

```html
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap"
      rel="stylesheet"
    />
    <title>portfolio</title>
  </head>
```

- [ ] **Step 2: Verify**

```bash
npm run build
```

(`index.html` isn't typechecked or linted; the build step is the only automated check available — confirm it still succeeds and emits the tag by checking `dist/index.html` after build contains the `fonts.googleapis.com` link.)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Load the Caveat handwriting font for the About Me book"
```

---

### Task 3: About Me content data

**Files:**
- Modify: `src/content/about.ts` (currently an unused empty scaffold — full rewrite)

**Interfaces:**
- Produces:
  - `type PhotoId = 'hiking' | 'skiing' | 'running'`
  - `type AboutBlock = { kind: 'title'; text: string } | { kind: 'quote'; text: string } | { kind: 'journal'; text: string } | { kind: 'photo'; id: PhotoId; caption: string; rotationDeg: number } | { kind: 'video'; youtubeId: string; caption: string }`
  - `type AboutPage = { id: string; blocks: readonly AboutBlock[]; torn?: boolean }`
  - `const ABOUT_PAGES: readonly AboutPage[]` — exactly 10 entries (5 spreads, even index = left page, odd = right page — same convention as `content/resume.ts`'s `RESUME_PAGES`).
- Consumed by: Task 4 (`renderAboutPage.ts` switches on `AboutBlock['kind']`), Task 5 (`useAboutBook.ts` reads `ABOUT_PAGES.length`), Task 6 (`AboutBook.tsx` iterates `ABOUT_PAGES`), Task 7 (`AboutChrome.tsx` scans `ABOUT_PAGES` for the video block/page).

Note on delegation: `scribe`'s scope covers `src/content/**`, but every word of copy here is already final (approved verbatim from the user's bio, or drafted and approved during design — see the spec's "Content — page-by-page" section) and the type shape is load-bearing for Task 4's renderer. Splitting type-authoring from data-population across two workers on one small, tightly-coupled file would cost more coordination than it saves, so this stays with `scene-dev` as a single task — an arbiter judgment call, noted per `CLAUDE.md`'s "do it yourself when delegating costs more than it saves," applied here to worker choice rather than the arbiter's own time.

- [ ] **Step 1: Write the file**

```ts
/**
 * The About Me scrapbook, pages as one flat array — same convention as
 * `content/resume.ts`'s `RESUME_PAGES`: even indices are left pages, odd
 * indices are right pages, two to a spread. See `scene/exhibits/about/` for
 * how a page turns into pixels.
 */

export type PhotoId = 'hiking' | 'skiing' | 'running'

export type AboutBlock =
  /** The cover's hand-lettered title. */
  | { kind: 'title'; text: string }
  /** A big standalone line — the opening line and the closing line. */
  | { kind: 'quote'; text: string }
  /** A diary-entry paragraph, set in the same serif the resume book uses. */
  | { kind: 'journal'; text: string }
  /** A taped-in photograph. `id` looks up the loaded image in
   *  `renderAboutPage.ts`'s `AboutPagePhotos`; `rotationDeg` is the small
   *  off-axis tilt that sells it as physically taped down. */
  | { kind: 'photo'; id: PhotoId; caption: string; rotationDeg: number }
  /** A taped-in video clipping. `youtubeId` is the bare video id (the part
   *  after `v=` in a youtube.com/watch URL), not a full URL. */
  | { kind: 'video'; youtubeId: string; caption: string }

export type AboutPage = {
  id: string
  blocks: readonly AboutBlock[]
  /** Torn top edge on this page. Alternated by hand across the book rather
   *  than applied to every page, so it reads as a few loose clippings rather
   *  than a wallpaper pattern — see `renderAboutPage.ts`'s `paintPaper`. */
  torn?: boolean
}

export const ABOUT_PAGES: readonly AboutPage[] = [
  // — Spread 1 — cover ————————————————————————————————————————
  {
    id: 'cover',
    blocks: [{ kind: 'title', text: 'About Me' }],
  },
  {
    id: 'opening',
    torn: true,
    blocks: [
      { kind: 'quote', text: 'Necessity is the mother of invention.' },
      {
        kind: 'journal',
        text: "I've always taken that one personally. My ambitions have run consistently ahead of my resources, and rather than wait for the two to meet, I've made a habit of closing the gap myself.",
      },
    ],
  },

  // — Spread 2 — the leap ————————————————————————————————————
  {
    id: 'leap-1',
    blocks: [
      {
        kind: 'journal',
        text: "In practice that means not waiting for permission or for conditions to be ideal. When rural North Wales started to feel small, I moved to Sweden. When the economics of working for somebody else stopped adding up, I started my own company — in a language I couldn't yet speak — and ran it for seven years, fitting a master's degree into the evenings.",
      },
    ],
  },
  {
    id: 'leap-2',
    torn: true,
    blocks: [
      {
        kind: 'journal',
        text: 'When I stumbled into programming in a biomechanics lab with no background in it whatsoever, I taught myself enough to build and test open-source modelling software, and then rebuilt my career around it.',
      },
    ],
  },

  // — Spread 3 — why I do this ——————————————————————————————
  {
    id: 'why-1',
    blocks: [
      {
        kind: 'journal',
        text: "The common thread is that I like taking things apart. Systems, problems, engines, arguments — I want to know what they're actually doing underneath, and then I want to make them work better. Software is the most satisfying place I've found to do that, because the distance between an idea and a working version of it is so short.",
      },
    ],
  },
  {
    id: 'why-2',
    torn: true,
    blocks: [
      {
        kind: 'journal',
        text: "I've also never been much good at leaving well enough alone. I'd rather be slightly out of my depth and learning than comfortable and coasting, which is more or less how I've come by every skill I actually value.",
      },
      { kind: 'photo', id: 'running', caption: 'also true on foot', rotationDeg: -3 },
    ],
  },

  // — Spread 4 — away from the keyboard ————————————————————
  {
    id: 'away',
    blocks: [
      {
        kind: 'journal',
        text: 'Away from the keyboard I hike and ski long distances in the far north of Sweden, restore and ride classic motorcycles, and spend an unreasonable proportion of my life fixing my sailboat.',
      },
    ],
  },
  {
    id: 'hiking-photo',
    torn: true,
    blocks: [{ kind: 'photo', id: 'hiking', caption: 'the far north, on foot', rotationDeg: 3 }],
  },

  // — Spread 5 — the far north / closer ————————————————————
  {
    id: 'far-north-collage',
    blocks: [
      { kind: 'photo', id: 'skiing', caption: 'the far north, on skis', rotationDeg: -2 },
      { kind: 'video', youtubeId: 'ehD6qmm1zpM', caption: 'Sunday ride, best co-pilot' },
    ],
  },
  {
    id: 'closer',
    torn: true,
    blocks: [{ kind: 'quote', text: "You're standing in a 3D model of her." }],
  },
]
```

- [ ] **Step 2: Verify**

```bash
npx tsc -b
npm run lint
node -e "
const ts = require('child_process').execSync('npx tsx -e \"import { ABOUT_PAGES } from \\'./src/content/about.ts\\'; console.log(ABOUT_PAGES.length)\"', {encoding:'utf8'});
console.log(ts);
" 2>/dev/null || echo "(if tsx isn't available, confirm the count of 'id:' entries by eye instead — must be exactly 10)"
grep -c "id: '" src/content/about.ts
```

Expected: `tsc -b` and `lint` both pass; the `id: '...'` count is 10.

- [ ] **Step 3: Commit**

```bash
git add src/content/about.ts
git commit -m "Write the About Me scrapbook's page content"
```

---

### Task 4: Canvas page renderer

Sibling to `src/scene/exhibits/resume/renderResumePage.ts`, drawing scrapbook pages instead of CV pages: torn paper, taped-in photos, a drawn video-tile placeholder, and handwritten type — onto the same 1024×1448 canvas / 0.105×0.148 m page ratio the resume book uses, so both books share the same physical page geometry (Task 6 reuses the resume book's `PAGE_WIDTH`/`PAGE_HEIGHT` constants unchanged).

**Files:**
- Create: `src/scene/exhibits/about/renderAboutPage.ts`

**Interfaces:**
- Consumes: `AboutBlock`, `AboutPage`, `PhotoId` from `src/content/about.ts` (Task 3).
- Produces:
  - `type AboutPagePhotos = Record<PhotoId, HTMLImageElement>`
  - `function renderAboutPage(page: AboutPage, side: 'left' | 'right', photos: AboutPagePhotos, scale?: number): HTMLCanvasElement`
  - `const ABOUT_PAGE_CANVAS_SIZE: { width: number; height: number }`
  - Consumed by: Task 6 (`AboutBook.tsx` calls `renderAboutPage` once per page to build `CanvasTexture`s, and imports `AboutPagePhotos` to type the loaded-photo bag it builds from `useTexture`).

- [ ] **Step 1: Write the file**

```ts
import type { AboutBlock, AboutPage, PhotoId } from '../../../content/about'

/**
 * Draws one scrapbook page onto a 2D canvas — sibling to
 * `resume/renderResumePage.ts`, same reason: the page is a texture on a 3D
 * plane, so it has to exist as pixels before the frame it first turns onto
 * screen. Where the resume book stays deliberately plain (no web fonts, one
 * accent colour), this one leans the other way on purpose — see the design
 * spec's "deliberate departure" note on the one web font this app loads.
 */

const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 1448

const PAPER_COLOUR = '#e7d9b8'
const INK_COLOUR = '#241d14'
const INK_MUTED = 'rgba(36, 29, 20, 0.75)'
const ACCENT_COLOUR = '#a8452f'
const TAPE_COLOUR = 'rgba(255, 248, 219, 0.55)'
const TAPE_STRIPE = 'rgba(255, 248, 219, 0.85)'

const MARGIN_OUTER = 64
const MARGIN_GUTTER = 110
const MARGIN_TOP = 80

const HAND_FONT = '"Caveat", cursive'
const BODY_FONT = 'Georgia, "Times New Roman", serif'
const LINE = 39

const PHOTO_FRAME_WIDTH = 520
const PHOTO_FRAME_HEIGHT = 620
const PHOTO_BORDER = 26

export type AboutPagePhotos = Record<PhotoId, HTMLImageElement>

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function textMargins(side: 'left' | 'right') {
  return side === 'left'
    ? { left: MARGIN_OUTER, right: MARGIN_GUTTER }
    : { left: MARGIN_GUTTER, right: MARGIN_OUTER }
}

/** Greedy word wrap using real glyph metrics, same as `renderResumePage.ts`. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** A cheap seeded LCG, same idiom as `renderResumePage.ts`'s paper speckle —
 *  deterministic per page so a re-render (a quality-tier change, an
 *  anisotropy update) draws pixel-identical paper rather than re-rolling the
 *  texture underneath the reader. */
function makeRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s % 1000) / 1000
  }
}

/** Paper fill, gutter shading and — for pages the content marks `torn` — a
 *  jagged top edge clipped into the fill, so the page reads as ripped from a
 *  bigger sheet rather than a plain rectangle. */
function paintPaper(ctx: CanvasRenderingContext2D, side: 'left' | 'right', torn: boolean) {
  const rand = makeRand(side === 'left' ? 3 : 11)

  ctx.save()
  if (torn) {
    ctx.beginPath()
    const step = 24
    ctx.moveTo(0, CANVAS_HEIGHT)
    ctx.lineTo(0, 18)
    for (let x = 0; x <= CANVAS_WIDTH; x += step) {
      ctx.lineTo(x, 8 + rand() * 22)
    }
    ctx.lineTo(CANVAS_WIDTH, 18)
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.closePath()
    ctx.clip()
  }

  ctx.fillStyle = PAPER_COLOUR
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const gutterX = side === 'left' ? CANVAS_WIDTH : 0
  const outerX = side === 'left' ? 0 : CANVAS_WIDTH
  const gradient = ctx.createLinearGradient(outerX, 0, gutterX, 0)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.16)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.fillStyle = 'rgba(70, 55, 30, 0.06)'
  for (let i = 0; i < 220; i++) {
    const x = rand() * CANVAS_WIDTH
    const y = rand() * CANVAS_HEIGHT
    const r = 0.6 + rand() * 1.2
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

type Cursor = { y: number }

function drawTitle(
  ctx: CanvasRenderingContext2D,
  block: Extract<AboutBlock, { kind: 'title' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const centreX = (left + right) / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = INK_COLOUR
  ctx.font = `700 130px ${HAND_FONT}`
  cursor.y += 260
  ctx.save()
  ctx.translate(centreX, cursor.y)
  ctx.rotate(-0.03)
  ctx.fillText(block.text, 0, 0)
  ctx.restore()

  cursor.y += 40
  ctx.strokeStyle = ACCENT_COLOUR
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(centreX - 140, cursor.y)
  ctx.quadraticCurveTo(centreX, cursor.y + 14, centreX + 140, cursor.y)
  ctx.stroke()
  ctx.textAlign = 'left'
}

function drawQuote(
  ctx: CanvasRenderingContext2D,
  block: Extract<AboutBlock, { kind: 'quote' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const centreX = (left + right) / 2
  const maxWidth = right - left - 40
  ctx.textAlign = 'center'
  ctx.fillStyle = ACCENT_COLOUR
  ctx.font = `700 68px ${HAND_FONT}`
  const lines = wrapText(ctx, block.text, maxWidth)
  ctx.save()
  ctx.translate(centreX, 0)
  ctx.rotate(-0.015)
  for (const line of lines) {
    cursor.y += 74
    ctx.fillText(line, 0, cursor.y)
  }
  ctx.restore()
  cursor.y += 30
  ctx.textAlign = 'left'
}

function drawJournal(
  ctx: CanvasRenderingContext2D,
  block: Extract<AboutBlock, { kind: 'journal' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  ctx.font = `400 34px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  const lines = wrapText(ctx, block.text, right - left)
  for (const line of lines) {
    cursor.y += LINE
    ctx.fillText(line, left, cursor.y)
  }
  cursor.y += 24
}

function drawTapeStrip(ctx: CanvasRenderingContext2D, cx: number, cy: number, angleRad: number) {
  const w = 150
  const h = 46
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angleRad)
  ctx.fillStyle = TAPE_COLOUR
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.strokeStyle = TAPE_STRIPE
  ctx.lineWidth = 3
  for (let x = -w / 2 + 8; x < w / 2; x += 16) {
    ctx.beginPath()
    ctx.moveTo(x, -h / 2)
    ctx.lineTo(x + 10, h / 2)
    ctx.stroke()
  }
  ctx.restore()
}

/** Crops `image` to cover a `boxW`×`boxH` box (like CSS `object-fit: cover`)
 *  and draws it centred at the current origin. */
function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  boxW: number,
  boxH: number,
  offsetY: number,
) {
  const imgAspect = image.naturalWidth / image.naturalHeight
  const boxAspect = boxW / boxH
  let sx = 0
  let sy = 0
  let sw = image.naturalWidth
  let sh = image.naturalHeight
  if (imgAspect > boxAspect) {
    sw = image.naturalHeight * boxAspect
    sx = (image.naturalWidth - sw) / 2
  } else {
    sh = image.naturalWidth / boxAspect
    sy = (image.naturalHeight - sh) / 2
  }
  ctx.drawImage(image, sx, sy, sw, sh, -boxW / 2, offsetY, boxW, boxH)
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  block: Extract<AboutBlock, { kind: 'photo' }>,
  photos: AboutPagePhotos,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const centreX = (left + right) / 2
  const frameW = Math.min(PHOTO_FRAME_WIDTH, right - left - 20)
  const frameH = PHOTO_FRAME_HEIGHT
  const angle = degToRad(block.rotationDeg)

  cursor.y += frameH / 2 + 24

  ctx.save()
  ctx.translate(centreX, cursor.y)
  ctx.rotate(angle)

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 10
  ctx.fillStyle = '#faf6ea'
  ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH)
  ctx.restore()

  const innerW = frameW - PHOTO_BORDER * 2
  const innerH = frameH - PHOTO_BORDER * 2 - 40
  drawCoverFit(ctx, photos[block.id], innerW, innerH, -frameH / 2 + PHOTO_BORDER)

  ctx.fillStyle = INK_MUTED
  ctx.font = `400 30px ${HAND_FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(block.caption, 0, frameH / 2 - 16)
  ctx.textAlign = 'left'
  ctx.restore()

  drawTapeStrip(ctx, centreX - frameW / 2 + 40, cursor.y - frameH / 2, angle + 0.5)

  cursor.y += frameH / 2 + 30
}

/** A taped-in "clipping" for the video, drawn rather than a fetched YouTube
 *  thumbnail — no network call at texture-build time. The tile is not
 *  itself the click target: the book's open pose is fixed on screen (see
 *  `AboutChrome.tsx`), so the actual trigger is an ordinary DOM button
 *  layered over the canvas, matching how the resume book's download link
 *  works. This drawing only has to read as clickable, not be it. */
function drawVideo(
  ctx: CanvasRenderingContext2D,
  block: Extract<AboutBlock, { kind: 'video' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const centreX = (left + right) / 2
  const frameW = Math.min(PHOTO_FRAME_WIDTH, right - left - 20)
  const frameH = PHOTO_FRAME_HEIGHT * 0.72
  const angle = degToRad(4)

  cursor.y += frameH / 2 + 24

  ctx.save()
  ctx.translate(centreX, cursor.y)
  ctx.rotate(angle)

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 10
  ctx.fillStyle = '#faf6ea'
  ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH)
  ctx.restore()

  const innerW = frameW - PHOTO_BORDER * 2
  const innerH = frameH - PHOTO_BORDER * 2 - 40
  const innerTop = -frameH / 2 + PHOTO_BORDER
  ctx.fillStyle = '#26221d'
  ctx.fillRect(-innerW / 2, innerTop, innerW, innerH)

  // A quick road-and-rider glyph: a horizon line, two wheels, a frame.
  const midY = innerTop + innerH / 2
  ctx.strokeStyle = 'rgba(231, 217, 184, 0.7)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(-innerW / 2 + 20, midY + innerH * 0.22)
  ctx.lineTo(innerW / 2 - 20, midY + innerH * 0.22)
  ctx.stroke()
  const wheelR = innerH * 0.16
  const wheelY = midY + innerH * 0.22 - wheelR * 0.6
  for (const wx of [-innerW * 0.18, innerW * 0.18]) {
    ctx.beginPath()
    ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(-innerW * 0.18, wheelY)
  ctx.lineTo(0, midY - innerH * 0.1)
  ctx.lineTo(innerW * 0.18, wheelY)
  ctx.stroke()

  // The hand-drawn play mark.
  const playY = midY - innerH * 0.32
  ctx.fillStyle = 'rgba(231, 217, 184, 0.92)'
  ctx.beginPath()
  ctx.arc(0, playY, 46, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#26221d'
  ctx.beginPath()
  ctx.moveTo(-14, playY - 20)
  ctx.lineTo(-14, playY + 20)
  ctx.lineTo(22, playY)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = INK_MUTED
  ctx.font = `400 30px ${HAND_FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(block.caption, 0, frameH / 2 - 16)
  ctx.textAlign = 'left'
  ctx.restore()

  drawTapeStrip(ctx, centreX + frameW / 2 - 40, cursor.y - frameH / 2, angle - 0.4)

  cursor.y += frameH / 2 + 30
}

export function renderAboutPage(
  page: AboutPage,
  side: 'left' | 'right',
  photos: AboutPagePhotos,
  scale = 1,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH * scale
  canvas.height = CANVAS_HEIGHT * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(scale, scale)

  paintPaper(ctx, side, page.torn ?? false)

  const { left, right } = textMargins(side)
  const contentRight = CANVAS_WIDTH - right
  const cursor: Cursor = { y: MARGIN_TOP }

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  for (const block of page.blocks) {
    switch (block.kind) {
      case 'title':
        drawTitle(ctx, block, left, contentRight, cursor)
        break
      case 'quote':
        drawQuote(ctx, block, left, contentRight, cursor)
        break
      case 'journal':
        drawJournal(ctx, block, left, contentRight, cursor)
        break
      case 'photo':
        drawPhoto(ctx, block, photos, left, contentRight, cursor)
        break
      case 'video':
        drawVideo(ctx, block, left, contentRight, cursor)
        break
    }
  }

  return canvas
}

export const ABOUT_PAGE_CANVAS_SIZE = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } as const
```

- [ ] **Step 2: Verify**

```bash
npx tsc -b
npm run lint
```

Expected: both pass. (No runtime test is possible here in isolation — `document.createElement('canvas')` needs a browser; Task 6 is where this first actually runs, in the dev server.)

- [ ] **Step 3: Commit**

```bash
git add src/scene/exhibits/about/renderAboutPage.ts
git commit -m "Add the About Me book's scrapbook page renderer"
```

---

### Task 5: Page-turn store

Direct mirror of `src/scene/exhibits/resume/useResumeBook.ts`, sized off `ABOUT_PAGES` instead of `RESUME_PAGES`.

**Files:**
- Create: `src/scene/exhibits/about/useAboutBook.ts`

**Interfaces:**
- Consumes: `ABOUT_PAGES` from `src/content/about.ts` (Task 3).
- Produces:
  - `const ABOUT_SPREAD_COUNT: number` (5)
  - `type TurnDirection = 'forward' | 'backward'`
  - `const useAboutBook: <store with `spread: number`, `turning: TurnDirection | null`, `turn(direction)`, `finishTurn()`, `reset()`>`
  - Consumed by: Task 6 (`AboutBook.tsx`) and Task 7 (`AboutChrome.tsx`).

- [ ] **Step 1: Write the file**

```ts
import { create } from 'zustand'
import { ABOUT_PAGES } from '../../../content/about'

/** Five spreads out of the ten flat pages in `ABOUT_PAGES` — see that
 *  module's own header. */
export const ABOUT_SPREAD_COUNT = ABOUT_PAGES.length / 2

export type TurnDirection = 'forward' | 'backward'

type AboutBookStore = {
  /** Index of the spread currently at rest — 0..ABOUT_SPREAD_COUNT - 1. */
  spread: number
  /** Which way a turn is in flight, or null when the book is at rest. */
  turning: TurnDirection | null
  /** Starts a turn. No-ops at the ends of the book or mid-turn. */
  turn: (direction: TurnDirection) => void
  /** Called by `AboutBook` once a turn's animation finishes. */
  finishTurn: () => void
  /** Back to the title spread, closed. Called when the exhibit closes. */
  reset: () => void
}

export const useAboutBook = create<AboutBookStore>((set, get) => ({
  spread: 0,
  turning: null,

  turn: (direction) => {
    const { turning, spread } = get()
    if (turning) return
    if (direction === 'forward' && spread >= ABOUT_SPREAD_COUNT - 1) return
    if (direction === 'backward' && spread <= 0) return
    set({ turning: direction })
  },

  finishTurn: () => {
    const { turning, spread } = get()
    if (!turning) return
    set({
      spread: turning === 'forward' ? spread + 1 : spread - 1,
      turning: null,
    })
  },

  reset: () => set({ spread: 0, turning: null }),
}))
```

- [ ] **Step 2: Verify**

```bash
npx tsc -b
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/scene/exhibits/about/useAboutBook.ts
git commit -m "Add the About Me book's page-turn store"
```

---

### Task 6: Photo assets + the staged 3D book

The largest task: gets the three photos into the asset pipeline, then adapts `resume/ResumeBook.tsx`'s slide/fly/open/turn rig into `about/AboutBook.tsx`. The animation rig itself (timeline constants, the `useFrame` phase logic, the hinge/turn JSX) carries over completely unchanged — the only load-bearing differences are: which shelf node it reads its start pose from, which content/renderer it pulls pages from, cover colour, and that this book also has to load three photographs before it can draw its pages.

**Files:**
- Create: `src/assets/textures/about/hiking.jpg`, `skiing.jpg`, `running.jpg` (resized copies of `files/1.jpg`, `files/2.jpg`, `files/3.jpg` — see Step 1)
- Create: `src/scene/exhibits/about/AboutBook.tsx` (adapted from `src/scene/exhibits/resume/ResumeBook.tsx` — see Step 2)

**Interfaces:**
- Consumes: `ABOUT_PAGES` (Task 3), `renderAboutPage`/`AboutPagePhotos` (Task 4), `useAboutBook` (Task 5), plus everything `ResumeBook.tsx` already consumes (`maxi77.glb` via `modelUrl`, `useQualityStore`, `prefersReducedMotion`, `clamp01`, `ExhibitSceneProps`).
- Produces: `function AboutBook(props: ExhibitSceneProps): JSX.Element` — a React component matching the `Exhibit['Scene']` shape. Consumed by Task 8's `about/index.ts`.

- [ ] **Step 1: Resize and copy the three photos**

The repo's existing convention (`files/Maxi77.jpg` → `src/assets/textures/maxi77.jpg`, `files/AlysTeddy.png` → `src/assets/textures/alys-teddy.jpg`) is: full-size originals live in `files/`, a resized/recompressed copy actually ships in `src/assets/textures/`. Match it — PIL is available on this machine (no ImageMagick):

```bash
mkdir -p src/assets/textures/about
python3 - <<'EOF'
from PIL import Image, ImageOps
import os

JOBS = [("files/1.jpg", "hiking.jpg"), ("files/2.jpg", "skiing.jpg"), ("files/3.jpg", "running.jpg")]
MAX_EDGE = 1400
DST_DIR = "src/assets/textures/about"

for src_path, dst_name in JOBS:
    im = Image.open(src_path)
    # Bakes EXIF orientation into pixels and drops the tag, so the image is
    # upright regardless of how the browser's canvas drawImage would
    # otherwise interpret (or fail to interpret) the original tag.
    im = ImageOps.exif_transpose(im)
    scale = MAX_EDGE / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.convert("RGB").save(os.path.join(DST_DIR, dst_name), "JPEG", quality=82, optimize=True)
    print(dst_name, im.size)
EOF
```

Expected output: three lines, `hiking.jpg (1400, 2664)`, `skiing.jpg (1050, 1400)`, `running.jpg (933, 1400)` (exact dimensions may differ slightly from these — the source images' aspect ratios drive them; what matters is all three files exist and the long edge is ≤1400).

- [ ] **Step 2: Copy and adapt `ResumeBook.tsx`**

```bash
cp src/scene/exhibits/resume/ResumeBook.tsx src/scene/exhibits/about/AboutBook.tsx
```

Then apply every one of these edits to the new file. Nothing else in the file changes — the geometry constants (`PAGE_WIDTH` through `LEAF_GAP`), the timeline constants (`DURATION_OPEN` through `TURN_DURATION`), `easeInOutCubic`, `phaseEase`, `findMesh`, `presentationDistance`, the entire `useFrame` body, and the JSX return are copied verbatim and stay correct unchanged — they don't reference anything resume-specific.

1. Imports — add `useState` and `useTexture`, add the three photo URLs, swap the three content-specific imports:

```diff
-import { useGLTF } from '@react-three/drei'
+import { useGLTF, useTexture } from '@react-three/drei'
 import { useFrame, useThree } from '@react-three/fiber'
-import { useEffect, useMemo, useRef } from 'react'
+import { useEffect, useMemo, useRef, useState } from 'react'
 import {
   CanvasTexture,
   Group,
   MathUtils,
   Matrix4,
   Mesh,
   Object3D,
   PerspectiveCamera,
   PlaneGeometry,
   Quaternion,
   SRGBColorSpace,
   Vector3,
 } from 'three'
 import type { Mesh as MeshType, MeshBasicMaterial } from 'three'
 import modelUrl from '../../../assets/models/maxi77.glb?url'
-import { RESUME_PAGES } from '../../../content/resume'
+import hikingUrl from '../../../assets/textures/about/hiking.jpg?url'
+import skiingUrl from '../../../assets/textures/about/skiing.jpg?url'
+import runningUrl from '../../../assets/textures/about/running.jpg?url'
+import { ABOUT_PAGES } from '../../../content/about'
 import { useQualityStore } from '../../../state/useQualityStore'
 import { prefersReducedMotion } from '../../introFlight'
 import { clamp01 } from '../../mathUtils'
 import type { ExhibitSceneProps } from '../types'
-import { renderResumePage } from './renderResumePage'
-import { useResumeBook } from './useResumeBook'
+import type { AboutPagePhotos } from './renderAboutPage'
+import { renderAboutPage } from './renderAboutPage'
+import { useAboutBook } from './useAboutBook'
```

2. Cover colours — a worn tan board and matching spine, not the resume's dark leather:

```diff
-const COVER_COLOUR = '#3c2620'
-const SPINE_COLOUR = '#2d1c17'
+const COVER_COLOUR = '#8a6a45'
+const SPINE_COLOUR = '#5f4527'
```

3. `readShelfSlot`'s doc comment and body — reads the `book_about` slot instead of `book_resume`:

```diff
-/** The book's start pose, read off the `book_resume` shelf slot rather than
+/** The book's start pose, read off the `book_about` shelf slot rather than
  *  hardcoded. Position only — the mesh's local axes already line up with the
  *  book-local frame this component builds in (spine vertical, pages
  *  extending +X from it, thickness along Z), the same assumption
  *  `BookSpines.tsx` makes when it treats this mesh's box directly in model
  *  space. `null` when the node is missing, so the caller can fail soft. */
 function readShelfSlot(model: Object3D): Vector3 | null {
-  const mesh = findMesh(model, 'book_resume')
+  const mesh = findMesh(model, 'book_about')
```

4. Page-texture building — add a `photos` parameter and a font-readiness gate. `document.fonts.check`/`.load` guards against the one real correctness risk this book has that the resume book doesn't: the canvas draw is synchronous and only happens once per `useMemo`, so if the Caveat webfont (Task 2) hasn't finished loading yet the first time this runs, the title/captions would be drawn in a fallback font and never redrawn — unless the memo is keyed on a `fontReady` flag that flips once, forcing exactly one rebuild:

```diff
 type TextureBundle = {
   left: CanvasTexture[]
   right: CanvasTexture[]
 }

+/** True once the Caveat webfont (loaded in `index.html`) is confirmed ready.
+ *  Starts from `document.fonts.check` for the fast path (already loaded, the
+ *  common case once the visitor has been on the page a few seconds), then
+ *  falls back to `document.fonts.load` for the first-ever open. */
+function useHandFontReady(): boolean {
+  const [ready, setReady] = useState(() => document.fonts.check('700 32px "Caveat"'))
+  useEffect(() => {
+    if (ready) return
+    let cancelled = false
+    document.fonts.load('700 32px "Caveat"').then(() => {
+      if (!cancelled) setReady(true)
+    })
+    return () => {
+      cancelled = true
+    }
+  }, [ready])
+  return ready
+}
+
 /**
- * Builds and memoises the eight page textures, four to a side.
+ * Builds and memoises the ten page textures, five to a side.
  *
- * Keyed on `pageScale` alone, not on anisotropy. Eight pages at 1024×1448 is
- * roughly 47 MB of RGBA VRAM, rasterised on the main thread the moment the
+ * Keyed on `pageScale`, `photos` and `fontReady` — not anisotropy, see the
+ * note on that below. Ten pages at 1024×1448 is roughly 59 MB of RGBA VRAM,
+ * rasterised on the main thread the moment the
  * book opens — the single largest allocation in the app, and a real failure
  * mode on a memory-starved phone — so this memo exists specifically to avoid
- * doing that rasterisation more than once. `pageScale` belongs in the key
- * because it changes what gets drawn onto the canvas; anisotropy does not,
+ * doing that rasterisation more than once (beyond the one unavoidable
+ * rebuild `fontReady` forces if the font wasn't ready yet on first open).
+ * `pageScale` belongs in the key because it changes what gets drawn onto the
+ * canvas; anisotropy does not,
  * since it is a property that can be set on an already-rendered texture
  * without touching the canvas at all — see the `useEffect` below, which
- * applies it separately so a tier change (which in this app's design never
- * happens mid-session, but would be free to support) would not force all
- * eight pages to be re-rasterised.
+ * applies it separately so a tier change would not force all ten pages to
+ * be re-rasterised.
  */
-function usePageTextures(pageScale: number): TextureBundle {
+function usePageTextures(
+  pageScale: number,
+  photos: AboutPagePhotos,
+  fontReady: boolean,
+): TextureBundle {
   return useMemo(() => {
     const left: CanvasTexture[] = []
     const right: CanvasTexture[] = []
-    for (let spread = 0; spread < RESUME_PAGES.length / 2; spread++) {
-      const leftPage = RESUME_PAGES[spread * 2]
-      const rightPage = RESUME_PAGES[spread * 2 + 1]
-      const leftCanvas = renderResumePage(leftPage, 'left', pageScale)
-      const rightCanvas = renderResumePage(rightPage, 'right', pageScale)
+    for (let spread = 0; spread < ABOUT_PAGES.length / 2; spread++) {
+      const leftPage = ABOUT_PAGES[spread * 2]
+      const rightPage = ABOUT_PAGES[spread * 2 + 1]
+      const leftCanvas = renderAboutPage(leftPage, 'left', photos, pageScale)
+      const rightCanvas = renderAboutPage(rightPage, 'right', photos, pageScale)
       const leftTex = new CanvasTexture(leftCanvas)
       const rightTex = new CanvasTexture(rightCanvas)
       leftTex.colorSpace = SRGBColorSpace
       rightTex.colorSpace = SRGBColorSpace
       left.push(leftTex)
       right.push(rightTex)
     }
     return { left, right }
-  }, [pageScale])
+  }, [pageScale, photos, fontReady])
 }
```

5. Component body — load the photos, compute `photos`, feed the font gate into `usePageTextures`, swap the store hook:

```diff
-export function ResumeBook({ active, onExited }: ExhibitSceneProps) {
+export function AboutBook({ active, onExited }: ExhibitSceneProps) {
   const { scene: model } = useGLTF(modelUrl)
   const gl = useThree((s) => s.gl)

-  const spread = useResumeBook((s) => s.spread)
-  const turning = useResumeBook((s) => s.turning)
-  const finishTurn = useResumeBook((s) => s.finishTurn)
-  const reset = useResumeBook((s) => s.reset)
+  const spread = useAboutBook((s) => s.spread)
+  const turning = useAboutBook((s) => s.turning)
+  const finishTurn = useAboutBook((s) => s.finishTurn)
+  const reset = useAboutBook((s) => s.reset)

-  // The resume book only ever opens from inside the `books` close-up, so the
+  // The about book only ever opens from inside the `books` close-up, so the
   // close-up budget applies unconditionally — no branching on `focus` needed.
   const pageScale = useQualityStore((s) => s.settings.focus.pageScale)
   const anisotropy = useQualityStore((s) => s.settings.textures.detailAnisotropy)
-  const textures = usePageTextures(pageScale)
+  const photoTextures = useTexture({ hiking: hikingUrl, skiing: skiingUrl, running: runningUrl })
+  const photos = useMemo<AboutPagePhotos>(
+    () => ({
+      // TextureLoader's `.image` is always an HTMLImageElement for a
+      // standard raster load — the type stays generic on `Texture` to also
+      // cover video/canvas sources, which don't apply here.
+      hiking: photoTextures.hiking.image as HTMLImageElement,
+      skiing: photoTextures.skiing.image as HTMLImageElement,
+      running: photoTextures.running.image as HTMLImageElement,
+    }),
+    // Individual textures, not the `photoTextures` wrapper object — drei's
+    // cache guarantees the same URL resolves to the same `Texture` instance
+    // across renders, but says nothing about the identity of the plain
+    // object `useTexture` wraps them in, and that object is what this memo
+    // must not spuriously rebuild on (each rebuild re-rasterises all ten
+    // pages — see `usePageTextures`'s own doc comment on why that's costly).
+    [photoTextures.hiking, photoTextures.skiing, photoTextures.running],
+  )
+  const fontReady = useHandFontReady()
+  const textures = usePageTextures(pageScale, photos, fontReady)
```

6. Finally, `ResumeBook.tsx` is 501 lines and ends with the component's own closing brace (the JSX return's `)` then `}`, with no trailing export or code after it). Append this after that final `}`, so a first-ever open never suspends the whole app's shared `<Suspense>` mid-visit (see `CabinPictures.tsx`'s identical `useTexture.preload` idiom):

```diff
         </group>
       )}
     </group>
   )
 }
+
+useTexture.preload([hikingUrl, skiingUrl, runningUrl])
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b
npm run lint
npm run build
```

Full visual verification isn't possible until Task 8 wires the exhibit into the registry (nothing can mount `AboutBook` before then) — defer it to Task 8's manual check.

- [ ] **Step 4: Commit**

```bash
git add src/assets/textures/about/ src/scene/exhibits/about/AboutBook.tsx
git commit -m "Add the About Me book's staged 3D scene"
```

---

### Task 7: DOM chrome + video lightbox

Sibling to `resume/ResumeChrome.tsx` (+ its `.css`): page-turn arrows plus the one new piece, a "Watch video" trigger and lightbox. The book's open pose is fixed on screen — that's why the resume book's arrows and download link are plain `position: fixed` DOM elements, not registered against any 3D coordinate — so the video trigger works the same way: a fixed button, shown only while the spread containing the video block is at rest.

**Files:**
- Create: `src/scene/exhibits/about/AboutChrome.tsx`
- Create: `src/scene/exhibits/about/AboutChrome.css`

**Interfaces:**
- Consumes: `useSceneStore` (`activeExhibitId`), `ABOUT_PAGES`/`AboutBlock` (Task 3), `ABOUT_SPREAD_COUNT`/`useAboutBook` (Task 5).
- Produces: `function AboutChrome(): JSX.Element | null` — matches `Exhibit['Content']`. Consumed by Task 8's `about/index.ts`.

- [ ] **Step 1: Write `AboutChrome.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { AboutBlock } from '../../../content/about'
import { ABOUT_PAGES } from '../../../content/about'
import { useSceneStore } from '../../../state/useSceneStore'
import { ABOUT_SPREAD_COUNT, useAboutBook } from './useAboutBook'
import './AboutChrome.css'

/** The page (0-indexed into `ABOUT_PAGES`) and block that carry the video —
 *  found once at module load rather than hardcoded, so a future reorder of
 *  `ABOUT_PAGES` can't silently desync the "Watch video" button from the
 *  spread it's meant to open on. */
const VIDEO_PAGE_INDEX = ABOUT_PAGES.findIndex((page) =>
  page.blocks.some((block) => block.kind === 'video'),
)
const VIDEO_SPREAD = Math.floor(VIDEO_PAGE_INDEX / 2)
const VIDEO_BLOCK = ABOUT_PAGES[VIDEO_PAGE_INDEX]?.blocks.find(
  (block): block is Extract<AboutBlock, { kind: 'video' }> => block.kind === 'video',
)

/**
 * The arrows and the video-lightbox trigger, drawn over the canvas rather
 * than inside the standard exhibit panel — same reasoning as
 * `ResumeChrome.tsx`. Everything here is `pointer-events: none` except its
 * own controls, and sits below `FocusExit`'s z-index of 5 — except the
 * lightbox itself, which sits above it (`AboutChrome.css`): while a video is
 * open it is the topmost layer on purpose, with its own explicit close
 * controls, rather than leaving the exhibit's back button reachable behind it.
 */
export function AboutChrome() {
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const spread = useAboutBook((s) => s.spread)
  const turning = useAboutBook((s) => s.turning)
  const turn = useAboutBook((s) => s.turn)

  const [lightboxOpen, setLightboxOpen] = useState(false)

  const isOpen = activeExhibitId === 'about'
  const atFirst = spread <= 0
  const atLast = spread >= ABOUT_SPREAD_COUNT - 1
  const midTurn = turning !== null
  const showVideoTrigger = spread === VIDEO_SPREAD && !midTurn && VIDEO_BLOCK !== undefined

  // The lightbox shouldn't persist into the next time the book is opened.
  useEffect(() => {
    if (!isOpen) setLightboxOpen(false)
  }, [isOpen])

  // Arrow keys turn pages, mirroring `ResumeChrome.tsx`. Escape is
  // deliberately not handled here for the *book* — `FocusExit` owns that,
  // same as the resume book — see the separate capture-phase listener below
  // for why the *lightbox* needs its own handling instead of racing it.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') turn('backward')
      else if (event.key === 'ArrowRight') turn('forward')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, turn])

  // Capture phase, not bubble: `FocusExit` binds its own Escape handler on
  // `window` in the bubble phase to close the exhibit. Registering this one
  // in the capture phase guarantees it runs first regardless of mount order,
  // and `stopPropagation` then keeps the event from ever reaching FocusExit's
  // listener — so Escape closes the lightbox before it can close the whole
  // exhibit, one level at a time, matching the rest of the app's back-out
  // behaviour. When the lightbox isn't open this handler is a no-op and lets
  // the event through to FocusExit exactly as before.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !lightboxOpen) return
      event.stopPropagation()
      setLightboxOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isOpen, lightboxOpen])

  if (!isOpen) return null

  return (
    <div className="about-chrome">
      <button
        type="button"
        className="about-arrow about-arrow-left"
        onClick={() => turn('backward')}
        disabled={atFirst || midTurn}
        aria-label="Previous page"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <button
        type="button"
        className="about-arrow about-arrow-right"
        onClick={() => turn('forward')}
        disabled={atLast || midTurn}
        aria-label="Next page"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {showVideoTrigger && VIDEO_BLOCK && (
        <button type="button" className="about-watch" onClick={() => setLightboxOpen(true)}>
          ▶ Watch: {VIDEO_BLOCK.caption}
        </button>
      )}
      {lightboxOpen && VIDEO_BLOCK && (
        <div className="about-lightbox" onClick={() => setLightboxOpen(false)}>
          <div className="about-lightbox-frame" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="about-lightbox-close"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close video"
            >
              ×
            </button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${VIDEO_BLOCK.youtubeId}`}
              title={VIDEO_BLOCK.caption}
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `AboutChrome.css`**

```css
/* The book fills the frame, so this layer has to float over the canvas
   rather than sit in a panel — same approach as `ResumeChrome.css`. */
.about-chrome {
  position: fixed;
  inset: 0;
  z-index: 4; /* under .focus-exit's 5, except the lightbox below. */
  pointer-events: none;
}

.about-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: auto;

  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;

  color: var(--text-h);
  background: var(--social-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;

  backdrop-filter: blur(8px);
  transition:
    border-color 0.3s,
    opacity 0.3s,
    transform 0.3s;
}

.about-arrow-left {
  left: max(20px, 3vw);
}

.about-arrow-right {
  right: max(20px, 3vw);
}

.about-arrow:hover:not(:disabled),
.about-arrow:focus-visible:not(:disabled) {
  border-color: var(--accent-border);
}

.about-arrow-left:hover:not(:disabled) {
  transform: translateY(-50%) translateX(-3px);
}

.about-arrow-right:hover:not(:disabled) {
  transform: translateY(-50%) translateX(3px);
}

.about-arrow:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.about-arrow:disabled {
  opacity: 0.25;
  cursor: default;
}

.about-arrow svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.about-watch {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  pointer-events: auto;

  padding: 8px 18px;
  font: inherit;
  font-size: 14px;
  color: var(--text-h);
  background: var(--social-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: border-color 0.3s;
}

.about-watch:hover,
.about-watch:focus-visible {
  border-color: var(--accent-border);
}

.about-watch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.about-lightbox {
  position: fixed;
  inset: 0;
  z-index: 6; /* above .focus-exit's 5 — see the component's own note. */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 8, 5, 0.82);
  pointer-events: auto;
}

.about-lightbox-frame {
  position: relative;
  width: min(90vw, 960px);
  aspect-ratio: 16 / 9;
  background: #000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.about-lightbox-frame iframe {
  width: 100%;
  height: 100%;
  border: 0;
}

.about-lightbox-close {
  position: absolute;
  top: -44px;
  right: 0;
  width: 36px;
  height: 36px;
  font-size: 24px;
  line-height: 1;
  color: #fff;
  background: transparent;
  border: none;
  cursor: pointer;
}

@media (max-width: 640px) {
  .about-arrow {
    width: 46px;
    height: 46px;
    top: auto;
    bottom: 76px;
    transform: none;
  }

  .about-arrow-left,
  .about-arrow-right {
    top: auto;
  }

  .about-arrow-left:hover:not(:disabled),
  .about-arrow-right:hover:not(:disabled) {
    transform: none;
  }

  .about-watch {
    bottom: 132px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .about-arrow,
  .about-watch {
    transition: none;
  }

  .about-arrow-left:hover:not(:disabled),
  .about-arrow-right:hover:not(:disabled) {
    transform: translateY(-50%);
  }
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/scene/exhibits/about/AboutChrome.tsx src/scene/exhibits/about/AboutChrome.css
git commit -m "Add the About Me book's page controls and video lightbox"
```

---

### Task 8: Registry wiring

The task that makes everything above actually reachable. Three small, mechanical edits.

**Files:**
- Create: `src/scene/exhibits/about/index.ts`
- Modify: `src/scene/exhibits/registry.ts`
- Modify: `src/scene/BookSpines.tsx` (the `book_about` entry in `BOOKS`)

**Interfaces:**
- Consumes: `AboutBook` (Task 6), `AboutChrome` (Task 7), `Exhibit` type from `../types`.
- Produces: `const about: Exhibit`, added to `EXHIBITS`. Nothing downstream of this task — it's the integration point.

- [ ] **Step 1: Write `src/scene/exhibits/about/index.ts`**

```ts
import type { Exhibit } from '../types'
import { AboutBook } from './AboutBook'
import { AboutChrome } from './AboutChrome'

/**
 * The About Me scrapbook, staged as a physical book — same shape as
 * `resume`: no hotspot of its own, triggered by the `book_about` spine on
 * the cabin shelf via `openExhibit('about')` in `BookSpines.tsx`. `focus:
 * 'books'` keeps it reachable only once the camera has moved in on the
 * shelf, which is also the state `FocusExit`'s back button steps back out to.
 */
export const about: Exhibit = {
  id: 'about',
  label: 'About Me',
  scene: 'cabin',
  focus: 'books',
  Scene: AboutBook,
  Content: AboutChrome,
}
```

- [ ] **Step 2: Register it**

In `src/scene/exhibits/registry.ts`:

```diff
+import { about } from './about'
 import { dummy } from './dummy'
 import { resume } from './resume'
 import type { Exhibit } from './types'

 /**
  * Every exhibit in the world.
  *
  * Adding one is an import and a line here, plus the exhibit's own module. If a
  * change ever needs to reach further than that, the plugin boundary has leaked.
  */
-export const EXHIBITS: readonly Exhibit[] = [dummy, resume]
+export const EXHIBITS: readonly Exhibit[] = [dummy, resume, about]
```

- [ ] **Step 3: Wire the shelf spine**

In `src/scene/BookSpines.tsx`, find the `BOOKS` array (around line 60) and change:

```diff
   { node: 'book_resume', title: 'My Resume', exhibit: 'resume' },
-  { node: 'book_about', title: 'About Me' },
+  { node: 'book_about', title: 'About Me', exhibit: 'about' },
   { node: 'book_github', title: 'Github', url: 'https://github.com/CadfanCode' },
```

- [ ] **Step 4: Verify — automated**

```bash
npx tsc -b
npm run lint
npm run build
```

- [ ] **Step 5: Verify — manual, in the dev server**

Per the project's established approach (`Page.captureScreenshot` reliably times out on this app — do not attempt it): start `npm run dev` in one terminal, open the app in a browser, then from that page's own devtools console:

```js
const m = await import('/src/state/useSceneStore.ts')
// The authored path is ocean → cockpit → cabin (see CLAUDE.md) — `goTo`
// only knows the legal single-step routes, so calling it straight to
// 'cabin' from the initial 'ocean' state silently no-ops (logs
// `[scene] no route from "ocean" to "cabin"`) and leaves `scene` stuck at
// 'ocean'. Route through 'cockpit' first.
m.useSceneStore.getState().goTo('cockpit')
m.useSceneStore.getState().arrive()
m.useSceneStore.getState().goTo('cabin')
m.useSceneStore.getState().arrive()
m.useSceneStore.getState().focusOn('books')
m.useSceneStore.getState().arrive()
m.useSceneStore.getState().openExhibit('about')
```

Then visually confirm in the browser window itself (this part genuinely needs eyes on the canvas, the console can't substitute):
- The book flies out and opens to the cover ("About Me").
- All 5 spreads read correctly page-by-page (arrows, both on-screen and ArrowLeft/ArrowRight) — 3 photos appear the right way up, not stretched or blank; the torn-edge pages look torn, not corrupted; the video tile appears on spread 4 (index) with its "▶ Watch: Sunday ride, best co-pilot" button showing only on that spread.
- Clicking "Watch video" opens the lightbox with a playable embed; Escape closes the lightbox only (check the exhibit is still open after); a second Escape then closes the exhibit.
- `m.useSceneStore.getState().closeExhibit()` closes the book cleanly (it retracts rather than vanishing).

Note: browser automation tabs run backgrounded (`document.hidden === true`),
which throttles `requestAnimationFrame` to near-zero — the same trap
documented in this project's own memory on verifying the scene without
screenshots. `useAboutBook`'s `turn()`/`finishTurn()` and `AboutBook.tsx`'s
open/fly/turn timeline are both driven by `useFrame`, so a `turn('forward')`
call will start a turn that never completes under automation. Calling
`finishTurn()` directly afterward bypasses the animation and validates the
store's state machine (spread bounds, `showVideoTrigger`'s spread-matching)
without needing the tween to run — real proof of the animation itself
requires eyes on a genuinely foregrounded browser tab (the user's own, or a
manual check), not automation.

Also confirm with quality/reduced-motion:

```js
window.matchMedia && console.log(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
```

Run the same open/close sequence once with the OS-level reduced-motion setting on, if convenient, to confirm the book still opens (collapsed timing is fine — it must not skip states or throw).

- [ ] **Step 6: Commit**

```bash
git add src/scene/exhibits/about/index.ts src/scene/exhibits/registry.ts src/scene/BookSpines.tsx
git commit -m "Wire the About Me book into the exhibit registry and shelf"
```

---

### Task 9: Final verification pass

Delegate to `checker` once Task 8 is committed — it independently confirms the whole feature (Tasks 1–8) rather than trusting scene-dev's own self-reported passes.

**Files:** None (read-only).

- [ ] **Step 1: Run the checker worker**

Ask it to run, on the full diff since this branch started:

```bash
npx tsc -b
npm run lint
npm run build
git status --short
git diff --stat main...HEAD
```

And to specifically check for:
- Scope creep: no file touched outside what Tasks 1–8 called for.
- The exhibit-plugin boundary held: `CameraRig.tsx`, `useSceneStore.ts`, `App.tsx`, and everything under `resume/` are untouched.
- No `// @ts-ignore`, stray `any`, or unexplained `as` casts beyond the one documented `as HTMLImageElement` in `AboutBook.tsx` (Task 6, Step 2.5).
- No leftover debris: no `console.log`, no commented-out blocks, no stray files under `src/scene/exhibits/about/`.
- `files/Cai_Birch_CV_Eng.pdf` and `public/Cai_Birch_CV_Eng.pdf` are both actually gone, and `public/Cai_Birch_CV.pdf` exists and is a real PDF (not zero bytes).

- [ ] **Step 2: Arbiter review**

Read `checker`'s report and the full diff. Confirm every point in the design spec's "Content — page-by-page" table is actually present in `content/about.ts`, and that the manual dev-server check from Task 8 Step 5 was actually run and passed (not just claimed).
