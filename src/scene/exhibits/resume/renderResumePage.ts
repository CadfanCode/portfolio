import type { ResumeBlock, ResumePage } from '../../../content/resume'

/**
 * Draws one printed page of the CV onto a 2D canvas.
 *
 * A canvas rather than DOM text laid over the mesh: the page is a texture on a
 * 3D plane, so it has to exist as pixels before the frame it first turns onto
 * screen — there is no live-reflow option here the way `ExhibitOverlay`'s DOM
 * panel gets for free. Everything below is plain `CanvasRenderingContext2D`,
 * matching `BookSpines.tsx`'s `drawSpineCanvas` in spirit: no web fonts, no
 * layout library, just measured text on a fixed canvas.
 *
 * The type is sized for a page that fills most of the viewport, which is what
 * the book does once it is open — so it is set much larger relative to the
 * page than a printed CV would be. The densest page (the first experience
 * page) is the one that fixes the ceiling: at these sizes it runs to roughly
 * six-sevenths of the text block, and everything else has room to spare.
 */

/** Canvas pixels per page. 1024:1448 matches the 0.105:0.148 m physical page,
 *  so the texture maps onto the mesh without stretching. */
const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 1448

const PAPER_COLOUR = '#f2ead8'
/** Near-black rather than a soft grey: the scene runs bloom over everything,
 *  and anything lighter washes out to an unreadable haze at page scale. */
const INK_COLOUR = '#1f1a15'
const INK_MUTED = 'rgba(31, 26, 21, 0.78)'
const RULE_COLOUR = 'rgba(31, 26, 21, 0.4)'

/** The one accent colour, a warm brass that sits comfortably next to the
 *  paper/ink pair without clashing — used sparingly, only where it earns its
 *  keep for hierarchy (section tabs, small-caps labels, chip outlines). */
const ACCENT_COLOUR = '#9c6a2e'
const ACCENT_MUTED = 'rgba(156, 106, 46, 0.45)'
const ACCENT_FAINT = 'rgba(156, 106, 46, 0.16)'

/** Outer margin (the page's fore-edge / top / bottom) vs. the gutter margin
 *  (the spine edge), in canvas px. The gutter is wider — paper disappears into
 *  the binding — which is also what makes the two facing pages read as one
 *  spread rather than two independent sheets. */
const MARGIN_OUTER = 64
const MARGIN_GUTTER = 110
const MARGIN_TOP = 80
const MARGIN_BOTTOM = 90

const BODY_FONT = 'Georgia, "Times New Roman", serif'

/** Line height, in px, for body copy at the base size — the unit `spacer`'s
 *  `size` field counts in. */
const LINE = 39

function textMargins(side: 'left' | 'right') {
  // The gutter is the spine-side edge: the page's right edge for a left page,
  // its left edge for a right page.
  return side === 'left'
    ? { left: MARGIN_OUTER, right: MARGIN_GUTTER }
    : { left: MARGIN_GUTTER, right: MARGIN_OUTER }
}

/** A cheap, seeded-by-position speckle so the paper doesn't read as a flat
 *  fill — a handful of translucent dots is enough at this scale and costs
 *  nothing to regenerate per page since it only ever runs once, off-frame. */
function paintPaper(ctx: CanvasRenderingContext2D, side: 'left' | 'right') {
  ctx.fillStyle = PAPER_COLOUR
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Darken gently toward the gutter so the spread reads as curved paper
  // falling away into the binding rather than two flat cards.
  const gutterX = side === 'left' ? CANVAS_WIDTH : 0
  const outerX = side === 'left' ? 0 : CANVAS_WIDTH
  const gradient = ctx.createLinearGradient(outerX, 0, gutterX, 0)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.14)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.fillStyle = 'rgba(80, 70, 55, 0.05)'
  // A fixed seed via a simple LCG so the speckle is deterministic — cheap and
  // reproducible rather than genuinely random, in keeping with the rest of
  // the app's "fake the effect" rule.
  let seed = side === 'left' ? 1 : 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return (seed % 1000) / 1000
  }
  for (let i = 0; i < 260; i++) {
    const x = rand() * CANVAS_WIDTH
    const y = rand() * CANVAS_HEIGHT
    const r = 0.6 + rand() * 1.1
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // A faint accent hairline framing the top and bottom of the sheet — a hint
  // of a printed running head/footer rule, present on every page regardless
  // of content so the book reads as a designed object rather than plain text
  // dumped on a card.
  ctx.strokeStyle = ACCENT_FAINT
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(40, 46)
  ctx.lineTo(CANVAS_WIDTH - 40, 46)
  ctx.moveTo(40, CANVAS_HEIGHT - 46)
  ctx.lineTo(CANVAS_WIDTH - 40, CANVAS_HEIGHT - 46)
  ctx.stroke()
}

/** Greedy word wrap using real glyph metrics — the only reliable way to wrap
 *  a serif face where character width varies a lot. */
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

/** Width of `text` if drawn with `fillTracked` at the given letter-spacing —
 *  needed up front wherever tracked text has to be measured before it's
 *  placed (centred, or right-justified against another run). */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let width = 0
  for (const ch of text) width += ctx.measureText(ch).width + tracking
  return text.length > 0 ? width - tracking : 0
}

/** Draws `text` letter-by-letter with extra spacing between glyphs — canvas
 *  has no native letter-spacing, so small-caps-style labels (section tabs,
 *  row labels, org names) are tracked out by hand. Always resolves to a
 *  left-to-right run internally; `align` only changes where that run starts. */
function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center',
) {
  const total = trackedWidth(ctx, text, tracking)
  const savedAlign = ctx.textAlign
  ctx.textAlign = 'left'
  let cx = align === 'center' ? x - total / 2 : x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tracking
  }
  ctx.textAlign = savedAlign
}

/** Traces a rounded-rect path without filling or stroking it, so the caller
 *  can do either (or both) — used for the skills chips. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

type Cursor = { y: number }

function drawTitle(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'title' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const centreX = (left + right) / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = INK_COLOUR
  ctx.font = `700 90px ${BODY_FONT}`
  cursor.y += 94
  ctx.fillText(block.text, centreX, cursor.y)

  // The role line reads as a printed small-caps subtitle rather than plain
  // italic body text — tracked out and lifted into the accent colour so it
  // reads as designed, not as an afterthought under the name.
  cursor.y += 48
  ctx.font = `700 27px ${BODY_FONT}`
  ctx.fillStyle = ACCENT_COLOUR
  fillTracked(ctx, block.subtitle.toUpperCase(), centreX, cursor.y, 4, 'center')

  cursor.y += 32
  ctx.strokeStyle = ACCENT_COLOUR
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(centreX - 60, cursor.y)
  ctx.lineTo(centreX + 60, cursor.y)
  ctx.stroke()

  cursor.y += LINE
  ctx.textAlign = 'left'
}

function drawHeading(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'heading' }>,
  left: number,
  _right: number,
  cursor: Cursor,
) {
  cursor.y += 24
  ctx.font = `700 50px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  cursor.y += 50
  ctx.fillText(block.text, left, cursor.y)

  // A short accent-coloured tab under the heading rather than a full-width
  // grey rule — reads as a deliberate section marker instead of a stray HR,
  // and doesn't compete with the gutter rule that separates the two pages.
  cursor.y += 16
  ctx.strokeStyle = ACCENT_COLOUR
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(left, cursor.y)
  ctx.lineTo(left + 68, cursor.y)
  ctx.stroke()

  cursor.y += 32
}

function drawParagraph(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'paragraph' }>,
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
  cursor.y += 18
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'bullets' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  ctx.font = `400 32px ${BODY_FONT}`
  const indent = 30
  for (const item of block.items) {
    const lines = wrapText(ctx, item, right - left - indent)
    lines.forEach((line, i) => {
      cursor.y += LINE - 3
      if (i === 0) {
        // An accent-coloured dot rather than a dash — small enough to stay
        // out of the way, but a distinct enough mark that a skimming eye can
        // count entries at a glance.
        ctx.fillStyle = ACCENT_COLOUR
        ctx.beginPath()
        ctx.arc(left + 6, cursor.y - 11, 4.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = INK_COLOUR
      ctx.fillText(line, left + indent, cursor.y)
    })
    cursor.y += 10
  }
  cursor.y += 12
}

/** The skills table, redrawn as tag-like chips wrapped under a small-caps
 *  label rather than a two-column text grid — closer to how a skills section
 *  actually reads on a well-designed CV, and it wraps far more gracefully
 *  than justified text ever did in a narrow value column. */
function drawRows(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'rows' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const width = right - left
  const chipFont = `400 26px ${BODY_FONT}`
  const chipHeight = 42
  const chipPadX = 16
  const chipGapX = 10
  const chipGapY = 12

  for (const row of block.rows) {
    ctx.font = `700 23px ${BODY_FONT}`
    ctx.fillStyle = ACCENT_COLOUR
    cursor.y += 30
    fillTracked(ctx, row.label.toUpperCase(), left, cursor.y, 2.4, 'left')
    cursor.y += 16

    ctx.font = chipFont
    const items = row.value.split(/,\s*/).filter(Boolean)
    let x = left
    let lineTop = cursor.y
    for (const item of items) {
      const chipWidth = ctx.measureText(item).width + chipPadX * 2
      if (x + chipWidth > left + width && x > left) {
        x = left
        lineTop += chipHeight + chipGapY
      }
      roundRectPath(ctx, x, lineTop, chipWidth, chipHeight, chipHeight / 2)
      ctx.fillStyle = ACCENT_FAINT
      ctx.fill()
      ctx.strokeStyle = ACCENT_MUTED
      ctx.lineWidth = 1.3
      ctx.stroke()
      ctx.fillStyle = INK_COLOUR
      ctx.fillText(item, x + chipPadX, lineTop + chipHeight / 2 + 9)
      x += chipWidth + chipGapX
    }
    cursor.y = lineTop + chipHeight + 22
  }
}

function drawEntry(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'entry' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  ctx.font = `700 36px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  cursor.y += LINE + 8
  ctx.fillText(block.role, left, cursor.y)

  if (block.org) {
    // Org rides the role's line where the two genuinely fit, and drops to its
    // own line where they don't. Measured rather than assumed: the education
    // entries pair a long qualification with a long institution, and
    // right-aligning blindly runs them into each other. Tracked, uppercase
    // and accent-coloured, so role and org read as two different kinds of
    // information rather than one run-on line.
    const roleWidth = ctx.measureText(block.role).width
    ctx.font = `700 24px ${BODY_FONT}`
    const orgText = block.org.toUpperCase()
    const orgWidth = trackedWidth(ctx, orgText, 1.6)
    ctx.fillStyle = ACCENT_COLOUR
    if (roleWidth + orgWidth + 40 <= right - left) {
      fillTracked(ctx, orgText, right - orgWidth, cursor.y, 1.6, 'left')
    } else {
      cursor.y += 34
      fillTracked(ctx, orgText, left, cursor.y, 1.6, 'left')
    }
  }

  if (block.meta) {
    ctx.font = `italic 400 26px ${BODY_FONT}`
    ctx.fillStyle = INK_MUTED
    cursor.y += 33
    ctx.fillText(block.meta, left, cursor.y)
  }

  if (block.bullets && block.bullets.length > 0) {
    cursor.y += 12
    drawBullets(ctx, { kind: 'bullets', items: block.bullets }, left, right, cursor)
  } else {
    cursor.y += 20
  }
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'note' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const indent = 22
  ctx.font = `italic 400 28px ${BODY_FONT}`
  ctx.fillStyle = INK_MUTED
  const lines = wrapText(ctx, block.text, right - left - indent)
  const topY = cursor.y
  for (const line of lines) {
    cursor.y += LINE - 5
    ctx.fillText(line, left + indent, cursor.y)
  }
  // A thin accent rule down the left edge marks this as a margin aside,
  // distinct from a body paragraph, without needing a change of font.
  ctx.strokeStyle = ACCENT_MUTED
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(left, topY + 6)
  ctx.lineTo(left, cursor.y - 8)
  ctx.stroke()
  cursor.y += 14
}

function drawRule(ctx: CanvasRenderingContext2D, left: number, right: number, cursor: Cursor) {
  cursor.y += 20
  const midX = (left + right) / 2
  ctx.strokeStyle = RULE_COLOUR
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(left, cursor.y)
  ctx.lineTo(midX - 14, cursor.y)
  ctx.moveTo(midX + 14, cursor.y)
  ctx.lineTo(right, cursor.y)
  ctx.stroke()

  // A small accent diamond breaks the rule at its centre — a printer's
  // flourish rather than a plain divider line.
  ctx.fillStyle = ACCENT_COLOUR
  ctx.beginPath()
  ctx.moveTo(midX, cursor.y - 6)
  ctx.lineTo(midX + 6, cursor.y)
  ctx.lineTo(midX, cursor.y + 6)
  ctx.lineTo(midX - 6, cursor.y)
  ctx.closePath()
  ctx.fill()

  cursor.y += 20
}

/** Renders one page — a title page, a section spread half, or the colophon —
 *  as a fresh canvas. `side` decides which edge is the gutter. */
export function renderResumePage(page: ResumePage, side: 'left' | 'right'): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  paintPaper(ctx, side)

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
      case 'heading':
        drawHeading(ctx, block, left, contentRight, cursor)
        break
      case 'paragraph':
        drawParagraph(ctx, block, left, contentRight, cursor)
        break
      case 'bullets':
        drawBullets(ctx, block, left, contentRight, cursor)
        break
      case 'rows':
        drawRows(ctx, block, left, contentRight, cursor)
        break
      case 'entry':
        drawEntry(ctx, block, left, contentRight, cursor)
        break
      case 'note':
        drawNote(ctx, block, left, contentRight, cursor)
        break
      case 'rule':
        drawRule(ctx, left, contentRight, cursor)
        break
      case 'spacer':
        cursor.y += block.size * LINE
        break
    }
  }

  if (page.folio) {
    ctx.textAlign = 'center'
    ctx.font = `italic 400 26px ${BODY_FONT}`
    ctx.fillStyle = 'rgba(31, 26, 21, 0.62)'
    ctx.fillText(page.folio, (left + contentRight) / 2, CANVAS_HEIGHT - MARGIN_BOTTOM + 39)
    ctx.textAlign = 'left'
  }

  return canvas
}

export const RESUME_PAGE_CANVAS_SIZE = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } as const
