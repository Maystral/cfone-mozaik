# CFOne Hackathon Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CFOne, a Mozaik swarm that turns a household's statements from any bank (PDF or CSV, any currency), cheque register, payment plan, card key facts and exchange rates into a verified position in the home currency, a 90-day radar and sourced, guarded actions, runnable from the README with or without an API key.

**Architecture:** One Mozaik 4.2 runtime per close. Participants react to events through situation specifications and share a typed `HouseholdState`; LLM agents start non-awaited loops with fresh contexts, so readers, clerk, categorisers and sentinels think at the same time. Code participants do all arithmetic (reconciliation, forecast, allocation); models only copy printed text and reference fact ids, and a Number Guard interception blocks any draft with an unsourced number.

**Tech Stack:** Node 22+, TypeScript (ESM) run with `tsx`, `@mozaik-ai/core@4.2.0`, `pdfkit@0.17.2` (generate), `unpdf@1.9.1` (read), `node:test`, `node:http` with server-sent events, vanilla HTML/JS/SVG.

**Spec:** `docs/superpowers/specs/2026-11-25-cfone-hackathon-design.md`, with `docs/data-spec.md` (layouts and golden values) and `docs/mozaik-notes.md` (verified API and pitfalls). Read all three before Task 1.

## Global Constraints

- The substance of the code is written during the event (Thu 26 Nov 10:00 to Fri 27 Nov midnight CET). This repo starts with docs, scenario data, boilerplate and two reference spikes only.
- `@mozaik-ai/core` is pinned to exactly `4.2.0`. Never upgrade to 5.x.
- Node `>=22`; ESM; no build step; no frontend framework; no CDN; no new runtime dependency without a line in the design doc.
- Money is integer minor units (`Minor = number`) plus an ISO 4217 currency code on every account, statement, row, commitment, flow and money fact. Parse from printed text; never use floating-point arithmetic on money; percentages round half up. Rates are 4-decimal strings applied with integer arithmetic: conversions round half up, amounts needed in another currency round up. Never convert without a sourced rate.
- Dates are ISO `YYYY-MM-DD` strings. As-of `CFONE_AS_OF`, default `2026-11-05`; horizon 90 days; home currency `CFONE_HOME_CURRENCY`, default `AED`; buffers `CFONE_BUFFERS`, default `AED=500.00,EUR=100.00`.
- No bank-specific code: document kinds and statement structure are detected from content; account ids come from the printed bank name, product and last four.
- The app reads only `data/synthetic/`. `data/scenario/*` is for the generator and tests.
- Models never produce amounts: tools take printed text plus a `p<page>:l<line>` source, or fact ids. Drafts use only `{{F:<factId>}}`, `{{D:YYYY-MM-DD}}`, `{{A:<accountId>}}`, `{{C:<chequeNo>}}`.
- Every action and every brief renders with the line `Not financial advice.`
- Every close calls `defineRuntime()` afresh and hands the runtime to participant factories. Every `runLoop` gets a fresh `ModelContext` and an explicit `maxOutputTokens`.
- Account ids: `bank-a-current-4417`, `bank-a-card-8821`, `bank-b-current-0263`, `bank-b-card-5530`, `bank-c-current-7710` (EUR) (rule in `docs/data-spec.md`). Statement ids `<accountId>:<YYYY-MM>`. Doc ids are file stems. Risk ids: `cheque-<no>`, `autopay-<accountId>-<date>`, `card-<accountId>-<date>`.
- Tests: `npm test` (`node:test` through `tsx`), `npm run typecheck`. Offline tests use `CFONE_OFFLINE_LATENCY_MS=20`.

## Review Focus

1. **A provider error or rate limit mid-run.** Expect: no crash; the failing agent's document is quarantined with reason "reader failed"; the close still settles. Test in Task 8 (`SafeRunner`) and Task 10 (`reader failure quarantines the document`).
2. **A model types an amount** ("AED 6,400") in an action or brief. Expect: blocked, retried in the same loop, never rendered. Test in Task 13 (`chaos draft is blocked then fixed`).
3. **An unknown or unreadable file in the drop folder.** Expect: marked `unsupported`, logged, close still settles. Test in Task 9 (`unknown file is unsupported and close settles`).
4. **A second close in the same process** (Run clicked twice, or twice in sequence). Expect: sequential runs both work (fresh runtime); a concurrent second request gets HTTP 409. Tests in Task 15 (`two closes in one process`) and Task 16 (`second POST while running is 409`).
5. **A currency without an exchange rate** (a statement in a currency that `fx-rates.csv` does not cover). Expect: that balance is left out of the home-currency totals with a `missing rate` marker on the position and never converted at 1:1; no cover suggestion uses it. Test in Task 12 (`missing rate is excluded, not assumed`).

## Schedule (CET) and cut list

| When | Tasks | Checkpoint |
|---|---|---|
| Thu 10:00 to 10:45 | Kickoff; create the public repo from this folder; `npm ci`; Task 1 | `npm test` green |
| Thu 10:45 to 12:30 | Tasks 2, 3 | `data/synthetic/` committed |
| Thu 12:30 to 14:00 | Tasks 4, 5, 6 | golden tests green |
| Thu 15:00 to 16:00 | Tasks 7, 8 | |
| Thu 16:00 to 18:00 | Tasks 9, 10 | 10 statements verified offline (8 PDF, 2 CSV), 2 rejections |
| Thu 18:00 to 20:00 | Tasks 11, 12 | risks match golden |
| Thu 20:00 to 23:30 | Tasks 13, 15 | **first full offline run from the CLI** |
| Fri 08:30 to 10:00 | Task 17 (live model), Task 14 if time | live run recorded |
| Fri 10:00 to 11:00 | Pitch preparation talk | |
| Fri 11:00 to 14:00 | Task 16 | UI shows a full run |
| Fri 15:00 to 16:30 | Task 18; two rehearsals; backup recording | submission draft saved |
| Fri 17:00 to 19:00 | Demos | |
| Fri 19:00 to 23:30 | Fixes; final submission (resubmission allowed, last one counts) | |

**Cut list, in order:** (1) Categoriser, (2) Matcher, (3) live web UI, replaced by `out/report.html` written by the CLI from the same render functions, (4) card key facts PDF, replaced by terms in `config/household.json`, (5) live-model polish, replaced by an offline demo plus a recorded live run, (6) Bank C (EUR, CSV) and cover suggestions: the build stays single-currency in practice, and the deck's "have" figure becomes 37,260.35.

**Team of two to four:** A takes Tasks 1, 8, 9, 10, 13, 15 (runtime and agents); B takes 2 to 7, then 11, 12, 14 (data and pure domain); C takes 16 from Thursday afternoon against `out/events.jsonl` recorded by the Observer; D takes 17, 18, the deck and the video.

## File map

```
src/types.ts            domain types shared by every module (contract in Task 1)
src/money.ts            parse printed amounts, format with currency, percentages, conversions
src/config.ts           environment to Config
src/runtime.ts          HouseholdState, createRuntime()
src/events.ts           event names, emit(), On / FromOther / ForMe specifications
src/logging.ts          one-time cloud warning, crash guard
src/facts.ts            FactStore, placeholder rendering
src/pdf/lines.ts        PDF or CSV to numbered lines, references
src/pdf/detect.ts       document kind from content
src/domain/reconcile.ts source check, reconciliation gate, hint
src/domain/recurring.ts recurring detection
src/domain/forecast.ts  flows, daily series, risks
src/domain/treasury.ts  paycheck-window allocation
src/domain/guard.ts     draft checker
src/domain/match.ts     transfer pairs
src/inference/models.ts, endpoint-runner.ts, safe-runner.ts, offline-runner.ts, offline/*.ts
src/agents/kit.ts       Ctx, startLoop, tool(), OneAtATime, codeParticipant
src/agents/*.ts         observer, coordinator, reader, auditor, clerk, categoriser, matcher,
                        forecaster, treasurer, sentinels, number-guard, briefer, you
src/close.ts            runClose()
src/report/lanes.ts     ASCII lane chart
src/cli.ts              npm run demo
src/server.ts           npm start
tools/generate-documents.ts, tools/layouts.ts   npm run gen
web/index.html, web/app.js, web/style.css
tests/*.test.ts, tests/helpers/{scenario,harness}.ts
```

---

### Task 1: Foundation: types, money, config, runtime, events, logging

**Files:**
- Create: `src/types.ts`, `src/money.ts`, `src/config.ts`, `src/runtime.ts`, `src/events.ts`, `src/logging.ts`, `.env.example` (exists), `tests/helpers/scenario.ts`
- Test: `tests/foundation.test.ts` (keep `tests/smoke.test.ts`)

**Interfaces:**
- Produces: everything below; later tasks import these names unchanged.

```ts
// src/types.ts (contract; extend, do not rename)
export type Minor = number
export type SourceRef = { docId: string; page: number; line: number } | { factId: string }
export type DocKind = "statement" | "cheque_register" | "payment_plan" | "card_terms" | "fx_rates" | "unsupported"
export type DocStatus = "received" | "verified" | "rejected" | "quarantined" | "processed" | "unsupported"
export interface PageLines { page: number; lines: string[] }
export interface Doc { id: string; file: string; kind: DocKind; pages: PageLines[]; status: DocStatus; assignee?: string; attempts: number; reason?: string }
export interface PrintedAmount { text: string; source: string }            // text exactly as printed; source "p1:l6"
export interface PrintedDate { text: string; iso: string; source: string }
export type ControlName = "opening" | "closing" | "totalDebits" | "totalCredits" | "previousBalance"
  | "paymentsAndCredits" | "purchases" | "financeCharges" | "newBalance" | "minimumDue"
export interface ExtractionArgs {
  docId: string
  currency: string                                               // ISO 4217 code as printed, e.g. "AED", "EUR"
  account: { bank: string; product: "current" | "credit_card"; last4: string; holder: string }
  period: { from: string; to: string }
  controls: Partial<Record<ControlName, PrintedAmount>> & { dueDate?: PrintedDate }
  rows: { date: string; description: string; amount: PrintedAmount; direction: "debit" | "credit"; balance?: PrintedAmount; cardLast4?: string; derived?: boolean }[]
}
export interface Account { id: string; bank: string; kind: "current" | "card"; currency: string; last4: string; holder: string; name: string }
// Row sign: current accounts + money in, − money out. Cards + purchases and charges, − payments.
export interface Row { id: string; date: string; description: string; amountMinor: Minor; cardLast4?: string; derived?: boolean; source: SourceRef }
export interface Statement { id: string; accountId: string; kind: "current" | "card"; currency: string; period: { from: string; to: string }
  controls: Partial<Record<ControlName, { minor: Minor; source: SourceRef }>>; dueDate?: { iso: string; source: SourceRef }; rows: Row[]; attempts: number }
export interface Commitment { id: string; chequeNo: string; accountId: string; payee: string; amountMinor: Minor; currency: string; date: string; purpose: string; source: SourceRef }
export interface CardTerms { accountId: string; monthlyRatePct: string; minimumDuePct: string; lateFeeMinor: Minor; autopayFrom?: string; sources: SourceRef[] }
export interface Risk { id: string; type: "cheque_shortfall" | "autopay_shortfall" | "card_interest"; accountId: string; currency: string; date: string
  amountMinor: Minor; projectedBeforeMinor?: Minor; shortfallMinor?: Minor; fullMinor?: Minor; minimumMinor?: Minor; ref?: string }
export interface Claim { id: string; owner: string; riskId: string; priority: 1 | 2 | 3; fromAccount: string; to: string; amountFactId: string; requestedMinor: Minor; byDate: string; seq: number }
export interface Grant { claimId: string; grantedMinor: Minor; availableMinor: Minor; windowEnds: string; status: "granted" | "partial" | "refused"; reason?: string }
export interface Action { id: string; riskId: string; owner: string; claimIds: string[]; title: string; body: string; status: "proposed" | "superseded" | "approved" | "snoozed" }
export interface Span { agentId: string; loopId: string; start: number; end?: number }
export interface Metrics { participants: number; loops: number; peakLoops: number; peakInFlight: number; overlapMs: number
  rejections: number; quarantined: number; conflicts: number; bumps: number; blocked: number; failures: number; facts: number }
```

- `parsePrinted(text: string): { minor: Minor; credit: boolean }`, `formatMoney(minor: Minor, currency?: string): string` (`"6,400.00"`, or `"AED 6,400.00"` with a currency), `pctOf(minor: Minor, pct: string): Minor`, `convert(minor: Minor, rate: string): Minor` (half up), `neededIn(homeMinor: Minor, rate: string): Minor` (rounded up) in `src/money.ts`
- `type Mode = "anthropic" | "openai" | "compatible" | "offline"`; `interface Config { mode; model; fastModel; baseURL?; asOf; horizonDays; homeCurrency; buffers: Record<string, Minor>; maxInFlight; offlineLatencyMs; chaos; dataDir; port; closeTimeoutMs }`; `loadConfig(env?: NodeJS.ProcessEnv): Config` in `src/config.ts`
- `class HouseholdState extends RuntimeState { constructor(config: Config) }` with maps `documents, extractions, statements, accounts, commitments, cardTerms, transfers, categories, claims, grants, actions` (keyed by id), `facts: FactStore` (Task 7; a placeholder class until then), `forecast?: Forecast` (type from Task 5; `unknown` until then), `brief?: { markdown: string }`, `spans: Span[]`, `metrics: Metrics`, `config: Config`; `type Runtime = ReturnType<typeof defineRuntime<HouseholdState>>`; `createRuntime(): Runtime` in `src/runtime.ts`
- `type CfEventType` (every event in the design's event table plus `terms.added` and `agent.failed`); `emit(rt: Runtime, type: CfEventType, producerId: string, payload: object): void`; classes `On(type)`, `FromOther`, `ForMe` (payload `assignee` or `owner` equals the participant id) in `src/events.ts`
- `quietCloudWarning(): void`, `installCrashGuard(onError: (e: unknown) => void): void` in `src/logging.ts`
- `tests/helpers/scenario.ts` exports `golden` and `scenario` (parsed JSON; both use app account ids)

- [ ] **Step 1: Write the failing tests** in `tests/foundation.test.ts`

```ts
test("parsePrinted reads printed amounts", () => {
  assert.deepEqual(parsePrinted("3,200.00"), { minor: 320000, credit: false })
  assert.deepEqual(parsePrinted("11,687.15 CR"), { minor: 1168715, credit: true })
  assert.deepEqual(parsePrinted("-12,000.00"), { minor: 1200000, credit: true })
  assert.deepEqual(parsePrinted("AED 8,362.80"), { minor: 836280, credit: false })
  assert.deepEqual(parsePrinted("4311.74"), { minor: 431174, credit: false })
})
test("formatMoney, pctOf and conversions", () => {
  assert.equal(formatMoney(640000), "6,400.00"); assert.equal(formatMoney(-590000), "-5,900.00"); assert.equal(formatMoney(205189, "EUR"), "EUR 2,051.89")
  assert.equal(pctOf(412528, "3.25"), 13407); assert.equal(pctOf(508095, "3.25"), 16513)
  assert.equal(convert(425000, "4.2500"), 1806250); assert.equal(neededIn(872053, "4.2500"), 205189)
})
test("loadConfig picks the mode from keys", () => {
  assert.equal(loadConfig({}).mode, "offline")
  assert.equal(loadConfig({ ANTHROPIC_API_KEY: "x" }).model, "claude-sonnet-5-5")
  assert.equal(loadConfig({ OPENAI_API_KEY: "x" }).model, "gpt-5.5")
  assert.equal(loadConfig({ ANTHROPIC_API_KEY: "x", CFONE_OFFLINE: "1" }).mode, "offline")
  assert.equal(loadConfig({ CFONE_OPENAI_BASE_URL: "http://localhost:11434/v1", CFONE_MODEL: "local-model" }).mode, "compatible")
  assert.equal(loadConfig({}).asOf, "2026-11-05"); assert.equal(loadConfig({}).homeCurrency, "AED")
  assert.deepEqual(loadConfig({}).buffers, { AED: 50000, EUR: 10000 })
})
test("events reach matching participants and runtimes are independent", () => {
  const a = createRuntime(), b = createRuntime()
  a.initializeRuntime({ state: new HouseholdState(loadConfig({})) }); b.initializeRuntime({ state: new HouseholdState(loadConfig({})) })
  const seen: string[] = []
  const h = createHuman({ name: "H", capabilities: [], handlers: [{ specification: new On("close.requested"), processor: { apply: ({ event }) => { seen.push(event.type) } } }] })
  a.join(h); emit(a, "close.requested", h.getId(), { folder: "x" })
  assert.deepEqual(seen, ["close.requested"])
  assert.throws(() => emit(b, "close.requested", h.getId(), {}))         // h never joined runtime b
})
```

- [ ] **Step 2: Run** `npm test` and confirm the new tests fail on missing modules.
- [ ] **Step 3: Implement the modules.** `loadConfig` parses `CFONE_BUFFERS` (`AED=500.00,EUR=100.00`) into minor units and sets mode `compatible` when `CFONE_OPENAI_BASE_URL` is set (then `CFONE_MODEL` is required). Defaults: fast model `claude-haiku-4-5` (Anthropic) or `gpt-5.4-mini` (OpenAI), `maxInFlight` 6, `offlineLatencyMs` 300, `closeTimeoutMs` 180000, `dataDir` `data/synthetic`, `port` 3000, `chaos` from `CFONE_CHAOS=1`. `quietCloudWarning` wraps `console.warn` to print messages starting with `mozaik cloud: no API key` once. `installCrashGuard` registers `unhandledRejection` and `uncaughtException` handlers that call `onError` and keep the process alive.
- [ ] **Step 4: Run** `npm test && npm run typecheck`; expect all green.
- [ ] **Step 5: Commit** `feat: foundation types, money, config, runtime and events`

### Task 2: PDF and CSV to numbered lines; document kind

**Files:**
- Create: `src/pdf/lines.ts`, `src/pdf/detect.ts`
- Test: `tests/pdf.test.ts`

**Interfaces:**
- Consumes: `PageLines`, `DocKind` (Task 1)
- Produces: `readPdfLines(path: string): Promise<PageLines[]>`; `readTextLines(path: string): Promise<PageLines[]>` (one page, one line per text line); `parseRef(ref: string): { page: number; line: number }`; `formatRef(page: number, line: number): string`; `lineAt(pages: PageLines[], ref: string): string | undefined`; `lineHasAmount(pages: PageLines[], ref: string, printed: string): boolean`; `detectKind(lines: string[]): DocKind` (the first page's lines; never the bank name or file name)

- [ ] **Step 1: Write the failing tests.** Draw a one-page PDF with `pdfkit` in a temp folder (the layout of `docs/reference/pdf-lines-spike.ts`), then:

```ts
const pages = await readPdfLines(file)
assert.equal(pages[0].lines[5], "Finance charges  165.13")
assert.equal(lineAt(pages, "p1:l6"), "Finance charges  165.13")
assert.ok(lineHasAmount(pages, "p1:l14", "2,000.00 CR")); assert.ok(!lineHasAmount(pages, "p1:l3", "165.13"))
assert.deepEqual(parseRef("p2:l11"), { page: 2, line: 11 })
assert.equal(detectKind(["BANK B", "Credit card statement", "05 Oct 2026  COFFEE SHOP  42.00", "17 Oct 2026  ONLINE MARKETPLACE  318.40"]), "statement")
assert.equal(detectKind(["ANY OTHER BANK", "Monthly statement", "2026-10-03  RENT  -900.00", "2026-10-09  SALARY  2,500.00"]), "statement")
assert.equal(detectKind(["account,currency,holder,period_from,period_to,opening_balance,closing_balance", "Bank C current 7710,EUR,LUKA,2026-10-01,2026-10-31,4311.74,4250.00"]), "statement")
assert.equal(detectKind(["cheque_no,account,payee,amount,currency,date,purpose"]), "cheque_register")
assert.equal(detectKind(["date,base,quote,rate,source"]), "fx_rates")
assert.equal(detectKind(["Statement of intent", "no dated rows here"]), "unsupported")
assert.equal(detectKind(["HARBOUR GATE DEVELOPMENTS", "PAYMENT PLAN"]), "payment_plan")
assert.equal(detectKind(["CARD KEY FACTS (SYNTHETIC)"]), "card_terms")
assert.equal(detectKind(["hello"]), "unsupported")
```

- [ ] **Step 2: Run** `npm test` and confirm failures.
- [ ] **Step 3: Implement.** `detectKind` follows design decision 2 (content signals only; a PDF counts as a statement when its first lines mention a statement and at least two lines start with a date in `dd/mm/yyyy`, `d Mon yyyy` or `yyyy-mm-dd` form). `readPdfLines` follows the spike: `getDocumentProxy`, `getTextContent()` per page, drop empty items, group by `Math.round(transform[5])` within 2 pt, sort lines top to bottom and items by `transform[4]`, join trimmed items with two spaces. `lineHasAmount` compares after collapsing spaces; `printed` must appear as a whole token sequence. `readPdfLines` rejects on a corrupt file; callers treat that as `unsupported`.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: numbered lines from PDF and CSV, document kind detection`

### Task 3: Synthetic documents generator

**Files:**
- Create: `tools/generate-documents.ts`, `tools/layouts.ts`; output `data/synthetic/*` (committed)
- Test: `tests/generator.test.ts`

**Interfaces:**
- Consumes: `readPdfLines`, `readTextLines` (Task 2); `data/scenario/household.scenario.json`
- Produces: `generateDocuments(scenarioPath: string, outDir: string): Promise<string[]>`; the fourteen files listed in `docs/data-spec.md`

- [ ] **Step 1: Write the failing tests** (generate into a temp folder):

```ts
assert.equal(files.length, 14)
const fc = await readPdfLines(join(out, "bank-a-current-2026-10.pdf"))
assert.ok(fc[0].lines.includes("31/10/2026  CLOSING BALANCE  27,110.35"))
assert.ok(fc[0].lines.includes("Total debits  17,197.50  Total credits  30,000.00"))
assert.ok(fc[0].lines.includes("02/10/2026  CAR LOAN EMI 0091  3,200.00  11,107.85"))
const sc = await readPdfLines(join(out, "bank-b-card-2026-10.pdf"))
assert.equal(sc[0].lines[7], "Finance charges  165.13")                       // p1:l8
assert.equal(sc[0].lines.filter((l) => l.includes("165.13")).length, 1)       // not in the table
const su = await readPdfLines(join(out, "bank-b-current-2026-10.pdf"))
assert.equal(su[0].lines[7], "29 Oct 2026  FAMILY SUPPORT TRANSFER  -12,000.00  10,150.00")
const reg = await readTextLines(join(out, "cheque-register.csv"))
assert.equal(reg[0].lines.length, 10)                                           // header + 9 cheques
const kf = await readPdfLines(join(out, "card-key-facts.pdf"))
assert.ok(kf[0].lines.some((l) => l.includes("Bank B credit card") && l.includes("Monthly rate 3.25%")))
const c = await readTextLines(join(out, "bank-c-current-2026-10.csv"))
assert.equal(c[0].lines[1], "Bank C current 7710,EUR,LUKA,2026-10-01,2026-10-31,4311.74,4250.00")
assert.equal(c[0].lines[6], "2026-10-20,PHONE PLAN HOME,-19.99,4250.00")
const fx = await readTextLines(join(out, "fx-rates.csv"))
assert.equal(fx[0].lines[1], "2026-10-31,EUR,AED,4.2500,Sample rate for the synthetic demo")
// hygiene: no real bank names anywhere
for (const f of pdfs) for (const p of await readPdfLines(f)) for (const l of p.lines)
  assert.ok(!/\b(ADCB|Wio|Emirates NBD|FAB|Mashreq|HSBC|ENBD)\b/i.test(l), l)
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** statement layouts A to E, the payment plan, the key facts page, the cheque register and the rates file exactly as `docs/data-spec.md` shows (PDFs drawn one text call per column at fixed x positions, 13 pt line pitch, Helvetica 9 pt, page 2 with the fictional-bank line; CSV files plain, without thousands separators). Card statements list rows by date inside each cardholder section; Bank B current lists newest first with running balances computed from the opening.
- [ ] **Step 4: Run** `npm test`, then `npm run gen` and check `git status` shows fourteen files under `data/synthetic/`.
- [ ] **Step 5: Commit** `feat: synthetic household documents generator and generated data`

### Task 4: Source check, reconciliation gate and hint

**Files:**
- Create: `src/domain/reconcile.ts`, `tests/helpers/extractions.ts`
- Test: `tests/reconcile.test.ts`

**Interfaces:**
- Consumes: `ExtractionArgs`, `PageLines`, `parsePrinted`, `lineHasAmount`
- Produces: `sourceCheck(ex: ExtractionArgs, pages: PageLines[]): string[]` (failure messages naming the reference); `reconcile(ex: ExtractionArgs): { ok: boolean; diffMinor: Minor; firstBadRow?: number; failures: string[] }`; `findHint(diffMinor: Minor, pages: PageLines[], citedRefs: Set<string>): { ref: string; label: string } | undefined`. Test helper `extractionFromScenario(accountId: string, period: string, pages: PageLines[], opts?: { withDerived?: boolean }): ExtractionArgs` builds a correct extraction by locating each scenario row's line in the generated text.

- [ ] **Step 1: Write the failing tests** against `data/synthetic/`:

```ts
const sc = await readPdfLines("data/synthetic/bank-b-card-2026-10.pdf")
const tableOnly = extractionFromScenario("bank-b-card-5530", "2026-10", sc)
assert.deepEqual(sourceCheck(tableOnly, sc), [])
const r = reconcile(tableOnly); assert.equal(r.ok, false); assert.equal(r.diffMinor, 16513)
assert.deepEqual(findHint(16513, sc, citedRefs(tableOnly)), { ref: "p1:l8", label: "Finance charges" })
assert.equal(reconcile(extractionFromScenario("bank-b-card-5530", "2026-10", sc, { withDerived: true })).ok, true)
const fc = await readPdfLines("data/synthetic/bank-a-current-2026-10.pdf")
const good = extractionFromScenario("bank-a-current-4417", "2026-10", fc); assert.equal(reconcile(good).ok, true)
const flipped = structuredClone(good); flipped.rows[0].direction = "credit"
assert.equal(reconcile(flipped).diffMinor, 640000)                         // 2 × 3,200.00
const wrongRef = structuredClone(good); wrongRef.rows[0].amount.source = "p1:l3"
assert.match(sourceCheck(wrongRef, fc)[0], /p1:l3/)
const cc = await readTextLines("data/synthetic/bank-c-current-2026-10.csv")
const eur = extractionFromScenario("bank-c-current-7710", "2026-10", cc)
assert.equal(eur.currency, "EUR"); assert.equal(reconcile(eur).ok, true)
const broken = structuredClone(eur); broken.rows[1].amount.text = "3.52"
assert.equal(reconcile(broken).firstBadRow, 1)                           // the running balance breaks at row 2
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement.** Layout-independent rules. When every row carries a printed balance, each must equal the previous balance plus the signed amount; the first row that breaks the chain is `firstBadRow` (0-based). Current accounts: `opening + Σcredits − Σdebits − closing`; when `totalDebits`/`totalCredits` are present they must equal the sums. Cards: `previousBalance − Σcredits + Σdebits − newBalance`, where derived rows count as debits. `diffMinor` is the absolute difference. `findHint` scans every line for an amount equal to `diffMinor` whose reference is not cited by a row, and returns the line's leading words as the label.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: source check, reconciliation gate and hint`

### Task 5: Recurring detection and forecast

**Files:**
- Create: `src/domain/recurring.ts`, `src/domain/forecast.ts`
- Test: `tests/forecast.test.ts`

**Interfaces:**
- Consumes: `Statement`, `Commitment`, `CardTerms`, `Risk`, `Grant`, `Claim`
- Produces:
  - `interface Recurring { accountId: string; description: string; amountMinor: Minor; day: number; sources: SourceRef[] }`; `detectRecurring(statements: Statement[], accounts: Account[]): Recurring[]`; `isOwnMovement(row: Row, accounts: Account[]): boolean`
  - `interface Flow { date: string; amountMinor: Minor; kind: "recurring" | "cheque" | "autopay" | "planned"; label: string; ref?: string; estimated?: boolean; sources: SourceRef[] }`
  - `interface Rate { base: string; quote: string; date: string; rate: string; factId: string }`
  - `interface ForecastInput { asOf: string; horizonDays: number; homeCurrency: string; buffers: Record<string, Minor>; rates: Rate[]; statements: Statement[]; accounts: Account[]; commitments: Commitment[]; cardTerms: CardTerms[]; claims: Claim[]; grants: Grant[] }`
  - `interface Cover { riskId: string; accountId: string; currency: string; needMinor: Minor; freeMinor: Minor; rateFactId: string }`
  - `interface Forecast { version: number; start: string; end: string; flows: Record<string, Flow[]>; baseline: Record<string, Record<string, Minor>>; planned: Record<string, Record<string, Minor>>; risks: Risk[]; cover: Cover[]; fingerprint: string }` (series are in each account's own currency)
  - `buildForecast(input: ForecastInput, version: number): Forecast`; `incomeDates(accountId: string, recurring: Recurring[], from: string, to: string): string[]`

- [ ] **Step 1: Write the failing tests** (statements built from the scenario by a helper that mirrors verified statements):

```ts
const rec = detectRecurring(statements, accounts)
assert.deepEqual(rec.map((r) => [r.accountId, r.description, r.amountMinor, r.day]), golden.recurring.map((r) => [r.accountId, r.description, r.amountMinor, r.day]))   // 13 items
const f0 = buildForecast(input({ claims: [], grants: [] }), 1)
const byId = Object.fromEntries(f0.risks.map((r) => [r.id, r]))
assert.equal(byId["cheque-000234"].projectedBeforeMinor, 2160000); assert.equal(byId["cheque-000234"].shortfallMinor, 640000)
assert.equal(byId["cheque-000301"].shortfallMinor, 2256965)
assert.equal(byId["autopay-bank-a-card-8821-2027-01-28"].shortfallMinor, 684835)
assert.equal(byId["card-bank-b-card-5530-2026-11-20"].fullMinor, 631248); assert.equal(byId["card-bank-b-card-5530-2026-11-20"].minimumMinor, 31562)
const f3 = buildForecast(input(goldenFinal()), 2)                             // claims and grants from golden.grantsFinal
assert.equal(f3.risks.find((r) => r.id === "cheque-000301")?.shortfallMinor, 872053)
assert.equal(f3.risks.find((r) => r.id === "cheque-000234"), undefined)
assert.deepEqual(f3.cover.map(({ rateFactId, ...c }) => c), [{ riskId: "cheque-000301", accountId: "bank-c-current-7710", currency: "EUR", needMinor: 205189, freeMinor: 391978 }])
test("recurring day clamps to month end", () => { /* a day-31 item over asOf 2027-01-20, 45 days: flows on 2027-01-31 and 2027-02-28 */ })
test("same-day credits apply before debits", () => { /* salary and cheque on one day: balance before the cheque includes the salary */ })
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** the rules in design section 11, each account in its own currency with its own buffer. Recurring: the two latest statements per current account, rows not `isOwnMovement` (description names another household bank, or contains `CARD PAYMENT` or `CARD AUTOPAY`), normalised description (digits removed, spaces collapsed), same sign, ratio 0.85 to 1.15, day within 3; project the latest amount and day. Openings from the latest `closing` control. Card dues from the latest card statement's `newBalance` and `dueDate`; for a card whose terms have `autopayFrom`, later months use the integer mean of the last two new balances, `estimated: true`. Granted claims become `planned` flows (debit on `fromAccount`, credit on `to` when it is a current account) in `planned` only. Risks are computed on `planned`; `fingerprint` is a stable string of risk ids and amounts. Cover: for each cheque or autopay risk still short on `planned`, every current account in another currency with a rate to the risk's currency gets `needMinor = neededIn(shortfall, rate)` when its lowest planned balance from the day before the risk to the horizon end, minus its buffer, is at least that.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: recurring detection and 90-day forecast with risks`

### Task 6: Treasurer allocation

**Files:**
- Create: `src/domain/treasury.ts`
- Test: `tests/treasury.test.ts`

**Interfaces:**
- Consumes: `buildForecast`, `incomeDates`, `ForecastInput`, `Claim`, `Grant`
- Produces: `allocate(claims: Claim[], input: Omit<ForecastInput, "claims" | "grants">): Grant[]`; `diffGrants(prev: Grant[], next: Grant[]): { claimId: string; fromMinor: Minor; toMinor: Minor }[]`

- [ ] **Step 1: Write the failing tests:**

```ts
const g1 = allocate([rent, card], base)                   // rent: priority 1, 640000 by 2026-11-21; card: priority 3, 631248 by 2026-11-20
assert.equal(grantFor(g1, rent).grantedMinor, 640000); assert.equal(grantFor(g1, rent).availableMinor, 858720)
assert.equal(grantFor(g1, card).grantedMinor, 218720); assert.equal(grantFor(g1, card).status, "partial")
const g3 = allocate([rent, card, cardRest, property], base) // cardRest 412528 by 2026-11-25; property priority 1, 1616965 by 2027-01-14
assert.equal(grantFor(g3, cardRest).grantedMinor, 412528); assert.equal(grantFor(g3, property).grantedMinor, 744912)
assert.equal(grantFor(g3, property).windowEnds, "2027-01-25")
for (const order of permutations([rent, card, cardRest, property])) assert.deepEqual(allocate(order, base), g3)
assert.deepEqual(diffGrants(allocate([card], base), g1), [{ claimId: card.id, fromMinor: 631248, toMinor: 218720 }])
// buffer invariant: planned balance of the source account >= its buffer from each claim date to its window end
const cross = { ...property, id: "x", fromAccount: "bank-c-current-7710", requestedMinor: 100 }
assert.deepEqual(pick(grantFor(allocate([rent, card, cardRest, property, cross], base), cross), "status", "reason"), { status: "refused", reason: "different currencies" })
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** with this ordering, which the tests do not fully determine:

```ts
// A claim whose source and destination currencies differ is refused (reason "different currencies").
// Claims compete only inside the paycheck window of their source account.
// windowEnd(c) = first income date of c.fromAccount strictly after c.byDate.
// Sort by (windowEnd, priority, byDate, seq). For each claim, available =
//   max(0, min(planned balance of fromAccount over [byDate, windowEnd)) − buffer),
// granted = min(requested, available); apply the grant as planned flows before the next claim.
```

- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: paycheck-window allocation for competing claims`

### Task 7: Facts, rendering and the draft checker

**Files:**
- Create: `src/facts.ts`, `src/domain/guard.ts`
- Test: `tests/guard.test.ts`

**Interfaces:**
- Produces: `interface Fact { id: string; label: string; kind: "money" | "date" | "pct" | "rate" | "text"; value: number | string; currency?: string; sources: SourceRef[]; derivedFrom?: string[]; producer: string }` (money facts always carry `currency`); `class FactStore { put(f: Fact): void; get(id: string): Fact | undefined; has(id: string): boolean; list(prefix?: string): Fact[]; toPromptLines(prefix?: string): string[] }`; `render(text: string, facts: FactStore, accounts: Map<string, Account>): { plain: string; html: string; chips: { factId: string; text: string }[] }`; `renderAction(a: Action, facts: FactStore, accounts: Map<string, Account>): { plain: string; html: string }`; `checkDraft(text: string, facts: FactStore, opts?: { claimIds?: string[] }): { ok: true } | { ok: false; reason: string }`
- Fact id formats (used by every later task): `bal:<accountId>:<date>`, `fx:<base>:<quote>:<date>`, `home:<accountId>:<date>` (a balance in the home currency), `cover:<riskId>:<accountId>`, `stmt:<statementId>:<ControlName|dueDate>`, `cheque:<no>:amount`, `terms:<accountId>:<field>`, `position:have|owe|promised90`, `shortfall:<riskId>`, `before:<riskId>`, `full:<riskId>`, `minimum:<riskId>`, `available:<accountId>:<date>`, `grant:<claimId>`, `remainder:<claimId>`, `interest-est:<claimId>`

- [ ] **Step 1: Write the failing tests:**

```ts
facts.put({ id: "grant:C1", label: "Granted for cheque 000234", kind: "money", value: 640000, currency: "AED", sources: [{ factId: "shortfall:cheque-000234" }], producer: "treasurer" })
const out = render("Move {{F:grant:C1}} from {{A:bank-b-current-0263}} to {{A:bank-a-current-4417}} by {{D:2026-11-21}} so {{C:000234}} clears.", facts, accounts)
assert.equal(out.plain, "Move AED 6,400.00 from Bank B current ·0263 to Bank A current ·4417 by 21 Nov 2026 so cheque 000234 clears.")
assert.equal(out.chips[0].factId, "grant:C1")
facts.put({ id: "cover:cheque-000301:bank-c-current-7710", label: "Bank C can cover", kind: "money", value: 205189, currency: "EUR", sources: [{ factId: "fx:EUR:AED:2026-10-31" }], producer: "forecaster" })
assert.equal(render("{{F:cover:cheque-000301:bank-c-current-7710}}", facts, accounts).plain, "EUR 2,051.89")
assert.deepEqual(checkDraft("Move AED 6,400 by 21 Nov", facts), { ok: false, reason: "unsourced number \"6,400\"" })
assert.equal(checkDraft("Move {{F:nope}}", facts).ok, false)
assert.equal(checkDraft("Move {{F:grant:C1}} by {{D:2026-11-21}}", facts, { claimIds: ["C1"] }).ok, true)
assert.equal(checkDraft("Move {{F:grant:C1}}", facts, { claimIds: ["C2"] }).ok, false)    // grant of another claim
assert.equal(checkDraft("by {{D:2026-13-40}}", facts).ok, false)
assert.match(renderAction(action, facts, accounts).plain, /Not financial advice\.$/)
assert.equal(facts.toPromptLines("grant:")[0], "[F:grant:C1] Granted for cheque 000234 = AED 6,400.00")
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement.** `checkDraft` strips the four placeholder forms, then the first remaining digit run (with separators) becomes the reason; fact ids must exist; `{{D:}}` must be a real date; with `claimIds`, every `grant:` or `remainder:` fact must belong to those claims. Replace the placeholder fact store in `HouseholdState`.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: fact store, placeholder rendering and draft checker`

### Task 8: Inference layer

**Files:**
- Create: `src/inference/models.ts`, `src/inference/endpoint-runner.ts`, `src/inference/safe-runner.ts`
- Test: `tests/inference.test.ts`

**Interfaces:**
- Consumes: `Config`
- Produces: `modelsFor(config: Config): GenerativeModel[]` (`supportedModels`, plus a clone of the same provider's spec for any configured id that is missing, plus, in `compatible` mode, `config.model` on `new OpenAIChatCompletions(undefined, { baseURL: config.baseURL, apiKey })` with the `gpt-5.4-mini` spec renamed); `class EndpointRunner implements InferenceRunner { constructor(models: GenerativeModel[]) }`; `class SafeRunner implements InferenceRunner { constructor(inner: InferenceRunner, opts: { maxInFlight: number; retries: number; baseDelayMs: number; onFailure: (input: InferenceInput, error: unknown) => void; onInFlight?: (n: number) => void }) }`

- [ ] **Step 1: Write the failing tests:**

```ts
test("retries a flaky runner", async () => { /* inner throws twice then returns a ModelMessageItem; run() resolves with it; inner called 3 times */ })
test("returns AGENT_ERROR after the last retry", async () => {
  // inner always throws "529 overloaded"; output.items[0] is a ModelMessageItem whose text starts with "AGENT_ERROR: 529 overloaded"; onFailure called once
})
test("caps in-flight inferences", async () => { /* maxInFlight 2; five parallel run() calls on an inner that waits 30 ms; peak reported by onInFlight is 2 */ })
test("EndpointRunner finds built-in Claude models", () => { /* modelsFor(loadConfig({ ANTHROPIC_API_KEY: "x" })) contains "claude-sonnet-5-5" and "claude-haiku-4-5" */ })
test("a local OpenAI-compatible model is registered", () => {
  const m = modelsFor(loadConfig({ CFONE_OPENAI_BASE_URL: "http://localhost:11434/v1", CFONE_MODEL: "local-model" }))
  assert.ok(m.some((x) => x.specification.name === "local-model" && x.endpoint instanceof OpenAIChatCompletions))
})
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement.** `EndpointRunner.run` finds the model by `specification.name` and calls `endpoint.infer(input)`; `stream` yields `SemanticEvent.create("inference.output", input.model, await this.run(input))`. `SafeRunner` uses a counting semaphore, backoff `baseDelayMs * 2 ** attempt` plus up to 25% jitter, defaults `retries: 2`, `baseDelayMs: 800`; failure output is `{ items: [ModelMessageItem.rehydrate({ text: "AGENT_ERROR: " + message })], tokenUsage: undefined, rowResponse: { error: true } }`.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: endpoint runner and safe runner with retries and concurrency cap`

### Task 9: Agent kit, Observer, Coordinator

**Files:**
- Create: `src/agents/kit.ts`, `src/agents/observer.ts`, `src/agents/coordinator.ts`, `src/agents/you.ts`, `src/inference/offline-runner.ts` (role dispatch only), `tests/helpers/harness.ts`
- Test: `tests/kit.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 7, 8
- Produces:
  - `interface Ctx { rt: Runtime; state: HouseholdState; config: Config }`
  - `startLoop(ctx: Ctx, agent: Agent, task: string, opts?: { model?: string; maxOutputTokens?: number; intercept?: InterceptionHandler }): void` (fresh context, default `maxOutputTokens` 4000, model `config.model`)
  - `roleInstruction(role: "reader" | "clerk" | "categoriser" | "cash-sentinel" | "card-sentinel" | "briefer", body: string): string` (first line `ROLE=<role>`, read by the offline runner)
  - `tool<A>(name: string, description: string, parameters: object, invoke: (args: A) => Promise<unknown>): Tool` (`strict: false`)
  - `class OneAtATime { constructor(run: () => void); trigger(): void; settle(): void }` (run now if idle, else mark dirty and run once on `settle()`)
  - `codeParticipant(name: string, handlers: SituationHandler[]): Agent` (an agent that never starts loops)
  - `createObserver(ctx: Ctx, sink?: (e: SemanticEvent) => void): Human`: spans from `inference.started` (first per `loopId`) to `model.answer`; metrics; emits `close.settled` once when no loop is open, every statement doc is terminal, and the forecast version is unchanged for 750 ms; emits `close.completed` with metrics on `brief.published`; writes `out/events.jsonl` when `CFONE_RECORD=1`
  - `createCoordinator(ctx: Ctx, spawnReader: (doc: Doc) => Agent, clerkId: () => string): Agent`: on `close.requested { folder }` reads every file (sorted), detects the kind, stores the `Doc`, joins a reader per statement and emits `document.received { docId, kind, assignee }`; cheque registers, payment plans and card terms go to the clerk; `fx_rates` files are parsed by the Coordinator itself into `fx:<base>:<quote>:<date>` facts (kind `rate`, source: the CSV line) and announced with `rates.added`; unreadable or unknown files get status `unsupported`
  - `createYou(ctx: Ctx): Human` (emits `close.requested`, `action.approved`, `action.snoozed`)
  - `class OfflineRunner implements InferenceRunner { constructor(opts: { latencyMs: number; chaos: boolean }) }` dispatching on `ROLE=` to policies in `src/inference/offline/*.ts` (added by later tasks; unknown role returns a model message "no policy")
  - `startHarness(opts: { participants: (ctx: Ctx) => Participant[]; runner?: InferenceRunner }): { ctx; you: Human; waitFor(type: CfEventType, n?: number, timeoutMs?: number): Promise<SemanticEvent[]>; events: SemanticEvent[] }`

- [ ] **Step 1: Write the failing tests:**

```ts
test("parallel loops overlap and use fresh contexts", async () => {
  // two agents, a stub runner that waits 40 ms and answers; startLoop on both at once
  // await two model.answer events; assert ctx.state.metrics.peakLoops >= 2
  // assert agent.getMemory().getContext().getItems().length === 1 (only the instruction)
})
test("unknown file is unsupported and close settles", async () => {
  // temp folder: two generated statement PDFs + notes.txt ("hello") + empty.pdf (0 bytes)
  // emit close.requested; documents: 2 statements received, notes and empty marked unsupported
  // with readers that never start (stub spawnReader returning code participants), close.settled is still emitted
})
test("the synthetic folder is routed by content", async () => {
  // emit close.requested on data/synthetic: 10 document.received with kind "statement" (8 PDF, 2 CSV), 3 for the clerk
  assert.equal(h.ctx.state.facts.get("fx:EUR:AED:2026-10-31")?.value, "4.2500")
  assert.deepEqual(h.ctx.state.facts.get("fx:EUR:AED:2026-10-31")?.sources, [{ docId: "fx-rates", page: 1, line: 2 }])
})
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** the modules. `startLoop` follows `docs/mozaik-notes.md` (fresh `ModelContext` with the agent's developer message). The Observer increments `peakInFlight` through `SafeRunner.onInFlight`, wired in Task 15.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: agent kit, observer and coordinator`

### Task 10: Readers and the Auditor

**Files:**
- Create: `src/agents/reader.ts`, `src/agents/auditor.ts`, `src/inference/offline/reader.ts`
- Test: `tests/reader-auditor.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 7, 9
- Produces: `createReader(ctx: Ctx, doc: Doc): Agent` with tool `submit_extraction(args: ExtractionArgs)`; `createAuditor(ctx: Ctx): Agent`. On `statement.verified` the Auditor has stored the `Statement`, registered the `Account` (id rule from the data spec, name like `Bank B current ·0263`) and put facts `bal:<accountId>:<period.to>` (current accounts) and `stmt:<statementId>:<control>` for every control plus `dueDate`, each sourced to its line.

- [ ] **Step 1: Write the failing tests** (offline harness on `data/synthetic/`, latency 20 ms):

```ts
const verified = await h.waitFor("statement.verified", 10, 10000)
assert.equal(verified.length, 10)
const rejected = h.events.filter((e) => e.type === "statement.rejected")
assert.deepEqual(rejected.map((e) => e.payload.docId).sort(), ["bank-b-card-2026-09", "bank-b-card-2026-10"])
assert.ok(rejected.every((e) => e.payload.hint.includes("Finance charges")))
assert.equal(h.ctx.state.facts.get("bal:bank-a-current-4417:2026-10-31")?.value, 2711035)
assert.equal(h.ctx.state.facts.get("stmt:bank-b-card-5530:2026-10:newBalance")?.value, 631248)
assert.equal(h.ctx.state.facts.get("bal:bank-c-current-7710:2026-10-31")?.value, 425000)
assert.equal(h.ctx.state.facts.get("bal:bank-c-current-7710:2026-10-31")?.currency, "EUR")
assert.equal(h.ctx.state.metrics.rejections, 2); assert.equal(h.ctx.state.metrics.quarantined, 0)
test("reader failure quarantines the document", async () => {
  // runner = SafeRunner(OfflineRunner) whose inner throws for the reader of bank-a-card-2026-10 (match on doc id in the task text)
  // process stays alive; doc status "quarantined", reason "reader failed"; 9 verified; close.settled emitted
})
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement.**
  - Reader instruction (live prompt): any layout and file type; report the currency code as printed; copy amounts exactly as printed with their `p:l` reference, and the running balance when a row shows one; one row per table line; direction from the running balance for current accounts, from `CR` or a leading minus for cards; controls from the summary or header lines; never compute totals; when the task carries `HINT ref=<ref>`, add that line as a row with `derived: true`. The task text is the numbered document (`p1:l1  ...`) plus `docId`.
  - Offline reader policy (a generic table reader, honest about its limits): rows are lines that start with a date (`dd/mm/yyyy`, `d Mon yyyy` or `yyyy-mm-dd`, comma-separated for CSV) and end with one or two amounts; the currency comes from a three-letter code in the header lines; balance-forward and closing lines become controls; summary labels it knows (`Previous balance`, `Payments and credits`, `Purchases`, `Purchases and debits`, `New balance`, `Minimum amount due`, `Minimum payment due`, `Payment due date`, `Opening balance`, `Closing balance`, `Total debits`) become controls; other summary lines are ignored, so summary-only charges are missed until a hint names them.
  - Auditor: on `extraction.submitted`, run `sourceCheck`, then `reconcile`; verified → store and emit; failed with attempts < 3 → `statement.rejected { docId, assignee, diffMinor, hint, attempt }` where the hint reads `difference <amount> equals '<label>' on <ref>` (or the first failure message); otherwise quarantine. `agent.failed` for a reader quarantines its document.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: concurrent readers with auditor gate and hinted re-reads`

### Task 11: Clerk

**Files:**
- Create: `src/agents/clerk.ts`, `src/inference/offline/clerk.ts`
- Test: `tests/clerk.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 7, 9
- Produces: `createClerk(ctx: Ctx): Agent` with tools `add_commitment({ docId, chequeNo, account, payee, amount: PrintedAmount, date: PrintedDate, purpose })`, `add_card_terms({ docId, card, monthlyRatePct, minimumDuePct, lateFee: PrintedAmount, autopayFrom?, source })`, `flag({ docId, reason, sources })`, `finish_document({ docId })`. One loop per document, started concurrently. Each tool checks the printed values appear on the cited line, derives account ids from bank name, kind and last four, stores the record, puts facts (`cheque:<no>:amount`, `terms:<accountId>:monthlyRatePct|minimumDuePct|lateFee|autopayFrom`) and emits `commitment.added`, `terms.added` or `commitment.flagged`.

- [ ] **Step 1: Write the failing tests** (offline harness, coordinator plus clerk):

```ts
assert.equal(h.ctx.state.commitments.size, 9)
assert.deepEqual([...h.ctx.state.commitments.values()].filter((c) => c.date >= "2026-11-05" && c.date <= "2027-02-03").map((c) => c.chequeNo), ["000234", "000301"])
assert.equal(h.ctx.state.facts.get("cheque:000234:amount")?.value, 2750000)
assert.ok([...h.ctx.state.commitments.values()].every((c) => c.currency === "AED"))
const flags = h.events.filter((e) => e.type === "commitment.flagged"); assert.equal(flags.length, 1); assert.match(flags[0].payload.reason, /handover/i)
assert.equal(h.ctx.state.facts.get("terms:bank-b-card-5530:monthlyRatePct")?.value, "3.25")
assert.equal(h.ctx.state.facts.get("terms:bank-a-card-8821:autopayFrom")?.value, "bank-a-current-4417")
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** the agent and the offline policy (CSV rows to commitments; plan lines compared with the register by date and amount, flagging instalments with no cheque; key-facts lines to terms).
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: clerk turns cheques, plan and key facts into sourced commitments`

### Task 12: Forecaster

**Files:**
- Create: `src/agents/forecaster.ts`
- Test: `tests/forecaster.test.ts`

**Interfaces:**
- Consumes: Tasks 5, 7, 9, 10, 11
- Produces: `createForecaster(ctx: Ctx): Agent`. Reacts to `statement.verified`, `commitment.added`, `terms.added`, `rates.added`, `reservation.changed`, `action.approved`; debounces 150 ms; stores `state.forecast`; puts `home:<accountId>:<date>` for balances in another currency, `position:have|owe|promised90` in the home currency (a balance without a rate is left out and listed in the fact's label as missing), `cover:<riskId>:<accountId>` per cover suggestion, and per risk `shortfall:`, `before:`, `full:`, `minimum:` facts with sources (opening line, recurring rows, cheque line or card statement lines); emits `forecast.updated { version, riskFingerprint }` only when the fingerprint or the planned series changed.

- [ ] **Step 1: Write the failing tests** (offline harness through statements and clerk):

```ts
await h.waitFor("close.settled")
assert.equal(f("position:have"), 5532285); assert.equal(f("position:owe"), 1918273); assert.equal(f("position:promised90"), 6350000)
assert.equal(f("home:bank-c-current-7710:2026-10-31"), 1806250)
assert.ok(h.ctx.state.facts.get("position:have")!.derivedFrom!.includes("fx:EUR:AED:2026-10-31"))
assert.equal(f("shortfall:cheque-000234"), 640000)
const src = h.ctx.state.facts.get("shortfall:cheque-000234")!.sources
assert.ok(src.some((s) => "docId" in s && s.docId === "bank-a-current-2026-10"))
assert.ok(src.some((s) => "docId" in s && s.docId === "cheque-register"))
assert.equal(f("full:card-bank-b-card-5530-2026-11-20"), 631248)
test("missing rate is excluded, not assumed", async () => {
  // same run without fx-rates.csv in the folder: position:have = 3726035, its label names EUR as missing, and no cover: facts exist
})
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** the agent around `buildForecast`.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: forecaster publishes sourced position, risks and shortfalls`

### Task 13: Treasurer, sentinels and the Number Guard

**Files:**
- Create: `src/agents/treasurer.ts`, `src/agents/sentinels.ts`, `src/agents/number-guard.ts`, `src/inference/offline/sentinels.ts`
- Test: `tests/sentinels.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 7, 9, 12
- Produces:
  - `createTreasurer(ctx: Ctx): { participant: Agent; reserve(args: { riskId: string; fromAccount: string; to: string; amountFactId: string; byDate: string }, owner: string): { claimId: string; status: Grant["status"]; grantFactId: string; remainderFactId?: string; availableFactId: string; windowEnds: string } }`. Priority from the risk type (cheque 1, autopay 2, card 3). Re-runs `allocate` over all claims, stores grants, puts `grant:`, `remainder:`, `available:` and, for card claims, `interest-est:` facts (`pctOf(remainder, terms monthly rate)`), emits `reservation.changed` when any grant changed and `reservation.bumped { claimId, owner, fromMinor, toMinor }` per decreased grant. A claim whose grant is lower than requested counts as a conflict in metrics.
  - `createCashSentinel(ctx, treasurer)`, `createCardSentinel(ctx, treasurer)`: agents with tools `get_risks()`, `get_facts({ prefix })`, `reserve_funds(args)`, `propose_action({ riskId, claimIds, title, body })`; triggered by `forecast.updated` when the fingerprint of their risk types changed, and by `reservation.bumped` addressed to them; one loop at a time (`OneAtATime`); loops run with `new NumberGuard(ctx, agentId)`.
  - `class NumberGuard implements InterceptionHandler { constructor(ctx: Ctx, agentId: string) }` guarding `propose_action` and `publish_brief` with `checkDraft` (`claimIds` from the call); a block emits `guard.blocked { agentId, tool, reason }` and returns `BLOCKED: <reason>. Use placeholders only.` to the model.
  - `propose_action` stores the action keyed by risk (superseding earlier ones) and emits `action.proposed`.

- [ ] **Step 1: Write the failing tests** (offline harness, all participants except the Briefer):

```ts
await h.waitFor("close.settled")
const grant = (riskId: string, byDate: string) => /* grant of the claim with this risk and date */
assert.equal(grant("cheque-000234", "2026-11-21").grantedMinor, 640000)
assert.equal(grant("card-bank-b-card-5530-2026-11-20", "2026-11-20").grantedMinor, 218720)
assert.equal(grant("card-bank-b-card-5530-2026-11-20", "2026-11-25").grantedMinor, 412528)
assert.equal(grant("cheque-000301", "2027-01-14").grantedMinor, 744912)
assert.equal(f("interest-est:" + cardRestClaimId), 13407)
assert.equal(f("cover:cheque-000301:bank-c-current-7710"), 205189)
const live = [...h.ctx.state.actions.values()].filter((a) => a.status === "proposed")
assert.deepEqual(live.map((a) => a.riskId).sort(), ["card-bank-b-card-5530-2026-11-20", "cheque-000234", "cheque-000301"])
assert.ok(live.every((a) => checkDraft(a.title + " " + a.body, h.ctx.state.facts).ok))
assert.ok(h.ctx.state.metrics.conflicts >= 1)
assert.ok(live.find((a) => a.riskId === "cheque-000301")!.body.includes("{{F:cover:cheque-000301:bank-c-current-7710}}"))
test("chaos draft is blocked then fixed", async () => {
  // OfflineRunner({ chaos: true }): each sentinel's first propose_action writes "AED 6,400"
  // guard.blocked count >= 1; the same three risks end with proposed actions; no rendered action contains a digit outside the rendered facts
})
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement.** Offline sentinel policies, in order of tool calls: `get_risks` → for each own risk without a live action: `reserve_funds` (cash: from the current account in the same currency with the most free cash, other than the risk's own, `byDate` one day before the risk date, amount `shortfall:<riskId>`; card: from the card's paying account, by the due date, amount `full:<riskId>`) → on `partial` for a card, `reserve_funds` for `remainder:<claimId>` on the paying account's next income date → on `partial` for a cheque, propose a heads-up naming the uncovered `remainder:` fact and, when a `cover:<riskId>:<accountId>` fact exists, that account and amount → `propose_action` with placeholder text such as `Move {{F:grant:C1}} from {{A:bank-b-current-0263}} to {{A:bank-a-current-4417}} by {{D:2026-11-21}} so {{C:000234}} clears.` Live prompts carry the same rules plus: write amounts only as fact placeholders; if no free cash is left, propose a heads-up instead of claiming again.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: treasurer arbitration, cash and card sentinels, number guard`

### Task 14: Categoriser and Matcher

**Files:**
- Create: `src/domain/match.ts`, `src/agents/matcher.ts`, `src/agents/categoriser.ts`, `src/inference/offline/categoriser.ts`
- Test: `tests/match-categorise.test.ts`

**Interfaces:**
- Consumes: Tasks 9, 10
- Produces: `interface TransferPair { id: string; out: string; in: string; amountMinor: Minor; kind: "transfer" | "card_payment" }`; `matchTransfers(statements: Statement[]): TransferPair[]` (equal and opposite amounts across own accounts within 3 days; candidates sorted by date distance, then by kind fit; each row used once); `createMatcher(ctx)` (on `statement.verified`, emits `transfer.matched`); `createCategoriser(ctx)` with tool `assign_categories({ statementId, items: { rowId, category, confidence }[] })` over the fixed list in design section 19, using `config.fastModel`.

- [ ] **Step 1: Write the failing tests:**

```ts
const pairs = matchTransfers(verifiedStatements)
assert.equal(pairs.length, 5)
assert.ok(pairs.some((p) => p.kind === "card_payment" && p.amountMinor === 200000 && p.out.startsWith("bank-b-current-0263:2026-10") && p.in.startsWith("bank-b-card-5530:2026-10")))
assert.ok(pairs.some((p) => p.kind === "transfer" && p.amountMinor === 200000 && p.in.startsWith("bank-a-current-4417:2026-10")))
// categoriser (offline): every verified row has a category from the list; "FAMILY SUPPORT TRANSFER" → "family support"; "ELECTRICITY AND WATER BILL" → "utilities and telecom"; "INSURANCE PREMIUM" → "insurance"
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** both participants and the keyword policy.
- [ ] **Step 4: Run** `npm test`; expect green.
- [ ] **Step 5: Commit** `feat: transfer matcher and categoriser`

### Task 15: Briefer, runClose and the CLI

**Files:**
- Create: `src/agents/briefer.ts`, `src/inference/offline/briefer.ts`, `src/close.ts`, `src/report/lanes.ts`, `src/cli.ts`
- Test: `tests/close.e2e.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: `createBriefer(ctx)` (on `close.settled`; tools `get_facts`, `publish_brief({ markdown })` behind the Number Guard; emits `brief.published`); `interface CloseResult { state: HouseholdState; metrics: Metrics; brief?: { plain: string; html: string }; actions: { plain: string; html: string; id: string }[]; durationMs: number; timedOut: boolean }`; `runClose(opts: { config: Config; onEvent?: (e: SemanticEvent) => void; runner?: InferenceRunner; folder?: string }): Promise<CloseResult>`; `laneChart(spans: Span[], names: Map<string, string>, width?: number): string`

- [ ] **Step 1: Write the failing tests:**

```ts
const r = await runClose({ config: loadConfig({ CFONE_OFFLINE: "1", CFONE_OFFLINE_LATENCY_MS: "20" }) })
assert.equal(r.timedOut, false)
for (const s of ["55,322.85", "19,182.73", "63,500.00", "EUR 2,051.89", "Not financial advice."]) assert.ok(r.brief!.plain.includes(s), s)
assert.equal(r.actions.length, 3)
assert.ok(r.metrics.peakLoops >= 11); assert.equal(r.metrics.rejections, 2); assert.equal(r.metrics.blocked, 0)
assert.ok(r.metrics.participants >= 22)
test("two closes in one process", async () => { /* a second runClose resolves with the same three actions */ })
test("cli prints the metrics line", async () => {
  // spawn `npx tsx src/cli.ts` with CFONE_OFFLINE=1; exit code 0; stdout matches /peak concurrent loops: \d+/ and /Not financial advice\./
})
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement.** `runClose`: `createRuntime()`, a new `HouseholdState`, `SafeRunner` over `OfflineRunner` (offline) or `EndpointRunner(modelsFor(config))`, `initializeRuntime`, join You, Observer, Coordinator, Auditor, Clerk, Categoriser, Matcher, Forecaster, Treasurer, both Sentinels, Briefer (readers join as the Coordinator spawns them), emit `close.requested { folder }`, resolve on `close.completed` or after `closeTimeoutMs`. CLI: `quietCloudWarning()`, `installCrashGuard()`, one log line per notable event (`✓ verified`, `✗ rejected <hint>`, `⇄ bumped`, `⛔ blocked`), then the lane chart, the brief, the actions, and the line `peak concurrent loops: N · LLM loops: N · rejections caught: N · conflicts settled: N · drafts blocked: N · facts: N`. Exit code 0 unless timed out.
- [ ] **Step 4: Run** `npm test`, then `CFONE_OFFLINE=1 npm run demo` and read the output end to end.
- [ ] **Step 5: Commit** `feat: briefer, runClose and terminal demo`

### Task 16: Web server and page

**Files:**
- Create: `src/server.ts`, `web/index.html`, `web/app.js`, `web/style.css`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `runClose`, `render`, `renderAction`
- Produces: `createServer(config: Config): import("node:http").Server`. Routes: `GET /`, `GET /app.js`, `GET /style.css`; `POST /api/close` → 202 `{ runId }` or 409 while a close runs; `GET /api/events` (server-sent events: `{ type, producer, at, payload }` with ids only); `GET /api/state` (position, facts, rendered actions, forecast series and risks, metrics, spans); `GET /api/doc/:docId` (numbered lines); `POST /api/actions/:id/approve` and `/snooze`.

- [ ] **Step 1: Write the failing tests:**

```ts
// server on port 0, CFONE_OFFLINE=1, latency 20
assert.equal((await get("/")).status, 200); assert.match(await (await get("/")).text(), /Not financial advice/)
assert.equal((await post("/api/close")).status, 202)
assert.equal((await post("/api/close")).status, 409)                      // second POST while running
await sseUntil("/api/events", "close.completed", 15000)
const doc = await (await get("/api/doc/bank-b-card-2026-10")).json(); assert.equal(doc.pages[0].lines[7], "Finance charges  165.13")
const before = (await (await get("/api/state")).json()).forecast.version
await post(`/api/actions/${firstActionId}/approve`)
// within 1 s: the action shows approved and forecast.version > before
```

- [ ] **Step 2: Run** `npm test`; confirm failures.
- [ ] **Step 3: Implement** the server and the page from the sketch in design section 15: header with mode badge and "Not financial advice"; position tiles with source chips; swarm lanes drawn from spans as events arrive; radar as inline SVG (one line per current account, planned dashed, risk markers); actions with Approve and Snooze; a drawer that shows the cited lines from `/api/doc/:docId` with the cited line highlighted. Works at 390 px wide.
- [ ] **Step 4: Run** `npm test`; then `CFONE_OFFLINE=1 npm start`, open `http://localhost:3000`, run a close, take two screenshots (desktop and 390 px) into `docs/img/`.
- [ ] **Step 5: Commit** `feat: live page with swarm lanes, radar, sourced actions and approvals`

### Task 17: Live-model run and prompt hardening

**Files:**
- Modify: prompts in `src/agents/*.ts` as needed
- Create: `docs/runs/2026-11-27-live.md`

- [ ] **Step 1:** Run `ANTHROPIC_API_KEY=... npm run demo`. Expected: 10 statements verified (re-reads allowed), 3 proposed actions, the brief contains the three position figures, `drafts blocked` is whatever happened, no crash.
- [ ] **Step 2:** For every failure, fix the prompt or the tool description, not the checks. Re-run until two consecutive runs pass. Repeat once with `OPENAI_API_KEY` if available.
- [ ] **Step 3:** Record the metrics line, duration, the lane chart and a screenshot in `docs/runs/2026-11-27-live.md`. Optional: `MOZAIK_API_KEY` run with `MOZAIK_REDACTION=content`, link the Mozaik Cloud session.
- [ ] **Step 4: Commit** `chore: live run notes and prompt fixes`

### Task 18: README, submission and deck numbers

**Files:**
- Modify: `README.md`, `docs/submission.md`, `docs/demo-script.md`

- [ ] **Step 1:** Fill the README placeholders with the measured numbers from Task 17 and the screenshots from Task 16. Keep the sections: what it does, run it, how the agents run concurrently, the checks, care with data, judging map, limits.
- [ ] **Step 2:** On a clean clone: `npm ci && npm test && CFONE_OFFLINE=1 npm run demo`; expect green and the metrics line.
- [ ] **Step 3:** Paste `docs/submission.md` into the submission form; update the deck's demo numbers to the recorded run.
- [ ] **Step 4: Commit** `docs: README, submission text and run numbers`

### Stretch (only after Task 18)

- **S1 Second reader:** a layout-aware rule reader per statement (`src/agents/rule-reader.ts`) next to the LLM reader; the Auditor records agreement (2/2 or 1/2). Test: all ten statements show 2/2 after re-reads.
- **S2 Ask CFOne:** a question fans out to ledger, commitments and cards analysts in parallel; the Briefer answers with facts only behind the Number Guard.
- **S3 Mozaik Cloud view:** document `npx @mozaik-ai/cloud-sdk pair` and show the live session in the demo.
- **S4 Video:** a 90-second screen recording of a live run for the gallery.
