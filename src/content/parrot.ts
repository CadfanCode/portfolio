import type { SceneState } from '../state/useSceneStore'

/** The parrot's name, shown in the chat panel's header and referenced by its
 *  ARIA label — kept here rather than hardcoded in a component so there is
 *  one place to rename him. */
export const PARROT_NAME = 'Polly'

/**
 * What Polly says as the first line of the chat panel at each stop, keyed
 * by `SceneState` so the copy lives beside the content it belongs to rather
 * than inside the component that speaks it — see the `content/` convention
 * in `CLAUDE.md`. Written the way you'd actually say it showing someone
 * round the boat, not as marketing copy. Each is click-triggered now, not
 * automatic — see `useParrotStore.ts`'s `openChat`.
 */
export const PARROT_HINTS: Record<SceneState, string> = {
  ocean: 'Maxi 77, seven and a half metres of her. Click the hull and come aboard.',
  cockpit: "Mind the boom. There's a way below, through the companionway.",
  // The cabin is the one stop where the bird himself is out of sight below
  // the coachroof — hence the shouted-from-outside tone. Nothing opens the
  // chat panel automatically here any more (the shelf nudge is a book-blink
  // now, see `ParrotAssistant.tsx`), so this line only ever speaks if
  // something still calls `openChat('cabin')` directly. Spelling of "Squak"
  // is verbatim as specified, not a typo for "Squawk".
  cabin: "*Squak* What are you doing, taking your time in there? Check out the books!",
}

/**
 * Unprompted lines Polly fires off when the drifting weather (`conditions.ts`)
 * crosses into one of these named presets — see `ParrotAssistant.tsx`'s
 * weather watch. Keyed by `Conditions['name']`, not `SceneState`: this is
 * about what the sky is doing, not where the visitor is standing, so only the
 * presets worth a comment get an entry here.
 */
export const PARROT_WEATHER_HINTS: Partial<Record<string, string>> = {
  squall: "I'm glad I'm not flying around in this weather!",
  fog: '*squak* This fog is spooky!',
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
    id: 'greeting',
    // No bare 'hi'/'hey'/'yo': the scoring below is a plain substring test,
    // and those three are short enough to false-positive inside ordinary
    // words — "what is **thi**s boat" contains "hi", "**hey** build this"
    // hides inside "t**hey**", "an**yo**ne"/"y**o**ur" hide "yo". Since this
    // intent is checked first and ties go to whichever intent scored first,
    // any of those three would have been able to steal a tied match from the
    // question's real intent (confirmed: "what is this boat" scored 1 for
    // both `greeting` via "hi" and `boat` via its own trigger, and `greeting`
    // won on the tie). Every trigger kept here is long/distinctive enough
    // not to turn up as an accidental substring of an unrelated question.
    triggers: ['hello', 'ahoy', 'good morning', 'good afternoon', 'good evening', "g'day"],
    answer: "Ahoy there! Polly's the name, sailing's the game. Come aboard, have a look round.",
  },
  {
    id: 'wellbeing',
    triggers: [
      'how are you',
      "how's it going",
      'hows it going',
      'how you doing',
      'how do you do',
      'you good',
      'you ok',
      'you okay',
    ],
    answer:
      "Feathers dry, perch steady, can't complain. Ask me something about the boat while I preen.",
  },
  {
    id: 'joke',
    triggers: [
      'tell me a joke',
      'say something funny',
      'make me laugh',
      'know any jokes',
      'joke',
      'funny',
    ],
    answer:
      "Why don't parrots ever get seasick? We just cracker the wind and go with it. ...I'll see myself out to the crow's nest.",
  },
  {
    id: 'creator',
    triggers: [
      'who built this',
      'who made this',
      'who built you',
      'who made you',
      'who coded this',
      'who wrote this',
      'who designed this',
      'who is cai',
      'who is cai birch',
      'developer of this site',
      'whose portfolio',
      'whose site',
      'who owns this boat',
    ],
    answer:
      "Cai Birch built her, plank by plank, in his spare evenings. Java developer, Stockholm — you're standing in his CV right now.",
  },
  {
    id: 'identity',
    triggers: [
      'what are you',
      'who are you',
      'your name',
      "what's your name",
      'what is your name',
      "who's polly",
      'who is polly',
      'what is polly',
    ],
    answer:
      "Polly, ship's parrot, at your service. I keep watch, heckle the rigging, and answer what I can about the boat and the man who built her.",
  },
  {
    id: 'ai-disclosure',
    triggers: [
      'are you an ai',
      'are you ai',
      'you ai',
      'are you a bot',
      'are you a robot',
      'are you real',
      'are you human',
      'is this ai',
      // Not bare 'what model'/'which model': a visitor asking "what model
      // boat is this" is asking about the *boat*, not the AI, and the boat
      // intent has no competing "model" trigger of its own to outscore this
      // one — confirmed via repro that the bare forms hijacked exactly that
      // question. Requiring "are/do you" (or "ai") disambiguates.
      'what model are you',
      'what model do you',
      'which model are you',
      'which model do you',
      'what ai model',
      'which ai model',
      'llama',
      'language model',
      'gpt',
      'chatgpt',
      'how do you work',
      'artificial intelligence',
      'your limitations',
      "what can't you do",
      'what can you not do',
      'are you a chatbot',
      'are you sentient',
    ],
    answer:
      "Between you and me — under the feathers there's a small AI running on Llama 3, tucked away in your browser. I stick to short answers and whatever I've actually been told about the boat and about Cai; ask me something outside that and I'll likely just squawk and change the subject rather than make something up. Still a parrot, mind. Just one with a chip for a brain.",
  },
  {
    id: 'boat',
    triggers: [
      'what boat',
      'what kind of boat',
      'maxi 77',
      'what is this boat',
      'tell me about the boat',
      'tell me about this boat',
      'what ship',
      'sloop',
      'what vessel',
      'how big is the boat',
      'how long is the boat',
      'how big is this boat',
    ],
    answer:
      "A Maxi 77 — 7.6 metres of Swedish sloop. She's modelled parametrically in Blender, not a stock asset off a shelf, so every plank under your feet was placed on purpose.",
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
      'how do i get inside',
      'companionway',
      'where do i go',
      'how do i get around',
      'how do i move',
      'how do i navigate',
      'where next',
      'what do i do next',
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
      'where can i see your cv',
      'show me the cv',
      'show me the resume',
    ],
    answer:
      "On the shelf to starboard, below decks — one of the spines isn't just for show. Open it and there's a PDF waiting in the close-up.",
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
      'linkedin',
      'how do i contact',
      'can i email',
    ],
    answer: "caiowain@gmail.com will reach him — that's the fastest line I've got aboard.",
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
      'what can he do',
      'java',
      'kotlin',
      'spring',
      'docker',
      'kubernetes',
      'sql',
      'testing',
      'test automation',
      'programming languages',
      'what does cai know',
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
      'what has he done',
      'internship',
      'cv summary',
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
      'what can i see here',
      'what is there to see',
    ],
    answer:
      "Honest answer: still being fitted out. The CV is aboard and readable below decks — the project exhibits are the next thing coming into the boat.",
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
 * Short comedic asides tacked onto the end of a matched answer when the
 * visitor is in the cockpit — the one stop where Polly is up in the open air
 * next to them rather than shouted-from-below or approached cold, so this is
 * where the "talkative and comical" personality gets to show. Generic by
 * design (boat/parrot flavoured, not tied to any one intent's content) so any
 * of them reads naturally tacked onto any answer above.
 */
const COCKPIT_ASIDES: readonly string[] = [
  " Mind the boom while you think about that one.",
  " *ruffles feathers* — ask me another, I'm enjoying this.",
  " Better than circling the anchorage all day, this.",
  " Don't tell the gulls I said that.",
]

function pickCockpitAside(): string {
  return COCKPIT_ASIDES[Math.floor(Math.random() * COCKPIT_ASIDES.length)]
}

/**
 * Scores every scripted intent against a visitor's question by how many of
 * its trigger phrases appear in it, and returns the best-scoring answer, or
 * `null` if nothing clears `MIN_SCORE` — the caller (`brains/scripted.ts`)
 * is what supplies the fallback line in that case, not this function, so it
 * stays usable by anything that wants to know whether the script actually
 * had an answer.
 *
 * `scene` only matters on the match path, not the no-match one: the fallback
 * lines already carry their own character (see `SCRIPTED_FALLBACKS`), so a
 * cockpit aside piled on top there would be one joke too many.
 */
export function matchScripted(question: string, scene: SceneState): string | null {
  const normalised = normalise(question)
  if (!normalised) return null

  let best: ScriptedIntent | null = null
  let bestScore = 0

  for (const intent of SCRIPTED_INTENTS) {
    const score = intent.triggers.reduce(
      (count, trigger) => count + (normalised.includes(trigger) ? 1 : 0),
      0,
    )
    if (score > bestScore) {
      best = intent
      bestScore = score
    }
  }

  if (bestScore < MIN_SCORE || !best) return null
  return scene === 'cockpit' ? best.answer + pickCockpitAside() : best.answer
}

/** Varied lines Polly falls back to when nothing in the script matches — an
 *  array rather than one fixed sentence, so hitting the wall on a second
 *  unanswerable question doesn't read as the exact same wall. */
export const SCRIPTED_FALLBACKS: readonly string[] = [
  "That one's past my perch. Ask about the boat, where to go aboard her, or where to find Cai's CV — those I know cold.",
  "Squawk — you've flown past what I know. Try me on the boat, the crew, or the CV below decks.",
  "I'm a parrot, not an oracle. The boat, getting around her, or Cai's CV — pick one of those and I'll do better.",
  "Can't help with that one, feathers crossed. Ask me something about the Maxi 77 or the man who built her instead.",
]

/** Picks one of `SCRIPTED_FALLBACKS` at random — its own export so
 *  `brains/scripted.ts` and `brains/webllm.ts` don't each reimplement the
 *  pick. */
export function pickFallback(): string {
  return SCRIPTED_FALLBACKS[Math.floor(Math.random() * SCRIPTED_FALLBACKS.length)]
}
