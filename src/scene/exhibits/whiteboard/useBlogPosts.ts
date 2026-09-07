import { useEffect, useState } from 'react'
import type { BlogPost } from './blogFeed'
import { fetchBlogFeed } from './blogFeed'

/** How often to check for new posts. Long enough that a visitor's session
 *  never triggers more than one or two refetches, short enough that a tab
 *  left open overnight still shows something written that morning. */
const REFETCH_INTERVAL_MS = 15 * 60 * 1000

/**
 * The whiteboard's posts, fetched on mount and kept fresh with a slow poll.
 *
 * Starts as `[]` rather than `null` — there is no meaningful distinction
 * between "still loading" and "the blog has nothing to say" here (see the
 * design spec's "empty state is the only state" note), so the board draws
 * its heading and URL scrawl immediately and lets entries fade in once the
 * feed lands, rather than holding a spinner for a request that may never
 * resolve to anything different from empty.
 */
export function useBlogPosts(): BlogPost[] {
  const [posts, setPosts] = useState<BlogPost[]>([])

  useEffect(() => {
    let cancelled = false

    const load = () => {
      fetchBlogFeed().then((fetched) => {
        // The interval keeps firing after unmount is scheduled but before
        // this promise settles is not possible once the interval itself is
        // cleared below, but the fetch already in flight at unmount time
        // still needs this guard — its `.then` runs after cleanup.
        if (!cancelled) setPosts(fetched)
      })
    }

    load()
    const timer = window.setInterval(load, REFETCH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return posts
}
