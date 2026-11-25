// Statement layouts for the synthetic household. Fictional banks only; no real branding or wording.
import { formatMoney, pctOf } from "../src/money.ts"

export type Cell = { text: string; x: number; right?: number; bold?: boolean }
export type Line = Cell[]
export interface PdfDoc { pages: Line[][] }

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Scenario = any
export type SRow = { date: string; description: string; amountMinor: number; card?: string }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
export const dMonY = (iso: string, pad = true) => `${pad ? iso.slice(8, 10) : String(Number(iso.slice(8, 10)))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
export const plain = (minor: number) => `${minor < 0 ? "-" : ""}${Math.floor(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, "0")}`
const money = (m: number) => formatMoney(m)

export function periodOf(period: string): { from: string; to: string } {
	const [y, m] = period.split("-").map(Number) as [number, number]
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
	return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` }
}

export function nextMonthDay(period: string, day: number): string {
	const [y, m] = period.split("-").map(Number) as [number, number]
	const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
	return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export interface CurrentTotals { opening: number; debits: number; credits: number; closing: number }
export interface CardTotals { previous: number; payments: number; purchases: number; finance: number; newBalance: number; minimumDue: number; dueDate: string }

/** Chains control figures across periods for a current account. */
export function currentTotals(stmts: Record<string, { opening?: number; rows: SRow[] }>): Record<string, CurrentTotals> {
	const out: Record<string, CurrentTotals> = {}
	let opening = 0
	for (const p of Object.keys(stmts).sort()) {
		const s = stmts[p]!
		opening = s.opening ?? opening
		const debits = s.rows.filter((r) => r.amountMinor < 0).reduce((a, r) => a - r.amountMinor, 0)
		const credits = s.rows.filter((r) => r.amountMinor > 0).reduce((a, r) => a + r.amountMinor, 0)
		out[p] = { opening, debits, credits, closing: opening - debits + credits }
		opening = out[p]!.closing
	}
	return out
}

/** Card figures: finance charge on the unpaid previous balance at the monthly rate; minimum as a share of the new balance. */
export function cardTotals(stmts: Record<string, { previous?: number; rows: SRow[] }>, terms: { monthlyRatePct: string; minDuePct: string }, dueDay: number): Record<string, CardTotals> {
	const out: Record<string, CardTotals> = {}
	let previous = 0
	for (const p of Object.keys(stmts).sort()) {
		const s = stmts[p]!
		previous = s.previous ?? previous
		const purchases = s.rows.filter((r) => r.amountMinor > 0).reduce((a, r) => a + r.amountMinor, 0)
		const payments = s.rows.filter((r) => r.amountMinor < 0).reduce((a, r) => a - r.amountMinor, 0)
		const unpaid = Math.max(previous - payments, 0)
		const finance = unpaid > 0 ? pctOf(unpaid, terms.monthlyRatePct) : 0
		const newBalance = previous - payments + purchases + finance
		out[p] = { previous, payments, purchases, finance, newBalance, minimumDue: pctOf(newBalance, terms.minDuePct), dueDate: nextMonthDay(p, dueDay) }
		previous = newBalance
	}
	return out
}

const FOOTER: Line[] = [[{ text: "Fictional bank. Synthetic data for a demo.", x: 40 }]]
const L = (...cells: Cell[]): Line => cells
const c = (text: string, x: number, right?: number): Cell => ({ text, x, right })

/** Layout A: debit and credit columns, running balance, totals at the end. */
export function layoutA(bank: string, holder: string, last4: string, currency: string, period: string, t: CurrentTotals, rows: SRow[]): PdfDoc {
	const { from, to } = periodOf(period)
	const p: Line[] = [
		L({ text: bank.toUpperCase(), x: 40, bold: true }),
		L(c("STATEMENT OF ACCOUNT", 40)),
		L(c("Account holder", 40), c(holder, 120), c(`Current account ending ${last4}`, 200), c(`Currency ${currency}`, 400)),
		L(c("Period", 40), c(`${dmy(from)} to ${dmy(to)}`, 120)),
		L(c("Date", 40), c("Description", 110), c("Debit", 330, 400), c("Credit", 410, 480), c("Balance", 490, 560)),
		L(c(dmy(from), 40), c("BALANCE BROUGHT FORWARD", 110), c(money(t.opening), 490, 560)),
	]
	let bal = t.opening
	for (const r of rows) {
		bal += r.amountMinor
		const amt = money(Math.abs(r.amountMinor))
		p.push(L(c(dmy(r.date), 40), c(r.description, 110), r.amountMinor < 0 ? c(amt, 330, 400) : c(amt, 410, 480), c(money(bal), 490, 560)))
	}
	p.push(L(c(dmy(to), 40), c("CLOSING BALANCE", 110), c(money(t.closing), 490, 560)))
	p.push(L(c("Total debits", 40), c(money(t.debits), 330, 400), c("Total credits", 410), c(money(t.credits), 490, 560)))
	return { pages: [p, FOOTER] }
}

/** Layout B: summary first, one section per cardholder, credits marked CR. */
export function layoutB(bank: string, holders: { name: string; last4: string; role: string }[], currency: string, limit: number, period: string, t: CardTotals, rows: SRow[]): PdfDoc {
	const { from, to } = periodOf(period)
	const primary = holders.find((h) => h.role === "primary")!
	const p: Line[] = [
		L({ text: bank.toUpperCase(), x: 40, bold: true }),
		L(c("CREDIT CARD STATEMENT", 40)),
		L(c(`Primary card ending ${primary.last4}`, 40), c(`Currency ${currency}`, 150), c(`Statement period ${dmy(from)} to ${dmy(to)}`, 225), c(`Credit limit ${money(limit)}`, 430)),
		L(c("Previous balance", 40), c(money(t.previous), 200, 280)),
		L(c("Payments and credits", 40), c(money(t.payments), 200, 280)),
		L(c("Purchases and debits", 40), c(money(t.purchases + t.finance), 200, 280)),
		L(c("New balance", 40), c(money(t.newBalance), 200, 280)),
		L(c("Minimum amount due", 40), c(money(t.minimumDue), 200, 280)),
		L(c("Payment due date", 40), c(dmy(t.dueDate), 200, 280)),
	]
	for (const h of holders) {
		p.push(L(c("Cardholder", 40), c(h.name, 110), c(`card ending ${h.last4}`, 180), ...(h.role === "primary" ? [] : [c(h.role, 280)])))
		p.push(L(c("Date", 40), c("Description", 110), c("Amount", 400, 500)))
		for (const r of rows.filter((x) => x.card === h.last4).sort((a, b) => a.date.localeCompare(b.date))) {
			const amt = money(Math.abs(r.amountMinor)) + (r.amountMinor < 0 ? " CR" : "")
			p.push(L(c(dmy(r.date), 40), c(r.description, 110), c(amt, 400, 500)))
		}
	}
	return { pages: [p, FOOTER] }
}

/** Layout C: newest first, signed amounts, running balance. */
export function layoutC(bank: string, holder: string, last4: string, currency: string, period: string, t: CurrentTotals, rows: SRow[]): PdfDoc {
	const { from, to } = periodOf(period)
	const p: Line[] = [
		L({ text: bank.toUpperCase(), x: 40, bold: true }),
		L(c("Account statement", 40)),
		L(c(holder, 40), c(`${currency} account ending ${last4}`, 100)),
		L(c(`${dMonY(from, false)} - ${dMonY(to, false)}`, 40)),
		L(c("Opening balance", 40), c(`${currency} ${money(t.opening)}`, 200, 300)),
		L(c("Closing balance", 40), c(`${currency} ${money(t.closing)}`, 200, 300)),
		L(c("Date", 40), c("Description", 110), c("Amount", 330, 430), c("Balance", 450, 550)),
	]
	let bal = t.opening
	const withBal = rows.map((r) => { bal += r.amountMinor; return { r, bal } })
	for (const { r, bal: b } of withBal.reverse()) p.push(L(c(dMonY(r.date), 40), c(r.description, 110), c(money(r.amountMinor), 330, 430), c(money(b), 450, 550)))
	return { pages: [p, FOOTER] }
}

/** Layout D: the finance charge is printed only in the summary, never in the table. */
export function layoutD(bank: string, holder: string, last4: string, currency: string, limit: number, period: string, t: CardTotals, rows: SRow[]): PdfDoc {
	const { from, to } = periodOf(period)
	const p: Line[] = [
		L({ text: bank.toUpperCase(), x: 40, bold: true }),
		L(c("Credit card statement", 40)),
		L(c(holder, 40), c(`Card ending ${last4}`, 100), c(`Limit ${currency} ${money(limit)}`, 200)),
		L(c(`${dMonY(from, false)} - ${dMonY(to, false)}`, 40)),
		L(c("Previous balance", 40), c(money(t.previous), 200, 280)),
		L(c("Payments and credits", 40), c(money(t.payments), 200, 280)),
		L(c("Purchases", 40), c(money(t.purchases), 200, 280)),
		L(c("Finance charges", 40), c(money(t.finance), 200, 280)),
		L(c("New balance", 40), c(money(t.newBalance), 200, 280)),
		L(c("Minimum payment due", 40), c(money(t.minimumDue), 200, 280)),
		L(c("Payment due date", 40), c(dMonY(t.dueDate), 200, 280)),
		L(c("Date", 40), c("Description", 110), c(`Amount (${currency})`, 400, 500)),
	]
	for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) p.push(L(c(dMonY(r.date), 40), c(r.description, 110), c(money(r.amountMinor), 400, 500)))
	return { pages: [p, FOOTER] }
}

/** Layout E: CSV export, header record, rows oldest first with a running balance, no thousands separators. */
export function layoutE(bank: string, last4: string, holder: string, currency: string, period: string, t: CurrentTotals, rows: SRow[]): string {
	const { from, to } = periodOf(period)
	const out = ["account,currency,holder,period_from,period_to,opening_balance,closing_balance",
		`${bank} current ${last4},${currency},${holder},${from},${to},${plain(t.opening)},${plain(t.closing)}`,
		"date,description,amount,balance"]
	let bal = t.opening
	for (const r of rows) { bal += r.amountMinor; out.push(`${r.date},${r.description},${plain(r.amountMinor)},${plain(bal)}`) }
	return out.join("\n") + "\n"
}

export function paymentPlan(plan: Scenario, buyer: string): PdfDoc {
	const p: Line[] = [
		L({ text: plan.developer.toUpperCase(), x: 40, bold: true }),
		L(c("PAYMENT PLAN", 40)),
		L(c("Project", 40), c(String(plan.project).replace(/ \(fictional\)$/, ""), 110), c("Buyer", 360), c(buyer, 400)),
		L(c("Price", 40), c(`AED ${money(plan.price)}`, 110)),
		L(c("No.", 40), c("Due", 70), c("Share", 260), c("Amount (AED)", 300, 380), c("Method", 400)),
	]
	for (const i of plan.instalments) {
		const due = String(i.status).startsWith("on handover") ? `On handover (expected ${dmy(i.date)})` : dmy(i.date)
		const method = i.status === "paid" ? "Paid" : String(i.status).includes("bank finance") ? "Bank finance" : "Post-dated cheque"
		p.push(L(c(String(i.n), 40), c(due, 70), c(`${i.pct}%`, 260), c(money(i.amountMinor), 300, 380), c(method, 400)))
	}
	p.push(L(c("Post-dated cheques are drawn on the buyer's current account. Fictional developer. Synthetic data for a demo.", 40)))
	return { pages: [p] }
}

export function keyFacts(cards: { bank: string; monthlyRatePct: string; minDuePct: string; lateFee: number; autopayFromLast4?: string }[]): PdfDoc {
	const p: Line[] = [L({ text: "CARD KEY FACTS (SYNTHETIC)", x: 40, bold: true })]
	for (const k of cards) p.push(L(c(`${k.bank} credit card`, 40), c(`Monthly rate ${k.monthlyRatePct}%`, 140), c(`Minimum due ${k.minDuePct}% of new balance`, 240), c(`Late payment fee AED ${money(k.lateFee)}`, 400)))
	p.push(L(c("Interest is charged on the amount unpaid at the due date. Paying the full new balance keeps purchases interest-free.", 40)))
	for (const k of cards) if (k.autopayFromLast4) p.push(L(c(`${k.bank} credit card pays the full new balance automatically from current account ending ${k.autopayFromLast4}.`, 40)))
	return { pages: [p] }
}
