import { defineRuntime, RuntimeState } from "@mozaik-ai/core"
import type { Config } from "./config.ts"
import { FactStore } from "./facts.ts"
import { emptyMetrics, type Account, type Action, type CardTerms, type Claim, type Commitment, type Doc, type ExtractionArgs, type Grant, type Metrics, type Span, type Statement } from "./types.ts"

export class HouseholdState extends RuntimeState {
	documents = new Map<string, Doc>()
	extractions = new Map<string, ExtractionArgs[]>()
	statements = new Map<string, Statement>()
	accounts = new Map<string, Account>()
	commitments = new Map<string, Commitment>()
	cardTerms = new Map<string, CardTerms>()
	transfers = new Map<string, unknown>()
	categories = new Map<string, unknown>()
	claims = new Map<string, Claim>()
	grants = new Map<string, Grant>()
	actions = new Map<string, Action>()
	facts = new FactStore()
	forecast?: unknown
	brief?: { markdown: string }
	spans: Span[] = []
	metrics: Metrics = emptyMetrics()
	log: string[] = []
	constructor(readonly config: Config) {
		super()
	}
}

export type Runtime = ReturnType<typeof defineRuntime<HouseholdState>>

/** A fresh runtime. Call once per close; a runtime initialises only once. */
export function createRuntime(): Runtime {
	return defineRuntime<HouseholdState>()
}
