/**
 * The CV, re-set as a book.
 *
 * The source document is `files/Cai_Birch_CV_Eng.pdf`. A CV is laid out for A4
 * and reads top-to-bottom in one column; a book reads as facing pages, so the
 * same material is re-broken here into eight pages — a title page, then the
 * sections paired left and right. Blocks are semantic, not visual: the page
 * renderer in `scene/exhibits/resume/` decides what a heading or an entry
 * actually looks like in ink.
 */

export type ResumeBlock =
  /** Title page only — the large opening name and role. */
  | { kind: 'title'; text: string; subtitle: string }
  /** Section heading, e.g. "Technical Skills". */
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: readonly string[] }
  /** Two-column label/value rows, for the skills table. */
  | { kind: 'rows'; rows: readonly { label: string; value: string }[] }
  /** A job or a qualification. `org`, `meta` and `bullets` are all optional. */
  | {
      kind: 'entry'
      role: string
      org?: string
      meta?: string
      bullets?: readonly string[]
    }
  /** Small italic aside. */
  | { kind: 'note'; text: string }
  /** Horizontal rule. */
  | { kind: 'rule' }
  /** Vertical gap, in the renderer's line units. */
  | { kind: 'spacer'; size: number }

export type ResumePage = {
  id: string
  blocks: readonly ResumeBlock[]
  /** Footer line. Omitted on the title page and the endpaper, as in print. */
  folio?: string
}

export const RESUME_PAGES: readonly ResumePage[] = [
  // — Spread 1 —————————————————————————————————————————————
  {
    id: 'title',
    blocks: [
      { kind: 'spacer', size: 4 },
      {
        kind: 'title',
        text: 'Cai Birch',
        subtitle: 'Java Developer / System Developer',
      },
      { kind: 'spacer', size: 2 },
      { kind: 'rule' },
      { kind: 'spacer', size: 1 },
      { kind: 'paragraph', text: 'Stockholm, Sweden' },
      { kind: 'paragraph', text: 'caiowain@gmail.com' },
    ],
  },
  {
    id: 'summary',
    folio: 'Professional Summary',
    blocks: [
      { kind: 'heading', text: 'Professional Summary' },
      {
        kind: 'paragraph',
        text: 'System developer graduate focused on Java, test automation and reliable backend systems. Hands-on with Java/Kotlin, Spring Boot, REST APIs, SQL/PostgreSQL, Git, JUnit/Mockito, Docker and Kubernetes.',
      },
      {
        kind: 'paragraph',
        text: 'Solid foundation in OOP, debugging, secure development and maintainable code, built in agile teams shipping cloud-based microservices, healthcare-data workflows and real-time communication features.',
      },
      {
        kind: 'paragraph',
        text: 'Looking for a Java Developer role building internal tools, automated test processes and high-quality software in complex technical environments.',
      },
    ],
  },

  // — Spread 2 —————————————————————————————————————————————
  {
    id: 'skills',
    folio: 'Technical Skills',
    blocks: [
      { kind: 'heading', text: 'Technical Skills' },
      {
        kind: 'rows',
        rows: [
          {
            label: 'Programming languages',
            value: 'Java, Kotlin, JavaScript, TypeScript, C#, SQL',
          },
          {
            label: 'Java & backend',
            value:
              'Java/OOP, Spring Boot (v2/v3), REST APIs, Hibernate/JPA, microservices, JSON, XML',
          },
          {
            label: 'Testing & quality',
            value:
              'Unit testing, JUnit, Mockito, debugging, code reviews, secure development, test automation',
          },
          {
            label: 'Data & systems',
            value: 'PostgreSQL, SQL, system architecture, WebRTC, real-time application flows',
          },
          {
            label: 'Frontend & web',
            value: 'Vue.js, React Native, Expo, HTML, CSS',
          },
          {
            label: 'DevOps & tools',
            value:
              'Git, GitHub, Docker, Kubernetes, JIRA, CI/CD concepts, agile ways of working',
          },
          { label: 'Languages', value: 'Fluent Swedish and English' },
        ],
      },
    ],
  },
  {
    id: 'experience-1',
    folio: 'Professional Experience',
    blocks: [
      { kind: 'heading', text: 'Professional Experience' },
      {
        kind: 'entry',
        role: 'Software Developer (Intern)',
        org: 'Braive AB',
        meta: 'Stockholm, Sweden | 2026',
        bullets: [
          'Developed and tested Java/Kotlin Spring Boot microservices and Vue.js admin interfaces in an agile team, using Git, JIRA and code review.',
          'Fixed race conditions in backend logging flows, cutting downtime and strengthening data integrity.',
          'Optimised PostgreSQL and Hibernate/JPA handling of sensitive healthcare data, applying secure-development principles to reduce manual error.',
          'Containerised services with Docker and worked Kubernetes-based DevOps, keeping environments consistent and feedback loops fast.',
        ],
      },
      {
        kind: 'entry',
        role: 'Software Developer (Intern)',
        org: 'Omika Health AB',
        meta: 'Stockholm, Sweden | 2025',
        bullets: [
          'Built a production-ready P2P video chat feature with WebRTC in React Native, including a lightweight signalling server and secure authentication.',
          'Tested and debugged real-time application flows, validating complex interactions with sub-millisecond response times in proof-of-concept tests.',
          'Translated user needs into practical technical solutions alongside a small agile product team.',
        ],
      },
    ],
  },

  // — Spread 3 —————————————————————————————————————————————
  {
    id: 'experience-2',
    folio: 'Professional Experience',
    blocks: [
      { kind: 'heading', text: 'Experience, continued' },
      {
        kind: 'entry',
        role: 'Correctional Officer',
        org: 'Kriminalvården',
        meta: 'Sweden | Ongoing — hourly and summer substitute',
        bullets: [
          'Work close to core operations in a high-trust environment with strict requirements for security, confidentiality and sound judgement.',
          'Rely daily on collaboration, accountability and clear communication.',
          'Bring an operational perspective to software development, connecting technical solutions to real user needs and safety requirements.',
        ],
      },
      {
        kind: 'entry',
        role: 'Laboratory Teacher',
        org: 'Loughborough University',
        meta: 'Loughborough, United Kingdom | 2018–2021',
        bullets: [
          "Taught biomechanics and motor control to more than 100 undergraduate and master's students, using Matlab and OpenSim data collection protocols.",
          'Mentored colleagues in interdisciplinary teams, sharing knowledge and solving problems collaboratively.',
        ],
      },
      {
        kind: 'entry',
        role: 'Research Assistant',
        org: 'GIH / KTH',
        meta: 'Stockholm, Sweden | 2017',
        bullets: [
          'Analysed biomechanical data with quantitative modelling to identify patterns of muscle spasticity in stroke patients.',
          'Applied analytical problem-solving and data interpretation to complex human movement data.',
        ],
      },
    ],
  },
  {
    id: 'education',
    folio: 'Education',
    blocks: [
      { kind: 'heading', text: 'Education' },
      {
        kind: 'entry',
        role: 'Diploma, Software Development',
        org: 'YH Akademin, Sundsvall',
      },
      {
        kind: 'note',
        text: 'Focus on database management, system architecture and scalable Spring Boot backends in team settings. Practical training in Java/OOP, SQL, testing, Git, agile development and maintainable software design.',
      },
      { kind: 'spacer', size: 1 },
      {
        kind: 'entry',
        role: 'Neuroscience (research)',
        org: 'Lund University, Lund',
      },
      { kind: 'entry', role: 'M.Sc. Sport Science', org: 'GIH, Stockholm' },
      {
        kind: 'entry',
        role: 'B.Sc. Sport Science',
        org: 'Bangor University, United Kingdom',
      },
      {
        kind: 'entry',
        role: 'Associate Fellow of Teaching',
        org: 'Loughborough University, United Kingdom',
      },
    ],
  },

  // — Spread 4 —————————————————————————————————————————————
  {
    id: 'additional',
    folio: 'Additional',
    blocks: [
      { kind: 'heading', text: 'Additional' },
      {
        kind: 'bullets',
        items: [
          'Career focus — Java developer roles in internal tools, test automation, backend services, integrations, secure systems or complex technical platforms.',
          '3rd place, Innovation Pioneers Hackathon 2025 — prototyped an AI-driven collaboration app connecting entrepreneurs with key stakeholders.',
          "JFokus 2026 — attended one of Europe's leading developer conferences, focused on modern Java architectures, tools and security trends.",
          'Independent project — building a machine-learning tool to analyse kinematic data and identify risk factors for musculoskeletal injuries.',
        ],
      },
    ],
  },
  {
    id: 'colophon',
    blocks: [
      { kind: 'spacer', size: 8 },
      { kind: 'rule' },
      { kind: 'spacer', size: 1 },
      { kind: 'note', text: 'References available upon request.' },
      { kind: 'spacer', size: 2 },
      { kind: 'paragraph', text: 'Cai Birch' },
      { kind: 'paragraph', text: 'caiowain@gmail.com' },
    ],
  },
]
