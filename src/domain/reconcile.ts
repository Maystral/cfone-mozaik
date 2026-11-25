// The Auditor's checks. Layout-independent: a statement must agree with its own printed figures.
import type { ControlName, ExtractionArgs, Minor, PageLines } from "../types.ts"
import { CONTROL_NAMES } from "../types.ts"
import { formatMoney, isPrintedAmount, parsePrinted } from "../money.ts"
import { formatRef, lineAt, lineHasAmount, parseRef, tokens } from "../pdf/lines.ts"

function checkPrinted(what: string, text: string, source: string, pages: PageLines[]): string | undefined {
	try { parseRef(source) } catch { return `${what}: bad reference "${source}" (expected p<page>:l<line>)` }
	if (lineAt(pages, source) === undefined) return `${what}: ${source} does not exist`
	if (!isPrintedAmount(text)) return `${what}: "${text}" on ${source} is not an amount as printed`
	if (!lineHasAmount(pages, source, text)) return `${what}: "${text}" is not printed on ${source}`
	return undefined
}

/** Every cited line exists and contains the amount exactly as printed. */
export function sourceCheck(ex: ExtractionArgs, pages: PageLines[]): string[] {
	const out: string[] = []
	for (const name of CONTROL_NAMES) {
		const c = ex.controls[name]
		if (c) { const f = checkPrinted(`control ${name}`, c.text, c.source, pages); if (f) out.push(f) }
	}
	if (ex.controls.dueDate) {
		const d = ex.controls.dueDate
		const line = lineAt(pages, d.source)
		if (line === undefined) out.push(`due date: ${d.source} does not exist`)
		else if (!line.includes(d.text)) out.push(`due date: "${d.text}" is not printed on ${d.source}`)
	}
	ex.rows.forEach((r, i) => {
		const f = checkPrinted(`row ${i + 1}`, r.amount.text, r.amount.source, pages)
		if (f) out.push(f)
		if (r.balance) { const b = checkPrinted(`row ${i + 1} balance`, r.balance.text, r.balance.source, pages); if (b) out.push(b) }
	})
	return out
}

/** Signed effect of a row on the balance: current + credit / − debit; card + debit / − credit. */
export function signedRow(ex: ExtractionArgs, i: number): Minor {
	const r = ex.rows[i]!
	const m = parsePrinted(r.amount.text).minor
	const card = ex.account.product === "credit_card"
	return (r.direction === "credit") === card ? -m : m
}

/** Balance values printed with a sign: "-2,736.75" is a negative balance on a current account. */
function signedBalance(text: string): Minor {
	const p = parsePrinted(text)
	return /^\s*(?:[A-Z]{3}\s+)?-/.test(text) ? -p.minor : p.minor
}

function control(ex: ExtractionArgs, name: ControlName): Minor | undefined {
	const c = ex.controls[name]
	if (!c) return undefined
	return signedBalance(c.text)
}

export function reconcile(ex: ExtractionArgs): { ok: boolean; diffMinor: Minor; firstBadRow?: number; failures: string[] } {
	const failures: string[] = []
	let signed: Minor[]
	try { signed = ex.rows.map((_, i) => signedRow(ex, i)) } catch (e) { return { ok: false, diffMinor: 0, failures: [(e as Error).message] } }
	const card = ex.account.product === "credit_card"
	const credits = ex.rows.reduce((a, r, i) => a + (r.direction === "credit" ? Math.abs(signed[i]!) : 0), 0)
	const debits = ex.rows.reduce((a, r, i) => a + (r.direction === "debit" ? Math.abs(signed[i]!) : 0), 0)
	let firstBadRow: number | undefined
	let diff = 0
	if (!card) {
		const opening = control(ex, "opening"), closing = control(ex, "closing")
		if (opening === undefined) failures.push("missing control opening")
		if (closing === undefined) failures.push("missing control closing")
		if (opening !== undefined && closing !== undefined) diff = opening + credits - debits - closing
		const td = control(ex, "totalDebits"), tc = control(ex, "totalCredits")
		if (td !== undefined && td !== debits) failures.push(`total debits printed ${formatMoney(td)}, rows sum to ${formatMoney(debits)}`)
		if (tc !== undefined && tc !== credits) failures.push(`total credits printed ${formatMoney(tc)}, rows sum to ${formatMoney(credits)}`)
		// Running balance chain, in date order (some banks print newest first).
		if (opening !== undefined && ex.rows.length > 0 && ex.rows.every((r) => r.balance)) {
			const n = ex.rows.length
			const newestFirst = ex.rows[0]!.date > ex.rows[n - 1]!.date
			const order = [...Array(n).keys()]
			if (newestFirst) order.reverse()
			let prev = opening
			for (const i of order) {
				const bal = signedBalance(ex.rows[i]!.balance!.text)
				if (prev + signed[i]! !== bal) { firstBadRow = i; failures.push(`running balance breaks at row ${i + 1} (${ex.rows[i]!.amount.source})`); break }
				prev = bal
			}
		}
	} else {
		const prev = control(ex, "previousBalance"), next = control(ex, "newBalance")
		if (prev === undefined) failures.push("missing control previousBalance")
		if (next === undefined) failures.push("missing control newBalance")
		if (prev !== undefined && next !== undefined) diff = prev - credits + debits - next
		const pc = control(ex, "paymentsAndCredits")
		if (pc !== undefined && pc !== credits) failures.push(`payments and credits printed ${formatMoney(pc)}, rows sum to ${formatMoney(credits)}`)
	}
	if (diff !== 0) failures.unshift(`difference ${formatMoney(Math.abs(diff))}`)
	return { ok: failures.length === 0, diffMinor: Math.abs(diff), firstBadRow, failures }
}

export function citedRefs(ex: ExtractionArgs): Set<string> {
	return new Set(ex.rows.flatMap((r) => [r.amount.source, ...(r.balance ? [r.balance.source] : [])]))
}

/** A line whose printed amount equals the difference and that no row cites. */
export function findHint(diffMinor: Minor, pages: PageLines[], cited: Set<string>): { ref: string; label: string } | undefined {
	if (diffMinor === 0) return undefined
	for (const p of pages) {
		for (let i = 0; i < p.lines.length; i++) {
			const ref = formatRef(p.page, i + 1)
			if (cited.has(ref)) continue
			const line = p.lines[i]!
			const hit = tokens(line).some((t) => isPrintedAmount(t) && parsePrinted(t).minor === diffMinor)
			if (hit) return { ref, label: line.split(/\s{2,}/)[0]!.trim() }
		}
	}
	return undefined
}
