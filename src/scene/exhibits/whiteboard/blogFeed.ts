/**
 * Fetches and parses the latest posts from `https://caibirch.blogspot.com/`
 * for the cabin whiteboard.
 *
 * `parseBloggerFeed` is deliberately pure and separate from `fetchBlogFeed`:
 * it takes whatever `JSON.parse` produced and turns it into `BlogPost[]`
 * with no network, no DOM, no `Date.now()` — which is what lets it be unit
 * tested against a captured payload instead of a live blog. See the design
 * spec (`docs/superpowers/specs/2026-09-07-blog-whiteboard-design.md`) for
 * why JSONP rather than `fetch`: Blogger's feed sends no
 * `Access-Control-Allow-Origin` header, so a browser `fetch` is blocked, and
 * JSONP is the one thing that still works from a static site with no
 * server-side proxy.
 */

/** One post, as the whiteboard needs it — everything else the feed carries
 *  (summary text, thumbnail, category) is read but discarded, since the
 *  board only ever shows a title, a date and a link. */
export type BlogPost = {
  title: string
  published: Date
  /** The permalink — the `link[]` entry with `rel === 'alternate'`, not the
   *  feed's own `self` link, which points at the JSON API rather than the
   *  post's web page. */
  permalink: string
}

/** The shape `alt=json-in-script` hands back, trimmed to what this file
 *  reads. Every field is optional because the payload is attacker-adjacent —
 *  it comes from a script tag pointed at a URL this app does not control —
 *  so nothing here may be trusted to be present, let alone typed right. */
type RawFeedLink = {
  rel?: unknown
  href?: unknown
}

type RawFeedEntry = {
  title?: { $t?: unknown }
  published?: { $t?: unknown }
  link?: unknown
}

type RawFeed = {
  feed?: {
    entry?: unknown
  }
}

/** Pulls the `rel === 'alternate'` link out of an entry's `link[]`, which is
 *  the post's own web page — the `self` link Blogger also includes points at
 *  the JSON API instead, and following that would hand a visitor raw JSON. */
function findPermalink(rawLink: unknown): string | null {
  if (!Array.isArray(rawLink)) return null
  for (const candidate of rawLink) {
    const link = candidate as RawFeedLink
    if (link?.rel === 'alternate' && typeof link.href === 'string') return link.href
  }
  return null
}

function parseEntry(raw: unknown): BlogPost | null {
  const entry = raw as RawFeedEntry
  const title = entry?.title?.$t
  const publishedRaw = entry?.published?.$t
  if (typeof title !== 'string' || typeof publishedRaw !== 'string') return null

  const published = new Date(publishedRaw)
  if (Number.isNaN(published.getTime())) return null

  const permalink = findPermalink(entry.link)
  if (!permalink) return null

  return { title, published, permalink }
}

/**
 * Turns a raw `alt=json-in-script` payload into posts, newest first. Never
 * throws: a payload this app does not control — network hiccup, Blogger
 * changing shape, the owner's own blog having zero entries — must degrade to
 * an empty board, never to a crash or a visible error. The empty-post case is
 * not an edge case here, it is the payload this blog actually returns today
 * (see the design spec's "measured facts"), which is why `feed.entry` being
 * absent entirely, rather than an empty array, is handled explicitly below
 * rather than assumed away.
 */
export function parseBloggerFeed(raw: unknown): BlogPost[] {
  try {
    const feed = (raw as RawFeed)?.feed
    const rawEntries = feed?.entry
    if (!Array.isArray(rawEntries)) return []

    const posts: BlogPost[] = []
    for (const rawEntry of rawEntries) {
      const post = parseEntry(rawEntry)
      if (post) posts.push(post)
    }

    return posts.sort((a, b) => b.published.getTime() - a.published.getTime())
  } catch {
    return []
  }
}

/** How many posts to ask Blogger for. Matches the board's five-line design
 *  (see the design spec's "open question" — five is a layout budget, not a
 *  count read off any real content, since the blog has none yet). */
const MAX_RESULTS = 5
/** Give up and clean up rather than leave a `<script>` hanging forever if
 *  Blogger never calls back. */
const TIMEOUT_MS = 8000

let jsonpCounter = 0

/**
 * Fetches the latest posts via Blogger's JSONP endpoint.
 *
 * Every exit path — the callback firing, the script erroring, and the
 * timeout — removes the injected `<script>` and deletes the global callback
 * it was given. `useBlogPosts` refetches this every 15 minutes, so a leak
 * here is not a one-off: it is one dead global accumulating on `window`
 * forever for as long as a tab stays open.
 */
export function fetchBlogFeed(): Promise<BlogPost[]> {
  return new Promise((resolve) => {
    const callbackName = `__blogFeedCallback${jsonpCounter++}`
    const script = document.createElement('script')
    let settled = false

    const cleanup = () => {
      // `delete` on a plain `window` property, not a `Map`/`Set` entry — the
      // callback only exists because JSONP requires a global function for
      // the script to call, and it must not outlive the request.
      delete (window as unknown as Record<string, unknown>)[callbackName]
      script.remove()
      window.clearTimeout(timer)
    }

    const finish = (posts: BlogPost[]) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(posts)
    }

    const timer = window.setTimeout(() => finish([]), TIMEOUT_MS)
    ;(window as unknown as Record<string, unknown>)[callbackName] = (raw: unknown) => {
      finish(parseBloggerFeed(raw))
    }

    script.src = `https://caibirch.blogspot.com/feeds/posts/summary?alt=json-in-script&callback=${callbackName}&max-results=${MAX_RESULTS}`
    // A network failure or a 4xx fires `error`, not the callback — without
    // this the promise would hang until the timeout for what is often an
    // instant failure (offline, an ad blocker, the blog gone).
    script.onerror = () => finish([])
    document.head.appendChild(script)
  })
}
