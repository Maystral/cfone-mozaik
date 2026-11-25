// One runtime per close: a fresh defineRuntime(), shared state, and inference that never throws.
import type { InferenceRunner } from "@mozaik-ai/core"
import type { Config } from "./config.ts"
import { createRuntime, HouseholdState } from "./runtime.ts"
import { SafeRunner } from "./inference/safe-runner.ts"
import { OfflineRunner } from "./inference/offline-runner.ts"
import { EndpointRunner } from "./inference/endpoint-runner.ts"
import { modelsFor } from "./inference/models.ts"
import { emit } from "./events.ts"
import type { Ctx } from "./agents/kit.ts"
import "./inference/offline/index.ts"

export function innerRunner(config: Config): InferenceRunner {
	return config.mode === "offline" ? new OfflineRunner({ latencyMs: config.offlineLatencyMs, chaos: config.chaos }) : new EndpointRunner(modelsFor(config))
}

export function initClose(config: Config, inner?: InferenceRunner, safe: { retries?: number; baseDelayMs?: number } = {}): Ctx {
	const rt = createRuntime()
	const state = new HouseholdState(config)
	const ctx: Ctx = { rt, state, config }
	const runner = new SafeRunner(inner ?? innerRunner(config), {
		maxInFlight: config.maxInFlight,
		retries: safe.retries ?? (config.mode === "offline" ? 1 : 2),
		baseDelayMs: safe.baseDelayMs ?? (config.mode === "offline" ? 5 : 800),
		onInFlight: (n) => { state.metrics.peakInFlight = Math.max(state.metrics.peakInFlight, n) },
		onFailure: (input, error) => {
			const agentId = state.loopOwners.get(input.context.id)
			const reason = error instanceof Error ? error.message : String(error)
			state.log.push(`inference failed for ${agentId ?? "unknown agent"}: ${reason}`)
			if (agentId && state.getParticipant(agentId)) emit(rt, "agent.failed", agentId, { agentId, reason })
		},
	})
	rt.initializeRuntime({ state, inferenceRunnerConfig: { runner } })
	return ctx
}
