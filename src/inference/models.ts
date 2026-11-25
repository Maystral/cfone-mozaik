import { OpenAIChatCompletions, supportedModels } from "@mozaik-ai/core"
export type GenerativeModel = (typeof supportedModels)[number]
import type { Config } from "../config.ts"

/** Built-in models, plus any configured model id the package does not list, plus a local OpenAI-compatible server. */
export function modelsFor(config: Config): GenerativeModel[] {
	const out: GenerativeModel[] = [...supportedModels]
	if (config.mode === "compatible") {
		const base = supportedModels.find((m) => m.specification.name === "gpt-5.4-mini")!
		const endpoint = new OpenAIChatCompletions(undefined, { baseURL: config.baseURL, apiKey: process.env.OPENAI_API_KEY || "not-needed" })
		for (const name of new Set([config.model, config.fastModel]))
			out.push({ endpoint, specification: { ...base.specification, name, provider: "openai-compatible", supportsReasoningEffort: false, supportedReasoningEfforts: [] } })
		return out
	}
	if (config.mode === "anthropic" || config.mode === "openai") {
		for (const name of new Set([config.model, config.fastModel])) {
			if (out.some((m) => m.specification.name === name)) continue
			const template = supportedModels.find((m) => m.specification.provider === config.mode)
			if (template) out.push({ endpoint: template.endpoint, specification: { ...template.specification, name } })
		}
	}
	return out
}
