# About Me exhibit — scrapbook book

## Summary

A new `about` exhibit: a staged 3D book, physically identical in kind to the
existing `resume` exhibit (slides off the shelf, flies to face the camera,
opens and turns pages), but rendered and written as a personal scrapbook
rather than a CV — torn paper, taped-in photographs, handwritten captions,
and a clickable video clipping that opens a YouTube lightbox. It plugs into
the existing `book_about` shelf spine, which currently has no `exhibit` and
is a dead click.

Source material: three photos (`files/1.jpg` backpacking in the Swedish
mountains, `files/2.jpg` ski-touring with a pulk sled, `files/3.jpg` a trail
race finish in Wales), one YouTube video (motorcycle ride with the dog), and
a five-paragraph first-person bio (verbatim, see "Copy" below).

## Non-goals

- No changes to `CameraRig`, `useSceneStore`, the `books` focus definition,
  or the resume exhibit.
- No generic/shared "book" abstraction extracted from `ResumeBook.tsx` —
  `about` gets its own `AboutBook.tsx`/`useAboutBook.ts`, mirroring the
  resume files' shape rather than factoring out a shared base. Consistent
  with the existing pattern (`dummy` and `resume` are already fully
  independent modules) and CLAUDE.md's exhibit-plugin convention.
- No real video thumbnail fetch — the video's canvas tile is a simple drawn
  placeholder (icon + hand-drawn play mark), not a fetched YouTube thumbnail.

## Architecture

New directory `src/scene/exhibits/about/`, structured like `resume/`:

- `src/content/about.ts` — content data, replacing the current unused
  `AboutContent` scaffold (`{title, paragraphs}` — nothing imports it today,
  free to redesign). New shape: an ordered array of page-pair "spreads,"
  each spread `{ left: AboutBlock[], right: AboutBlock[] }`. `AboutBlock` is
  a small union: `{ kind: 'title'; text }`, `{ kind: 'quote'; text }`,
  `{ kind: 'journal'; text }` (diary paragraph), `{ kind: 'photo'; src;
  caption; rotationDeg }`, `{ kind: 'video'; youtubeId; caption }`.
- `src/scene/exhibits/about/AboutBook.tsx` — staged 3D book. Adapted from
  `ResumeBook.tsx`: same geometry constants and open/fly/turn timeline
  approach, pointed at the `book_about` GLB node instead of `book_resume`,
  driving pages through `renderAboutPage` instead of `renderResumePage`.
- `src/scene/exhibits/about/useAboutBook.ts` — page-turn store, same shape
  as `useResumeBook.ts` (`spread`, `turning`, `turn()`, `finishTurn()`,
  `reset()`), sized off `ABOUT_SPREADS.length`.
- `src/scene/exhibits/about/renderAboutPage.ts` — canvas page renderer,
  sibling to `renderResumePage.ts`. Draws paper texture, torn top edge,
  taped-in photos, the video tile, and typeset text per the visual system
  below.
- `src/scene/exhibits/about/AboutChrome.tsx` + `.css` — bare DOM chrome over
  the canvas (staged exhibits render `Content` without `ExhibitOverlay`'s
  panel wrapper): prev/next page controls matching `ResumeChrome.tsx`'s
  pattern, plus the video lightbox (see below).
- `src/scene/exhibits/about/index.ts` — registers:
  ```
  export const about: Exhibit = {
    id: 'about',
    label: 'About Me',
    scene: 'cabin',
    focus: 'books',
    Scene: AboutBook,
    Content: AboutChrome,
  }
  ```
  Added to `EXHIBITS` in `src/scene/exhibits/registry.ts`.
- `src/scene/BookSpines.tsx` — one-line change: the `book_about` entry in
  `BOOKS` gets `exhibit: 'about'` (today it has none, so clicking the spine
  only does the placeholder sticky-glow highlight and opens nothing).
- Photos `files/1.jpg`, `files/2.jpg`, `files/3.jpg` move/copy into
  `src/assets/textures/about/` (or wherever the project's existing image
  assets live under `src/assets` — confirm against convention at
  implementation time) so they can be imported and drawn onto the page
  canvas via `HTMLImageElement`.

**Deliberate departure from existing convention:** `renderResumePage.ts`
explicitly avoids web fonts ("no web fonts, no layout library"). This
exhibit loads one Google Font (a handwriting face — "Caveat" or "Kalam") for
headings, pull-quotes, and captions, because native cursive font stacks
vary too unpredictably across OSes to read as "attention grabbing." Diary
body paragraphs stay in the resume's existing serif for legibility. This is
the first web font in the codebase; flagged here rather than done silently.

## Content — page-by-page

Five spreads (10 pages). Every word of the bio is used verbatim; nothing is
paraphrased. Two additions beyond the given text are called out explicitly
below since they're new copy, not from the user's material.

**Spread 1 — Cover**
- Left: title page — "About Me" hand-lettered, small tape/torn-corner
  decoration, no other content.
- Right: opening pull-quote *"Necessity is the mother of invention."*, then
  the "I've always taken that one personally…" paragraph beneath it as the
  first diary entry.

**Spread 2 — The leap**
- Left: first half of the "In practice that means not waiting for
  permission…" paragraph, up through "…ran it for seven years, fitting a
  master's degree into the evenings."
- Right: second half, "When I stumbled into programming in a biomechanics
  lab…" through "…rebuilt my career around it." Split at that paragraph
  break so it reads as one entry running over the page turn, not two
  entries.

**Spread 3 — Why I do this**
- Left: "The common thread is that I like taking things apart…" paragraph
  in full, with a small drawn gear/circuit doodle.
- Right: "I've also never been much good at leaving well enough alone…"
  paragraph in full, plus **photo 3** (trail race finish) taped in the
  corner. *New copy:* caption "also true on foot" (nothing in the bio
  mentions running; this photo isn't otherwise anchored to text — flagged
  for approval/edit).

**Spread 4 — Away from the keyboard**
- Left: "Away from the keyboard I hike and ski long distances…" paragraph
  in full, as the entry.
- Right: **photo 1** (backpacking, mountains) taped in large and angled.
  *New copy:* caption "the far north, on foot."

**Spread 5 — The far north / closer**
- Left: **photo 2** (ski-touring with pulk) and the **video tile**
  (motorcycle + dog) taped in together as a two-clipping collage. *New
  copy:* photo 2 caption "the far north, on skis" — deliberately paired
  with spread 4's "on foot" caption as a matched set, same place, different
  season. Video caption "Sunday ride, best co-pilot." Clicking the tile
  opens the lightbox.
- Right: closing line *"You're standing in a 3D model of her."* — kept
  clean and uncluttered (no additional photos/doodles) so it lands as the
  punchline connecting the exhibit back to the boat itself. Small signoff
  mark, in the spirit of the resume's colophon.

All captions marked "new copy" above are proposed final wording, not
placeholders — `scribe` should use them as-is unless the user requests
changes during implementation review.

## Visual system

Canvas-rendered pages (`renderAboutPage.ts`), same 1024×1448 page canvas and
physical page geometry as the resume book, so both exhibits share the
`AboutBook`/`ResumeBook` mesh dimensions.

- **Paper**: warmer/more aged tone than the resume's cream (kraft-adjacent),
  same cheap deterministic-speckle technique as `paintPaper()`. Alternating
  pages get a torn/deckled top edge — a jagged path clipped into the paper
  fill instead of a straight rectangle — for the "clipped-out" read.
- **Photos**: the jpg is drawn onto the page canvas via a loaded
  `HTMLImageElement`, framed with a white polaroid-style border and a soft
  drop shadow, rotated 2–4° off-axis. A translucent, subtly striped
  "washi-tape" rectangle is drawn overlapping one corner so it reads as
  physically taped down rather than pasted flush.
- **Video tile**: same taped/rotated treatment as a photo, but the "photo"
  itself is a drawn placeholder (dark tile + simple road/motorcycle icon,
  no live thumbnail fetch), with a hand-drawn circular "▶" mark overlaid as
  the click affordance. `AboutChrome.tsx` tracks this tile's screen-space
  hit zone to open the lightbox on click.
- **Type**: headings, pull-quotes, and captions use the new handwriting web
  font (ink-coloured, occasionally set on a slight rotation for a "scrawled"
  look); diary body paragraphs stay in the resume's serif (`Georgia, "Times
  New Roman", serif`) for readability at length.
- **Doodles**: small recurring hand-drawn accents (arrows, underlines under
  key phrases, the gear/circuit sketch on spread 3) as simple vector paths
  drawn directly in canvas — no illustration assets, consistent with the
  project's "fake cheap effects" convention.

## Video lightbox

Lives in `AboutChrome.tsx`, since staged exhibits render `Content` bare over
the canvas (no `ExhibitOverlay` panel wrapper — see `ExhibitOverlay.tsx`).
Local component state (`lightboxOpen: boolean`) toggles a fixed-position
overlay: dark backdrop, centered real `<iframe>` YouTube embed (using the
video's id, standard `youtube-nocookie.com` embed URL), a close button
top-right, Escape key and backdrop-click both close it — mirroring
`ExhibitOverlay`'s existing dismiss behavior, reimplemented locally since
the staged-exhibit path doesn't get it for free.

## Testing

- Manual verification per the project's `verifying-the-3d-scene-without-
  screenshots` approach (import the store / R3F roots from the dev server)
  — confirm `book_about` opens the exhibit, all 10 pages render without
  overflow/clipping at both default and reduced-motion settings, page
  navigation (arrows + keyboard) works, and the lightbox opens/closes
  cleanly without leaking focus or breaking Escape-to-close on the
  exhibit itself.
- `npm run lint`, `npx tsc -b`, `npm run build` must pass (per `checker`
  worker's standard gate).
