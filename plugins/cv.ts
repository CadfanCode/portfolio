/**
 * Publishes the CV, and keeps the resume book pointed at whichever one is
 * current.
 *
 * `files/` is where the source documents live — drop a new PDF in and the
 * download link, the cache-busting URL and the book's "updated" line all
 * follow on the next dev reload or build. Nothing else needs editing, and no
 * copy of the PDF is kept in `public/`: this plugin serves the chosen file
 * straight out of `files/` in dev and emits it into the bundle at build, so
 * there is exactly one copy in the repo and it cannot go stale.
 *
 * WHICH FILE WINS
 * Any `.pdf` in `files/` with "cv" in its name is a candidate. The newest
 * wins, and "newest" is read from the *filename* first because file
 * modification times do not survive a git clone — on Vercel every file is
 * checked out at once, so mtime there says only when the build ran. Dates are
 * read in this order:
 *
 *   1. An explicit date: `Cai_Birch_CV_2026-08.pdf`, `..._2026-08-28.pdf`.
 *      This is the recommended convention — it is the only one that is
 *      unambiguous across years.
 *   2. A month name, English or Swedish: `Cai_Birch_CV_August.pdf`. The year
 *      comes from a four-digit year elsewhere in the name if there is one,
 *      and from the file's timestamp otherwise. Fine within a year; add the
 *      year to the name once two Augusts could be in play.
 *   3. No date in the name at all — sorts below every dated file, ordered
 *      among its own kind by modification time.
 *
 * The pick is logged on every dev start and every build, so which CV shipped
 * is never a guess.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { Plugin } from 'vite'

/** Where the source documents live, relative to the project root. */
const FILES_DIR = 'files'

/** The path the CV is published at. Deliberately stable and free of the
 *  source filename: the link is the same one it has always been, so anything
 *  already pointing at it keeps working when the underlying document is
 *  replaced. Freshness is handled by the `?v=` stamp instead. */
const PUBLIC_PATH = '/Cai_Birch_CV.pdf'

/** What the visitor's browser saves the file as, regardless of how the source
 *  is named in `files/`. */
const DOWNLOAD_NAME = 'Cai_Birch_CV.pdf'

const VIRTUAL_ID = 'virtual:cv'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

/** English and Swedish month names, plus the usual abbreviations. */
const MONTHS: Readonly<Record<string, number>> = {
  january: 1, jan: 1, januari: 1,
  february: 2, feb: 2, februari: 2,
  march: 3, mar: 3, mars: 3,
  april: 4, apr: 4,
  may: 5, maj: 5,
  june: 6, jun: 6, juni: 6,
  july: 7, jul: 7, juli: 7,
  august: 8, aug: 8, augusti: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, oktober: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type Candidate = {
  path: string
  file: string
  date: Date
  /** Whether `date` came from the filename. Undated files sort last. */
  dated: boolean
}

/** The date a CV claims in its own filename, falling back to its timestamp.
 *  See the "WHICH FILE WINS" note above for why the name is preferred. */
function dateFromName(file: string, mtime: Date): { date: Date; dated: boolean } {
  const base = file.replace(/\.pdf$/i, '')

  // 1. An explicit year-month(-day), with or without separators.
  const iso = base.match(
    /(?:^|\D)((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])(?:[-_.]?(0[1-9]|[12]\d|3[01]))?(?!\d)/,
  )
  if (iso) {
    return {
      date: new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, iso[3] ? Number(iso[3]) : 1)),
      dated: true,
    }
  }

  // 2. A month name. Only the year is guessed, never the month.
  const tokens = base.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const month = tokens.map((t) => MONTHS[t]).find((m) => m !== undefined)
  if (month !== undefined) {
    const yearToken = tokens.find((t) => /^(?:19|20)\d{2}$/.test(t))
    const year = yearToken ? Number(yearToken) : mtime.getUTCFullYear()
    return { date: new Date(Date.UTC(year, month - 1, 1)), dated: true }
  }

  // 3. Nothing in the name to go on.
  return { date: mtime, dated: false }
}

/** Every CV in `files/`, newest first. */
function candidates(root: string): Candidate[] {
  const dir = resolve(root, FILES_DIR)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => /\.pdf$/i.test(f) && /cv/i.test(f))
    .map((file) => {
      const path = join(dir, file)
      const { date, dated } = dateFromName(file, statSync(path).mtime)
      return { path, file, date, dated }
    })
    .sort((a, b) => {
      // A dated filename always beats an undated one, however fresh the
      // undated file's timestamp looks — see the note at the top of the file.
      if (a.dated !== b.dated) return a.dated ? -1 : 1
      return b.date.getTime() - a.date.getTime()
    })
}

/** The module the app imports. Written out as source rather than handed over
 *  as an object because it has to survive being bundled. */
function virtualModule(cv: Candidate | null): string {
  if (!cv) {
    return [
      'export const CV_HREF = null',
      'export const CV_FILENAME = null',
      'export const CV_UPDATED = null',
      'export const CV_UPDATED_LABEL = null',
      '',
    ].join('\n')
  }

  const iso = cv.date.toISOString().slice(0, 10)
  const label = `${MONTH_LABELS[cv.date.getUTCMonth()]} ${cv.date.getUTCFullYear()}`
  // The stamp changes whenever the document does, so a returning visitor is
  // never served a cached copy of last month's CV from a stable URL.
  const href = `${PUBLIC_PATH}?v=${iso.replace(/-/g, '')}`

  return [
    `export const CV_HREF = ${JSON.stringify(href)}`,
    `export const CV_FILENAME = ${JSON.stringify(DOWNLOAD_NAME)}`,
    `export const CV_UPDATED = ${JSON.stringify(iso)}`,
    `export const CV_UPDATED_LABEL = ${JSON.stringify(label)}`,
    '',
  ].join('\n')
}

export function cvPlugin(): Plugin {
  let root = process.cwd()
  let isBuild = false

  const pick = (): Candidate | null => candidates(root)[0] ?? null

  return {
    name: 'portfolio:cv',

    configResolved(config) {
      root = config.root
      isBuild = config.command === 'build'

      const found = candidates(root)
      const chosen = found[0]
      if (!chosen) return // reported properly in buildStart / the middleware

      const how = chosen.dated ? 'dated by filename' : 'undated, fell back to mtime'
      config.logger.info(
        `\n  CV → ${chosen.file}  (${how}: ${chosen.date.toISOString().slice(0, 10)})` +
          (found.length > 1 ? `\n  also in ${FILES_DIR}/: ${found.slice(1).map((c) => c.file).join(', ')}` : ''),
      )
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
      return null
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null
      return virtualModule(pick())
    },

    buildStart() {
      if (!isBuild) return

      const cv = pick()
      if (!cv) {
        // Fail the build rather than ship a resume book whose download button
        // 404s — a broken CV link is worse than a red build.
        this.error(
          `No CV found in ${FILES_DIR}/. Expected a .pdf with "cv" in its name, ` +
            `e.g. ${FILES_DIR}/Cai_Birch_CV_2026-08.pdf`,
        )
        return
      }

      this.emitFile({
        type: 'asset',
        fileName: DOWNLOAD_NAME,
        source: readFileSync(cv.path),
      })
    },

    configureServer(devServer) {
      // Serve the chosen PDF straight from `files/`, resolved per request so a
      // newly dropped CV is live without restarting the server.
      devServer.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== PUBLIC_PATH) return next()

        const cv = pick()
        if (!cv) {
          res.statusCode = 404
          res.end(`No CV in ${FILES_DIR}/`)
          return
        }

        const body = readFileSync(cv.path)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Length', body.byteLength)
        res.setHeader('Content-Disposition', `inline; filename="${DOWNLOAD_NAME}"`)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(req.method === 'HEAD' ? undefined : body)
      })

      // Adding or replacing a CV should update the book in place, the same as
      // editing a source file does.
      const dir = resolve(root, FILES_DIR)
      devServer.watcher.add(dir)
      const onChange = (path: string) => {
        if (!path.startsWith(dir) || !/\.pdf$/i.test(basename(path))) return
        const mod = devServer.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
        if (mod) devServer.moduleGraph.invalidateModule(mod)
        devServer.ws.send({ type: 'full-reload' })
      }
      devServer.watcher.on('add', onChange)
      devServer.watcher.on('change', onChange)
      devServer.watcher.on('unlink', onChange)
    },
  }
}
