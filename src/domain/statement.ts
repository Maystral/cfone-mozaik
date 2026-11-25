// A verified extraction becomes a statement and an account. Ids come from what is printed, never from the file.
import type { Account, ControlName, ExtractionArgs, Row, SourceRef, Statement } from "../types.ts"
import { CONTROL_NAMES } from "../types.ts"
import { parseRef } from "../pdf/lines.ts"
import { signedBalanceText, signedRow } from "./reconcile.ts"

export function slug(s: string): string {
	return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** `<bank slug>-<current|card>-<last four>`, e.g. bank-a-current-4417. */
export function accountIdFor(bank: string, product: "current" | "credit_card" | "card", last4: string): string {
	return `${slug(bank)}-${product === "current" ? "current" : "card"}-${last4}`
}

export function accountName(bank: string, kind: "current" | "card", last4: string): string {
	return `${bank} ${kind} ·${last4}`
}

export function refOf(docId: string, ref: string): SourceRef {
	const r = parseRef(ref)
	return { docId, page: r.page, line: r.line }
}

export function statementFromExtraction(ex: ExtractionArgs, attempts: number): { statement: Statement; account: Account } {
	const kind = ex.account.product === "current" ? "current" : "card"
	const accountId = accountIdFor(ex.account.bank, ex.account.product, ex.account.last4)
	const account: Account = { id: accountId, bank: ex.account.bank, kind, currency: ex.currency, last4: ex.account.last4, holder: ex.account.holder, name: accountName(ex.account.bank, kind, ex.account.last4) }
	const id = `${accountId}:${ex.period.to.slice(0, 7)}`
	const controls: Statement["controls"] = {}
	for (const name of CONTROL_NAMES) {
		const c = ex.controls[name as ControlName]
		if (c) controls[name] = { minor: signedBalanceText(c.text), source: refOf(ex.docId, c.source) }
	}
	const rows: Row[] = ex.rows.map((r, i) => ({
		id: `${id}#${i + 1}`, date: r.date, description: r.description, amountMinor: signedRow(ex, i),
		...(r.cardLast4 ? { cardLast4: r.cardLast4 } : {}), ...(r.derived ? { derived: true } : {}),
		source: refOf(ex.docId, r.amount.source),
	}))
	const statement: Statement = {
		id, accountId, kind, currency: ex.currency, period: { ...ex.period }, controls, rows, attempts,
		...(ex.controls.dueDate ? { dueDate: { iso: ex.controls.dueDate.iso, source: refOf(ex.docId, ex.controls.dueDate.source) } } : {}),
	}
	return { statement, account }
}
