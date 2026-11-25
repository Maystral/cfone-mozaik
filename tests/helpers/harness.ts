// Runs participants on a fresh offline runtime and records every event. Test-only.
import { createHuman, SituationSpecification, type Human, type InferenceRunner, type Participant, type SemanticEvent } from "@mozaik-ai/core"
import { loadConfig } from "../../src/config.ts"
import { initClose } from "../../src/setup.ts"
import { createYou } from "../../src/agents/you.ts"
import type { Ctx } from "../../src/agents/kit.ts"
import type { CfEventType } from "../../src/events.ts"

class Always extends SituationSpecification { isSatisfiedBy() { return true } }

export function startHarness(opts: { participants: (ctx: Ctx) => Participant[]; runner?: InferenceRunner; env?: NodeJS.ProcessEnv }) {
	const config = loadConfig({ CFONE_OFFLINE: "1", CFONE_OFFLINE_LATENCY_MS: "20", ...opts.env })
	const ctx = initClose(config, opts.runner, { baseDelayMs: 1 })
	const events: SemanticEvent[] = []
	const waiters: (() => void)[] = []
	const recorder: Human = createHuman({ name: "Recorder", capabilities: [], handlers: [{ specification: new Always(), processor: { apply: ({ event }) => { events.push(event); for (const w of [...waiters]) w() } } }] })
	ctx.rt.join(recorder)
	const you = createYou(ctx)
	ctx.rt.join(you)
	for (const p of opts.participants(ctx)) ctx.rt.join(p)
	function waitFor(type: CfEventType | string, n = 1, timeoutMs = 5000): Promise<SemanticEvent[]> {
		return new Promise((resolve, reject) => {
			const done = () => {
				const hits = events.filter((e) => e.type === type)
				if (hits.length >= n) { waiters.splice(waiters.indexOf(done), 1); clearTimeout(t); resolve(hits) }
			}
			const t = setTimeout(() => { waiters.splice(waiters.indexOf(done), 1); reject(new Error(`timeout waiting for ${n}× ${type}; saw ${events.filter((e) => e.type === type).length}. log: ${ctx.state.log.slice(-5).join(" | ")}`)) }, timeoutMs)
			waiters.push(done)
			done()
		})
	}
	return { ctx, you, events, waitFor }
}
