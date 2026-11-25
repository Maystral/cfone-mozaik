// Domain types shared by every module. Extend, do not rename.
export type Minor = number
export type SourceRef = { docId: string; page: number; line: number } | { factId: string }
export type DocKind = "statement" | "cheque_register" | "payment_plan" | "card_terms" | "fx_rates" | "unsupported"
export type DocStatus = "received" | "verified" | "rejected" | "quarantined" | "processed" | "unsupported"
export interface PageLines { page: number; lines: string[] }
export interface Doc { id: string; file: string; kind: DocKind; pages: PageLines[]; status: DocStatus; assignee?: string; attempts: number; reason?: string }
export interface PrintedAmount { text: string; source: string }
export interface PrintedDate { text: string; iso: string; source: string }
export type ControlName = "opening" | "closing" | "totalDebits" | "totalCredits" | "previousBalance"
	| "paymentsAndCredits" | "purchases" | "financeCharges" | "newBalance" | "minimumDue"
export const CONTROL_NAMES: ControlName[] = ["opening", "closing", "totalDebits", "totalCredits", "previousBalance",
	"paymentsAndCredits", "purchases", "financeCharges", "newBalance", "minimumDue"]
export interface ExtractionRow {
	date: string; description: string; amount: PrintedAmount; direction: "debit" | "credit"
	balance?: PrintedAmount; cardLast4?: string; derived?: boolean
}
export interface ExtractionArgs {
	docId: string
	currency: string
	account: { bank: string; product: "current" | "credit_card"; last4: string; holder: string }
	period: { from: string; to: string }
	controls: Partial<Record<ControlName, PrintedAmount>> & { dueDate?: PrintedDate }
	rows: ExtractionRow[]
}
export interface Account { id: string; bank: string; kind: "current" | "card"; currency: string; last4: string; holder: string; name: string }
// Row sign: current accounts + money in, − money out. Cards + purchases and charges, − payments.
export interface Row { id: string; date: string; description: string; amountMinor: Minor; cardLast4?: string; derived?: boolean; source: SourceRef }
export interface Statement {
	id: string; accountId: string; kind: "current" | "card"; currency: string; period: { from: string; to: string }
	controls: Partial<Record<ControlName, { minor: Minor; source: SourceRef }>>; dueDate?: { iso: string; source: SourceRef }; rows: Row[]; attempts: number
}
export interface Commitment { id: string; chequeNo: string; accountId: string; payee: string; amountMinor: Minor; currency: string; date: string; purpose: string; source: SourceRef }
export interface CardTerms { accountId: string; monthlyRatePct: string; minimumDuePct: string; lateFeeMinor: Minor; autopayFrom?: string; sources: SourceRef[] }
export interface Risk {
	id: string; type: "cheque_shortfall" | "autopay_shortfall" | "card_interest"; accountId: string; currency: string; date: string
	amountMinor: Minor; projectedBeforeMinor?: Minor; shortfallMinor?: Minor; fullMinor?: Minor; minimumMinor?: Minor; ref?: string
}
export interface Claim { id: string; owner: string; riskId: string; priority: 1 | 2 | 3; fromAccount: string; to: string; amountFactId: string; requestedMinor: Minor; byDate: string; seq: number }
export interface Grant { claimId: string; grantedMinor: Minor; availableMinor: Minor; windowEnds: string; status: "granted" | "partial" | "refused"; reason?: string }
export interface Action { id: string; riskId: string; owner: string; claimIds: string[]; title: string; body: string; status: "proposed" | "superseded" | "approved" | "snoozed" }
export interface Span { agentId: string; loopId: string; start: number; end?: number }
export interface Metrics {
	participants: number; loops: number; peakLoops: number; peakInFlight: number; overlapMs: number
	rejections: number; quarantined: number; conflicts: number; bumps: number; blocked: number; failures: number; facts: number
}
export function emptyMetrics(): Metrics {
	return { participants: 0, loops: 0, peakLoops: 0, peakInFlight: 0, overlapMs: 0, rejections: 0, quarantined: 0, conflicts: 0, bumps: 0, blocked: 0, failures: 0, facts: 0 }
}
