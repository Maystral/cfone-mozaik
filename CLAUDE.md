# CFOne: instructions for Claude Code

A Mozaik swarm that closes a household's books from statements of any bank, format and
currency (synthetic in the demo) and warns before a payment bounces. Hackathon entry, JigJoy Black Friday AI Hackathon, 26 to 27 Nov 2026.

## Read first, in this order

1. `docs/superpowers/specs/2026-11-25-cfone-hackathon-design.md`: what and why, decided.
2. `docs/superpowers/plans/2026-11-26-cfone-hackathon.md`: the tasks. Work them in order.
3. `docs/mozaik-notes.md`: verified Mozaik 4.2 API and the traps (read before any agent code).
4. `docs/data-spec.md`: document layouts and the golden values the tests use.

## How to work

- One plan task at a time, test first: write the failing test, see it fail, implement, see it
  pass, run `npm run typecheck`, commit. Tick the task's boxes in the plan.
- Use superpowers:executing-plans (or subagent-driven-development when asked).
- If a task's plan is wrong, fix the plan in the same commit and say why.

## Commands

```
npm install
npm test                      # node:test via tsx
npm run typecheck
CFONE_OFFLINE=1 npm run demo  # full close in the terminal, no API key
npm start                     # page on http://localhost:3000
npm run gen                   # regenerate data/synthetic from data/scenario
python3 data/scenario/make_scenario.py data/scenario   # regenerate scenario and golden values
```

## Rules that are never traded away

- `@mozaik-ai/core` stays at exactly `4.2.0`. Version 5 is a different API.
- Every close calls `defineRuntime()` afresh and passes the runtime to participants.
- Every `runLoop` gets a fresh `ModelContext` and an explicit `maxOutputTokens`.
- Inference always goes through `SafeRunner`; the process must survive a provider error.
- Money is integer minor units with an ISO currency code. No floating-point money. Percentages
  round half up. Rates are sourced facts; never convert without one, never at 1:1.
- No bank-specific code: kinds and structure come from content, account ids from the printed
  bank name, product and last four.
- Models never produce amounts. Tools take printed text plus a `p<page>:l<line>` source, or
  fact ids. Drafts use only `{{F:id}}`, `{{D:YYYY-MM-DD}}`, `{{A:accountId}}`, `{{C:chequeNo}}`.
- Never loosen the Auditor's gate or the Number Guard to make a run pass. Fix the prompt or
  the reader.
- The app reads only `data/synthetic/`. `data/scenario/` is for the generator and tests.
- Synthetic data only. No real bank names, logos or wording in generated documents.
- "Not financial advice." on every action and brief. Nothing moves money.
- No new runtime dependency without a line in the design doc. No frontend build, no CDN.
- Hackathon rule: the substance of the code is written during the event. Do not paste in code
  from other projects.

## Where things are

- `docs/reference/mozaik-4.2-spike.ts`: a working runtime with readers, an auditor, a re-read
  loop and an interception gate. Copy patterns, not the file.
- `docs/reference/pdf-lines-spike.ts`: PDF drawing with pdfkit and line reading with unpdf.
- `data/scenario/golden.json`: every number the close must find.
