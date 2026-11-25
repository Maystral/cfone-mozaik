// Pre-event API spike, kept as a reference for the build. Not imported by the app.
// Run: npx tsx docs/reference/mozaik-4.2-spike.ts
// THROWAWAY SPIKE: verifies the @mozaik-ai/core 4.2.0 API the CFOne plan relies on.
// - several agents run loops at the same time (non-awaited runLoop)
// - shared typed state on a RuntimeState subclass
// - custom domain events via sendEvent + SituationSpecification
// - a checker agent reacts to another agent's output while others still run
// - an InterceptionHandler blocks a tool call that lacks sources
// - fresh ModelContext per loop so concurrent loops do not share context
import {
	createAgent,
	createHuman,
	defineRuntime,
	DeveloperMessageItem,
	FunctionCallItem,
	FunctionCallOutputItem,
	ModelContext,
	ModelMessageItem,
	OpenAIChatCompletions,
	RuntimeState,
	SemanticEvent,
	SituationSpecification,
	type Agent,
	type ExecutableTransition,
	type InferenceInput,
	type InferenceOutput,
	type InferenceRunner,
	type InterceptionHandler,
	type SituationContext,
	type SituationHandler,
	type Tool,
} from "@mozaik-ai/core"

type Row = { date: string; amountMinor: number; source?: string }
type Extraction = { statementId: string; openingMinor: number; closingMinor: number; rows: Row[] }

class SwarmState extends RuntimeState {
	extractions = new Map<string, Extraction>()
	verdicts = new Map<string, "verified" | "rejected">()
	spans: { agent: string; loopId: string; start: number; end?: number }[] = []
	log: string[] = []
}

const { initializeRuntime, resolveRuntime, join, sendEvent, runLoop } = defineRuntime<SwarmState>()
const t0 = Date.now()
const ms = () => String(Date.now() - t0).padStart(5)
const say = (s: string) => {
	resolveRuntime().state.log.push(s)
	console.log(`${ms()}ms  ${s}`)
}

// ---- synthetic statements: S2 has a missing row so it will not reconcile on first read
const STATEMENTS: Record<string, Extraction> = {
	S1: { statementId: "S1", openingMinor: 100000, closingMinor: 82500, rows: [{ date: "2026-10-03", amountMinor: -12500 }, { date: "2026-10-09", amountMinor: -5000 }] },
	S2: { statementId: "S2", openingMinor: 50000, closingMinor: 38000, rows: [{ date: "2026-10-04", amountMinor: -4000 }, { date: "2026-10-11", amountMinor: -5000 }] },
	S3: { statementId: "S3", openingMinor: 0, closingMinor: -23000, rows: [{ date: "2026-10-05", amountMinor: -23000 }] },
}

// ---- mock model: replies with a tool call, then a final message; random latency
class MockRunner implements InferenceRunner {
	private attempts = new Map<string, number>()
	async run(input: InferenceInput): Promise<InferenceOutput> {
		await new Promise((r) => setTimeout(r, 250 + Math.random() * 350))
		const items = input.context.getItems()
		const last = items[items.length - 1]
		if (last instanceof FunctionCallOutputItem && !last.output.text.startsWith("REJECTED")) {
			return { items: [ModelMessageItem.rehydrate({ text: `done: ${last.output.text.slice(0, 60)}` })], tokenUsage: undefined, rowResponse: { mock: true } }
		}
		const dev = items.find((i) => i instanceof DeveloperMessageItem) as DeveloperMessageItem
		const sid = /statement (S\d)/.exec(dev.content.text)?.[1] ?? "S1"
		const n = (this.attempts.get(sid) ?? 0) + 1
		this.attempts.set(sid, n)
		const base = structuredClone(STATEMENTS[sid]!)
		// first attempt on S1 omits sources (interception must block it); retry on S2 finds the missing row
		const withSources = !(sid === "S1" && n === 1)
		if (sid === "S2" && n > 1) base.rows.push({ date: "2026-10-20", amountMinor: -3000 })
		base.rows = base.rows.map((r, i) => (withSources ? { ...r, source: `${sid}:p1:r${i + 1}` } : r))
		const call = FunctionCallItem.rehydrate({ callId: `${sid}-${n}`, name: "submit_extraction", args: JSON.stringify(base) })
		return { items: [call], tokenUsage: undefined, rowResponse: { mock: true } }
	}
	async *stream(input: InferenceInput) {
		yield SemanticEvent.create("inference.output", input.model, await this.run(input))
	}
}

// ---- interception: refuse submit_extraction when any row lacks a source
class RequireSources implements InterceptionHandler {
	isSatisfiedBy(t: ExecutableTransition): boolean {
		if (t.nextStateId !== "function_call") return false
		const { call } = t.input as { call: FunctionCallItem }
		if (call.name !== "submit_extraction") return false
		const ex = JSON.parse(call.args) as Extraction
		return ex.rows.some((r) => !r.source)
	}
	async handle(t: ExecutableTransition): Promise<ExecutableTransition> {
		const { call, inferenceInput } = t.input as { call: FunctionCallItem; inferenceInput: InferenceInput }
		say(`interception: blocked ${call.callId} (row without source)`)
		inferenceInput.context.addContextItems([call, FunctionCallOutputItem.create(call.callId, "REJECTED: every row needs a source reference")])
		return { nextStateId: "inference", input: inferenceInput }
	}
}

// ---- specifications
class On<T extends string> extends SituationSpecification {
	constructor(private type: T) { super() }
	isSatisfiedBy({ event }: SituationContext) { return event.type === this.type }
}
class FromOther extends SituationSpecification {
	isSatisfiedBy({ event, participant }: SituationContext) { return event.producerId !== participant.getId() }
}
class ForMe extends SituationSpecification {
	isSatisfiedBy({ event, participant }: SituationContext) {
		const p = event.payload as { assignee?: string }
		return p.assignee === participant.getId()
	}
}

function freshContext(agent: Agent): ModelContext {
	return ModelContext.create().addContextItem(DeveloperMessageItem.create(agent.getDeveloperMessage()))
}

function startLoop(agent: Agent, message: string, intercept?: InterceptionHandler) {
	const input: InferenceInput = { model: "mock", context: freshContext(agent), tools: agent.getTools() }
	runLoop(agent.getId(), message, input, intercept)
}

// ---- reader agents: one per statement
function makeReader(sid: string): Agent {
	let self: Agent
	const submit: Tool = {
		type: "function",
		name: "submit_extraction",
		description: "Submit the extracted statement",
		strict: false,
		parameters: { type: "object", properties: {}, additionalProperties: true },
		invoke: async (ex: Extraction) => {
			resolveRuntime().state.extractions.set(ex.statementId, ex)
			sendEvent(SemanticEvent.create("statement.extracted", self.getId(), { statementId: ex.statementId }), self.getId())
			return { accepted: true, rows: ex.rows.length }
		},
	}
	const onAssigned: SituationHandler = {
		specification: new On("statement.assigned").and(new ForMe()),
		processor: { apply: () => startLoop(self, `Read statement ${sid}`, new RequireSources()) },
	}
	const onRejected: SituationHandler = {
		specification: new On("statement.rejected").and(new ForMe()),
		processor: { apply: ({ event }) => startLoop(self, `Re-read statement ${sid}: ${(event.payload as { reason: string }).reason}`, new RequireSources()) },
	}
	self = createAgent({ name: `Reader ${sid}`, capabilities: ["read"], instruction: `You read statement ${sid}.`, tools: [submit], handlers: [onAssigned, onRejected] })
	return self
}

// ---- auditor: deterministic reconciliation reacting to each extraction as it lands
let auditor: Agent
const readerOf = new Map<string, string>()
const onExtracted: SituationHandler = {
	specification: new On("statement.extracted").and(new FromOther()),
	processor: {
		apply: ({ event }) => {
			const { statementId } = event.payload as { statementId: string }
			const ex = resolveRuntime().state.extractions.get(statementId)!
			const sum = ex.rows.reduce((a, r) => a + r.amountMinor, 0)
			const diff = ex.openingMinor + sum - ex.closingMinor
			const ok = diff === 0
			resolveRuntime().state.verdicts.set(statementId, ok ? "verified" : "rejected")
			say(`auditor: ${statementId} ${ok ? "VERIFIED" : `REJECTED diff=${diff}`}`)
			if (!ok) sendEvent(SemanticEvent.create("statement.rejected", auditor.getId(), { statementId, assignee: readerOf.get(statementId), reason: `off by ${diff}` }), auditor.getId())
			else sendEvent(SemanticEvent.create("statement.verified", auditor.getId(), { statementId }), auditor.getId())
		},
	},
}
auditor = createAgent({ name: "Auditor", capabilities: ["audit"], instruction: "You reconcile.", tools: [], handlers: [onExtracted] })

// ---- observer: records loop spans from runtime events
const observer = createHuman({
	name: "Observer",
	capabilities: [],
	handlers: [
		{
			specification: new On("inference.started"),
			processor: { apply: ({ event }) => { const p = event.payload as { loopId: string }; const st = resolveRuntime().state; if (!st.spans.find((s) => s.loopId === p.loopId)) st.spans.push({ agent: event.producerId, loopId: p.loopId, start: Date.now() - t0 }) } },
		},
		{
			specification: new On("model.answer"),
			processor: { apply: ({ event }) => { const p = event.payload as { loopId: string }; const s = resolveRuntime().state.spans.find((x) => x.loopId === p.loopId); if (s) s.end = Date.now() - t0 } },
		},
	],
})

initializeRuntime({
	state: new SwarmState(),
	inferenceRunnerConfig: {
		supportedModels: [{ endpoint: new OpenAIChatCompletions(), specification: { name: "mock", provider: "mock", supportsReasoningEffort: false, supportedReasoningEfforts: [], supportsStreaming: false, contextWindowSize: 1000, supportedContextItemTypes: [], maxOutputTokens: 1000, supportsFunctionCalling: true, supportsStructuredOutput: false } }],
		runner: new MockRunner(),
	},
})

const coordinator = createHuman({ name: "Coordinator", capabilities: [], handlers: [] })
join(coordinator)
join(observer)
join(auditor)
for (const sid of Object.keys(STATEMENTS)) {
	const r = makeReader(sid)
	readerOf.set(sid, r.getId())
	join(r)
}
for (const sid of Object.keys(STATEMENTS)) {
	sendEvent(SemanticEvent.create("statement.assigned", coordinator.getId(), { statementId: sid, assignee: readerOf.get(sid) }), coordinator.getId())
}

setTimeout(() => {
	const st = resolveRuntime().state
	const names = new Map(st.getParticipants().map((p) => [p.getId(), p.getManifest().name]))
	console.log("\nloop spans (ms):")
	for (const s of st.spans) console.log(`  ${names.get(s.agent)?.padEnd(10)} ${String(s.start).padStart(5)} -> ${String(s.end ?? "open").padStart(5)}`)
	// peak concurrency
	const pts = st.spans.flatMap((s) => [[s.start, 1], [s.end ?? Infinity, -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
	let cur = 0, peak = 0
	for (const [, d] of pts) { cur += d; peak = Math.max(peak, cur) }
	console.log(`peak concurrent loops: ${peak}`)
	console.log("verdicts:", Object.fromEntries(st.verdicts))
}, 6000)
