/**
 * Fetches and parses the latest posts from
 * `https://cadfancode.wordpress.com/` for the cabin whiteboard.
 *
 * `parsePosts` is deliberately pure and separate from `fetchBlogFeed`: it
 * takes whatever `JSON.parse` produced and turns it into `BlogPost[]` with
 * no network, no DOM, no `Date.now()` — which is what lets it be unit tested
 * against a captured payload instead of a live blog. WordPress's REST API
 * sends `Access-Control-Allow-Origin: *`, so a plain `fetch` works from a
 * static site with no server-side proxy — unlike the Blogger feed this
 * replaced, which needed a JSONP `<script>` dance to get around having no
 * CORS header at all.
 */

/** One post, as the whiteboard needs it — everything else the API response
 *  carries (excerpt, featured image, author) is read but discarded, since
 *  the board only ever shows a title, a date and a link. */
export type BlogPost = {
  title: string
  published: Date
  /** The post's own web page, as WordPress's `URL` field gives it — never
   *  the API endpoint itself. */
  permalink: string
}

/** The shape `/posts/` hands back, trimmed to what this file reads. Every
 *  field is optional because the payload is attacker-adjacent — it comes
 *  from a fetch to a host this app does not control — so nothing here may be
 *  trusted to be present, let alone typed right. */
type RawPost = {
  title?: unknown
  date?: unknown
  URL?: unknown
}

type RawFeed = {
  posts?: unknown
}

/** The five named XML entities plus numeric `&#NN;`/`&#xNN;` references —
 *  the only entities a WordPress post title ever actually carries. Resolved
 *  by hand rather than round-tripped through `innerHTML`, which would also
 *  execute anything else smuggled into a title this app does not control. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const codePoint = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      // Range-check before `fromCodePoint`, which throws a RangeError rather
      // than returning NaN for anything past the last code point. `&#1114112;`
      // in a title would otherwise take the whole board down, and this file's
      // contract is that a payload it does not control can never throw.
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match
      return String.fromCodePoint(codePoint)
    }
    return NAMED_ENTITIES[body] ?? match
  })
}

function parsePost(raw: unknown): BlogPost | null {
  const post = raw as RawPost
  const rawTitle = post?.title
  const rawDate = post?.date
  const rawUrl = post?.URL
  if (typeof rawTitle !== 'string' || typeof rawDate !== 'string' || typeof rawUrl !== 'string') return null

  const published = new Date(rawDate)
  if (Number.isNaN(published.getTime())) return null

  return { title: decodeEntities(rawTitle), published, permalink: rawUrl }
}

/**
 * Turns a raw WordPress `/posts/` payload into posts, newest first. Never
 * throws: a payload this app does not control — network hiccup, WordPress
 * changing shape, the blog having zero entries — must degrade to an empty
 * board, never to a crash or a visible error.
 */
export function parsePosts(raw: unknown): BlogPost[] {
  try {
    const rawPosts = (raw as RawFeed)?.posts
    if (!Array.isArray(rawPosts)) return []

    const posts: BlogPost[] = []
    for (const rawPost of rawPosts) {
      const post = parsePost(rawPost)
      if (post) posts.push(post)
    }

    return posts.sort((a, b) => b.published.getTime() - a.published.getTime())
  } catch {
    return []
  }
}

/** How many posts to ask WordPress for. Matches the board's five-line design
 *  (see the design spec's "open question" — five is a layout budget, not a
 *  count read off any real content, since the blog has few entries so far). */
const MAX_RESULTS = 5
/** Give up rather than leave a visitor's session waiting forever on a fetch
 *  that will never resolve — a stalled connection, not a clean failure,
 *  otherwise never rejects on its own. */
const TIMEOUT_MS = 8000

const FEED_URL = `https://public-api.wordpress.com/rest/v1.1/sites/cadfancode.wordpress.com/posts/?number=${MAX_RESULTS}&fields=ID,title,date,URL`

/**
 * Fetches the latest posts via WordPress's public REST API.
 *
 * Never rejects: a network error, a non-OK response or a malformed body all
 * resolve to `[]`, the same degrade-to-empty behaviour the board has always
 * had — see `parsePosts`'s own doc comment for why that empty state is not
 * an edge case here.
 */
export function fetchBlogFeed(): Promise<BlogPost[]> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)

  return fetch(FEED_URL, { signal: controller.signal })
    .then((response) => {
      if (!response.ok) return []
      return response.json().then(parsePosts)
    })
    .catch(() => [])
    .finally(() => window.clearTimeout(timer))
}
