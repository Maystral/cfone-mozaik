// A generic table reader, honest about its limits: it reads dated rows and the summary labels it knows,
// so a charge printed only in a summary is missed until the Auditor's hint names its line.
import { registerPolicy, type PolicyInput } from "../offline-runner.ts"
import { isoFromPrinted } from "../../dates.ts"
import { isPrintedAmount, parsePrinted } from "../../money.ts"
import { signedBalanceText } from "../../domain/reconcile.ts"
import type { ControlName, ExtractionArgs, PrintedAmount } from "../../types.ts"

const LABELS: [RegExp, ControlName][] = [
	[/^balance brought forward$/i, "opening"], [/^opening balance$/i, "opening"], [/^closing balance$/i, "closing"],
	[/^total debits$/i, "totalDebits"], [/^total credits$/i, "totalCredits"], [/^previous balance$/i, "previousBalance"],
	[/^payments and credits$/i, "paymentsAndCredits"], [/^purchases( and debits)?$/i, "purchases"],
	[/^new balance$/i, "newBalance"], [/^minimum (amount|payment) due$/i, "minimumDue"],
]
const DATE = String.raw`(\d{2}\/\d{2}\/\d{4}|\d{1,2} [A-Z][a-z]{2} \d{4}|\d{4}-\d{2}-\d{2})`
const PERIOD = new RegExp(`${DATE}\\s*(?:to|-)\\s*${DATE}`)

interface L { ref: string; text: string; cols: string[] }

function parseLines(task: string): { docId: string; hintRef?: string; lines: L[] } {
	const docId = /docId=(\S+)/.exec(task)?.[1] ?? ""
	const hintRef = /HINT ref=(p\d+:l\d+)/.exec(task)?.[1]
	const lines: L[] = []
	for (const raw of task.split("\n")) {
		const m = /^(p\d+:l\d+)  (.*)$/.exec(raw)
		if (m) lines.push({ ref: m[1]!, text: m[2]!, cols: m[2]!.split(/\s{2,}/) })
	}
	return { docId, hintRef, lines }
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

function readCsv(docId: string, lines: L[]): ExtractionArgs | undefined {
	const head = lines[0]?.text.toLowerCase().split(",") ?? []
	if (!head.includes("opening_balance")) return undefined
	const rec = lines[1]!, f = rec.text.split(",")
	const at = (n: string) => f[head.indexOf(n)] ?? ""
	const name = at("account")
	const m = /^(.*?)\s+(current|card|credit card)\s+(\d{4})$/i.exec(name)
	const ex: ExtractionArgs = {
		docId, currency: at("currency").toUpperCase(),
		account: { bank: m?.[1] ?? name, product: m && /card/i.test(m[2]!) ? "credit_card" : "current", last4: m?.[3] ?? "", holder: at("holder") },
		period: { from: at("period_from"), to: at("period_to") },
		controls: { opening: { text: at("opening_balance"), source: rec.ref }, closing: { text: at("closing_balance"), source: rec.ref } },
		rows: [],
	}
	const hdr = lines.findIndex((l, i) => i > 1 && /^date,/i.test(l.text))
	const cols = lines[hdr]?.text.toLowerCase().split(",") ?? []
	for (const l of lines.slice(hdr + 1)) {
		const v = l.text.split(",")
		const date = isoFromPrinted(v[cols.indexOf("date")] ?? "")
		const amount = v[cols.indexOf("amount")] ?? ""
		if (!date || !isPrintedAmount(amount)) continue
		const bal = v[cols.indexOf("balance")]
		ex.rows.push({ date, description: v[cols.indexOf("description")] ?? "", amount: { text: amount, source: l.ref }, direction: amount.startsWith("-") ? "debit" : "credit", ...(bal && isPrintedAmount(bal) ? { balance: { text: bal, source: l.ref } } : {}) })
	}
	return ex
}

function readPdf(docId: string, lines: L[], hintRef?: string): ExtractionArgs {
	const firstRow = lines.findIndex((l) => new RegExp(`^${DATE}$`).test(l.cols[0] ?? "") && l.cols.length >= 3)
	const header = lines.slice(0, firstRow < 0 ? 8 : firstRow).map((l) => l.text).join("\n")
	const all = lines.map((l) => l.text).join("\n")
	const currency = (/Currency\s+([A-Z]{3})\b/.exec(header) ?? /\b([A-Z]{3}) [\d,]+\.\d{2}\b/.exec(header) ?? /\(([A-Z]{3})\)/.exec(all) ?? /\b([A-Z]{3}) account\b/.exec(header))?.[1] ?? ""
	const product = /credit card|card statement/i.test(header) ? "credit_card" : "current"
	const last4 = /ending\s+(\d{4})/i.exec(header)?.[1] ?? ""
	let holder = ""
	for (const l of lines) {
		const i = l.cols.findIndex((c) => /^(account holder|cardholder|holder)$/i.test(c))
		if (i >= 0 && l.cols[i + 1]) { holder = l.cols[i + 1]!; break }
	}
	if (!holder) holder = lines.find((l) => /ending\s+\d{4}/i.test(l.text) && /^[A-Z][A-Z ]+$/.test(l.cols[0] ?? ""))?.cols[0] ?? ""
	const pm = PERIOD.exec(header)
	const ex: ExtractionArgs = {
		docId, currency, account: { bank: titleCase(lines[0]?.text ?? ""), product, last4, holder },
		period: { from: isoFromPrinted(pm?.[1] ?? "") ?? "", to: isoFromPrinted(pm?.[2] ?? "") ?? "" }, controls: {}, rows: [],
	}
	const controlRefs = new Set<string>()
	for (const l of lines) {
		l.cols.forEach((c, i) => {
			for (const [re, name] of LABELS) {
				const v = l.cols[i + 1]
				if (re.test(c) && v && isPrintedAmount(v) && !ex.controls[name]) { ex.controls[name] = { text: v, source: l.ref }; controlRefs.add(l.ref) }
			}
			if (/^payment due date$/i.test(c) && l.cols[i + 1]) {
				const iso = isoFromPrinted(l.cols[i + 1]!)
				if (iso) ex.controls.dueDate = { text: l.cols[i + 1]!, iso, source: l.ref }
			}
		})
	}
	// Rows: lines that start with a date and end with one or two amounts.
	let section: string | undefined
	const raw: { l: L; date: string; description: string; amount: string; balance?: string; section?: string }[] = []
	for (const l of lines) {
		const sec = /card ending (\d{4})/i.exec(l.text)
		if (/cardholder/i.test(l.text) && sec) section = sec[1]
		if (controlRefs.has(l.ref)) continue
		const date = isoFromPrinted(l.cols[0] ?? "")
		if (!date || l.cols.length < 3) continue
		const tail = l.cols.slice(1)
		const amounts: string[] = []
		while (tail.length > 1 && isPrintedAmount(tail[tail.length - 1]!) && amounts.length < 2) amounts.unshift(tail.pop()!)
		if (amounts.length === 0) continue
		raw.push({ l, date, description: tail.join(" "), amount: amounts[0]!, balance: amounts[1], section })
	}
	const card = product === "credit_card"
	const opening = ex.controls.opening ? signedBalanceText(ex.controls.opening.text) : undefined
	// Direction: sign or CR first; otherwise follow the running balance in date order.
	const order = raw.map((_, i) => i)
	if (raw.length > 1 && raw[0]!.date > raw[raw.length - 1]!.date) order.reverse()
	const dir: ("debit" | "credit")[] = new Array(raw.length)
	let prev = opening
	for (const i of order) {
		const r = raw[i]!
		const signed = /^-|CR$/.test(r.amount.trim())
		if (card) dir[i] = signed ? "credit" : "debit"
		else if (r.amount.trim().startsWith("-")) dir[i] = "debit"
		else if (r.balance && prev !== undefined) dir[i] = signedBalanceText(r.balance) === prev + parsePrinted(r.amount).minor ? "credit" : "debit"
		else dir[i] = "credit"
		if (r.balance) prev = signedBalanceText(r.balance)
	}
	raw.forEach((r, i) => ex.rows.push({
		date: r.date, description: r.description, amount: { text: r.amount, source: r.l.ref }, direction: dir[i]!,
		...(r.balance ? { balance: { text: r.balance, source: r.l.ref } as PrintedAmount } : {}), ...(card && r.section ? { cardLast4: r.section } : {}),
	}))
	if (hintRef) {
		const h = lines.find((l) => l.ref === hintRef)
		const v = h?.cols.find((c) => isPrintedAmount(c))
		if (h && v) ex.rows.push({ date: ex.period.to, description: h.cols[0]!, amount: { text: v, source: h.ref }, direction: "debit", derived: true })
	}
	return ex
}

export function offlineRead(task: string): ExtractionArgs {
	const { docId, hintRef, lines } = parseLines(task)
	return readCsv(docId, lines) ?? readPdf(docId, lines, hintRef)
}

registerPolicy("reader", (p: PolicyInput) => {
	if (p.calls.some((c) => c.name === "submit_extraction" && c.output !== undefined)) return { say: "Submitted." }
	return { call: "submit_extraction", args: offlineRead(p.task) }
})
