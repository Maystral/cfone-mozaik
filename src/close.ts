// One close: a fresh runtime, every participant joined, close.requested emitted, resolved on close.completed.
import type { InferenceRunner, SemanticEvent } from "@mozaik-ai/core"
import type { Config } from "./config.ts"
import type { HouseholdState } from "./runtime.ts"
import type { Metrics } from "./types.ts"
import { initClose } from "./setup.ts"
import { createYou } from "./agents/you.ts"
import { createObserver } from "./agents/observer.ts"
import { createCoordinator } from "./agents/coordinator.ts"
import { createReader } from "./agents/reader.ts"
import { createAuditor } from "./agents/auditor.ts"
import { createClerk } from "./agents/clerk.ts"
import { createCategoriser } from "./agents/categoriser.ts"
import { createMatcher } from "./agents/matcher.ts"
import { createForecaster } from "./agents/forecaster.ts"
import { createTreasurer } from "./agents/treasurer.ts"
import { createCashSentinel, createCardSentinel } from "./agents/sentinels.ts"
import { createBriefer } from "./agents/briefer.ts"
import { DISCLAIMER, render, renderAction } from "./facts.ts"
import { emit } from "./events.ts"
import type { Ctx } from "./agents/kit.ts"

export interface CloseResult {
	state: HouseholdState; metrics: Metrics; brief?: { plain: string; html: string }
	actions: { plain: string; html: string; id: string }[]; durationMs: number; timedOut: boolean
}

export interface RunningClose { ctx: Ctx; youId: string; done: Promise<CloseResult> }

export function renderBrief(state: HouseholdState): { plain: string; html: string } | undefined {
	if (!state.brief) return undefined
	const r = render(state.brief.markdown, state.facts, state.accounts)
	return { plain: `${r.plain}\n\n${DISCLAIMER}`, html: `${r.html}\n\n${DISCLAIMER}` }
}

export function liveActions(state: HouseholdState): { plain: string; html: string; id: string }[] {
	return [...state.actions.values()].filter((a) => a.status === "proposed" || a.status === "approved").sort((a, b) => a.riskId.localeCompare(b.riskId))
		.map((a) => ({ id: a.id, ...renderAction(a, state.facts, state.accounts) }))
}

/** Starts a close and returns at once; `done` resolves when the brief is out or the close times out. */
export function startClose(opts: { config: Config; onEvent?: (e: SemanticEvent) => void; runner?: InferenceRunner; folder?: string }): RunningClose {
	const { config } = opts
	const ctx = initClose(config, opts.runner)
	const t0 = Date.now()
	let resolveDone!: (r: CloseResult) => void
	const done = new Promise<CloseResult>((r) => { resolveDone = r })
	let finished = false
	const finish = (timedOut: boolean) => {
		if (finished) return
		finished = true
		clearTimeout(timer)
		ctx.state.finishMetrics?.()
		resolveDone({ state: ctx.state, metrics: { ...ctx.state.metrics }, brief: renderBrief(ctx.state), actions: liveActions(ctx.state), durationMs: Date.now() - t0, timedOut })
	}
	const you = createYou(ctx)
	const observer = createObserver(ctx, (e) => { opts.onEvent?.(e); if (e.type === "close.completed") setImmediate(() => finish(false)) })
	const clerk = createClerk(ctx)
	const treasurer = createTreasurer(ctx)
	for (const p of [you, observer, createAuditor(ctx), clerk, createCategoriser(ctx), createMatcher(ctx), createForecaster(ctx), treasurer.participant,
		createCashSentinel(ctx, treasurer), createCardSentinel(ctx, treasurer), createBriefer(ctx),
		createCoordinator(ctx, (doc) => createReader(ctx, doc), () => clerk.getId())]) ctx.rt.join(p)
	// A referenced timer keeps the process alive while the close settles; cleared when it finishes.
	const timer = setTimeout(() => finish(true), config.closeTimeoutMs)
	emit(ctx.rt, "close.requested", you.getId(), { folder: opts.folder ?? config.dataDir })
	return { ctx, youId: you.getId(), done }
}

export function runClose(opts: { config: Config; onEvent?: (e: SemanticEvent) => void; runner?: InferenceRunner; folder?: string }): Promise<CloseResult> {
	return startClose(opts).done
}
