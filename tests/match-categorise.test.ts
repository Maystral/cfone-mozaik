import { test } from "node:test"
import assert from "node:assert/strict"
import { matchTransfers } from "../src/domain/match.ts"
import { verifiedHousehold } from "./helpers/household.ts"
import { startHarness } from "./helpers/harness.ts"
import { createObserver } from "../src/agents/observer.ts"
import { createCoordinator } from "../src/agents/coordinator.ts"
import { createReader } from "../src/agents/reader.ts"
import { createAuditor } from "../src/agents/auditor.ts"
import { createMatcher } from "../src/agents/matcher.ts"
import { createCategoriser, CATEGORIES } from "../src/agents/categoriser.ts"
import { codeParticipant } from "../src/agents/kit.ts"
import { emit, On, ForMe } from "../src/events.ts"

test("transfers and card payments between own accounts pair up without crossing", async () => {
	const { statements } = await verifiedHousehold()
	const pairs = matchTransfers(statements)
	assert.equal(pairs.length, 5)
	assert.ok(pairs.some((p) => p.kind === "card_payment" && p.amountMinor === 200000 && p.out.startsWith("bank-b-current-0263:2026-10") && p.in.startsWith("bank-b-card-5530:2026-10")))
	assert.ok(pairs.some((p) => p.kind === "transfer" && p.amountMinor === 200000 && p.out.startsWith("bank-b-current-0263:2026-10") && p.in.startsWith("bank-a-current-4417:2026-10")))
	assert.equal(pairs.filter((p) => p.kind === "card_payment" && p.out.startsWith("bank-a-current-4417")).length, 2)
	const rows = new Set(pairs.flatMap((p) => [p.out, p.in]))
	assert.equal(rows.size, 10)
})

test("the matcher and the categoriser label every verified row", async () => {
	const h = startHarness({
		participants: (ctx) => {
			const clerk = codeParticipant("Clerk stub", [{ specification: new On("document.received").and(new ForMe()), processor: { apply: ({ event }) => { ctx.state.documents.get((event.payload as { docId: string }).docId)!.status = "processed" } } }])
			return [createObserver(ctx), createAuditor(ctx), clerk, createMatcher(ctx), createCategoriser(ctx), createCoordinator(ctx, (doc) => createReader(ctx, doc), () => clerk.getId())]
		},
	})
	emit(h.ctx.rt, "close.requested", h.you.getId(), { folder: "data/synthetic" })
	await h.waitFor("categories.assigned", 10, 15000)
	await h.waitFor("close.settled", 1, 10000)
	const s = h.ctx.state
	assert.equal(h.events.filter((e) => e.type === "transfer.matched").length, 5)
	const rows = [...s.statements.values()].flatMap((x) => x.rows)
	const cat = (desc: string) => (s.categories.get(rows.find((r) => r.description === desc)!.id) as { category: string }).category
	for (const r of rows) assert.ok(CATEGORIES.includes((s.categories.get(r.id) as { category: string } | undefined)?.category ?? ""), r.description)
	assert.equal(cat("FAMILY SUPPORT TRANSFER"), "family support")
	assert.equal(cat("ELECTRICITY AND WATER BILL"), "utilities and telecom")
	assert.equal(cat("INSURANCE PREMIUM"), "insurance")
	assert.equal(cat("TRANSFER TO BANK A"), "transfer")
	assert.equal(cat("SALARY ACME TRADING LLC"), "income")
})
