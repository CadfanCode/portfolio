import type { BlogPost } from './blogFeed'

/**
 * Draws the whiteboard face onto a 2D canvas — the same "pixels before the
 * first frame" idiom as `renderAboutPage.ts` and `CabinPictures.tsx`'s
 * plaque: the result becomes a `CanvasTexture` in `Whiteboard.tsx`, so it has
 * to exist as a bitmap before three.js has anything to upload.
 *
 * Matches the board's own 0.40 x 0.30 m proportions exactly (4:3), so the
 * texture maps on with no stretching.
 */

const CANVAS_WIDTH = 2048
const CANVAS_HEIGHT = 1536

const HAND_FONT = '"Caveat", cursive'

/** Off-white with a faint blue-grey cast — a real whiteboard is never the
 *  paper white a plain `#ffffff` fill would give it. */
const BOARD_BASE = '#eef1f3'
const INK_COLOUR = '#20303f'
const URL_INK = '#3a5068'

const MARGIN_X = 140
const HEADING_Y = 190
const ENTRIES_TOP = 320
const ENTRIES_BOTTOM = 1310
const URL_Y = 1430

const BLOG_URL = 'caibirch.blogspot.com'

/** A cheap seeded LCG, same idiom as `renderAboutPage.ts`'s — deterministic
 *  per seed, so the ghost smears redraw pixel-identical rather than
 *  re-rolling under the visitor every time the feed refetches and this
 *  canvas is redrawn. */
function makeRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s % 1000) / 1000
  }
}

function hashSeed(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) & 0x7fffffff
  }
  return h || 1
}

/** Greedy word wrap using real glyph metrics — the `wrapText` idiom from
 *  `renderAboutPage.ts:60-75`. */
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

/**
 * Faint un-erased marker smears, seeded once and fixed — not reseeded per
 * render — so a board that has just been wiped a hundred times reads the
 * same "never quite clean" every time this texture is rebuilt, rather than
 * flickering to a new pattern of smudges on every feed refetch. This is the
 * detail the design spec calls out as doing most of the work of selling the
 * object as a real whiteboard rather than a white rectangle.
 */
function paintGhosting(ctx: CanvasRenderingContext2D) {
  const rand = makeRand(hashSeed('whiteboard-ghosts'))
  ctx.save()
  for (let i = 0; i < 5; i++) {
    const x = MARGIN_X + rand() * (CANVAS_WIDTH - MARGIN_X * 2)
    const y = ENTRIES_TOP + rand() * (URL_Y - ENTRIES_TOP)
    const w = 220 + rand() * 420
    const h = 26 + rand() * 30
    const angle = (rand() - 0.5) * 0.1
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = `rgba(70, 90, 100, ${0.02 + rand() * 0.025})`
    ctx.beginPath()
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // A couple of stray dots, the kind a cap-off marker leaves resting on the
  // board for a second too long.
  for (let i = 0; i < 6; i++) {
    const x = MARGIN_X + rand() * (CANVAS_WIDTH - MARGIN_X * 2)
    const y = ENTRIES_TOP + rand() * (URL_Y - ENTRIES_TOP)
    ctx.fillStyle = `rgba(60, 80, 90, ${0.05 + rand() * 0.05})`
    ctx.beginPath()
    ctx.arc(x, y, 3 + rand() * 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function paintBase(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BOARD_BASE
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // A soft vignette — a lit board photographs slightly darker at its own
  // frame edge than at its centre, and a flat fill reads as a texture
  // rather than an object under the cabin's lights.
  const vignette = ctx.createRadialGradient(
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    CANVAS_HEIGHT * 0.2,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    CANVAS_HEIGHT * 0.85,
  )
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vignette.addColorStop(1, 'rgba(30, 40, 50, 0.1)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function paintHeading(ctx: CanvasRenderingContext2D) {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK_COLOUR
  ctx.font = `700 116px ${HAND_FONT}`
  ctx.save()
  ctx.translate(MARGIN_X, HEADING_Y)
  ctx.rotate(-0.012)
  ctx.fillText('the blog', 0, 0)
  ctx.restore()

  // The underline, same quick-curve idiom as `renderAboutPage.ts`'s title
  // rule — a single confident stroke, not a ruled line.
  ctx.strokeStyle = URL_INK
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(MARGIN_X, HEADING_Y + 26)
  ctx.quadraticCurveTo(MARGIN_X + 220, HEADING_Y + 44, MARGIN_X + 440, HEADING_Y + 24)
  ctx.stroke()
}

/** The permanent affordance line: what clicking the board does, scrawled as
 *  if it were another note rather than set as UI chrome. Present in every
 *  state — populated, empty, unreachable — because a visitor who never
 *  clicks should still be able to read where the board goes. */
function paintUrlScrawl(ctx: CanvasRenderingContext2D) {
  ctx.textAlign = 'left'
  ctx.fillStyle = URL_INK
  ctx.font = `400 62px ${HAND_FONT}`
  ctx.save()
  ctx.translate(MARGIN_X, URL_Y)
  ctx.rotate(0.008)
  ctx.fillText(`-> ${BLOG_URL}`, 0, 0)
  ctx.restore()
}

function paintEmptyNotice(ctx: CanvasRenderingContext2D) {
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(32, 48, 63, 0.72)'
  ctx.font = `400 78px ${HAND_FONT}`
  ctx.save()
  ctx.translate(MARGIN_X, ENTRIES_TOP + 120)
  ctx.rotate(-0.008)
  ctx.fillText('nothing up here yet', 0, 0)
  ctx.restore()
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * One entry: a wrapped, jittered title and a small date underneath. Rotation
 * and baseline wobble are rolled per *entry*, not per page as
 * `renderAboutPage.ts` does for its blocks — deliberately, because these are
 * separate notes written on different days, not one hand-written page, and a
 * shared rotation would make five posts look like one sitting.
 */
function paintEntry(
  ctx: CanvasRenderingContext2D,
  post: BlogPost,
  index: number,
  top: number,
  maxWidth: number,
): number {
  const rand = makeRand(hashSeed(post.permalink))
  // Rotation and indent are rolled per entry and deliberately generous. A
  // tighter jitter reads as a typeset list in a script face rather than as
  // something a person wrote on a board with a marker, which is the whole
  // point of the object: the eye picks up a ruler-straight left margin
  // immediately, and nothing else about the drawing recovers from it.
  const rotation = (rand() - 0.5) * 0.09
  const indent = (rand() - 0.5) * 36
  const wobble = (rand() - 0.5) * 14
  // Older entries read fainter, as if written earlier and half wiped since —
  // the same logic a real memo board follows, where the newest note is
  // always the boldest one.
  const inkAlpha = Math.max(0.42, 0.92 - index * 0.13)

  ctx.font = `600 66px ${HAND_FONT}`
  const lines = wrapText(ctx, post.title, maxWidth)

  ctx.save()
  ctx.translate(MARGIN_X + indent, top)
  ctx.rotate(rotation)
  ctx.textAlign = 'left'
  ctx.fillStyle = `rgba(32, 48, 63, ${inkAlpha})`
  let lineY = 60 + wobble
  for (const line of lines) {
    // A second, smaller roll per line. Hand-written lines under one another
    // drift apart slightly rather than stacking on a fixed grid, and the
    // wrapped second line of a long title is where that shows most.
    ctx.fillText(line, (rand() - 0.5) * 10, lineY)
    lineY += 70
  }
  ctx.fillStyle = `rgba(58, 80, 104, ${inkAlpha * 0.75})`
  ctx.font = `400 40px ${HAND_FONT}`
  ctx.fillText(DATE_FORMAT.format(post.published), 4 + (rand() - 0.5) * 12, lineY + 6)
  ctx.restore()

  return top + 60 + lines.length * 70 + 66
}

/**
 * Renders the whiteboard face for the given posts and returns the canvas —
 * the caller (`Whiteboard.tsx`) wraps it in a `CanvasTexture`.
 *
 * Never draws an error state: `useBlogPosts` collapses a network failure to
 * an empty list exactly the same way it collapses a genuinely empty blog, so
 * this function only ever sees "some posts" or "none", and only ever draws
 * one of those two things.
 */
export function renderWhiteboard(posts: readonly BlogPost[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  paintBase(ctx)
  paintGhosting(ctx)
  paintHeading(ctx)

  const maxWidth = CANVAS_WIDTH - MARGIN_X * 2

  if (posts.length === 0) {
    paintEmptyNotice(ctx)
  } else {
    // Measure before drawing, so the entries can be spread down the board
    // instead of stacking from the top and leaving a dead band above the URL
    // scrawl. Titles vary in length, so the natural height is only knowable
    // after wrapping — hence the measuring pass.
    ctx.font = `600 66px ${HAND_FONT}`
    const lineCounts = posts.map((post) => wrapText(ctx, post.title, maxWidth).length)
    const natural = lineCounts.reduce((sum, n) => sum + 60 + n * 70 + 66, 0)
    const slack = ENTRIES_BOTTOM - ENTRIES_TOP - natural
    // Capped: with one short post, spreading the full slack would push the
    // single entry into the middle of nowhere. Capped at 90 px the board reads
    // as loosely spaced rather than as either cramped or empty.
    const extraGap = posts.length > 1 ? Math.max(0, Math.min(90, slack / (posts.length - 1))) : 0

    let cursor = ENTRIES_TOP
    for (let i = 0; i < posts.length; i++) {
      if (cursor > ENTRIES_BOTTOM) break
      cursor = paintEntry(ctx, posts[i], i, cursor, maxWidth) + (i < posts.length - 1 ? extraGap : 0)
    }
  }

  paintUrlScrawl(ctx)

  return canvas
}
