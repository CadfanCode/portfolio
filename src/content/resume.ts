/**
 * The CV, re-set as a book.
 *
 * The source document is whichever CV `plugins/cv.ts` selects from `files/`
 * (newest wins) — the same file the Download PDF button serves. That
 * document is written in Swedish; these pages are an English setting of it,
 * so they are re-transcribed by hand rather than generated. A CV is laid out
 * for A4 and reads top-to-bottom in one column; a book reads as facing
 * pages, so the same material is re-broken here into eight pages — a title
 * page, then the sections paired left and right. Blocks are semantic, not
 * visual: the page renderer in `scene/exhibits/resume/` decides what a
 * heading or an entry actually looks like in ink.
 */

import { CV_UPDATED_LABEL } from 'virtual:cv'

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
        subtitle: 'Systems Developer',
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
        text: 'Newly graduated systems developer specialising in backend development with Java, Kotlin and Spring Boot. Built and deployed cloud-based microservices in agile teams using PostgreSQL, Hibernate/JPA, REST APIs, Docker and Kubernetes.',
      },
      {
        kind: 'paragraph',
        text: 'Also works in Python, MongoDB and AWS through study and personal projects. Experienced in business-critical workflows for sensitive data and in real-time communication, where performance, stability and availability come first.',
      },
      {
        kind: 'paragraph',
        text: 'Background as a researcher and university lecturer brings strong analytical skills for structured problem-solving and explaining technical solutions clearly, in teams with real ownership: you build it, you own it.',
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
            value: 'Java, Kotlin, Python, JavaScript, TypeScript, SQL, C#',
          },
          {
            label: 'Backend & data',
            value:
              'Spring Boot (v2/v3), REST APIs, microservices, PostgreSQL, MongoDB, Hibernate/JPA, WebRTC, JSON, XML',
          },
          {
            label: 'Cloud & DevOps',
            value: 'AWS, Docker, Kubernetes, CI/CD, Git, GitHub, JUnit, Mockito, JIRA',
          },
          {
            label: 'Frontend & web',
            value: 'React, React Native, Vue.js, Expo, HTML, CSS, Three.js',
          },
          {
            label: 'Methods',
            value:
              'OOP, data structures and algorithms, design patterns, unit testing, secure development, agile/Scrum',
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
        role: 'Systems Developer (Placement)',
        org: 'Braive AB',
        meta: 'Stockholm, Sweden | 2026',
        bullets: [
          'Built and deployed Java/Kotlin Spring Boot microservices and a Vue.js admin interface in an agile team, with Git, JIRA and code review.',
          'Fixed race conditions in backend logging, cutting downtime and strengthening data integrity.',
          'Optimised sensitive healthcare data in PostgreSQL and Hibernate/JPA under IT security principles, cutting manual error sources.',
          'Containerised services with Docker and worked in Kubernetes-based DevOps flows, keeping environments consistent through to production.',
        ],
      },
      {
        kind: 'entry',
        role: 'Systems Developer (Placement)',
        org: 'Omika Health AB',
        meta: 'Stockholm, Sweden | 2025',
        bullets: [
          'Designed and built a production-ready P2P video chat with WebRTC in React Native, including a signalling server and secure authentication.',
          'Built and debugged low-latency real-time flows, verifying complex client interactions in proof-of-concept tests.',
          'Translated user needs into concrete technical solutions alongside a small, product-focused team.',
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
        meta: 'Sweden | Ongoing, hourly and summer substitute',
        bullets: [
          'Work close to core operations in a high-trust environment with strict requirements for security, confidentiality and sound judgement.',
          'Bring an operational perspective to software development, connecting technical solutions to real user needs and safety requirements.',
        ],
      },
      {
        kind: 'entry',
        role: 'Laboratory Teacher',
        org: 'Loughborough University',
        meta: 'Loughborough, United Kingdom | 2018-2021',
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
        role: 'Diploma, Java Systems Development',
        org: 'YH Akademin, Sundsvall',
        meta: '2024-2026',
      },
      {
        kind: 'note',
        text: 'Backend-focused Java program, with two placements at Braive AB and Omika Health AB.',
      },
      {
        kind: 'entry',
        role: 'Neuroscience (research)',
        org: 'Lund University, Lund',
      },
      {
        kind: 'note',
        text: 'Postgraduate research in motor control: quantitative analysis and scientific writing.',
      },
      { kind: 'entry', role: 'M.Sc. Sport Science', org: 'GIH, Stockholm' },
      {
        kind: 'note',
        text: 'Biomechanics and movement analysis, with statistical modelling in Matlab.',
      },
      {
        kind: 'entry',
        role: 'B.Sc. Sport Science',
        org: 'Bangor University, United Kingdom',
      },
      {
        kind: 'note',
        text: 'Research methods, statistics and critical thinking in sport science.',
      },
      {
        kind: 'entry',
        role: 'Associate Fellow of Advance HE',
        org: 'Loughborough University, United Kingdom',
      },
      {
        kind: 'note',
        text: 'Recognised qualification in teaching complex topics clearly.',
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
          '3rd place, Innovation Pioneers Hackathon 2025: prototyped an AI-driven collaboration app connecting entrepreneurs with key stakeholders in 48 hours, judged by a panel of innovation experts.',
          "JFokus 2026: attended one of Europe's leading developer conferences, focused on modern microservice architectures, tooling and security trends in the Java ecosystem.",
          'Independent project: building a machine-learning tool to analyse kinematic data and identify risk factors for musculoskeletal injury.',
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
      {
        kind: 'note',
        text: 'References gladly supplied on request. Supervisors from the Braive AB and Omika Health AB placements can be contacted.',
      },
      { kind: 'spacer', size: 2 },
      { kind: 'paragraph', text: 'Cai Birch' },
      { kind: 'paragraph', text: 'caiowain@gmail.com' },
      // Which edition of the CV these pages were set from, taken from the
      // published document itself rather than typed in, so it cannot drift
      // out of step with what the Download PDF button hands over.
      ...(CV_UPDATED_LABEL
        ? ([{ kind: 'spacer', size: 1 }, { kind: 'note', text: `Set from the CV of ${CV_UPDATED_LABEL}.` }] as const)
        : []),
    ],
  },
]
