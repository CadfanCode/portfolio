# Arbiter and workers

How Claude Code is set up to work on this repo. The worker definitions themselves
live in `.claude/agents/` — that directory holds agent files only, since every `.md`
in it is parsed as one.

The session you type into is the **arbiter**: Opus 5 at `xhigh` effort, configured in
`.claude/settings.json`. It plans, delegates, and reviews. It should do very little
reading and almost no editing itself.

The agents in this folder are **workers**: Sonnet 5 at `medium` effort. They do the
routine reads and edits. Each one is narrow on purpose — a narrow worker needs less
context, gets less lost, and produces a diff the arbiter can review quickly.

The trade this makes: the expensive model spends its tokens on judgement (what to
build, whether the result is right) and the cheap model spends its tokens on typing.
That is where the efficiency comes from, and it only holds if the arbiter actually
delegates.

## The roster

| Agent        | Edits            | Use it for                                          |
| ------------ | ---------------- | --------------------------------------------------- |
| `scout`      | nothing          | Locating code, tracing state, "where is X" — before planning |
| `scene-dev`  | `src/**`         | R3F components, camera rig, stores, exhibits, CSS   |
| `blender-dev`| `blender/**`     | Hull, deck, rig, sails, interior, params, verify    |
| `checker`    | nothing          | Independent typecheck / lint / build / verify + diff review |
| `scribe`     | `*.md`, `src/content/**` | Docs and visitor-facing copy                |

`scout` and `checker` have no write tools at all. That is deliberate: an agent that
can fix a failing check has an incentive to see green, so the agent that reports on
the work is not the agent that did it.

## How the arbiter should run a task

1. **Understand** — if the answer isn't already in context, send `scout`. One
   question, bounded. Don't read the repo yourself.
2. **Plan** — decide the approach, the file boundaries, and the acceptance test
   yourself. This is the part that is worth Opus and must not be delegated.
3. **Delegate** — hand a worker a bounded change with the plan in it. Independent
   changes in different areas can run in parallel in one message; anything touching
   the same files must be sequential.
4. **Verify** — send `checker`. Its report is evidence; the worker's self-report is
   a claim.
5. **Review** — read the diff yourself and judge it against the plan. Accept, or send
   back a specific correction. This is the other part that is worth Opus.

## Writing a good worker prompt

Workers are cheap and literal. They fail on vague goals and succeed on bounded ones.
Every delegation should carry:

- **The goal**, in one sentence — the outcome, not the keystrokes.
- **The files** it may touch, and the ones it may not.
- **The decisions already made**, so it doesn't re-litigate them.
- **How you'll know it worked** — the command that must pass, or the behaviour that
  must appear.
- **What's out of scope**, explicitly, when the change sits next to something
  tempting.

## When not to delegate

Delegation costs a cold start: the worker re-derives context the arbiter already has.
Do it yourself when the change is a couple of lines you can already see, when you're
mid-debug and holding state a worker would have to rebuild, or when explaining the
task would take longer than doing it.

## Escalation

A worker that reports **Not done**, **Assumptions** it wasn't comfortable making, or
a leaked architectural boundary is doing its job. Handle it at the arbiter level —
re-plan, then re-delegate. Do not just tell the worker to try harder.
