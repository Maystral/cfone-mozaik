import { test } from "node:test"
import assert from "node:assert/strict"
import { readPdfLines, readTextLines } from "../src/pdf/lines.ts"
import { sourceCheck, reconcile, findHint, citedRefs } from "../src/domain/reconcile.ts"
import { extractionFromScenario } from "./helpers/extractions.ts"

test("bank B card: table rows alone miss the summary-only finance charge, and the hint finds it", async () => {
	const sc = await readPdfLines("data/synthetic/bank-b-card-2026-10.pdf")
	const tableOnly = extractionFromScenario("bank-b-card-5530", "2026-10", sc)
	assert.deepEqual(sourceCheck(tableOnly, sc), [])
	const r = reconcile(tableOnly)
	assert.equal(r.ok, false)
	assert.equal(r.diffMinor, 16513)
	assert.deepEqual(findHint(16513, sc, citedRefs(tableOnly)), { ref: "p1:l8", label: "Finance charges" })
	const fixed = extractionFromScenario("bank-b-card-5530", "2026-10", sc, { withDerived: true })
	assert.deepEqual(sourceCheck(fixed, sc), [])
	assert.equal(reconcile(fixed).ok, true)
})

test("bank A current reconciles; a flipped row and a wrong reference are caught", async () => {
	const fc = await readPdfLines("data/synthetic/bank-a-current-2026-10.pdf")
	const good = extractionFromScenario("bank-a-current-4417", "2026-10", fc)
	assert.deepEqual(sourceCheck(good, fc), [])
	assert.equal(reconcile(good).ok, true)
	const flipped = structuredClone(good)
	flipped.rows[0]!.direction = "credit"
	const rf = reconcile(flipped)
	assert.equal(rf.ok, false)
	assert.equal(rf.diffMinor, 640000)
	assert.equal(rf.firstBadRow, 0)
	const wrongRef = structuredClone(good)
	wrongRef.rows[0]!.amount.source = "p1:l3"
	assert.match(sourceCheck(wrongRef, fc)[0]!, /p1:l3/)
	const noRef = structuredClone(good)
	noRef.rows[1]!.amount.source = "line 7"
	assert.match(sourceCheck(noRef, fc)[0]!, /line 7/)
	const badTotal = structuredClone(good)
	delete badTotal.rows[2]!.balance
	badTotal.controls.totalDebits = { text: "17,000.00", source: badTotal.controls.totalDebits!.source }
	assert.ok(reconcile(badTotal).failures.some((f) => /total debits/i.test(f)))
})

test("bank B current is printed newest first and still chains", async () => {
	const su = await readPdfLines("data/synthetic/bank-b-current-2026-10.pdf")
	const ex = extractionFromScenario("bank-b-current-0263", "2026-10", su)
	assert.ok(ex.rows.every((r) => r.balance))
	assert.equal(ex.rows[0]!.description, "FAMILY SUPPORT TRANSFER")
	assert.deepEqual(sourceCheck(ex, su), [])
	assert.equal(reconcile(ex).ok, true)
	const broken = structuredClone(ex)
	broken.rows[0]!.amount.text = "-12,100.00"
	assert.equal(reconcile(broken).firstBadRow, 0)
})

test("EUR CSV statement reconciles and a changed row breaks the chain where it happens", async () => {
	const cc = await readTextLines("data/synthetic/bank-c-current-2026-10.csv")
	const eur = extractionFromScenario("bank-c-current-7710", "2026-10", cc)
	assert.equal(eur.currency, "EUR")
	assert.deepEqual(sourceCheck(eur, cc), [])
	assert.equal(reconcile(eur).ok, true)
	const broken = structuredClone(eur)
	broken.rows[1]!.amount.text = "3.52"
	assert.equal(reconcile(broken).firstBadRow, 1)
})

test("bank A card with two cardholder sections reconciles", async () => {
	const ac = await readPdfLines("data/synthetic/bank-a-card-2026-10.pdf")
	const ex = extractionFromScenario("bank-a-card-8821", "2026-10", ac)
	assert.deepEqual(sourceCheck(ex, ac), [])
	assert.equal(reconcile(ex).ok, true)
	const missing = structuredClone(ex)
	delete missing.controls.newBalance
	assert.ok(reconcile(missing).failures.some((f) => /newBalance/.test(f)))
})
