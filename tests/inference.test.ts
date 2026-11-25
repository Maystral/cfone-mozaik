import { test } from "node:test"
import assert from "node:assert/strict"
import { ModelContext, ModelMessageItem, OpenAIChatCompletions, SemanticEvent, type InferenceInput, type InferenceOutput, type InferenceRunner } from "@mozaik-ai/core"
import { SafeRunner } from "../src/inference/safe-runner.ts"
import { EndpointRunner } from "../src/inference/endpoint-runner.ts"
import { modelsFor } from "../src/inference/models.ts"
import { loadConfig } from "../src/config.ts"

const input = (): InferenceInput => ({ model: "m", maxOutputTokens: 100, context: ModelContext.create() })
const answer = (text: string): InferenceOutput => ({ items: [ModelMessageItem.rehydrate({ text })], tokenUsage: undefined, rowResponse: {} })
class Stub implements InferenceRunner {
	calls = 0
	constructor(private readonly f: (n: number) => Promise<InferenceOutput>) {}
	run(i: InferenceInput) { return this.f(++this.calls) }
	async *stream(i: InferenceInput) { yield SemanticEvent.create("inference.output", i.model, await this.run(i)) }
}
const textOf = (o: InferenceOutput) => (o.items[0] as ModelMessageItem).content.text

test("retries a flaky runner", async () => {
	const inner = new Stub(async (n) => { if (n < 3) throw new Error("flaky"); return answer("ok") })
	const out = await new SafeRunner(inner, { maxInFlight: 2, retries: 2, baseDelayMs: 1, onFailure: () => assert.fail("no failure expected") }).run(input())
	assert.equal(textOf(out), "ok")
	assert.equal(inner.calls, 3)
})

test("returns AGENT_ERROR after the last retry", async () => {
	const failures: unknown[] = []
	const inner = new Stub(async () => { throw new Error("529 overloaded") })
	const out = await new SafeRunner(inner, { maxInFlight: 2, retries: 2, baseDelayMs: 1, onFailure: (_i, e) => failures.push(e) }).run(input())
	assert.ok(textOf(out).startsWith("AGENT_ERROR: 529 overloaded"))
	assert.equal(failures.length, 1)
	assert.equal(inner.calls, 3)
	const streamed: SemanticEvent[] = []
	for await (const e of new SafeRunner(inner, { maxInFlight: 1, retries: 0, baseDelayMs: 1, onFailure: () => {} }).stream(input())) streamed.push(e)
	assert.equal(streamed[0]!.type, "inference.output")
})

test("caps in-flight inferences", async () => {
	const seen: number[] = []
	const inner = new Stub(async () => { await new Promise((r) => setTimeout(r, 30)); return answer("ok") })
	const safe = new SafeRunner(inner, { maxInFlight: 2, retries: 0, baseDelayMs: 1, onFailure: () => {}, onInFlight: (n) => seen.push(n) })
	await Promise.all([1, 2, 3, 4, 5].map(() => safe.run(input())))
	assert.equal(Math.max(...seen), 2)
	assert.equal(inner.calls, 5)
})

test("EndpointRunner finds built-in Claude models", () => {
	const names = modelsFor(loadConfig({ ANTHROPIC_API_KEY: "x" })).map((m) => m.specification.name)
	assert.ok(names.includes("claude-sonnet-5-5"))
	assert.ok(names.includes("claude-haiku-4-5"))
	const custom = modelsFor(loadConfig({ ANTHROPIC_API_KEY: "x", CFONE_MODEL: "claude-new-9" }))
	assert.equal(custom.find((m) => m.specification.name === "claude-new-9")?.specification.provider, "anthropic")
})

test("a local OpenAI-compatible model is registered", () => {
	const m = modelsFor(loadConfig({ CFONE_OPENAI_BASE_URL: "http://localhost:11434/v1", CFONE_MODEL: "local-model" }))
	assert.ok(m.some((x) => x.specification.name === "local-model" && x.endpoint instanceof OpenAIChatCompletions))
})

test("EndpointRunner rejects an unknown model", async () => {
	await assert.rejects(new EndpointRunner([]).run(input()), /unknown model/)
})
