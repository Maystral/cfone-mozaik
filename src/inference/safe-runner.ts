// Every inference goes through here: retries with backoff, a concurrency cap, and never a thrown error.
import { ModelMessageItem, SemanticEvent, type InferenceInput, type InferenceOutput, type InferenceRunner } from "@mozaik-ai/core"

export interface SafeRunnerOptions {
	maxInFlight: number; retries: number; baseDelayMs: number
	onFailure: (input: InferenceInput, error: unknown) => void
	onInFlight?: (n: number) => void
}

export class SafeRunner implements InferenceRunner {
	private inFlight = 0
	private readonly waiting: (() => void)[] = []
	constructor(private readonly inner: InferenceRunner, private readonly opts: SafeRunnerOptions) {}

	private async acquire(): Promise<void> {
		if (this.inFlight >= Math.max(1, this.opts.maxInFlight)) await new Promise<void>((r) => this.waiting.push(r))
		this.inFlight++
		this.opts.onInFlight?.(this.inFlight)
	}
	private release(): void {
		this.inFlight--
		this.opts.onInFlight?.(this.inFlight)
		this.waiting.shift()?.()
	}

	async run(input: InferenceInput): Promise<InferenceOutput> {
		let last: unknown
		for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
			if (attempt > 0) {
				const d = this.opts.baseDelayMs * 2 ** (attempt - 1)
				await new Promise((r) => setTimeout(r, d + Math.random() * d * 0.25))
			}
			await this.acquire()
			try { return await this.inner.run(input) } catch (e) { last = e } finally { this.release() }
		}
		try { this.opts.onFailure(input, last) } catch { /* a failing listener must not crash the loop */ }
		const message = last instanceof Error ? last.message : String(last)
		return { items: [ModelMessageItem.rehydrate({ text: `AGENT_ERROR: ${message}` })], tokenUsage: undefined, rowResponse: { error: true } }
	}

	async *stream(input: InferenceInput): AsyncGenerator<SemanticEvent> {
		yield SemanticEvent.create("inference.output", input.model, await this.run(input))
	}
}
