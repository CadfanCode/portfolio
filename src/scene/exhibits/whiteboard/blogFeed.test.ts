import { describe, expect, it } from 'vitest'
import wordpressEmpty from './__fixtures__/wordpress-empty.json'
import wordpressPosts from './__fixtures__/wordpress-posts.json'
import { parsePosts } from './blogFeed'

describe('parsePosts', () => {
  it('handles a feed with zero posts, without throwing', () => {
    expect(() => parsePosts(wordpressEmpty)).not.toThrow()
    expect(parsePosts(wordpressEmpty)).toEqual([])
  })

  it('parses titles, dates and permalinks from a real payload', () => {
    const posts = parsePosts(wordpressPosts)
    expect(posts).toHaveLength(3)
    expect(posts[0].title).toBe('Claude code – Testing the limits as an independent developer')
    expect(posts[0].published).toBeInstanceOf(Date)
    expect(posts[0].published.toISOString()).toBe('2026-09-08T14:18:40.000Z')
    expect(posts[0].permalink).toBe(
      'https://cadfancode.wordpress.com/2026/09/08/claude-code-testing-the-limits-as-an-independent-developer/',
    )
  })

  it('takes the permalink from the post URL, not an API endpoint', () => {
    const posts = parsePosts(wordpressPosts)
    for (const post of posts) {
      expect(post.permalink).not.toContain('public-api.wordpress.com')
    }
  })

  it('orders newest first', () => {
    const posts = parsePosts(wordpressPosts)
    const times = posts.map((p) => p.published.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('decodes HTML entities in titles rather than displaying them literally', () => {
    const posts = parsePosts(wordpressPosts)
    const decoded = posts.find((p) => p.permalink.includes('first-post'))
    expect(decoded?.title).toBe('First post & a few ’lessons learned’')
  })

  it('leaves an out-of-range numeric entity alone instead of throwing', () => {
    // `String.fromCodePoint` throws a RangeError past the last code point
    // rather than returning NaN, so the decoder range-checks first. A title
    // is untrusted input, and this parser's contract is that it never throws.
    const posts = parsePosts({
      posts: [{ title: 'Edge &#1114112; case', date: '2026-01-02T00:00:00+00:00', URL: 'https://example.com/p/' }],
    })
    expect(posts[0]?.title).toBe('Edge &#1114112; case')
  })

  it('returns an empty array for a genuinely malformed payload', () => {
    expect(parsePosts(null)).toEqual([])
    expect(parsePosts(undefined)).toEqual([])
    expect(parsePosts({})).toEqual([])
    expect(parsePosts({ posts: null })).toEqual([])
    expect(parsePosts('not even an object')).toEqual([])
    expect(parsePosts(42)).toEqual([])
  })

  it('drops a post missing a required field rather than crashing the whole parse', () => {
    const raw = {
      posts: [
        { title: 'Fine', date: '2024-01-01T00:00:00+00:00', URL: 'https://example.com/a' },
        { title: 'No date', URL: 'https://example.com/b' },
        { title: 'No permalink', date: '2024-01-02T00:00:00+00:00' },
      ],
    }
    const posts = parsePosts(raw)
    expect(posts).toHaveLength(1)
    expect(posts[0].title).toBe('Fine')
  })
})
