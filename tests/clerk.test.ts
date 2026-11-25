import { test } from "node:test"
import assert from "node:assert/strict"
import { startHarness } from "./helpers/harness.ts"
import { createObserver } from "../src/agents/observer.ts"
import { createCoordinator } from "../src/agents/coordinator.ts"
import { createReader } from "../src/agents/reader.ts"
import { createAuditor } from "../src/agents/auditor.ts"
import { createClerk } from "../src/agents/clerk.ts"
import { emit } from "../src/events.ts"

test("the clerk turns cheques, the plan and key facts into sourced commitments and terms", async () => {
	const h = startHarness({
		participants: (ctx) => {
			const clerk = createClerk(ctx)
			return [createObserver(ctx), createAuditor(ctx), clerk, createCoordinator(ctx, (doc) => createReader(ctx, doc), () => clerk.getId())]
		},
	})
	emit(h.ctx.rt, "close.requested", h.you.getId(), { folder: "data/synthetic" })
	await h.waitFor("commitment.added", 9, 10000)
	await h.waitFor("terms.added", 2, 10000)
	await h.waitFor("close.settled", 1, 10000)
	const s = h.ctx.state
	assert.equal(s.commitments.size, 9)
	assert.deepEqual([...s.commitments.values()].filter((c) => c.date >= "2026-11-05" && c.date <= "2027-02-03").map((c) => c.chequeNo).sort(), ["000234", "000301"])
	assert.ok([...s.commitments.values()].every((c) => c.currency === "AED" && c.accountId === "bank-a-current-4417"))
	assert.equal(s.facts.get("cheque:000234:amount")?.value, 2750000)
	assert.deepEqual(s.facts.get("cheque:000234:amount")?.sources, [{ docId: "cheque-register", page: 1, line: 5 }])
	const flags = h.events.filter((e) => e.type === "commitment.flagged")
	assert.equal(flags.length, 1)
	assert.match((flags[0]!.payload as { reason: string }).reason, /handover/i)
	assert.equal(s.facts.get("terms:bank-b-card-5530:monthlyRatePct")?.value, "3.25")
	assert.equal(s.facts.get("terms:bank-a-card-8821:monthlyRatePct")?.value, "3.49")
	assert.equal(s.facts.get("terms:bank-b-card-5530:lateFee")?.value, 23000)
	assert.equal(s.facts.get("terms:bank-a-card-8821:autopayFrom")?.value, "bank-a-current-4417")
	assert.equal(s.cardTerms.get("bank-b-card-5530")?.autopayFrom, undefined)
	for (const id of ["cheque-register", "payment-plan", "card-key-facts"]) assert.equal(s.documents.get(id)?.status, "processed")
})
