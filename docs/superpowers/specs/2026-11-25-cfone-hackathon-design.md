# CFOne: a team of agents that closes a household's books

Design for the first build of CFOne, made at the JigJoy Black Friday AI Hackathon
(track "Agents in Finance", 26 to 27 Nov 2026). Written 25 Nov 2026, revised the same day for a
generic product scope. Status: decided, ready to plan.

## 1. Intent

My own problem first. Our household's money sits in several banks and cards for two people,
in more than one currency, and part of it is already promised: cheques and instalments dated
months and years ahead. Every bank app shows its own slice. Banks hand out statements, PDFs
and CSV exports, each in its own layout and currency, and no app we tried reads them all or
knows what we have promised. So the questions that matter have no answer in one place:

- How much do we have, what do we owe, and what have we already promised?
- Will next month's payments clear, and which card will charge interest?

**CFOne** answers them for any household. Drop in statements from any bank, in any format
and currency, plus the cheque register, loan or payment plans and card terms. A team of
agents reads everything at once, checks each other's work, and returns a verified position
in the home currency and a 90-day radar that warns before a payment bounces or a card charges
interest, with the exact fix and a source behind every number.

Tagline: *See everything you have, owe and have promised, and fix problems before they happen.*

The hackathon brief asks for "a team of AI agents that does a real job in finance". The job
here is the household month-end close plus a cash-flow early warning.

## 2. What success looks like

- **The demo moment** (live, about 90 seconds): ten statements from three banks (PDF and CSV,
  AED and EUR) and four supporting files go in; the swarm timeline lights up; the Auditor
  rejects a card statement and the reader fixes it; two sentinels compete for the same money
  and the Treasurer settles it; the Number Guard blocks a draft with an unsourced number; a
  brief appears where every amount is a clickable source chip, including the euro account
  that can close January's gap; I approve the plan and the forecast redraws.
- **Runnable**: `npm install && npm run demo` works with no API key (offline runner), live
  with `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or against any OpenAI-compatible endpoint
  such as a local model server.
- **Measured concurrency**, printed at the end of every run: participants, LLM loops, peak
  concurrent loops, rejections caught, conflicts settled, drafts blocked.
- **Every amount on screen** links to a statement line, a cheque, a rate, or a computed fact
  whose inputs link to those.

## 3. Goals, non-goals, anti-goals

**Goals**
1. One real job done end to end: statements in, verified position and radar out.
2. No bank-specific code: any statement layout, PDF or CSV, any currency, any number of banks.
3. Genuine concurrency on Mozaik: several agents thinking at the same time over shared state,
   reacting to each other's events.
4. Checks between agents that change outcomes, not decorations.
5. Runs from the README on a clean machine.
6. No invented numbers, by construction.

**Non-goals (this build)**
- Bank connections, real statements, real accounts, moving money.
- Scanned statements (OCR); the readers take digital PDFs and CSV exports.
- Reserving money across currencies: conversions are used for totals and cover suggestions only.
- Auth, multi-user, persistence beyond one run (a JSON snapshot is enough).

**Anti-goals** (failure even if it runs)
- A sequential pipeline with a `Promise.all` in the middle, presented as a swarm.
- One agent with a pile of tools.
- Any amount typed by a model reaching the screen.
- A conversion at a rate nobody can trace, or at 1:1 because a rate is missing.
- Synthetic documents that imitate a real bank's branding.
- Output that reads as advice. Every action carries "Not financial advice".

## 4. Constraints (checked 25 Nov 2026)

- **Rules** (build.jigjoy.ai/rules): the project must use `@mozaik-ai/core` and run two or
  more concurrent agents; single-agent projects do not qualify. Frameworks, libraries and
  boilerplate may be used, but the substance of the work must happen during the event.
  Synthetic or public data only. Submit a repo, a description and an explanation of how the
  agents run concurrently; video and screenshots are optional but strongly recommended;
  entries the judges cannot run or verify may be excluded.
- **Judging** (track page): Useful 30, Multi-agent design on Mozaik 30 (agents in parallel,
  shared state, checks between them), It works from the README 25, Care with financial
  data 15. Weight on genuine concurrency, "not a sequential pipeline in disguise".
- **Time**: kickoff Thu 10:00 CET, demos Fri 17:00 to 19:00, submissions close Fri midnight
  CET (resubmission allowed).
- **Mozaik version**: pin `@mozaik-ai/core@4.2.0`. Version 5.0.x (published 14 to 15 Nov)
  replaces the runtime and event bus with a single-loop breakpoint harness; docs.jigjoy.ai
  and the mozaik-examples repo still target 4.x, and past winners used 4.x. A spike on 25 Nov
  confirmed every 4.2.0 API this design uses (section 12).
- **This repo before kickoff** holds the design, the plan, contracts, the synthetic scenario
  and boilerplate. Application code is written during the event.

## 5. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | **Reactive swarm over a shared household ledger.** One Mozaik runtime; one reader per statement; checkers and planners react to events as facts land; a Treasurer arbitrates shared cash; a Number Guard intercepts publishing. | Most moving parts and event-debugging cost. Directly matches all three judged traits: parallel, shared state, checks. Produces the real job. | **Chosen** |
| B | **Ask-CFOne research crew.** A planner splits a question, analysts answer in parallel, a fact-checker verifies, a writer answers. | Every question becomes a fan-out-and-join pipeline, which is what the judges call a pipeline in disguise. Needs the ledger anyway. | Stretch on top of A |
| C | **Batch pipeline with a parallel map.** Parse all files in `Promise.all`, then analyse in sequence. | Simplest, and exactly the anti-goal. | Rejected |
| D | **Port the earlier Raspberry Pi plan (Python, bank-specific parsers).** | Mozaik is TypeScript, the work must be built at the event, and per-bank parsers contradict goal 2. Ideas carry over, code does not. | Rejected |

## 6. Shape of the system

```
          drop folder ──► Coordinator ── document.received ×N ──┐       (rates → facts, by code)
                                                                ▼
   Reader ×N (LLM) ──extraction.submitted──► Auditor ──statement.verified──► Forecaster ──forecast.updated──► Cash Sentinel (LLM)
        ▲                                     │   │                              ▲                          Card Sentinel (LLM)
        └────────── statement.rejected ───────┘   └──► Categoriser (LLM)         │                               │ reserve_funds
                                                  └──► Matcher                   │                               ▼
   Clerk (LLM) ──commitment.added / terms.added────────────────────────────────►─┘◄──reservation.changed── Treasurer
                                                                                                                  │
   Briefer (LLM) ◄── close.settled ── Observer (metrics, SSE)        Number Guard intercepts propose_action / publish_brief
        │                                                                                                         │
        └──────────────► You (approve / snooze) ── action.approved ──► Forecaster, Treasurer ◄────────────────────┘
```

- **One runtime per close.** `defineRuntime<HouseholdState>()`; every participant joins
  before the Coordinator emits anything.
- **Nobody calls anybody.** Participants only react to events through
  `SituationSpecification`s and write to shared state through tools or handlers. There is no
  orchestrator loop that calls agents in order.
- **LLM agents start loops with `runLoop`, which is not awaited**, so loops overlap. Each
  loop gets a fresh `ModelContext` (the agent's instruction plus the task), so parallel loops
  of the same agent never share context. Readers are one agent per statement.
- **Code participants** (Coordinator, Auditor, Matcher, Forecaster, Treasurer, Observer) do
  arithmetic, conversions and bookkeeping. Models never do arithmetic.

## 7. Participants

| # | Participant | Kind | Reacts to | Does | Emits |
|---|---|---|---|---|---|
| 1 | Coordinator | code | `close.requested` | Reads every file in the drop folder as numbered lines (PDF or CSV), detects its kind from content, spawns one Reader per statement, routes commitments and terms to the Clerk, and turns `fx-rates.csv` into rate facts | `document.received`, `rates.added` |
| 2 | Reader ×N | LLM, one per statement | `document.received` (its own), `statement.rejected` (its own) | Reads numbered text of any layout, submits currency, rows with `page:line` sources and the statement's own control figures | `extraction.submitted` |
| 3 | Auditor | code | `extraction.submitted` | Source check, reconciliation gate (printed totals or running balance), hint on failure, quarantine after two failed re-reads | `statement.verified`, `statement.rejected`, `statement.quarantined` |
| 4 | Clerk | LLM | `document.received` (cheque register, payment plan, card terms) | Turns the register, plans and card terms into commitments and card terms with sources; flags plan instalments without a cheque | `commitment.added`, `terms.added`, `commitment.flagged` |
| 5 | Categoriser | LLM (fast model) | `statement.verified` | Labels rows from a fixed category list with confidence | `categories.assigned` |
| 6 | Matcher | code | `statement.verified` | Links transfers and card payments between own accounts so they are not counted as spending | `transfer.matched` |
| 7 | Forecaster | code | `statement.verified`, `commitment.added`, `terms.added`, `rates.added`, `reservation.changed`, `action.approved` | Detects recurring items, projects daily balances per account in its currency for 90 days, converts the position to the home currency, publishes facts, risks and cover suggestions (debounced) | `forecast.updated` |
| 8 | Cash Sentinel | LLM | `forecast.updated` with cheque or autopay risks changed | Claims cash to cover shortfalls, proposes actions, points to cover in another currency | tool calls: `reserve_funds`, `propose_action` |
| 9 | Card Sentinel | LLM | `forecast.updated` with card risks changed | Claims cash to pay cards before interest, splits payments around paydays | tool calls: `reserve_funds`, `propose_action` |
| 10 | Treasurer | code | `reserve_funds` calls, `action.approved` | Owns the reservation ledger, allocates scarce cash by policy within one currency, bumps lower-priority claims | `reservation.changed`, `reservation.bumped` |
| 11 | Number Guard | code (interception) | `propose_action`, `publish_brief` tool calls | Blocks any draft with a digit outside a placeholder or an unknown fact | `guard.blocked` |
| 12 | Briefer | LLM | `close.settled` | Writes the household brief from facts only | tool call: `publish_brief` |
| 13 | Observer | code | everything | Loop spans, metrics, settled detection, server-sent events to the UI | `close.settled`, `close.completed` |
| 14 | You | human | UI | Approve or snooze actions; the app never moves money | `action.approved`, `action.snoozed` |

With the demo's ten statements, the first seconds have at least thirteen LLM loops in flight
(ten Readers and three Clerk loops), followed by Categorisers, then both Sentinels at once.
Twenty-two participants in all.

## 8. Events

All custom events are `SemanticEvent.create(type, producerId, payload)` sent with
`sendEvent(event, producerId)`. Payloads carry ids; the data lives in shared state.

| Event | Payload | Producer |
|---|---|---|
| `close.requested` | `{ folder }` | You (CLI or UI) |
| `document.received` | `{ docId, kind, assignee }` | Coordinator |
| `rates.added` | `{ base, quote, date }` | Coordinator |
| `extraction.submitted` | `{ docId, attempt }` | Reader |
| `statement.verified` | `{ docId, statementId, accountId }` | Auditor |
| `statement.rejected` | `{ docId, assignee, diffMinor, hint, attempt }` | Auditor |
| `statement.quarantined` | `{ docId, reason }` | Auditor |
| `commitment.added` / `commitment.flagged` | `{ commitmentId }` / `{ reason, sources }` | Clerk |
| `terms.added` | `{ accountId }` | Clerk |
| `agent.failed` | `{ agentId, reason }` | inference wrapper, after the last retry |
| `categories.assigned` | `{ statementId, lowConfidence }` | Categoriser |
| `transfer.matched` | `{ pairId }` | Matcher |
| `forecast.updated` | `{ version, riskFingerprint }` | Forecaster |
| `reservation.changed` / `reservation.bumped` | `{ claimId, grantedMinor }` / `{ claimId, owner, fromMinor, toMinor }` | Treasurer |
| `action.proposed` | `{ actionId }` | Sentinel tool, after the guard passes |
| `guard.blocked` | `{ agentId, tool, reason }` | Number Guard |
| `brief.published` | `{ briefId }` | Briefer tool, after the guard passes |
| `close.settled` / `close.completed` | `{}` / `{ metrics }` | Observer |
| `action.approved` / `action.snoozed` | `{ actionId }` | You |

Built-in Mozaik events used: `inference.started`, `inference.completed`,
`function_call.started`, `function_call.completed`, `model.answer`, `interception.started`,
`interception.finished` (each carries `loopId`).

## 9. Shared state (`HouseholdState extends RuntimeState`)

- `documents`: id, file, kind (`statement`, `cheque_register`, `payment_plan`, `card_terms`,
  `fx_rates`, `unsupported`), pages as numbered lines, status.
- `extractions`: per document and attempt, the submitted currency, rows and control figures.
- `statements`: verified only: account, currency, period, control figures, rows with sources.
- `accounts`: id, bank, kind, currency, last four, holder, display name.
- `commitments`: cheques and instalments: number, payee, amount, currency, date, account, sources.
- `transfers`, `categories`, `cardTerms`.
- `facts`: id, label, kind (`money`, `date`, `pct`, `rate`, `text`), value, currency,
  `sources[]`, producer. Only code participants create facts.
- `forecast`: version, daily balances per current account in its currency (baseline and
  planned), risks, cover suggestions.
- `claims` and `grants`: the Treasurer's ledger.
- `actions`: proposed, approved, snoozed; text with placeholders; claim ids.
- `brief`, `metrics` (loop spans, counters), `log`.

Money is integer minor units plus an ISO 4217 currency code everywhere. Dates are ISO strings.
The household's home currency and per-currency buffers are settings.

## 10. The checks

These are the heart of the entry. Each one can change the outcome.

1. **Source check (Auditor).** Every extracted row cites `p<page>:l<line>` (CSV files are one
   page). The Auditor confirms the cited line exists and contains that amount as printed. A
   row that fails is an extraction failure, not a warning.
2. **Reconciliation gate (Auditor).** Whatever the layout, a statement must agree with its own
   figures, to the cent: opening + credits − debits = closing and printed totals match, or,
   for cards, previous − payments + purchases + charges = new balance; where rows carry a
   running balance, every step of the chain must hold. On a mismatch the Auditor computes the
   difference and searches the document text for an amount equal to it; if found, the hint
   names the line ("difference 165.13 equals 'Finance charges' on p1:l8"). The Reader re-reads
   with the hint in a new loop. After two failed re-reads the statement is quarantined and
   excluded from every number.
3. **Arbitration (Treasurer).** Sentinels claim cash with `reserve_funds`. Claims move money
   only between accounts in the same currency; others are refused with a reason. Claims
   compete only inside the same paycheck window of the source account (from the claim date to
   the account's next recurring income). Inside a window, priority decides: cheque 1,
   autopay 2, card payment 3; ties by date, then claim id. Windows are processed in date
   order. The allocation is a pure function of the claims, so the result does not depend on
   which sentinel was faster. When a higher-priority claim arrives, lower ones are recomputed
   and their owners receive `reservation.bumped` and re-plan. The Treasurer refuses any
   allocation that would take a planned balance below its buffer before the end of the window.
4. **Number Guard (interception).** A Mozaik `InterceptionHandler` on `propose_action` and
   `publish_brief`. A draft passes only if it contains no digits outside `{{F:<factId>}}`,
   `{{D:YYYY-MM-DD}}`, `{{A:<accountId>}}` and `{{C:<chequeNo>}}` placeholders, every fact id
   exists, and any granted amount it names belongs to its own claims. Otherwise the tool call
   is replaced with a `BLOCKED: <reason>` output and the model tries again in the same loop.
5. **Human approval.** Actions are proposals. Approving one commits its reservation and
   redraws the forecast. Nothing is ever executed against an account.
6. **Second reader (stretch).** A layout-aware rule reader per statement runs next to the
   LLM reader; the Auditor verifies when either reconciles and records agreement (2/2 or 1/2).

## 11. Numbers: facts, currencies, forecast, policy

**Facts and rendering.** Code participants publish facts such as
`bal:bank-a-current-4417:2026-10-31`, `fx:EUR:AED:2026-10-31`, `shortfall:cheque-000234`,
`available:bank-b-current-0263:2026-11-20`, `grant:C1`,
`cover:cheque-000301:bank-c-current-7710`. Each fact carries its currency and its sources
(statement lines, cheque rows, rate lines, or the facts it was computed from). Agents see facts
as `[F:shortfall:cheque-000234] Shortfall for cheque 000234 = AED 6,400.00` and write
`{{F:shortfall:cheque-000234}}` in drafts. The UI renders placeholders as formatted amounts
with their currency and a source chip; clicking it shows the cited lines.

**Currencies.** Every account, statement, row, commitment and money fact has a currency.
Rates are facts with a source line, stored as 4-decimal strings and applied with integer
arithmetic: conversions round half up; an amount needed in another currency rounds up. The
position (have, owe, promised) is reported in the home currency using the latest rate on or
before each balance's date; an amount without a rate is left out of the total and shown with a
"missing rate" marker, never converted at 1:1.

**Forecast (deterministic, per account in its own currency).**
- Start: each current account's latest verified closing balance; project day by day from the
  day after the statement period to `asOf + 90 days`.
- Recurring items: from the two most recent verified statements of each current account,
  excluding own-account movements (rows naming a household bank, or containing `CARD PAYMENT`
  or `CARD AUTOPAY`, or matched by the Matcher); same normalised description (digits removed),
  same sign, amount within ±15%, day of month within ±3, clamped to the month's last day.
  Projected with the latest amount on the latest day of month.
- Cheques: from commitments, on their date, from their account.
- Card autopay: the known due from the latest card statement on its due date; later months
  estimated as the mean of the last two statements' new balances (marked estimated).
- Same-day order: credits before debits.
- A risk is raised when the balance just before a cheque or autopay is below the amount plus
  the account's buffer. Manual cards raise a `card_interest` risk on their due date with the
  full and minimum amounts.
- **Cover suggestions.** For a cheque or autopay shortfall still open after grants, any
  current account in another currency whose free funds (lowest projected balance from the day
  before the risk to the horizon end, minus its buffer) cover the converted amount gets a
  `cover:<riskId>:<accountId>` fact in its own currency.

**Treasurer policy.** As in check 3. The card interest estimate uses the card terms' monthly
rate on the amount left unpaid at the due date.

## 12. Mozaik usage (verified on `@mozaik-ai/core@4.2.0`, 25 Nov)

The spike in `docs/reference/mozaik-4.2-spike.ts` ran three readers, an auditor with a
re-read loop and an interception gate on one runtime, with a mock inference runner: four loops
overlapped, the auditor rejected one statement while the others were still being read, the
re-read fixed it, and the gate blocked a sourceless submission. Findings that shape the build:

- `defineRuntime<S>()` returns `initializeRuntime, resolveRuntime, resolveParticipant, join,
  leave, sendMessage, sendEvent, runLoop`. Each call owns one runtime that initialises once,
  so every close calls it afresh. Event fan-out is synchronous; `runLoop` returns immediately
  and its loop runs on its own.
- `runLoop` does not catch errors. A provider error inside a loop is an unhandled rejection
  that kills the Node process (reproduced). The build wraps inference in a `SafeRunner`
  (retries with backoff, a concurrency cap, and on final failure a model message plus an
  `agent.failed` event) and installs a process-level `unhandledRejection` handler.
- Agent memory is one shared `ModelContext`. Concurrent loops use a fresh context each.
- `InterceptionHandler.isSatisfiedBy(transition)` plus `handle(transition)` can replace a
  pending function call with an output item and route the loop back to inference.
- Built-in models include `claude-sonnet-5-5`, `claude-opus-5-5`, `gpt-5.5`, `gpt-5.4-mini`,
  `claude-haiku-4-5`. `OpenAIChatCompletions` takes a `baseURL`, so any OpenAI-compatible
  server, including a local one, becomes a custom `GenerativeModel`.
- `inferenceRunnerConfig.runner` accepts any `InferenceRunner`, which is how offline mode
  works without touching agent code.
- With `MOZAIK_API_KEY` set, 4.2.0 streams every loop to Mozaik Cloud; without it, it prints
  one warning per loop (the build de-duplicates it). `MOZAIK_REDACTION=content` strips
  payload content.
- Context items are text only, so PDFs and CSVs become numbered text locally before any model
  sees them.

## 13. Models and offline mode

- `CFONE_MODEL` (default `claude-sonnet-5-5` when `ANTHROPIC_API_KEY` is set, else `gpt-5.5`
  when `OPENAI_API_KEY` is set) for Readers, Clerk, Sentinels and Briefer;
  `CFONE_FAST_MODEL` (default `claude-haiku-4-5` or `gpt-5.4-mini`) for the Categoriser.
  `CFONE_OPENAI_BASE_URL` plus `CFONE_MODEL` point both at any OpenAI-compatible server.
- No key, or `CFONE_OFFLINE=1`: an `OfflineRunner` replaces inference. It is a scripted
  policy per role that reads the same context a model would and emits the same tool calls:
  a generic table reader for PDF lines and CSV rows (which genuinely misses summary-only
  charges until given the hint), a CSV and plan reader, a keyword categoriser, sentinels that
  claim and split, and a template briefer. Agents, events, checks and concurrency are
  identical; the UI labels the run "offline: scripted model".

## 14. Concurrency you can see

- Observer records a span per loop (`inference.started` to `model.answer`, keyed by
  `loopId`) and computes peak concurrent loops and total overlap.
- The CLI prints a lane chart and the metrics line at the end.
- The UI shows the swarm timeline live over server-sent events.
- Optional: Mozaik Cloud live view when `MOZAIK_API_KEY` is set.

## 15. UI (one page, no build step)

```
┌ CFOne · Close October ───────────────────────── offline | live · Not financial advice ┐
│ HAVE AED 55,322.85 ⓢ   OWE AED 19,182.73 ⓢ   PROMISED (90 days) AED 63,500.00 ⓢ      │
├ Swarm ──────────────────────────────┬ Radar: next 90 days ──────────────────────────┤
│ Reader Bank A current Sep ▇▇▇▇      │  Bank A current ───╮      ╭───╮     ╭─        │
│ Reader Bank B card Oct  ▇▇▇ ✗ ▇▇ ✓  │                    ╰ ✗ 22 Nov     ╰ ✗ 15 Jan │
│ Clerk                 ▇▇▇▇▇▇        │  Bank B current ───────────────────────       │
│ Cash Sentinel              ▇▇▇ ⇄    │  Bank C current (EUR) ─────────────────       │
│ Card Sentinel              ▇▇▇▇ ⇄   ├ Actions ──────────────────────────────────────┤
│ peak 13 loops · 2 rejections ·      │ 1 Move 6,400.00 ⓢ from Bank B to Bank A by 21 Nov [Approve] │
│ 1 conflict · 0 drafts blocked       │ 2 Pay 2,187.20 ⓢ by 20 Nov, 4,125.28 ⓢ on 25 Nov │
└─────────────────────────────────────┴ 3 15 Jan cheque short 8,720.53 ⓢ: Bank C covers EUR 2,051.89 ⓢ ┘
```

Source chips open a drawer with the cited lines. Built from `web/index.html`, `web/app.js`,
`web/style.css`, inline SVG charts, server-sent events from `node:http`.

## 16. Synthetic household (summary)

Fictional couple Luka and Mila. Bank A (current account with a cheque book, credit card with
a supplementary card, PDF statements), Bank B (current account, credit card, PDF statements in
a different layout) and Bank C (a euro account abroad, CSV exports); September and October
2026 statements (ten files), a cheque register, a developer payment plan, card key facts and a
rates file. Home currency AED. As of 5 Nov 2026. Full spec and golden values:
`docs/data-spec.md`, `data/scenario/household.scenario.json`, `data/scenario/golden.json`.

What the close must find (golden):

| Finding | Value |
|---|---|
| Have / owe / promised in 90 days (AED) | 55,322.85 / 19,182.73 / 63,500.00 |
| Bank C, EUR 4,250.00 at 4.2500 | AED 18,062.50 inside "have" |
| Bank B card Oct statement: table rows alone | 6,147.35, short of the 6,312.48 new balance by 165.13 (finance charge printed only in the summary) |
| Rent cheque 000234, 22 Nov: projected balance before it | 21,600.00 vs 27,500.00, shortfall 6,400.00 with buffer |
| Bank B card due 20 Nov | full 6,312.48, minimum 315.62 |
| Bank B cash free until next payday (25 Nov) | 8,587.20 |
| Treasurer: rent claim / card claim | 6,400.00 granted / 2,187.20 of 6,312.48 granted |
| Card remainder after payday, estimated finance charge | 4,125.28 on 25 Nov, 134.07 |
| Property cheque 000301, 15 Jan: shortfall / fundable from Bank B / still short | 16,169.65 / 7,449.12 / 8,720.53 |
| Cover from Bank C | EUR 2,051.89 needed, EUR 3,919.78 free |

## 17. Care with financial data

- Synthetic data only, generated from a committed scenario; fictional names, banks and
  merchants; no bank branding.
- No bank logins: statements in, nothing out.
- Integer minor units with currencies; reconciliation to the cent; unverified statements
  never count; rates are sourced and never assumed.
- Every displayed amount is a fact with sources; models cannot type amounts.
- Read-only: proposals and approvals only; nothing moves money.
- "Not financial advice" on the brief and on every action.
- Mozaik Cloud is off unless `MOZAIK_API_KEY` is set; `.env.example` sets
  `MOZAIK_REDACTION=content`. No secrets in the repo.

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A provider error kills the process mid-demo | `SafeRunner` plus `unhandledRejection` handler (failure reproduced in the spike) |
| Rate limits with thirteen loops in flight | Concurrency cap (default 6) and retries with jitter in `SafeRunner` |
| LLM misreads an unfamiliar layout | Source check, gate, hinted re-read, quarantine |
| A currency without a rate | Left out of totals with a visible marker; no 1:1 fallback |
| Sentinels loop forever reacting to each other | They react only when the risk fingerprint changes; Treasurer allocation is deterministic |
| Venue Wi-Fi or quota fails during demos | Offline mode, plus a recorded run |
| Behind schedule | Cut list in the plan, in order |
| Someone installs Mozaik 5 | Exact pin, note in CLAUDE.md |

## 19. Build decisions (author's calls)

These settle questions a builder would otherwise have to guess. Change them only with a reason.

1. **PDF in and out.** Synthetic PDFs are drawn with `pdfkit` (pure JavaScript, no browser).
   The app reads them with `unpdf`: `getDocumentProxy`, then `getTextContent()` per page,
   text items grouped into lines by y position (2 pt tolerance) and ordered by x, joined
   with two spaces. Lines are numbered per page from 1. CSV files are one page, one line per
   record. Verified on 25 Nov: a generated card statement came back line for line, so a
   `page:line` reference reliably points at the printed line.
2. **Document kind** is detected from content, never from the bank or the file name: a CSV
   header naming cheque and payee columns is a cheque register; one naming base, quote and
   rate is a rates file; one naming date and amount (or opening and closing balances) is a
   statement; text containing "payment plan" or an instalment schedule is a payment plan;
   "key facts" or card terms is card terms; a PDF whose first lines say "statement" and that
   has dated rows is a statement; anything else is unsupported.
3. **Tools take fact ids, not amounts.** `reserve_funds` and `propose_action` accept fact ids;
   the Treasurer answers with new facts (`grant:<claimId>`, `remainder:<claimId>`,
   `available:<account>:<date>`), so a sentinel can claim "the remainder" without typing it.
4. **One loop per sentinel at a time.** A trigger that arrives while a sentinel's loop is
   running sets a dirty flag; the sentinel runs once more when its loop answers. Same for
   the Forecaster's debounce (150 ms).
5. **Actions are keyed by risk id.** A new proposal for the same risk supersedes the old one.
6. **Settled** means: every statement is verified or quarantined and other documents are
   processed; no loop is open; the forecast version has not changed for 750 ms. The Observer
   then emits `close.settled` once per close; the Briefer reacts. Approvals after that update
   numbers and the radar, not the brief, unless the user asks for a new brief.
7. **Two entry points.** `npm run demo` runs a close in the terminal and prints the lane chart,
   the brief and the metrics. `npm start` serves the page on `http://localhost:3000` with a
   Run button; both use the same runtime code.
8. **Settings**: `CFONE_AS_OF` (default `2026-11-05`), `CFONE_HOME_CURRENCY` (default `AED`),
   `CFONE_BUFFERS` (default `AED=500.00,EUR=100.00`; a currency without one uses zero).
9. **Categories** are a fixed list: groceries, dining and delivery, transport and fuel,
   utilities and telecom, housing, childcare and education, health and beauty, insurance,
   shopping, travel, entertainment and subscriptions, fitness, family support, cash, fees and
   interest, income, transfer.
10. **Account ids** come from the printed bank name, product and last four
    (`bank-a-current-4417`), so a new bank needs no code.

## 20. Left to the builder

Prompt wording, PDF visual style, CSS, the exact lane-chart drawing, log format, and which
stretch items to attempt. Decisions here are the author's calls and can be changed if the
build shows a better way, as long as the anti-goals hold.
