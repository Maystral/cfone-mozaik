// Shared tools for participants: fresh-context loops, tool definitions, one-loop-at-a-time triggers.
import { createAgent, DeveloperMessageItem, ModelContext, type Agent, type InterceptionHandler, type SituationHandler, type Tool } from "@mozaik-ai/core"
import type { Config } from "../config.ts"
import type { HouseholdState, Runtime } from "../runtime.ts"

export interface Ctx { rt: Runtime; state: HouseholdState; config: Config }

export type Role = "reader" | "clerk" | "categoriser" | "cash-sentinel" | "card-sentinel" | "briefer"

export function roleInstruction(role: Role, body: string): string {
	return `ROLE=${role}\n${body}`
}

/** Starts a loop that is not awaited, on a fresh context, so loops of the same agent never share context. */
export function startLoop(ctx: Ctx, agent: Agent, task: string, opts: { model?: string; maxOutputTokens?: number; intercept?: InterceptionHandler } = {}): void {
	const context = ModelContext.create().addContextItem(DeveloperMessageItem.create(agent.getDeveloperMessage()))
	ctx.state.loopOwners.set(context.id, agent.getId())
	try {
		ctx.rt.runLoop(agent.getId(), task, { model: opts.model ?? ctx.config.model, maxOutputTokens: opts.maxOutputTokens ?? 4000, context, tools: agent.getTools() }, opts.intercept)
	} catch (e) {
		ctx.state.log.push(`loop for ${agent.getManifest().name} did not start: ${(e as Error).message}`)
	}
}

export function tool<A>(name: string, description: string, parameters: object, invoke: (args: A) => Promise<unknown>): Tool {
	return { type: "function", name, description, strict: false, parameters: parameters as Record<string, unknown>, invoke: invoke as (args: unknown) => Promise<unknown> }
}

/** Runs now if idle; otherwise remembers one more run for when the current one settles. */
export class OneAtATime {
	private running = false
	private dirty = false
	constructor(private readonly run: () => void) {}
	get busy(): boolean { return this.running }
	trigger(): void {
		if (this.running) { this.dirty = true; return }
		this.running = true
		this.run()
	}
	settle(): void {
		if (this.dirty) { this.dirty = false; this.run(); return }
		this.running = false
	}
}

/** A participant that reacts with code and never starts loops. */
export function codeParticipant(name: string, handlers: SituationHandler[]): Agent {
	return createAgent({ name, capabilities: ["code"], instruction: `${name} (code participant)`, tools: [], handlers })
}

/** A handler processor that never throws into Mozaik's synchronous fan-out. */
export function safely(ctx: Ctx, who: string, f: () => void | Promise<void>): void {
	try {
		const r = f()
		if (r instanceof Promise) r.catch((e) => ctx.state.log.push(`${who}: ${(e as Error).message}`))
	} catch (e) {
		ctx.state.log.push(`${who}: ${(e as Error).message}`)
	}
}

/** Every document is through intake: statements verified or quarantined, other documents processed or unsupported. */
export function intakeDone(state: HouseholdState): boolean {
	const docs = [...state.documents.values()]
	if (docs.length === 0) return false
	return docs.every((d) => d.kind === "statement" ? d.status === "verified" || d.status === "quarantined" : ["processed", "unsupported", "quarantined"].includes(d.status))
}
