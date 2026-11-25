// Recurring items from the two latest verified statements of each current account.
import type { Account, Minor, Row, SourceRef, Statement } from "../types.ts"
import { dayOf } from "../dates.ts"

export interface Recurring { accountId: string; description: string; amountMinor: Minor; day: number; sources: SourceRef[] }

export function normalise(description: string): string {
	return description.toUpperCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim()
}

/** Money moving between the household's own accounts is not income or spending. */
export function isOwnMovement(row: Row, accounts: Account[], matchedRowIds?: Set<string>): boolean {
	if (matchedRowIds?.has(row.id)) return true
	const d = row.description.toUpperCase()
	if (d.includes("CARD PAYMENT") || d.includes("CARD AUTOPAY")) return true
	return [...new Set(accounts.map((a) => a.bank.toUpperCase()))].some((b) => d.includes(b))
}

export function latestStatements(statements: Statement[], accountId: string, n: number): Statement[] {
	return statements.filter((s) => s.accountId === accountId).sort((a, b) => b.period.to.localeCompare(a.period.to)).slice(0, n)
}

export function detectRecurring(statements: Statement[], accounts: Account[], matchedRowIds?: Set<string>): Recurring[] {
	const out: Recurring[] = []
	for (const acct of accounts.filter((a) => a.kind === "current")) {
		const [latest, prior] = latestStatements(statements, acct.id, 2)
		if (!latest || !prior) continue
		for (const r of [...latest.rows].sort((x, y) => x.date.localeCompare(y.date))) {
			if (r.derived || isOwnMovement(r, accounts, matchedRowIds)) continue
			const n = normalise(r.description)
			const s = prior.rows.find((p) => !p.derived && normalise(p.description) === n && (p.amountMinor > 0) === (r.amountMinor > 0) && p.amountMinor !== 0)
			if (!s) continue
			const ratio = Math.abs(r.amountMinor) / Math.abs(s.amountMinor)
			if (ratio < 0.85 || ratio > 1.15) continue
			if (Math.abs(dayOf(r.date) - dayOf(s.date)) > 3) continue
			out.push({ accountId: acct.id, description: n, amountMinor: r.amountMinor, day: dayOf(r.date), sources: [r.source, s.source] })
		}
	}
	return out
}
