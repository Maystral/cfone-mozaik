// Verified statements, commitments, terms and rates for the synthetic household, built through the real conversion path. Test-only.
import { readPdfLines, readTextLines } from "../../src/pdf/lines.ts"
import { statementFromExtraction } from "../../src/domain/statement.ts"
import type { Account, CardTerms, Claim, Commitment, Grant, Statement } from "../../src/types.ts"
import type { ForecastInput, Rate } from "../../src/domain/forecast.ts"
import { extractionFromScenario } from "./extractions.ts"
import { golden, scenario } from "./scenario.ts"

export const DOCS: [string, string, string][] = [
	["bank-a-current-2026-09", "bank-a-current-4417", "2026-09"], ["bank-a-current-2026-10", "bank-a-current-4417", "2026-10"],
	["bank-a-card-2026-09", "bank-a-card-8821", "2026-09"], ["bank-a-card-2026-10", "bank-a-card-8821", "2026-10"],
	["bank-b-current-2026-09", "bank-b-current-0263", "2026-09"], ["bank-b-current-2026-10", "bank-b-current-0263", "2026-10"],
	["bank-b-card-2026-09", "bank-b-card-5530", "2026-09"], ["bank-b-card-2026-10", "bank-b-card-5530", "2026-10"],
	["bank-c-current-2026-09", "bank-c-current-7710", "2026-09"], ["bank-c-current-2026-10", "bank-c-current-7710", "2026-10"],
]

export async function verifiedHousehold(): Promise<{ statements: Statement[]; accounts: Account[] }> {
	const statements: Statement[] = []
	const accounts = new Map<string, Account>()
	for (const [docId, accountId, period] of DOCS) {
		const file = `data/synthetic/${docId}.${accountId.startsWith("bank-c") ? "csv" : "pdf"}`
		const pages = file.endsWith(".csv") ? await readTextLines(file) : await readPdfLines(file)
		const ex = { ...extractionFromScenario(accountId, period, pages, { withDerived: true }), docId }
		const { statement, account } = statementFromExtraction(ex, 1)
		statements.push(statement)
		accounts.set(account.id, account)
	}
	const order = scenario.accounts.map((a: { id: string }) => a.id) as string[]
	return { statements, accounts: order.map((id) => accounts.get(id)!) }
}

export function scenarioCommitments(): Commitment[] {
	return scenario.cheques.map((c: { no: string; payee: string; amountMinor: number; date: string; purpose: string }, i: number) => ({
		id: `cheque-${c.no}`, chequeNo: c.no, accountId: "bank-a-current-4417", payee: c.payee, amountMinor: c.amountMinor, currency: "AED",
		date: c.date, purpose: c.purpose, source: { docId: "cheque-register", page: 1, line: i + 2 },
	}))
}

export function scenarioTerms(): CardTerms[] {
	return Object.entries(scenario.cardTerms as Record<string, { monthlyRatePct: string; minDuePct: string; lateFee: number }>).map(([accountId, t], i) => ({
		accountId, monthlyRatePct: t.monthlyRatePct, minimumDuePct: t.minDuePct, lateFeeMinor: t.lateFee,
		autopayFrom: accountId === "bank-a-card-8821" ? "bank-a-current-4417" : undefined,
		sources: [{ docId: "card-key-facts", page: 1, line: i + 2 }],
	}))
}

export const RATES: Rate[] = [{ base: "EUR", quote: "AED", date: "2026-10-31", rate: "4.2500", factId: "fx:EUR:AED:2026-10-31" }]

export async function baseInput(): Promise<Omit<ForecastInput, "claims" | "grants">> {
	const { statements, accounts } = await verifiedHousehold()
	return {
		asOf: "2026-11-05", horizonDays: 90, homeCurrency: "AED", buffers: { AED: 50000, EUR: 10000 }, rates: RATES,
		statements, accounts, commitments: scenarioCommitments(), cardTerms: scenarioTerms(),
	}
}

type G = { id: string; riskId: string; priority: 1 | 2 | 3; from: string; to: string; requestedMinor: number; byDate: string; grantedMinor: number; availableMinor: number; windowEnds: string; status: Grant["status"] }
export function goldenClaims(list: G[]): { claims: Claim[]; grants: Grant[] } {
	return {
		claims: list.map((g, i) => ({ id: g.id, owner: "test", riskId: g.riskId, priority: g.priority, fromAccount: g.from, to: g.to, amountFactId: "", requestedMinor: g.requestedMinor, byDate: g.byDate, seq: i })),
		grants: list.map((g) => ({ claimId: g.id, grantedMinor: g.grantedMinor, availableMinor: g.availableMinor, windowEnds: g.windowEnds, status: g.status })),
	}
}
export const goldenFinal = () => goldenClaims(golden.grantsFinal)
