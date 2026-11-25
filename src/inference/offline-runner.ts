// Offline mode: a scripted policy per role reads the same context a model would and emits the same tool calls.
import { DeveloperMessageItem, FunctionCallItem, FunctionCallOutputItem, ModelMessageItem, SemanticEvent, UserMessageItem, type InferenceInput, type InferenceOutput, type InferenceRunner } from "@mozaik-ai/core"

export interface PolicyInput {
	role: string; instruction: string; task: string; chaos: boolean
	/** tool calls made so far in this loop, with their outputs */
	calls: { name: string; args: Record<string, unknown>; output?: string }[]
	input: InferenceInput
}
export type PolicyStep = { call: string; args: object } | { say: string }
export type Policy = (p: PolicyInput) => PolicyStep

export const policies = new Map<string, Policy>()
export function registerPolicy(role: string, p: Policy): void { policies.set(role, p) }

let seq = 0

export function readPolicyInput(input: InferenceInput, chaos: boolean): PolicyInput {
	const items = input.context.getItems()
	const dev = items.find((i) => i instanceof DeveloperMessageItem) as DeveloperMessageItem | undefined
	const user = items.find((i) => i instanceof UserMessageItem) as UserMessageItem | undefined
	const instruction = dev?.content.text ?? ""
	const role = /^ROLE=([\w-]+)/.exec(instruction)?.[1] ?? ""
	const calls: PolicyInput["calls"] = []
	for (const it of items) {
		if (it instanceof FunctionCallItem) {
			let args: Record<string, unknown> = {}
			try { args = JSON.parse(it.args) } catch { /* keep empty */ }
			calls.push({ name: it.name, args })
		} else if (it instanceof FunctionCallOutputItem) {
			const c = calls[calls.length - 1]
			if (c) c.output = it.output.text
		}
	}
	return { role, instruction, task: user?.content.text ?? "", chaos, calls, input }
}

export class OfflineRunner implements InferenceRunner {
	constructor(private readonly opts: { latencyMs: number; chaos: boolean }) {}
	async run(input: InferenceInput): Promise<InferenceOutput> {
		if (this.opts.latencyMs > 0) await new Promise((r) => setTimeout(r, this.opts.latencyMs * (0.6 + Math.random() * 0.8)))
		const p = readPolicyInput(input, this.opts.chaos)
		const policy = policies.get(p.role)
		const step: PolicyStep = policy ? policy(p) : { say: `no policy for role "${p.role}"` }
		const item = "call" in step
			? FunctionCallItem.rehydrate({ callId: `off-${++seq}`, name: step.call, args: JSON.stringify(step.args) })
			: ModelMessageItem.rehydrate({ text: step.say })
		return { items: [item], tokenUsage: undefined, rowResponse: { offline: true } }
	}
	async *stream(input: InferenceInput): AsyncGenerator<SemanticEvent> {
		yield SemanticEvent.create("inference.output", input.model, await this.run(input))
	}
}
