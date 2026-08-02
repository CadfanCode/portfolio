import type { SceneState } from '../state/useSceneStore'

/** The parrot's name, used by both the in-world bubble's neighbourhood and
 *  (eventually) the chat panel a later task adds — kept here rather than
 *  hardcoded in a component so there is one place to rename him. */
export const PARROT_NAME = 'Skipper'

/**
 * What Skipper says on arriving at each stop, keyed by `SceneState` so the
 * copy lives beside the content it belongs to rather than inside the
 * component that speaks it — see the `content/` convention in `CLAUDE.md`.
 * Written the way you'd actually say it showing someone round the boat, not
 * as marketing copy.
 */
export const PARROT_HINTS: Record<SceneState, string> = {
  // Currently unspoken: `ParrotAssistant` never schedules or shows the
  // ocean-stop bubble, since that stop is an orbit of the whole boat from
  // outside and a prompt anchored to the bird would read as attached to
  // nothing. Left in place because the `Record<SceneState, string>` needs
  // the key, and it's the copy to restore if that's ever reverted.
  ocean: 'Maxi 77, seven and a half metres of her. Click the hull and come aboard.',
  cockpit: "Mind the boom. There's a way below, through the companionway.",
  // The existing cabin copy, carried over unchanged — it was already good.
  cabin: "There's a shelf of books to starboard. One of them isn't just for show.",
}

/**
 * One scripted answer, matched by keyword against a visitor's question.
 *
 * `triggers` are lowercase phrases checked as substrings of the normalised
 * question (see `matchScripted`), not a full intent classifier — this is a
 * parrot with a script, not a language model, and pretending otherwise with
 * a fancier matcher wouldn't make the answers any more true. Every fact in
 * every `answer` below is drawn from `content/resume.ts`; nothing here is
 * invented, because this is meant to speak for a real person applying for
 * real jobs.
 */
type ScriptedIntent = {
  id: string
  triggers: readonly string[]
  answer: string
}

const SCRIPTED_INTENTS: readonly ScriptedIntent[] = [
  {
    id: 'creator',
    triggers: [
      'who built this',
      'who made this',
      'who built you',
      'who made you',
      'who coded this',
      'who is cai',
      'who is cai birch',
      'developer of this site',
      'whose portfolio',
      'whose site',
    ],
    answer:
      "Cai Birch built her, plank by plank. Java developer, Stockholm — you're standing in his CV.",
  },
  {
    id: 'identity',
    triggers: [
      'what are you',
      'who are you',
      'are you real',
      'are you a bot',
      'are you an ai',
      'your name',
      "what's your name",
      'what is your name',
    ],
    answer:
      "Skipper, ship's parrot. I keep watch, I heckle the rigging, and I'll answer what I can about the boat and the man who built her.",
  },
  {
    id: 'boat',
    triggers: [
      'what boat',
      'what kind of boat',
      'maxi 77',
      'what is this boat',
      'tell me about the boat',
      'what ship',
      'sloop',
    ],
    answer:
      "A Maxi 77 — a 7.6 metre Swedish sloop. She's modelled parametrically in Blender, not a stock asset, so every plank you're standing on was placed on purpose.",
  },
  {
    id: 'navigate-cabin',
    triggers: [
      'how do i get below',
      'how do i go below',
      'how do i get to the cabin',
      'get below deck',
      'go below deck',
      'how do i get down',
      'companionway',
      'where do i go',
      'how do i get around',
    ],
    answer:
      "Through the companionway, aft of the cockpit — click it and mind your head on the way down. There's a book below worth opening.",
  },
  {
    id: 'cv-location',
    triggers: [
      'where is the cv',
      'where is the resume',
      "where's the cv",
      "where's the resume",
      'find the cv',
      'find the resume',
      'download cv',
      'download resume',
      'cv',
      'resume',
      'pdf',
    ],
    answer:
      "On the shelf to starboard, below decks — one of the spines isn't just for show. Open it and there's a PDF download waiting in the close-up.",
  },
  {
    id: 'contact',
    triggers: [
      'contact',
      'email',
      'get in touch',
      'reach him',
      'reach cai',
      'hire',
      'hiring',
      'phone number',
    ],
    answer: "caiowain@gmail.com will reach him — that's the fastest line I've got.",
  },
  {
    id: 'skills',
    triggers: [
      'what languages',
      'what tech',
      'tech stack',
      'what stack',
      'skills',
      'what does he know',
      'java',
      'kotlin',
      'spring',
      'docker',
      'kubernetes',
      'sql',
      'testing',
      'test automation',
    ],
    answer:
      'Java and Kotlin first, with Spring Boot, REST APIs and SQL/PostgreSQL. Git, JUnit and Mockito, Docker and Kubernetes alongside. Test automation is the part he actually enjoys.',
  },
  {
    id: 'experience',
    triggers: [
      'experience',
      'worked',
      'work history',
      'where has he worked',
      'previous job',
      'previous jobs',
      'employment',
      'career',
      'background',
      // Deliberately the stem, not a whole word: the matcher is a substring
      // test, so this one trigger covers study / studied / studying / student.
      'stud',
      'education',
      'degree',
      'qualification',
    ],
    answer:
      'Two developer internships in Stockholm — Braive and Omika Health — building and testing Java/Kotlin Spring Boot microservices and Vue.js admin interfaces. A software development diploma behind that, and a neuroscience research past before it. The full run is in the book below decks.',
  },
  {
    id: 'projects',
    triggers: [
      'project',
      'projects',
      'what have you built',
      'what has he built',
      'portfolio piece',
      'demo',
      'demos',
      'exhibits',
    ],
    answer:
      "Honest answer: still being fitted out. The CV is aboard and readable below decks — the project exhibits are the next thing coming into the boat.",
  },
  {
    id: 'fallback',
    triggers: [],
    answer:
      "That one's past my perch. Ask about the boat, where to go aboard her, or where to find Cai's CV — those I know cold.",
  },
]

/** Lowercases and strips punctuation, so "What's the CV?" and "whats the cv"
 *  score the same trigger the same way. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()]/g, '')
    .trim()
}

/** Minimum trigger hits before an intent is considered a match at all — below
 *  this, a stray shared word (e.g. "boat" inside an unrelated sentence) would
 *  otherwise win by default over the honest "I don't know" fallback. */
const MIN_SCORE = 1

/**
 * Scores every scripted intent against a visitor's question by how many of
 * its trigger phrases appear in it, and returns the best-scoring answer, or
 * `null` if nothing clears `MIN_SCORE` — the caller (`brains/scripted.ts`)
 * is what supplies the fallback line in that case, not this function, so it
 * stays usable by anything that wants to know whether the script actually
 * had an answer.
 */
export function matchScripted(question: string): string | null {
  const normalised = normalise(question)
  if (!normalised) return null

  let best: ScriptedIntent | null = null
  let bestScore = 0

  for (const intent of SCRIPTED_INTENTS) {
    if (intent.id === 'fallback') continue
    const score = intent.triggers.reduce(
      (count, trigger) => count + (normalised.includes(trigger) ? 1 : 0),
      0,
    )
    if (score > bestScore) {
      best = intent
      bestScore = score
    }
  }

  return bestScore >= MIN_SCORE && best ? best.answer : null
}

/** The line Skipper falls back to when nothing in the script matches — kept
 *  as its own export so `brains/scripted.ts` doesn't have to reach into the
 *  intent table to find the one entry with no triggers. */
export const SCRIPTED_FALLBACK =
  SCRIPTED_INTENTS.find((intent) => intent.id === 'fallback')?.answer ?? ''
