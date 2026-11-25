import { SemanticEvent, type InferenceInput, type InferenceOutput, type InferenceRunner } from "@mozaik-ai/core"
import type { GenerativeModel } from "./models.ts"

/** Calls the model's endpoint directly (4.2.0 does not export the validator DefaultInferenceRunner needs). */
export class EndpointRunner implements InferenceRunner {
	constructor(private readonly models: GenerativeModel[]) {}
	async run(input: InferenceInput): Promise<InferenceOutput> {
		const m = this.models.find((x) => x.specification.name === input.model)
		if (!m) throw new Error(`unknown model "${input.model}"`)
		return m.endpoint.infer(input)
	}
	async *stream(input: InferenceInput): AsyncGenerator<SemanticEvent> {
		yield SemanticEvent.create("inference.output", input.model, await this.run(input))
	}
}
