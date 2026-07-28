import type { Exhibit } from '../types'
import { ResumeBook } from './ResumeBook'
import { ResumeChrome } from './ResumeChrome'

/**
 * The CV, staged as a physical book.
 *
 * A "staged" exhibit rather than a panel one: it has no hotspot of its own
 * because its trigger already exists in the scene — the `book_resume` spine on
 * the cabin shelf, which calls `openExhibit('resume')` from `BookSpines.tsx`.
 * `focus: 'books'` keeps it reachable only once the camera has moved in on the
 * shelf, which is also the state `FocusExit`'s back button steps back out to.
 */
export const resume: Exhibit = {
  id: 'resume',
  label: 'My Resume',
  scene: 'cabin',
  focus: 'books',
  Scene: ResumeBook,
  Content: ResumeChrome,
}
