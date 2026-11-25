import type { Minor } from "./types.ts"
import { parsePrinted } from "./money.ts"

export type Mode = "anthropic" | "openai" | "compatible" | "offline"
export interface Config {
	mode: Mode
	model: string
	fastModel: string
	baseURL?: string
	asOf: string
	horizonDays: number
	homeCurrency: string
	buffers: Record<string, Minor>
	maxInFlight: number
	offlineLatencyMs: number
	chaos: boolean
	dataDir: string
	port: number
	closeTimeoutMs: number
}

function parseBuffers(s: string): Record<string, Minor> {
	const out: Record<string, Minor> = {}
	for (const part of s.split(",").map((p) => p.trim()).filter(Boolean)) {
		const [cur, amount] = part.split("=")
		if (!cur || !amount) throw new Error(`bad CFONE_BUFFERS entry "${part}"`)
		out[cur.trim().toUpperCase()] = parsePrinted(amount.trim()).minor
	}
	return out
}

function int(v: string | undefined, d: number): number {
	const n = v === undefined || v === "" ? d : Number(v)
	if (!Number.isFinite(n)) throw new Error(`not a number: ${v}`)
	return n
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	let mode: Mode
	let model: string
	let fastModel: string
	const baseURL = env.CFONE_OPENAI_BASE_URL || undefined
	if (env.CFONE_OFFLINE === "1") mode = "offline"
	else if (baseURL) mode = "compatible"
	else if (env.ANTHROPIC_API_KEY) mode = "anthropic"
	else if (env.OPENAI_API_KEY) mode = "openai"
	else mode = "offline"
	switch (mode) {
		case "anthropic":
			model = env.CFONE_MODEL || "claude-sonnet-5-5"
			fastModel = env.CFONE_FAST_MODEL || "claude-haiku-4-5"
			break
		case "openai":
			model = env.CFONE_MODEL || "gpt-5.5"
			fastModel = env.CFONE_FAST_MODEL || "gpt-5.4-mini"
			break
		case "compatible":
			if (!env.CFONE_MODEL) throw new Error("CFONE_OPENAI_BASE_URL needs CFONE_MODEL")
			model = env.CFONE_MODEL
			fastModel = env.CFONE_FAST_MODEL || env.CFONE_MODEL
			break
		default:
			model = "offline"
			fastModel = "offline"
	}
	return {
		mode, model, fastModel, baseURL: mode === "compatible" ? baseURL : undefined,
		asOf: env.CFONE_AS_OF || "2026-11-05",
		horizonDays: 90,
		homeCurrency: (env.CFONE_HOME_CURRENCY || "AED").toUpperCase(),
		buffers: parseBuffers(env.CFONE_BUFFERS || "AED=500.00,EUR=100.00"),
		maxInFlight: int(env.CFONE_MAX_IN_FLIGHT, 6),
		offlineLatencyMs: int(env.CFONE_OFFLINE_LATENCY_MS, 300),
		chaos: env.CFONE_CHAOS === "1",
		dataDir: env.CFONE_DATA_DIR || "data/synthetic",
		port: int(env.PORT, 3000),
		closeTimeoutMs: int(env.CFONE_CLOSE_TIMEOUT_MS, 180000),
	}
}
