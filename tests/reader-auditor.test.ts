import { test } from "node:test"
import assert from "node:assert/strict"
import { ModelMessageItem, SemanticEvent, type InferenceInput, type InferenceRunner, UserMessageItem } from "@mozaik-ai/core"
import { startHarness } from "./helpers/harness.ts"
import { createObserver } from "../src/agents/observer.ts"
import { createCoordinator } from "../src/agents/coordinator.ts"
import { createReader } from "../src/agents/reader.ts"
import { createAuditor } from "../src/agents/auditor.ts"
import { codeParticipant, type Ctx } from "../src/agents/kit.ts"
import { OfflineRunner } from "../src/inference/offline-runner.ts"
import { emit, On, ForMe } from "../src/events.ts"
import "../src/inference/offline/index.ts"

/** Marks the clerk's documents processed so the close can settle without the Clerk. */
const stubClerk = (ctx: Ctx) => codeParticipant("Clerk stub", [{ specification: new On("document.received").and(new ForMe()), processor: { apply: ({ event }) => { ctx.state.documents.get((event.payload as { docId: string }).docId)!.status = "processed" } } }])

function close(runner?: InferenceRunner) {
	let clerk = ""
	const h = startHarness({
		runner,
		participants: (ctx) => {
			const c = stubClerk(ctx)
			clerk = c.getId()
			return [createObserver(ctx), createAuditor(ctx), c, createCoordinator(ctx, (doc) => createReader(ctx, doc), () => clerk)]
		},
	})
	emit(h.ctx.rt, "close.requested", h.you.getId(), { folder: "data/synthetic" })
	return h
}

test("ten statements verified offline; the Bank B card statements are rejected once with a hint", async () => {
	const h = close()
	const verified = await h.waitFor("statement.verified", 10, 15000)
	assert.equal(verified.length, 10)
	const rejected = h.events.filter((e) => e.type === "statement.rejected").map((e) => e.payload as { docId: string; hint: string })
	assert.deepEqual(rejected.map((p) => p.docId).sort(), ["bank-b-card-2026-09", "bank-b-card-2026-10"])
	assert.ok(rejected.every((p) => p.hint.includes("Finance charges")), JSON.stringify(rejected))
	const f = h.ctx.state.facts
	assert.equal(f.get("bal:bank-a-current-4417:2026-10-31")?.value, 2711035)
	assert.equal(f.get("bal:bank-b-current-0263:2026-10-31")?.value, 1015000)
	assert.equal(f.get("stmt:bank-b-card-5530:2026-10:newBalance")?.value, 631248)
	assert.equal(f.get("stmt:bank-b-card-5530:2026-10:dueDate")?.value, "2026-11-20")
	assert.equal(f.get("bal:bank-c-current-7710:2026-10-31")?.value, 425000)
	assert.equal(f.get("bal:bank-c-current-7710:2026-10-31")?.currency, "EUR")
	assert.deepEqual(f.get("bal:bank-a-current-4417:2026-10-31")?.sources, [{ docId: "bank-a-current-2026-10", page: 1, line: 14 }])
	assert.equal(h.ctx.state.accounts.get("bank-b-current-0263")?.name, "Bank B current ·0263")
	assert.equal(h.ctx.state.statements.get("bank-a-card-8821:2026-10")?.rows.filter((r) => r.cardLast4 === "8839").length, 6)
	assert.equal(h.ctx.state.statements.get("bank-b-card-5530:2026-10")?.rows.filter((r) => r.derived).length, 1)
	await h.waitFor("close.settled", 1, 5000)
	assert.equal(h.ctx.state.metrics.rejections, 2)
	assert.equal(h.ctx.state.metrics.quarantined, 0)
	assert.ok(h.ctx.state.metrics.peakLoops >= 6, `peak ${h.ctx.state.metrics.peakLoops}`)
})

class FailFor implements InferenceRunner {
	private readonly inner = new OfflineRunner({ latencyMs: 20, chaos: false })
	constructor(private readonly docId: string) {}
	async run(input: InferenceInput) {
		const task = input.context.getItems().find((i) => i instanceof UserMessageItem) as UserMessageItem | undefined
		if (task?.content.text.includes(`docId=${this.docId}\n`)) throw new Error("529 overloaded")
		return this.inner.run(input)
	}
	async *stream(input: InferenceInput) { yield SemanticEvent.create("inference.output", input.model, await this.run(input)) }
}

test("reader failure quarantines the document", async () => {
	const h = close(new FailFor("bank-a-card-2026-10"))
	await h.waitFor("statement.quarantined", 1, 10000)
	await h.waitFor("close.settled", 1, 15000)
	const doc = h.ctx.state.documents.get("bank-a-card-2026-10")!
	assert.equal(doc.status, "quarantined")
	assert.equal(doc.reason, "reader failed")
	assert.equal(h.events.filter((e) => e.type === "statement.verified").length, 9)
	assert.equal(h.events.filter((e) => e.type === "agent.failed").length, 1)
	assert.equal(h.ctx.state.statements.has("bank-a-card-8821:2026-10"), false)
})

class SilentFor implements InferenceRunner {
	private readonly inner = new OfflineRunner({ latencyMs: 20, chaos: false })
	constructor(private readonly docId: string) {}
	async run(input: InferenceInput) {
		const task = input.context.getItems().find((i) => i instanceof UserMessageItem) as UserMessageItem | undefined
		if (task?.content.text.includes(`docId=${this.docId}\n`)) return { items: [ModelMessageItem.rehydrate({ text: "I could not read this." })], tokenUsage: undefined, rowResponse: {} }
		return this.inner.run(input)
	}
	async *stream(input: InferenceInput) { yield SemanticEvent.create("inference.output", input.model, await this.run(input)) }
}

test("a reader that never submits does not hang the close", async () => {
	const h = close(new SilentFor("bank-a-current-2026-09"))
	await h.waitFor("close.settled", 1, 15000)
	const doc = h.ctx.state.documents.get("bank-a-current-2026-09")!
	assert.equal(doc.status, "quarantined")
	assert.match(doc.reason ?? "", /did not submit/)
	assert.equal(h.events.filter((e) => e.type === "statement.verified").length, 9)
})
