import { test } from "node:test"
import assert from "node:assert/strict"
import { startHarness } from "./helpers/harness.ts"
import { createObserver } from "../src/agents/observer.ts"
import { createCoordinator } from "../src/agents/coordinator.ts"
import { createReader } from "../src/agents/reader.ts"
import { createAuditor } from "../src/agents/auditor.ts"
import { createClerk } from "../src/agents/clerk.ts"
import { createForecaster } from "../src/agents/forecaster.ts"
import { createTreasurer } from "../src/agents/treasurer.ts"
import { createCashSentinel, createCardSentinel } from "../src/agents/sentinels.ts"
import { checkDraft } from "../src/domain/guard.ts"
import { renderAction } from "../src/facts.ts"
import { emit } from "../src/events.ts"

function run(env: NodeJS.ProcessEnv = {}) {
	const h = startHarness({
		env,
		participants: (ctx) => {
			const clerk = createClerk(ctx)
			const treasurer = createTreasurer(ctx)
			return [createObserver(ctx), createAuditor(ctx), clerk, createForecaster(ctx), treasurer.participant,
				createCashSentinel(ctx, treasurer), createCardSentinel(ctx, treasurer), createCoordinator(ctx, (doc) => createReader(ctx, doc), () => clerk.getId())]
		},
	})
	emit(h.ctx.rt, "close.requested", h.you.getId(), { folder: "data/synthetic" })
	return h
}

test("treasurer settles the competing claims and sentinels propose sourced actions", async () => {
	const h = run()
	await h.waitFor("close.settled", 1, 20000)
	const s = h.ctx.state
	const f = (id: string) => s.facts.get(id)?.value
	const claim = (riskId: string, byDate: string) => [...s.claims.values()].find((c) => c.riskId === riskId && c.byDate === byDate)!
	const grant = (riskId: string, byDate: string) => s.grants.get(claim(riskId, byDate).id)!
	assert.equal(grant("cheque-000234", "2026-11-21").grantedMinor, 640000)
	assert.equal(grant("card-bank-b-card-5530-2026-11-20", "2026-11-20").grantedMinor, 218720)
	assert.equal(grant("card-bank-b-card-5530-2026-11-20", "2026-11-25").grantedMinor, 412528)
	assert.equal(claim("cheque-000301", "2027-01-14").requestedMinor, 1616965)
	assert.equal(grant("cheque-000301", "2027-01-14").grantedMinor, 744912)
	assert.equal(f(`remainder:${claim("cheque-000301", "2027-01-14").id}`), 872053)
	assert.equal(f(`interest-est:${claim("card-bank-b-card-5530-2026-11-20", "2026-11-25").id}`), 13407)
	assert.equal(f("cover:cheque-000301:bank-c-current-7710"), 205189)
	assert.equal(f("shortfall:cheque-000301"), 872053)
	const live = [...s.actions.values()].filter((a) => a.status === "proposed")
	assert.deepEqual(live.map((a) => a.riskId).sort(), ["card-bank-b-card-5530-2026-11-20", "cheque-000234", "cheque-000301"])
	assert.ok(live.every((a) => checkDraft(a.title + " " + a.body, s.facts).ok))
	assert.ok(live.find((a) => a.riskId === "cheque-000301")!.body.includes("{{F:cover:cheque-000301:bank-c-current-7710}}"))
	assert.ok(s.metrics.conflicts >= 1)
	assert.equal(s.metrics.blocked, 0)
	const rent = renderAction(live.find((a) => a.riskId === "cheque-000234")!, s.facts, s.accounts).plain
	assert.match(rent, /AED 6,400\.00/)
	assert.match(rent, /Bank B current ·0263/)
	assert.match(rent, /Not financial advice\.$/)
	assert.match(renderAction(live.find((a) => a.riskId === "cheque-000301")!, s.facts, s.accounts).plain, /EUR 2,051\.89/)
	assert.ok(h.events.some((e) => e.type === "reservation.changed"))
})

test("chaos draft is blocked then fixed", async () => {
	const h = run({ CFONE_CHAOS: "1" })
	await h.waitFor("close.settled", 1, 20000)
	const s = h.ctx.state
	assert.ok(h.events.filter((e) => e.type === "guard.blocked").length >= 1)
	assert.ok(s.metrics.blocked >= 1)
	const live = [...s.actions.values()].filter((a) => a.status === "proposed")
	assert.deepEqual(live.map((a) => a.riskId).sort(), ["card-bank-b-card-5530-2026-11-20", "cheque-000234", "cheque-000301"])
	for (const a of [...s.actions.values()]) assert.ok(checkDraft(a.title + " " + a.body, s.facts).ok, a.body)
})
