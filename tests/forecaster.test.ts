import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startHarness } from "./helpers/harness.ts"
import { createObserver } from "../src/agents/observer.ts"
import { createCoordinator } from "../src/agents/coordinator.ts"
import { createReader } from "../src/agents/reader.ts"
import { createAuditor } from "../src/agents/auditor.ts"
import { createClerk } from "../src/agents/clerk.ts"
import { createForecaster } from "../src/agents/forecaster.ts"
import { emit } from "../src/events.ts"

function run(folder: string) {
	const h = startHarness({
		participants: (ctx) => {
			const clerk = createClerk(ctx)
			return [createObserver(ctx), createAuditor(ctx), clerk, createForecaster(ctx), createCoordinator(ctx, (doc) => createReader(ctx, doc), () => clerk.getId())]
		},
	})
	emit(h.ctx.rt, "close.requested", h.you.getId(), { folder })
	return h
}

test("the forecaster publishes the sourced position, risks and shortfalls", async () => {
	const h = run("data/synthetic")
	await h.waitFor("close.settled", 1, 15000)
	const facts = h.ctx.state.facts
	const f = (id: string) => facts.get(id)?.value
	assert.equal(f("position:have"), 5532285)
	assert.equal(facts.get("position:have")?.currency, "AED")
	assert.equal(f("position:owe"), 1918273)
	assert.equal(f("position:promised90"), 6350000)
	assert.equal(f("home:bank-c-current-7710:2026-10-31"), 1806250)
	assert.ok(facts.get("position:have")!.derivedFrom!.includes("fx:EUR:AED:2026-10-31"))
	assert.ok(facts.get("position:have")!.derivedFrom!.includes("bal:bank-a-current-4417:2026-10-31"))
	assert.equal(f("shortfall:cheque-000234"), 640000)
	assert.equal(f("before:cheque-000234"), 2160000)
	const src = facts.get("shortfall:cheque-000234")!.sources
	assert.ok(src.some((s) => "docId" in s && s.docId === "bank-a-current-2026-10"))
	assert.ok(src.some((s) => "docId" in s && s.docId === "cheque-register"))
	assert.equal(f("shortfall:cheque-000301"), 2256965)
	assert.equal(f("shortfall:autopay-bank-a-card-8821-2027-01-28"), 684835)
	assert.equal(f("full:card-bank-b-card-5530-2026-11-20"), 631248)
	assert.equal(f("minimum:card-bank-b-card-5530-2026-11-20"), 31562)
	assert.equal(h.ctx.state.forecast!.risks.length, 4)
	const updates = h.events.filter((e) => e.type === "forecast.updated")
	assert.ok(updates.length >= 1)
	assert.equal((updates.at(-1)!.payload as { riskFingerprint: string }).riskFingerprint, h.ctx.state.forecast!.fingerprint)
})

test("missing rate is excluded, not assumed", async () => {
	const dir = mkdtempSync(join(tmpdir(), "cfone-norate-"))
	for (const f of readdirSync("data/synthetic").filter((x) => !x.startsWith(".") && x !== "fx-rates.csv")) copyFileSync(join("data/synthetic", f), join(dir, f))
	const h = run(dir)
	await h.waitFor("close.settled", 1, 15000)
	const have = h.ctx.state.facts.get("position:have")!
	assert.equal(have.value, 3726035)
	assert.match(have.label, /missing rate.*EUR/i)
	assert.equal(h.ctx.state.facts.get("home:bank-c-current-7710:2026-10-31"), undefined)
	assert.deepEqual(h.ctx.state.facts.list("cover:"), [])
})
