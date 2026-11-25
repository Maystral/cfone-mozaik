// Pairs money leaving one own account with money arriving in another, so neither counts as spending or income.
import type { Minor, Row, Statement } from "../types.ts"

export interface TransferPair { id: string; out: string; in: string; amountMinor: Minor; kind: "transfer" | "card_payment" }

const OWN = /TRANSFER|CARD PAYMENT|AUTOPAY|PAYMENT RECEIVED|PAYMENT - THANK YOU|BANK [A-Z]\b/i
const daysBetween = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000)

export function matchTransfers(statements: Statement[]): TransferPair[] {
	// Cash view: positive means money arrives in the account. A card payment lowers the card balance, so it arrives.
	const flows: { row: Row; accountId: string; card: boolean; cash: Minor }[] = []
	for (const s of statements) for (const r of s.rows) if (!r.derived && OWN.test(r.description)) flows.push({ row: r, accountId: s.accountId, card: s.kind === "card", cash: s.kind === "card" ? -r.amountMinor : r.amountMinor })
	const cands: { o: (typeof flows)[number]; i: (typeof flows)[number]; dist: number; fit: number }[] = []
	for (const o of flows) for (const i of flows) {
		if (o.cash >= 0 || i.cash <= 0 || o.accountId === i.accountId || -o.cash !== i.cash || o.card) continue
		const dist = daysBetween(o.row.date, i.row.date)
		if (dist > 3) continue
		const cardWords = /CARD/i.test(o.row.description)
		cands.push({ o, i, dist, fit: cardWords === i.card ? 0 : 1 })
	}
	cands.sort((a, b) => a.dist - b.dist || a.fit - b.fit || a.o.row.id.localeCompare(b.o.row.id) || a.i.row.id.localeCompare(b.i.row.id))
	const used = new Set<string>()
	const out: TransferPair[] = []
	for (const c of cands) {
		if (used.has(c.o.row.id) || used.has(c.i.row.id)) continue
		used.add(c.o.row.id); used.add(c.i.row.id)
		out.push({ id: `${c.o.row.id}~${c.i.row.id}`, out: c.o.row.id, in: c.i.row.id, amountMinor: c.i.cash, kind: c.i.card ? "card_payment" : "transfer" })
	}
	return out
}
