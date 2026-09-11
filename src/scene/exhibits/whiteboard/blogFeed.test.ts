import { describe, expect, it } from 'vitest'
import blogFeedEmpty from './__fixtures__/blogger-empty.json'
import blogFeedSummary from './__fixtures__/blogger-summary.json'
import { parseBloggerFeed } from './blogFeed'

describe('parseBloggerFeed', () => {
  // First and most important: the owner's own blog has zero posts, and
  // Blogger represents that by omitting `feed.entry` entirely rather than
  // sending `entry: []`. A naive `feed.entry.map(...)` throws on this, and
  // this fixture is captured from exactly that blog.
  it('handles a feed with no entry key at all, without throwing', () => {
    expect(() => parseBloggerFeed(blogFeedEmpty)).not.toThrow()
    expect(parseBloggerFeed(blogFeedEmpty)).toEqual([])
  })

  it('parses titles, dates and permalinks from a real payload', () => {
    const posts = parseBloggerFeed(blogFeedSummary)
    expect(posts).toHaveLength(3)
    expect(posts[0].title).toBe('A better Blogger experience on the web')
    expect(posts[0].published).toBeInstanceOf(Date)
    expect(posts[0].published.toISOString()).toBe('2020-05-20T23:53:00.001Z')
    expect(posts[0].permalink).toBe(
      'https://blogger.googleblog.com/2020/05/a-better-blogger-experience-on-web.html',
    )
  })

  it('takes the permalink from the alternate link, not the self link', () => {
    const posts = parseBloggerFeed(blogFeedSummary)
    for (const post of posts) {
      expect(post.permalink).not.toContain('www.blogger.com/feeds')
    }
  })

  it('orders newest first', () => {
    const posts = parseBloggerFeed(blogFeedSummary)
    const times = posts.map((p) => p.published.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('returns an empty array for a genuinely malformed payload', () => {
    expect(parseBloggerFeed(null)).toEqual([])
    expect(parseBloggerFeed(undefined)).toEqual([])
    expect(parseBloggerFeed({})).toEqual([])
    expect(parseBloggerFeed({ feed: {} })).toEqual([])
    expect(parseBloggerFeed('not even an object')).toEqual([])
    expect(parseBloggerFeed(42)).toEqual([])
  })

  it('tolerates an entry with category absent, still parsing it', () => {
    const raw = {
      feed: {
        entry: [
          {
            title: { $t: 'No category here' },
            published: { $t: '2024-01-01T00:00:00.000Z' },
            link: [{ rel: 'alternate', href: 'https://example.com/post' }],
            // `category` deliberately omitted.
          },
        ],
      },
    }
    const posts = parseBloggerFeed(raw)
    expect(posts).toHaveLength(1)
    expect(posts[0].title).toBe('No category here')
  })

  it('drops an entry missing a required field rather than crashing the whole parse', () => {
    const raw = {
      feed: {
        entry: [
          { title: { $t: 'Fine' }, published: { $t: '2024-01-01T00:00:00.000Z' }, link: [{ rel: 'alternate', href: 'https://example.com/a' }] },
          { title: { $t: 'No date' }, link: [{ rel: 'alternate', href: 'https://example.com/b' }] },
          { title: { $t: 'No permalink' }, published: { $t: '2024-01-02T00:00:00.000Z' } },
        ],
      },
    }
    const posts = parseBloggerFeed(raw)
    expect(posts).toHaveLength(1)
    expect(posts[0].title).toBe('Fine')
  })
})
