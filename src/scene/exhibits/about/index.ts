import type { Exhibit } from '../types'
import { AboutBook } from './AboutBook'
import { AboutChrome } from './AboutChrome'

/**
 * The About Me scrapbook, staged as a physical book — same shape as
 * `resume`: no hotspot of its own, triggered by the `book_about` spine on
 * the cabin shelf via `openExhibit('about')` in `BookSpines.tsx`. `focus:
 * 'books'` keeps it reachable only once the camera has moved in on the
 * shelf, which is also the state `FocusExit`'s back button steps back out to.
 */
export const about: Exhibit = {
  id: 'about',
  label: 'About Me',
  scene: 'cabin',
  focus: 'books',
  Scene: AboutBook,
  Content: AboutChrome,
}
