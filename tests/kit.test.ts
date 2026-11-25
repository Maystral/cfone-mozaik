import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, copyFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAgent, DeveloperMessageItem, ModelMessageItem, SemanticEvent, type InferenceInput, type InferenceOutput, type InferenceRunner } from "@mozaik-ai/core"
import { startHarness } from "./helpers/harness.ts"
import { codeParticipant, OneAtATime, roleInstruction, startLoop } from "../src/agents/kit.ts"
import { createObserver } from "../src/agents/observer.ts"
import { createCoordinator } from "../src/agents/coordinator.ts"
import { emit, On, ForMe } from "../src/events.ts"
import type { Doc } from "../src/types.ts"

class Slow implements InferenceRunner {
	contexts: { id: string; dev: string; n: number }[] = []
	async run(input: InferenceInput): Promise<InferenceOutput> {
		const items = input.context.getItems()
		this.contexts.push({ id: input.context.id, dev: (items[0] as DeveloperMessageItem).content.text, n: items.length })
		await new Promise((r) => setTimeout(r, 40))
		return { items: [ModelMessageItem.rehydrate({ text: "done" })], tokenUsage: undefined, rowResponse: {} }
	}
	async *stream(input: InferenceInput) { yield SemanticEvent.create("inference.output", input.model, await this.run(input)) }
}

test("parallel loops overlap and use fresh contexts", async () => {
	const runner = new Slow()
	const a = createAgent({ name: "A", capabilities: [], instruction: roleInstruction("reader", "I am A"), tools: [], handlers: [] })
	const b = createAgent({ name: "B", capabilities: [], instruction: roleInstruction("reader", "I am B"), tools: [], handlers: [] })
	const h = startHarness({ runner, participants: (ctx) => [createObserver(ctx), a, b] })
	startLoop(h.ctx, a, "task a")
	startLoop(h.ctx, b, "task b")
	startLoop(h.ctx, a, "task a2")
	await h.waitFor("model.answer", 3)
	assert.ok(h.ctx.state.metrics.peakLoops >= 2)
	assert.equal(new Set(runner.contexts.map((c) => c.id)).size, 3)
	assert.ok(runner.contexts.every((c) => c.n === 2))
	assert.deepEqual(runner.contexts.map((c) => c.dev.split("\n")[1]).sort(), ["I am A", "I am A", "I am B"])
	assert.equal(a.getMemory().getContext().getItems().length, 1) // only its own instruction
})

test("OneAtATime runs once more when triggered while busy", () => {
	let runs = 0
	const o = new OneAtATime(() => { runs++ })
	o.trigger(); o.trigger(); o.trigger()
	assert.equal(runs, 1)
	o.settle()
	assert.equal(runs, 2)
	o.settle()
	assert.equal(o.busy, false)
	o.trigger()
	assert.equal(runs, 3)
})

/** A stand-in reader that marks its document verified at once, with no model. */
const instantReader = (h: { ctx: import("../src/agents/kit.ts").Ctx }) => (doc: Doc) => codeParticipant(`Reader ${doc.id}`, [{
	specification: new On("document.received").and(new ForMe()),
	processor: { apply: () => { doc.status = "verified" } },
}])

test("unknown file is unsupported and close settles", async () => {
	const dir = mkdtempSync(join(tmpdir(), "cfone-drop-"))
	for (const f of ["bank-a-current-2026-10.pdf", "bank-b-card-2026-10.pdf"]) copyFileSync(join("data/synthetic", f), join(dir, f))
	writeFileSync(join(dir, "notes.txt"), "hello\n")
	writeFileSync(join(dir, "empty.pdf"), "")
	writeFileSync(join(dir, "photo.jpg"), "xx")
	let ref: { ctx: import("../src/agents/kit.ts").Ctx } | undefined
	const h = startHarness({ participants: (ctx) => { ref = { ctx }; return [createObserver(ctx), createCoordinator(ctx, instantReader(ref), () => "nobody")] } })
	emit(h.ctx.rt, "close.requested", h.you.getId(), { folder: dir })
	await h.waitFor("close.settled", 1, 5000)
	const docs = h.ctx.state.documents
	assert.equal(h.events.filter((e) => e.type === "document.received").length, 2)
	assert.equal(docs.get("notes")!.status, "unsupported")
	assert.equal(docs.get("empty")!.status, "unsupported")
	assert.equal(docs.get("photo")!.status, "unsupported")
	assert.equal(h.events.filter((e) => e.type === "close.settled").length, 1)
})

test("the synthetic folder is routed by content", async () => {
	let ref: { ctx: import("../src/agents/kit.ts").Ctx } | undefined
	const h = startHarness({ participants: (ctx) => { ref = { ctx }; return [createCoordinator(ctx, instantReader(ref), () => "clerk-id")] } })
	emit(h.ctx.rt, "close.requested", h.you.getId(), { folder: "data/synthetic" })
	const received = await h.waitFor("document.received", 13)
	const pay = received.map((e) => e.payload as { docId: string; kind: string; assignee: string })
	assert.equal(pay.filter((p) => p.kind === "statement").length, 10)
	assert.equal(pay.filter((p) => p.assignee === "clerk-id").map((p) => p.kind).sort().join(), "card_terms,cheque_register,payment_plan")
	assert.equal(new Set(pay.filter((p) => p.kind === "statement").map((p) => p.assignee)).size, 10)
	await h.waitFor("rates.added")
	assert.equal(h.ctx.state.facts.get("fx:EUR:AED:2026-10-31")?.value, "4.2500")
	assert.deepEqual(h.ctx.state.facts.get("fx:EUR:AED:2026-10-31")?.sources, [{ docId: "fx-rates", page: 1, line: 2 }])
	assert.equal(h.ctx.state.documents.get("fx-rates")!.status, "processed")
})
