import { test } from "node:test"
import assert from "node:assert/strict"
import { detectRecurring, isOwnMovement } from "../src/domain/recurring.ts"
import { buildForecast, incomeDates, type ForecastInput } from "../src/domain/forecast.ts"
import type { Account, Row, Statement } from "../src/types.ts"
import { baseInput, goldenFinal, verifiedHousehold } from "./helpers/household.ts"
import { golden } from "./helpers/scenario.ts"

test("verified statements carry ids, currencies and signed rows", async () => {
	const { statements, accounts } = await verifiedHousehold()
	assert.deepEqual(accounts.map((a) => a.id), ["bank-a-current-4417", "bank-a-card-8821", "bank-b-current-0263", "bank-b-card-5530", "bank-c-current-7710"])
	assert.equal(accounts.find((a) => a.id === "bank-b-current-0263")!.name, "Bank B current ·0263")
	const s = statements.find((x) => x.id === "bank-a-current-4417:2026-10")!
	assert.equal(s.controls.closing!.minor, 2711035)
	assert.equal(s.rows[0]!.amountMinor, -320000)
	assert.deepEqual(s.rows[0]!.source, { docId: "bank-a-current-2026-10", page: 1, line: 7 })
	const c = statements.find((x) => x.id === "bank-b-card-5530:2026-10")!
	assert.equal(c.dueDate!.iso, "2026-11-20")
	assert.equal(c.rows.find((r) => r.description === "PAYMENT - THANK YOU")!.amountMinor, -200000)
	assert.equal(statements.find((x) => x.id === "bank-c-current-7710:2026-10")!.currency, "EUR")
})

test("recurring items match the golden list", async () => {
	const { statements, accounts } = await verifiedHousehold()
	const rec = detectRecurring(statements, accounts)
	assert.deepEqual(rec.map((r) => [r.accountId, r.description, r.amountMinor, r.day]), golden.recurring.map((r: { accountId: string; description: string; amountMinor: number; day: number }) => [r.accountId, r.description, r.amountMinor, r.day]))
	assert.equal(rec.length, 13)
	assert.ok(rec.every((r) => r.sources.length === 2))
	const row = (description: string): Row => ({ id: "x", date: "2026-10-01", description, amountMinor: -1, source: { factId: "x" } })
	assert.ok(isOwnMovement(row("TRANSFER FROM BANK B"), accounts))
	assert.ok(isOwnMovement(row("BANK A CARD AUTOPAY"), accounts))
	assert.ok(!isOwnMovement(row("FRESH MART GROCERY"), accounts))
})

test("baseline forecast raises the golden risks", async () => {
	const f0 = buildForecast({ ...(await baseInput()), claims: [], grants: [] }, 1)
	assert.equal(f0.start, "2026-11-01")
	assert.equal(f0.end, "2027-02-03")
	const byId = Object.fromEntries(f0.risks.map((r) => [r.id, r]))
	assert.deepEqual(Object.keys(byId).sort(), golden.risksBaseline.map((r: { id: string }) => r.id).sort())
	assert.equal(byId["cheque-000234"]!.projectedBeforeMinor, 2160000)
	assert.equal(byId["cheque-000234"]!.shortfallMinor, 640000)
	assert.equal(byId["cheque-000301"]!.shortfallMinor, 2256965)
	assert.equal(byId["cheque-000301"]!.projectedBeforeMinor, 1393035)
	assert.equal(byId["autopay-bank-a-card-8821-2027-01-28"]!.shortfallMinor, 684835)
	assert.equal(byId["autopay-bank-a-card-8821-2027-01-28"]!.amountMinor, 1227870)
	assert.equal(byId["card-bank-b-card-5530-2026-11-20"]!.fullMinor, 631248)
	assert.equal(byId["card-bank-b-card-5530-2026-11-20"]!.minimumMinor, 31562)
	assert.ok(f0.flows["bank-a-current-4417"]!.some((fl) => fl.kind === "autopay" && fl.estimated && fl.amountMinor === -1227870))
	assert.equal(f0.baseline["bank-c-current-7710"]!["2026-11-01"], 425000)
	assert.deepEqual(f0.baseline, f0.planned)
})

test("with the golden grants, the January cheque keeps a residual gap that Bank C can cover", async () => {
	const f3 = buildForecast({ ...(await baseInput()), ...goldenFinal() }, 2)
	assert.equal(f3.risks.find((r) => r.id === "cheque-000301")?.shortfallMinor, 872053)
	assert.equal(f3.risks.find((r) => r.id === "cheque-000234"), undefined)
	assert.deepEqual(f3.cover.map(({ rateFactId, ...c }) => c), [{ riskId: "cheque-000301", accountId: "bank-c-current-7710", currency: "EUR", needMinor: 205189, freeMinor: 391978 }])
	assert.equal(f3.cover[0]!.rateFactId, "fx:EUR:AED:2026-10-31")
	assert.notEqual(f3.fingerprint, buildForecast({ ...(await baseInput()), claims: [], grants: [] }, 1).fingerprint)
	assert.notDeepEqual(f3.baseline, f3.planned)
})

test("without a rate there is no cover suggestion", async () => {
	const f = buildForecast({ ...(await baseInput()), ...goldenFinal(), rates: [] }, 2)
	assert.deepEqual(f.cover, [])
})

test("income dates come from positive recurring items", async () => {
	const { statements, accounts } = await verifiedHousehold()
	const rec = detectRecurring(statements, accounts)
	assert.deepEqual(incomeDates("bank-b-current-0263", rec, "2026-11-01", "2027-01-31"), ["2026-11-25", "2026-12-25", "2027-01-25"])
})

// Small fixtures for edge cases.
const acct: Account = { id: "bank-x-current-0001", bank: "Bank X", kind: "current", currency: "AED", last4: "0001", holder: "T", name: "Bank X current ·0001" }
function stmt(period: string, to: string, opening: number, rows: [string, string, number][]): Statement {
	const closing = rows.reduce((a, r) => a + r[2], opening)
	return {
		id: `${acct.id}:${period}`, accountId: acct.id, kind: "current", currency: "AED", period: { from: `${period}-01`, to },
		controls: { opening: { minor: opening, source: { factId: "o" } }, closing: { minor: closing, source: { factId: "c" } } },
		rows: rows.map(([date, description, amountMinor], i) => ({ id: `${period}#${i}`, date, description, amountMinor, source: { factId: "r" } })), attempts: 1,
	}
}
function fixture(asOf: string, horizonDays: number, statements: Statement[], cheques: [string, string, number][] = []): ForecastInput {
	return {
		asOf, horizonDays, homeCurrency: "AED", buffers: { AED: 0 }, rates: [], statements, accounts: [acct], cardTerms: [], claims: [], grants: [],
		commitments: cheques.map(([no, date, amountMinor]) => ({ id: `cheque-${no}`, chequeNo: no, accountId: acct.id, payee: "P", amountMinor, currency: "AED", date, purpose: "x", source: { factId: "q" } })),
	}
}

test("recurring day clamps to month end", () => {
	const f = buildForecast(fixture("2027-01-20", 45, [
		stmt("2026-11", "2026-11-30", 100000, [["2026-11-30", "RENT SHARE", -1000]]),
		stmt("2026-12", "2026-12-31", 99000, [["2026-12-31", "RENT SHARE", -1000]]),
	]), 1)
	assert.deepEqual(f.flows[acct.id]!.filter((x) => x.kind === "recurring").map((x) => x.date), ["2027-01-31", "2027-02-28"])
})

test("same-day credits apply before debits", () => {
	const f = buildForecast(fixture("2026-11-05", 90, [
		stmt("2026-09", "2026-09-30", 0, [["2026-09-25", "SALARY", 500000]]),
		stmt("2026-10", "2026-10-31", 500000, [["2026-10-25", "SALARY", 500000]]),
	], [["000777", "2026-11-25", 1600000]]), 1)
	const r = f.risks.find((x) => x.id === "cheque-000777")!
	assert.equal(r.projectedBeforeMinor, 1500000)
	assert.equal(r.shortfallMinor, 100000)
})
