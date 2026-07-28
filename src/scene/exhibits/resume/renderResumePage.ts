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
 */

/** Canvas pixels per page. 1024:1448 matches the 0.105:0.148 m physical page,
 *  so the texture maps onto the mesh without stretching. */
const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 1448

const PAPER_COLOUR = '#f2ead8'
const INK_COLOUR = '#2b2621'
const RULE_COLOUR = 'rgba(43, 38, 33, 0.35)'

/** Outer margin (the page's fore-edge / top / bottom) vs. the gutter margin
 *  (the spine edge), in canvas px. The gutter is wider — paper disappears into
 *  the binding — which is also what makes the two facing pages read as one
 *  spread rather than two independent sheets. */
const MARGIN_OUTER = 72
const MARGIN_GUTTER = 128
const MARGIN_TOP = 96
const MARGIN_BOTTOM = 108

const BODY_FONT = 'Georgia, "Times New Roman", serif'

/** Line height, in px, for body copy at the base size — the unit `spacer`'s
 *  `size` field counts in. */
const LINE = 30

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
  ctx.font = `400 64px ${BODY_FONT}`
  cursor.y += 64
  ctx.fillText(block.text, centreX, cursor.y)
  cursor.y += 44
  ctx.font = `italic 300 30px ${BODY_FONT}`
  ctx.fillStyle = 'rgba(43, 38, 33, 0.75)'
  ctx.fillText(block.subtitle, centreX, cursor.y)
  cursor.y += LINE
  ctx.textAlign = 'left'
}

function drawHeading(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'heading' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  cursor.y += 8
  ctx.font = `700 38px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  cursor.y += 38
  ctx.fillText(block.text, left, cursor.y)
  cursor.y += 14
  ctx.strokeStyle = RULE_COLOUR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left, cursor.y)
  ctx.lineTo(right, cursor.y)
  ctx.stroke()
  cursor.y += 26
}

function drawParagraph(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'paragraph' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  ctx.font = `400 26px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  const lines = wrapText(ctx, block.text, right - left)
  for (const line of lines) {
    cursor.y += LINE
    ctx.fillText(line, left, cursor.y)
  }
  cursor.y += 10
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'bullets' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  ctx.font = `400 25px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  const indent = 26
  for (const item of block.items) {
    const lines = wrapText(ctx, item, right - left - indent)
    lines.forEach((line, i) => {
      cursor.y += LINE - 2
      if (i === 0) ctx.fillText('–', left, cursor.y)
      ctx.fillText(line, left + indent, cursor.y)
    })
    cursor.y += 6
  }
  cursor.y += 8
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'rows' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  const labelWidth = (right - left) * 0.34
  const valueLeft = left + labelWidth + 18
  const valueWidth = right - valueLeft
  for (const row of block.rows) {
    const rowTop = cursor.y
    ctx.font = `700 22px ${BODY_FONT}`
    ctx.fillStyle = INK_COLOUR
    const labelLines = wrapText(ctx, row.label, labelWidth)

    ctx.font = `400 22px ${BODY_FONT}`
    const valueLines = wrapText(ctx, row.value, valueWidth)

    const rowLines = Math.max(labelLines.length, valueLines.length)

    ctx.font = `700 22px ${BODY_FONT}`
    labelLines.forEach((line, i) => {
      ctx.fillText(line, left, rowTop + LINE - 4 + i * (LINE - 4))
    })
    ctx.font = `400 22px ${BODY_FONT}`
    valueLines.forEach((line, i) => {
      ctx.fillText(line, valueLeft, rowTop + LINE - 4 + i * (LINE - 4))
    })

    cursor.y = rowTop + rowLines * (LINE - 4) + 10
    ctx.strokeStyle = 'rgba(43, 38, 33, 0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, cursor.y)
    ctx.lineTo(right, cursor.y)
    ctx.stroke()
    cursor.y += 12
  }
}

function drawEntry(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'entry' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  ctx.font = `700 27px ${BODY_FONT}`
  ctx.fillStyle = INK_COLOUR
  cursor.y += LINE + 2
  ctx.fillText(block.role, left, cursor.y)

  if (block.org) {
    // Org rides the role's line where the two genuinely fit, and drops to its
    // own line where they don't. Measured rather than assumed: the education
    // entries pair a long qualification with a long institution, and
    // right-aligning blindly runs them into each other.
    const roleWidth = ctx.measureText(block.role).width
    ctx.font = `400 24px ${BODY_FONT}`
    const orgWidth = ctx.measureText(block.org).width
    if (roleWidth + orgWidth + 24 <= right - left) {
      ctx.textAlign = 'right'
      ctx.fillText(block.org, right, cursor.y)
      ctx.textAlign = 'left'
    } else {
      cursor.y += 28
      ctx.fillText(block.org, left, cursor.y)
    }
  }

  if (block.meta) {
    ctx.font = `italic 400 21px ${BODY_FONT}`
    ctx.fillStyle = 'rgba(43, 38, 33, 0.7)'
    cursor.y += 26
    ctx.fillText(block.meta, left, cursor.y)
  }

  if (block.bullets && block.bullets.length > 0) {
    cursor.y += 8
    drawBullets(ctx, { kind: 'bullets', items: block.bullets }, left, right, cursor)
  } else {
    cursor.y += 12
  }
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  block: Extract<ResumeBlock, { kind: 'note' }>,
  left: number,
  right: number,
  cursor: Cursor,
) {
  ctx.font = `italic 400 22px ${BODY_FONT}`
  ctx.fillStyle = 'rgba(43, 38, 33, 0.75)'
  const lines = wrapText(ctx, block.text, right - left)
  for (const line of lines) {
    cursor.y += LINE - 4
    ctx.fillText(line, left, cursor.y)
  }
  cursor.y += 8
}

function drawRule(ctx: CanvasRenderingContext2D, left: number, right: number, cursor: Cursor) {
  cursor.y += 14
  ctx.strokeStyle = RULE_COLOUR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(left, cursor.y)
  ctx.lineTo(right, cursor.y)
  ctx.stroke()
  cursor.y += 14
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
    ctx.font = `italic 400 20px ${BODY_FONT}`
    ctx.fillStyle = 'rgba(43, 38, 33, 0.6)'
    ctx.fillText(page.folio, (left + contentRight) / 2, CANVAS_HEIGHT - MARGIN_BOTTOM + 30)
    ctx.textAlign = 'left'
  }

  return canvas
}

export const RESUME_PAGE_CANVAS_SIZE = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } as const
