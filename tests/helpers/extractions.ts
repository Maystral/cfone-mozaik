// Builds a correct extraction from the scenario by locating each row's printed line. Test-only.
import type { ControlName, ExtractionArgs, PageLines, PrintedAmount } from "../../src/types.ts"
import { formatMoney } from "../../src/money.ts"
import { formatRef, lineHasAmount } from "../../src/pdf/lines.ts"
import { isoFromPrinted } from "../../src/dates.ts"
import { scenario } from "./scenario.ts"

const plain = (m: number) => `${m < 0 ? "-" : ""}${Math.floor(Math.abs(m) / 100)}.${String(Math.abs(m) % 100).padStart(2, "0")}`
const LABELS: [string, ControlName][] = [
	["BALANCE BROUGHT FORWARD", "opening"], ["CLOSING BALANCE", "closing"], ["Opening balance", "opening"], ["Closing balance", "closing"],
	["Previous balance", "previousBalance"], ["Payments and credits", "paymentsAndCredits"], ["Purchases and debits", "purchases"], ["Purchases", "purchases"],
	["Finance charges", "financeCharges"], ["New balance", "newBalance"], ["Minimum amount due", "minimumDue"], ["Minimum payment due", "minimumDue"],
	["Total debits", "totalDebits"], ["Total credits", "totalCredits"],
]

function allLines(pages: PageLines[]) {
	return pages.flatMap((p) => p.lines.map((text, i) => ({ text, ref: formatRef(p.page, i + 1) })))
}

export function extractionFromScenario(accountId: string, period: string, pages: PageLines[], opts: { withDerived?: boolean } = {}): ExtractionArgs {
	const acct = scenario.accounts.find((a: { id: string }) => a.id === accountId)
	const bank = scenario.banks.find((b: { id: string }) => b.id === acct.bank).name
	const holder = scenario.people.find((p: { id: string }) => p.id === acct.owner).name.toUpperCase()
	const stmt = scenario.statements[accountId][period]
	const [y, m] = period.split("-").map(Number) as [number, number]
	const to = `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`
	const lines = allLines(pages)
	const controls: ExtractionArgs["controls"] = {}
	for (const l of lines) {
		const cols = l.text.split(/\s{2,}/)
		for (const [label, name] of LABELS) {
			const i = cols.indexOf(label)
			if (i >= 0 && controls[name] === undefined) {
				const v = cols[i + 1]
				if (v !== undefined && /\d/.test(v)) controls[name] = { text: v, source: l.ref }
			}
		}
		const due = cols.indexOf("Payment due date")
		if (due >= 0) controls.dueDate = { text: cols[due + 1]!, iso: isoFromPrinted(cols[due + 1]!)!, source: l.ref }
	}
	if (acct.format === "csv") {
		const f = lines[1]!.text.split(",")
		controls.opening = { text: f[5]!, source: lines[1]!.ref }
		controls.closing = { text: f[6]!, source: lines[1]!.ref }
	}
	const used = new Set<string>()
	let bal = controls.opening ? Number(controls.opening.text.replace(/[^\d.-]/g, "").replace(".", "")) : 0
	const rows: ExtractionArgs["rows"] = []
	for (const r of stmt.rows as { date: string; description: string; amountMinor: number }[]) {
		const isCard = acct.kind === "card"
		const cands = [...(r.amountMinor < 0 ? [formatMoney(-r.amountMinor) + " CR"] : []), formatMoney(r.amountMinor), plain(r.amountMinor), formatMoney(Math.abs(r.amountMinor))]
		const line = lines.find((l) => !used.has(l.ref) && l.text.includes(r.description) && isoFromPrinted(l.text.split(/\s{2,}|,/)[0]!) === r.date && cands.some((c) => lineHasAmount(pages, l.ref, c)))
		if (!line) throw new Error(`row not found: ${r.date} ${r.description}`)
		used.add(line.ref)
		const amount: PrintedAmount = { text: cands.find((c) => lineHasAmount(pages, line.ref, c))!, source: line.ref }
		const row: ExtractionArgs["rows"][number] = { date: r.date, description: r.description, amount, direction: isCard ? (r.amountMinor < 0 ? "credit" : "debit") : (r.amountMinor > 0 ? "credit" : "debit") }
		if (!isCard) {
			bal += r.amountMinor
			const bc = [formatMoney(bal), plain(bal)].find((c) => lineHasAmount(pages, line.ref, c))
			if (bc) row.balance = { text: bc, source: line.ref }
		}
		rows.push(row)
	}
	// Rows in printed order.
	rows.sort((a, b) => {
		const pa = /^p(\d+):l(\d+)$/.exec(a.amount.source)!, pb = /^p(\d+):l(\d+)$/.exec(b.amount.source)!
		return Number(pa[1]) - Number(pb[1]) || Number(pa[2]) - Number(pb[2])
	})
	if (opts.withDerived && controls.financeCharges) {
		rows.push({ date: to, description: "Finance charges", amount: { ...controls.financeCharges }, direction: "debit", derived: true })
	}
	return {
		docId: "", currency: acct.currency,
		account: { bank, product: acct.kind === "card" ? "credit_card" : "current", last4: acct.last4, holder },
		period: { from: `${period}-01`, to }, controls, rows,
	}
}
