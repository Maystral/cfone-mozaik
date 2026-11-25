// Watches every event: loop spans, metrics, settled detection, an optional event log.
import { appendFileSync, mkdirSync } from "node:fs"
import { createHuman, SituationSpecification, type Human, type SemanticEvent } from "@mozaik-ai/core"
import { intakeDone, type Ctx } from "./kit.ts"
import { emit } from "../events.ts"

class Always extends SituationSpecification { isSatisfiedBy(): boolean { return true } }

const LOOP_EVENTS = new Set(["message_received.started", "message_received.completed", "inference.started", "inference.stream", "inference.completed",
	"function_call.started", "function_call.completed", "model.answer", "interception.started", "interception.finished"])

/** Small, id-only view of an event, safe to log or stream. */
export function summarize(e: SemanticEvent): { type: string; producer: string; at: number; payload: Record<string, unknown> } {
	const p = (e.payload ?? {}) as Record<string, unknown>
	let payload: Record<string, unknown>
	if (LOOP_EVENTS.has(e.type)) {
		payload = { loopId: p.loopId }
		if (e.type === "function_call.started") payload.tool = (p.call as { name?: string } | undefined)?.name
	} else payload = Object.fromEntries(Object.entries(p).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v)))
	return { type: e.type, producer: e.producerId, at: e.occurredAt.getTime(), payload }
}

export const SETTLE_QUIET_MS = 750

export function createObserver(ctx: Ctx, sink?: (e: SemanticEvent) => void): Human {
	const { state } = ctx
	const t0 = Date.now()
	const open = new Set<string>()
	let started = false, settled = false
	let lastVersion = -1, lastChange = Date.now()
	let timer: NodeJS.Timeout | undefined
	const record = process.env.CFONE_RECORD === "1"
	if (record) { mkdirSync("out", { recursive: true }); appendFileSync("out/events.jsonl", "") }

	const openSpans = () => state.spans.filter((s) => s.end === undefined).length
	const terminal = () => intakeDone(state)
	const check = () => {
		if (settled) return
		const v = state.forecast?.version ?? 0
		if (v !== lastVersion) { lastVersion = v; lastChange = Date.now(); return }
		if (open.size === 0 && terminal() && Date.now() - lastChange >= SETTLE_QUIET_MS && state.pendingWork === 0) {
			settled = true
			if (timer) clearInterval(timer)
			emit(ctx.rt, "close.settled", self.getId(), {})
		}
	}
	const finish = () => {
		const m = state.metrics
		m.participants = state.getParticipants().length
		m.facts = state.facts.size
		// total time with two or more loops open
		const pts = state.spans.flatMap((s) => [[s.start, 1], [s.end ?? Date.now() - t0, -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
		let cur = 0, prev = 0, overlap = 0
		for (const [t, d] of pts) { if (cur >= 2) overlap += t - prev; cur += d; prev = t }
		m.overlapMs = overlap
		m.loops = state.spans.length
	}

	const self: Human = createHuman({
		name: "Observer",
		capabilities: ["observe"],
		handlers: [{
			specification: new Always(),
			processor: {
				apply: ({ event }) => {
					try {
						sink?.(event)
						if (record) appendFileSync("out/events.jsonl", JSON.stringify(summarize(event)) + "\n")
						const p = (event.payload ?? {}) as { loopId?: string }
						switch (event.type) {
							case "close.requested":
								if (!started) { started = true; timer = setInterval(check, 50); timer.unref() }
								break
							case "message_received.started":
								if (p.loopId) open.add(p.loopId)
								break
							case "inference.started":
								if (p.loopId && !state.spans.some((s) => s.loopId === p.loopId)) {
									state.spans.push({ agentId: event.producerId, loopId: p.loopId, start: Date.now() - t0 })
									state.metrics.loops = state.spans.length
									state.metrics.peakLoops = Math.max(state.metrics.peakLoops, openSpans())
								}
								break
							case "model.answer": {
								if (p.loopId) open.delete(p.loopId)
								const s = state.spans.find((x) => x.loopId === p.loopId)
								if (s && s.end === undefined) s.end = Date.now() - t0
								break
							}
							case "statement.rejected": state.metrics.rejections++; break
							case "statement.quarantined": state.metrics.quarantined++; break
							case "reservation.bumped": state.metrics.bumps++; break
							case "guard.blocked": state.metrics.blocked++; break
							case "agent.failed": state.metrics.failures++; break
							case "brief.published":
								finish()
								emit(ctx.rt, "close.completed", self.getId(), { metrics: { ...state.metrics } })
								break
						}
					} catch (e) {
						state.log.push(`observer: ${(e as Error).message}`)
					}
				},
			},
		}],
	})
	state.finishMetrics = finish
	return self
}
