import type { AboutBlock, AboutPage, PhotoId } from '../../../content/about'

/**
 * Draws one scrapbook page onto a 2D canvas — sibling to
 * `resume/renderResumePage.ts`, same reason: the page is a texture on a 3D
 * plane, so it has to exist as pixels before the frame it first turns onto
 * screen. Where the resume book stays deliberately plain (no web fonts, one
 * accent colour), this one leans the other way on purpose — see the design
 * spec's "deliberate departure" note on the one web font this app loads.
 *
 * There is no decorative filler in this file — no doodles, no pull-quotes.
 * A page is only ever as full as the real content `content/about.ts` gives
 * it: several full paragraphs for text, one large photo (or two, halved)
 * for images. If a page still looks thin, the fix belongs in that content,
 * not here.
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
const MARGIN_BOTTOM = 70

const HAND_FONT = '"Caveat", cursive'
const BODY_FONT = 'Georgia, "Times New Roman", serif'
const LINE = 46

/** A photo alone on its page — the common case. */
const PHOTO_FRAME_WIDTH = 820
const PHOTO_FRAME_HEIGHT = 1150
/** For a page that shares two photos, one above the other — still a large,
 *  primary image each, just not the full page. Unused by any page currently
 *  in `content/about.ts`, kept for a future spread that wants the layout. */
const PHOTO_FRAME_WIDTH_HALF = 650
const PHOTO_FRAME_HEIGHT_HALF = 580
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

/** A cheap string hash, purely to turn a page id into a distinct RNG seed —
 *  not cryptographic, just needs to spread different ids to different
 *  numbers so no two torn pages draw the identical tear. */
function hashSeed(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) & 0x7fffffff
  }
  return h || 1
}

/** Paper fill, gutter shading, an occasional coffee ring and dog-eared
 *  corner, and — for pages the content marks `torn` — a jagged top edge
 *  clipped into the fill, so the page reads as ripped from a bigger sheet
 *  rather than a plain rectangle. All of it seeded off `pageId`, so a
 *  re-render draws the identical "well-loved" wear rather than re-rolling
 *  it under the reader. This is paper texture, not page content — unlike
 *  the doodles and pull-quotes this file used to add, it never competes
 *  with the actual text and photos for space. */
function paintPaper(
  ctx: CanvasRenderingContext2D,
  side: 'left' | 'right',
  torn: boolean,
  pageId: string,
) {
  const rand = makeRand(hashSeed(`${pageId}-${side}`))

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

  // A faded coffee ring, about one page in five — a couple of concentric,
  // slightly offset arcs read as a mug set down and lifted again, not a
  // perfect circle.
  if (rand() < 0.22) {
    const cx = MARGIN_OUTER + rand() * (CANVAS_WIDTH - MARGIN_OUTER * 2)
    const cy = MARGIN_TOP + rand() * (CANVAS_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM)
    const r = 46 + rand() * 30
    ctx.strokeStyle = 'rgba(120, 76, 30, 0.14)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(120, 76, 30, 0.08)'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.ellipse(cx + r * 0.08, cy + r * 0.05, r * 1.08, r, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // A dog-eared corner on the outer bottom edge, about two pages in five —
  // a folded triangle with a shadow along the crease.
  if (rand() < 0.4) {
    const size = 60 + rand() * 34
    const cornerX = side === 'left' ? 0 : CANVAS_WIDTH
    const dir = side === 'left' ? 1 : -1
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cornerX, CANVAS_HEIGHT)
    ctx.lineTo(cornerX + dir * size, CANVAS_HEIGHT)
    ctx.lineTo(cornerX, CANVAS_HEIGHT - size)
    ctx.closePath()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cornerX + dir * size, CANVAS_HEIGHT)
    ctx.lineTo(cornerX, CANVAS_HEIGHT - size)
    ctx.stroke()
    ctx.restore()
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
  cursor.y += 40
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
  ctx.font = `400 40px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  const lines = wrapText(ctx, block.text, right - left)
  for (const line of lines) {
    cursor.y += LINE
    ctx.fillText(line, left, cursor.y)
  }
  cursor.y += 34
}

/** Faint ruled baselines behind a page's body text, notebook-style — drawn
 *  once the full block list is known so the rule spans exactly the region
 *  actual writing occupies, not the whole page. */
function drawRuling(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  bottom: number,
) {
  ctx.save()
  ctx.strokeStyle = 'rgba(70, 90, 110, 0.1)'
  ctx.lineWidth = 1.5
  for (let y = top; y < bottom; y += LINE) {
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
  }
  ctx.restore()
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
  const half = block.size === 'half'
  const centreX = (left + right) / 2
  const frameW = Math.min(
    half ? PHOTO_FRAME_WIDTH_HALF : PHOTO_FRAME_WIDTH,
    right - left - 20,
  )
  const frameH = half ? PHOTO_FRAME_HEIGHT_HALF : PHOTO_FRAME_HEIGHT
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
  ctx.font = `400 ${half ? 28 : 32}px ${HAND_FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(block.caption, 0, frameH / 2 - 16)
  ctx.textAlign = 'left'
  ctx.restore()

  drawTapeStrip(ctx, centreX - frameW / 2 + 40, cursor.y - frameH / 2, angle + 0.5)

  cursor.y += frameH / 2 + 30
}

/** A taped-in "clipping" for the video — the real YouTube thumbnail, fetched
 *  once at build time and bundled as a static asset (`ride-thumbnail.jpg`,
 *  same loading path as the photos) rather than fetched over the network at
 *  render time, so it is instantly recognisable rather than a generic
 *  hand-drawn glyph standing in for it. The tile is not itself the click
 *  target: `AboutChrome.tsx` lays a real, precisely positioned control
 *  directly over this drawing (see `computeVideoLayoutRect` below, which
 *  mirrors this function's geometry on purpose) so the video reads as
 *  playable right there on the page. This drawing only has to look the
 *  part. */
function drawVideo(
  ctx: CanvasRenderingContext2D,
  block: Extract<AboutBlock, { kind: 'video' }>,
  videoThumb: HTMLImageElement,
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
  drawCoverFit(ctx, videoThumb, innerW, innerH, innerTop)

  // A slight dark wash over the thumbnail, same trick YouTube's own
  // thumbnails use under a play button, so the mark below stays legible
  // against whatever the frame happens to be.
  const midY = innerTop + innerH / 2
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.fillRect(-innerW / 2, innerTop, innerW, innerH)

  const playY = midY
  ctx.fillStyle = 'rgba(20, 16, 10, 0.6)'
  ctx.beginPath()
  ctx.arc(0, playY, 46, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#faf6ea'
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
  videoThumb: HTMLImageElement,
  scale = 1,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH * scale
  canvas.height = CANVAS_HEIGHT * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(scale, scale)

  paintPaper(ctx, side, page.torn ?? false, page.id)

  const { left, right } = textMargins(side)
  const contentRight = CANVAS_WIDTH - right
  const cursor: Cursor = { y: MARGIN_TOP }
  const rulingTop = MARGIN_TOP + 20
  const hasJournal = page.blocks.some((b) => b.kind === 'journal')

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
        drawVideo(ctx, block, videoThumb, left, contentRight, cursor)
        break
    }
  }

  // Ruled baselines behind body text read best drawn under the ink, but
  // this canvas draws top-to-bottom in one pass — so instead they're laid
  // down now, clipped to the span the journal text actually used, and
  // composited underneath what's already there.
  if (hasJournal) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-over'
    drawRuling(ctx, left, contentRight, rulingTop, Math.min(cursor.y, CANVAS_HEIGHT - MARGIN_BOTTOM))
    ctx.restore()
  }

  return canvas
}

export const ABOUT_PAGE_CANVAS_SIZE = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } as const

export type VideoLayoutRect = { cx: number; cy: number; w: number; h: number; angleDeg: number }

/** Computes the on-canvas rect `drawVideo` will draw its clipping into for
 *  `page`, without rasterising anything — `AboutChrome.tsx` uses this to lay
 *  a real, precisely positioned control directly over the drawing, and to
 *  animate a "zoom into the page" from that exact spot. Deliberately mirrors
 *  `drawVideo`'s own geometry by hand rather than sharing code with it: this
 *  app only ever has one page with a video block, so factoring out a general
 *  layout-only block walker would be abstraction for an audience of one
 *  caller. Only supports blocks preceding the video that don't need a text
 *  layout pass (currently just `photo`) — returns `null` rather than
 *  guessing for anything else, so a future content change fails loudly
 *  instead of silently misplacing the overlay. */
export function computeVideoLayoutRect(page: AboutPage, side: 'left' | 'right'): VideoLayoutRect | null {
  const { left, right } = textMargins(side)
  const contentRight = CANVAS_WIDTH - right
  let y = MARGIN_TOP

  for (const block of page.blocks) {
    if (block.kind === 'photo') {
      const frameH = block.size === 'half' ? PHOTO_FRAME_HEIGHT_HALF : PHOTO_FRAME_HEIGHT
      y += frameH / 2 + 24 + (frameH / 2 + 30)
    } else if (block.kind === 'video') {
      const frameW = Math.min(PHOTO_FRAME_WIDTH, contentRight - left - 20)
      const frameH = PHOTO_FRAME_HEIGHT * 0.72
      return {
        cx: (left + contentRight) / 2,
        cy: y + frameH / 2 + 24,
        w: frameW,
        h: frameH,
        angleDeg: 4,
      }
    } else {
      return null
    }
  }
  return null
}
