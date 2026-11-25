// Interception on propose_action and publish_brief: a draft with a number outside a fact placeholder never runs.
import { FunctionCallItem, FunctionCallOutputItem, type ExecutableTransition, type InferenceInput, type InterceptionHandler } from "@mozaik-ai/core"
import type { Ctx } from "./kit.ts"
import { checkDraft } from "../domain/guard.ts"
import { emit } from "../events.ts"

export const GUARDED = new Set(["propose_action", "publish_brief"])

export class NumberGuard implements InterceptionHandler {
	constructor(private readonly ctx: Ctx, private readonly agentId: string) {}

	isSatisfiedBy(t: ExecutableTransition): boolean {
		if (t.nextStateId !== "function_call") return false
		const call = (t.input as { call?: FunctionCallItem }).call
		return !!call && GUARDED.has(call.name)
	}

	/** null when the draft passes, otherwise the reason. */
	verdict(call: FunctionCallItem): string | null {
		let args: { title?: string; body?: string; markdown?: string; claimIds?: string[] }
		try { args = JSON.parse(call.args) } catch { return "arguments are not valid JSON" }
		const claimIds = Array.isArray(args.claimIds) ? args.claimIds : []
		for (const id of claimIds) {
			const c = this.ctx.state.claims.get(id)
			if (!c || c.owner !== this.agentId) return `claim "${id}" is not yours`
		}
		const text = call.name === "publish_brief" ? String(args.markdown ?? "") : `${args.title ?? ""}\n${args.body ?? ""}`
		const r = checkDraft(text, this.ctx.state.facts, { ...(call.name === "propose_action" ? { claimIds } : {}), accountIds: new Set(this.ctx.state.accounts.keys()) })
		return r.ok ? null : r.reason
	}

	async handle(t: ExecutableTransition): Promise<ExecutableTransition> {
		const { call, inferenceInput } = t.input as { call: FunctionCallItem; inferenceInput: InferenceInput }
		const reason = this.verdict(call)
		if (reason === null) return t
		emit(this.ctx.rt, "guard.blocked", this.agentId, { agentId: this.agentId, tool: call.name, reason })
		inferenceInput.context.addContextItems([call, FunctionCallOutputItem.create(call.callId, `BLOCKED: ${reason}. Use placeholders only: {{F:<factId>}} for every amount, {{D:YYYY-MM-DD}}, {{A:<accountId>}}, {{C:<chequeNo>}}.`)])
		return { nextStateId: "inference", input: inferenceInput } as ExecutableTransition
	}
}
