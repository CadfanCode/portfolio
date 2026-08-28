/**
 * Types for `virtual:cv`, the module `plugins/cv.ts` generates at dev-server
 * start and at build time from whichever CV in `files/` is newest.
 *
 * Every value is `null` when `files/` holds no CV at all. That only happens in
 * dev — the build fails rather than shipping a dead download link — but the
 * app still has to type-check for it, so the resume book simply drops its
 * download button in that case.
 */
declare module 'virtual:cv' {
  /** Site-root path to the published PDF, with a `?v=` stamp that changes
   *  whenever the document does. */
  export const CV_HREF: string | null
  /** The name the browser saves it under. */
  export const CV_FILENAME: string | null
  /** The CV's date as `YYYY-MM-DD`. */
  export const CV_UPDATED: string | null
  /** The same date written for a reader, e.g. `August 2026`. */
  export const CV_UPDATED_LABEL: string | null
}
