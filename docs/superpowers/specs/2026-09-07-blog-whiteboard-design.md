# Cabin Blog Whiteboard — Design

Date: 2026-09-07
Status: designed under stated assumptions; owner absent at time of writing

## Goal

A whiteboard on a cabin wall showing the latest posts from
`https://caibirch.blogspot.com/`, written as if scrawled in marker. Looking at
it should let you read the titles. Clicking it should take you to the blog.

Second of the two sub-projects split out of the 2026-09-07 request. The first
is `2026-09-07-archipelago-and-traffic-design.md`; the two share nothing.

## Measured facts

Established by direct probe and by parsing the built GLB, not assumed.

### The blog

| Fact | Evidence |
| --- | --- |
| The blog exists: "CaiBirch", author "Cai Owain", blog id `1113595344296501267` | Atom feed |
| It currently has **zero published posts** | `openSearch$totalResults: "0"` on both `alt=json` and `alt=rss` |
| The feed sends **no `Access-Control-Allow-Origin` header**, so a browser `fetch` is blocked | response headers show only `cross-origin-resource-policy: cross-origin` |
| **JSONP works**: `?alt=json-in-script&callback=cb` returns `// API callback` then `cb({...})` | verified against the live blog |
| The `summary` endpoint is **4.5x smaller** than `default`: 12 KB vs 54 KB for 5 entries, and still carries title, date and permalink | measured on a Blogger blog with real posts |
| Blogger **ignores** the `fields=` parameter — it does not trim the payload | measured: identical 53,736 bytes with and without it |
| There is **no CSP** anywhere in this project, so injecting a script tag is unobstructed | `index.html`, no `vercel.json`, no header config |

Entry shape on the `summary` endpoint: `title.$t`, `published.$t`,
`link[]` where `rel === 'alternate'` gives the permalink, `summary.$t`, and an
optional `media$thumbnail.url`. `category` may be absent entirely.

### The cabin

| Fact | Source |
| --- | --- |
| Forward bulkhead saloon face at `z = -0.689`; both usable panel strips already carry framed photos | `src/scene/CabinPictures.tsx:60-97` |
| `instruments` span `x -0.395..0.571, y 0.847..0.963` on that bulkhead | GLB accessor dump |
| The two forward-bulkhead gaps beside the doorway are each only **0.372 m** wide | GLB accessor dump |
| **Aft bulkhead** front face at `z = 1.353`, facing the saloon | GLB accessor dump |
| Its **port side is free**: `x -1.214..-0.335` (0.88 m) by `y 0.490..0.968` (0.478 m). `vhf` occupies only the starboard side | GLB accessor dump |
| `galley` tops out at `y = 0.490` beneath it | GLB accessor dump |
| Cabin stop eye at `[0, 1.05, 1.05]`, resting target `[0, 0.65, -1.3]`, **full 360 degree azimuth**, polar 35-140 deg, FOV 50 | `src/scene/cameraStops.ts:138-151`, `src/SceneCanvas.tsx:35` |
| `desk` (the chart table, `[-0.925, 0.52, 1.03]`) and `vhf` are `placeholder: true` — camera work, no content | `src/scene/cameraFocus.ts:109-265` |
| **Caveat** (400/700) is already loaded from Google Fonts | `index.html:7-12` |
| Font-readiness idiom: `document.fonts.check('700 32px "Caveat"')` fast path, else `document.fonts.load(...)` | `src/scene/exhibits/about/AboutBook.tsx:148-157` |
| External-link idiom: `window.open(url, '_blank', 'noopener,noreferrer')` | `src/scene/BookSpines.tsx:615-618` |
| Flat wall-mounted object idiom: box moulding + plane proud of it, `map` and `emissiveMap` both set, `emissiveIntensity 0.22` for the dim cabin | `src/scene/CabinPictures.tsx:263-347` |

## Decisions

Four calls made without the owner present. Each is recorded with its reasoning
so it can be overturned cheaply.

### 1. Placement: aft bulkhead, port side, over the chart table

Not the forward bulkhead. Its two free gaps are 0.372 m wide and further
constrained below `y = 0.847` by the instrument cluster, leaving roughly
0.37 x 0.24 m — too tight for a board that has to carry five legible lines.

The aft bulkhead's port panel is 0.88 x 0.478 m and completely unclaimed. It
sits directly above the chart table and galley, which is where a memo board
actually lives on a boat — the nav station is where you write things down. It
also gives the currently-placeholder `desk` corner something real beside it.

Board: **0.40 wide x 0.30 tall**, centred at `x = -0.78, y = 0.74`, its face
at `z = 1.335` (the bulkhead at 1.353 less an 0.018 frame depth, matching
`CabinPictures`' `MOULDING_DEPTH`), normal pointing `-Z` toward the saloon.

Cost: it is about 68 degrees off the resting gaze, so a visitor has to turn to
find it. Acceptable — azimuth is unlimited at this stop, and the alternative
was an unreadable board.

### 2. Interaction: focus first, then the link

Two statements in the request pull in different directions — "clicking on it
should take a user to my blog page", and "if a user just looks and doesn't
click, the titles should look like hand scribbled entries". The second only
means anything if the titles are legible without clicking through.

So: a `CameraFocus` entry named `whiteboard` lets the first click move the
camera in close, exactly as `photo-boat` and `books` already do. Once focused,
clicking the board itself opens the blog in a new tab. The board carries a
scrawled `-> caibirch.blogspot.com` as the affordance, and the cursor changes
on hover.

The click-to-open is gated on `focus === 'whiteboard'` so the blog cannot be
opened by a stray click from across the cabin.

### 3. Data: runtime JSONP, no build-time snapshot

JSONP is the only option that works from the browser without infrastructure,
and it is verified working against this blog. Endpoint:

```
https://caibirch.blogspot.com/feeds/posts/summary
  ?alt=json-in-script&callback=<unique>&max-results=5
```

`summary` rather than `default` for the 4.5x payload saving.

A build-time snapshot via a Vite plugin (the `plugins/cv.ts` idiom) was
considered and **rejected**: with zero posts on the blog it would bake in
nothing, so it would add a plugin and a build-time network dependency in
exchange for no benefit today. Runtime fetch also serves "automatically
update" better, since it needs no redeploy.

Refetched every 15 minutes so a long-open tab stays current.

### 4. Not an Exhibit registry entry

`CLAUDE.md` says new exhibits go through the registry. The registry exists to
carry a `HotspotMesh`, a staged 3D `Scene`, or a DOM `Content` panel. The
whiteboard needs none of the three — it is a wall object with a link, which is
precisely what `CabinPictures` and the GitHub book spine already are, and
neither of those is registered either.

So it is built as a cabin component with a `CameraFocus` entry. If it later
grows a reading panel, registering it is a small change.

## The empty state is the default state

The blog has no posts. That makes the empty state the **only** state that can
be seen today, so it is designed properly rather than treated as an edge case:

- **Empty** — heading, then "nothing up here yet" in marker, then the blog URL
  scrawl. Still deliberate, still clickable, reads as a board someone has
  wiped clean rather than as a bug.
- **Loading** — the board renders with its heading and the URL scrawl
  immediately; entries fade in when the feed lands. No spinner, nothing that
  looks broken.
- **Error** — identical to empty but with no claim about content. A blog that
  cannot be reached and a blog with nothing on it should not be
  distinguishable to a visitor, and the board must never show an error string.

## Components

```
src/scene/exhibits/whiteboard/
  blogFeed.ts         parseBloggerFeed (pure) + fetchBlogFeed (JSONP)
  blogFeed.test.ts    parser tests against a captured live fixture
  useBlogPosts.ts     hook: fetch on mount, refetch every 15 min
  renderWhiteboard.ts canvas -> CanvasTexture, the scribbled look
  Whiteboard.tsx      frame, surface, marker tray, click handling
```

`parseBloggerFeed` is separated from `fetchBlogFeed` specifically so the
parsing can be unit tested against a real captured payload without a network
or a browser. The fixture is captured from a Blogger blog that has posts,
because the owner's does not.

Modified: `src/scene/cameraFocus.ts` (one `whiteboard` entry),
`src/scene/PortfolioWorld.tsx` (mount `<Whiteboard />` in `boatFrame` beside
`<CabinPictures />`).

### The scribbled look

`renderWhiteboard.ts` draws to a 2048 x 1536 canvas using the established
procedural-texture idiom (`CabinPictures.tsx:184-261`): draw, wrap in
`CanvasTexture`, set `SRGBColorSpace`, clamp anisotropy, dispose on cleanup.

- Board is off-white with a faint blue-grey cast and a soft vignette, not pure
  `#ffffff` — a real whiteboard never photographs white.
- **Ghosting**: faint un-erased marker smears from a seeded RNG. A board that
  has been wiped a hundred times is never clean, and this one detail is most
  of what sells it as real.
- Heading in Caveat 700; entries in Caveat 400, greedy word-wrapped with
  measured glyph widths using the `wrapText` idiom from
  `renderAboutPage.ts:60-75`.
- **Per-entry jitter**: each entry gets its own small rotation (about
  +/-0.02 rad) and baseline wobble. `renderAboutPage.ts` rotates per *block*;
  going per *entry* here is deliberate, because these are separate notes
  written on different days, not one hand-written page.
- Ink darkness varies per entry, older entries fainter, as if written earlier
  and partly wiped.
- A dry-wipe marker rests on a small tray below the board — two boxes and a
  cylinder, and it is what makes the object read as a whiteboard rather than a
  white rectangle.

Font readiness is handled exactly as `AboutBook.tsx:148-157` does it, or the
first paint falls back to a system cursive and the illusion dies.

## Verification

- `parseBloggerFeed` unit tests against the captured fixture: titles, dates,
  permalinks, entry ordering, the zero-post case, a malformed payload, and a
  payload with `category` absent.
- `fetchBlogFeed` cleans up after itself: the global callback is deleted and
  the script tag removed on success, on error, and on timeout. A leak here
  would accumulate one dead global per refetch, every 15 minutes, forever.
- `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`.
- In the browser: the board is findable from the cabin stop by turning to
  port; the focus close-up makes the scribbles legible; clicking while focused
  opens the blog in a new tab; the empty state looks intentional.
- Screenshots time out in this project, so scene checks go through the dev
  server via the store and R3F `_roots`.

## Open question for the owner

The board is designed for **five** entries and currently the blog has none.
Once there are real posts, the line count and the font size may want a pass —
five long titles at 0.40 m will be tighter than five short ones.
