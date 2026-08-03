/**
 * The About Me scrapbook, pages as one flat array — same convention as
 * `content/resume.ts`'s `RESUME_PAGES`: even indices are left pages, odd
 * indices are right pages, two to a spread. See `scene/exhibits/about/` for
 * how a page turns into pixels.
 */

export type PhotoId = 'hiking' | 'skiing' | 'running'

export type AboutBlock =
  /** The cover's hand-lettered title. */
  | { kind: 'title'; text: string }
  /** A big standalone line — the opening line and the closing line. */
  | { kind: 'quote'; text: string }
  /** A diary-entry paragraph, set in the same serif the resume book uses. */
  | { kind: 'journal'; text: string }
  /** A taped-in photograph. `id` looks up the loaded image in
   *  `renderAboutPage.ts`'s `AboutPagePhotos`; `rotationDeg` is the small
   *  off-axis tilt that sells it as physically taped down. */
  | { kind: 'photo'; id: PhotoId; caption: string; rotationDeg: number }
  /** A taped-in video clipping. `youtubeId` is the bare video id (the part
   *  after `v=` in a youtube.com/watch URL), not a full URL. */
  | { kind: 'video'; youtubeId: string; caption: string }

export type AboutPage = {
  id: string
  blocks: readonly AboutBlock[]
  /** Torn top edge on this page. Alternated by hand across the book rather
   *  than applied to every page, so it reads as a few loose clippings rather
   *  than a wallpaper pattern — see `renderAboutPage.ts`'s `paintPaper`. */
  torn?: boolean
}

export const ABOUT_PAGES: readonly AboutPage[] = [
  // — Spread 1 — cover ————————————————————————————————————————
  {
    id: 'cover',
    blocks: [{ kind: 'title', text: 'About Me' }],
  },
  {
    id: 'opening',
    torn: true,
    blocks: [
      { kind: 'quote', text: 'Necessity is the mother of invention.' },
      {
        kind: 'journal',
        text: "I've always taken that one personally. My ambitions have run consistently ahead of my resources, and rather than wait for the two to meet, I've made a habit of closing the gap myself.",
      },
    ],
  },

  // — Spread 2 — the leap ————————————————————————————————————
  {
    id: 'leap-1',
    torn: true,
    blocks: [
      {
        kind: 'journal',
        text: "In practice that means not waiting for permission or for conditions to be ideal. When rural North Wales started to feel small, I moved to Sweden. When the economics of working for somebody else stopped adding up, I started my own company — in a language I couldn't yet speak — and ran it for seven years, fitting a master's degree into the evenings.",
      },
    ],
  },
  {
    id: 'leap-2',
    torn: true,
    blocks: [
      {
        kind: 'journal',
        text: 'When I stumbled into programming in a biomechanics lab with no background in it whatsoever, I taught myself enough to build and test open-source modelling software, and then rebuilt my career around it.',
      },
    ],
  },

  // — Spread 3 — why I do this ——————————————————————————————
  {
    id: 'why-1',
    blocks: [
      {
        kind: 'journal',
        text: "The common thread is that I like taking things apart. Systems, problems, engines, arguments — I want to know what they're actually doing underneath, and then I want to make them work better. Software is the most satisfying place I've found to do that, because the distance between an idea and a working version of it is so short.",
      },
    ],
  },
  {
    id: 'why-2',
    blocks: [
      {
        kind: 'journal',
        text: "I've also never been much good at leaving well enough alone. I'd rather be slightly out of my depth and learning than comfortable and coasting, which is more or less how I've come by every skill I actually value.",
      },
      { kind: 'photo', id: 'running', caption: 'also true on foot', rotationDeg: -3 },
    ],
  },

  // — Spread 4 — away from the keyboard ————————————————————
  {
    id: 'away',
    torn: true,
    blocks: [
      {
        kind: 'journal',
        text: 'Away from the keyboard I hike and ski long distances in the far north of Sweden, restore and ride classic motorcycles, and spend an unreasonable proportion of my life fixing my sailboat.',
      },
    ],
  },
  {
    id: 'hiking-photo',
    torn: true,
    blocks: [{ kind: 'photo', id: 'hiking', caption: 'the far north, on foot', rotationDeg: 3 }],
  },

  // — Spread 5 — the far north / closer ————————————————————
  {
    id: 'far-north-collage',
    blocks: [
      { kind: 'photo', id: 'skiing', caption: 'the far north, on skis', rotationDeg: -2 },
      { kind: 'video', youtubeId: 'ehD6qmm1zpM', caption: 'Sunday ride, best co-pilot' },
    ],
  },
  {
    id: 'closer',
    blocks: [{ kind: 'quote', text: "You're standing in a 3D model of her." }],
  },
]
