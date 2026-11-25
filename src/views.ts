// Plain-language views of a close for people who are not accountants: what needs attention,
// what is coming up, and how the numbers were checked. Every amount still comes from code.
import type { HouseholdState } from "./runtime.ts"
import type { Config } from "./config.ts"
import type { Risk, SourceRef } from "./types.ts"
import { render } from "./facts.ts"
import { formatMoney } from "./money.ts"
import { humanDate } from "./dates.ts"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "SALARY ACME TRADING LLC" → "Salary Acme Trading LLC": short all-caps words (ATM, LLC, EMI) stay as printed. */
const title = (s: string) => s.split(/\s+/).map((w) => (/^[A-Z]{2,3}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ")

/** "bank-b-card-2026-10" → "Bank B card · Oct 2026"; from the document id, no bank-specific code. */
export function docLabel(docId: string): string {
	const m = /^(.*)-(\d{4})-(\d{2})$/.exec(docId)
	const words = (m ? m[1]! : docId).split("-").map((w, i) => (i === 0 || w.length === 1 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ")
	return m ? `${words} · ${MONTHS[Number(m[3]) - 1]} ${m[2]}` : words
}

export function daysBetween(a: string, b: string): number {
	return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

/** What each participant is doing, in words a household understands. */
export function activityLabel(name: string): string {
	const reader = /^Reader (.+)$/.exec(name)
	if (reader) return `Reading ${docLabel(reader[1]!)}`
	return ({
		Clerk: "Reading cheques, payment plan and card terms",
		Categoriser: "Sorting spending into categories",
		"Cash Sentinel": "Planning cash for cheques",
		"Card Sentinel": "Planning card payments",
		Briefer: "Writing the summary",
	} as Record<string, string>)[name] ?? name
}

export interface AttentionItem {
	actionId: string; status: string; riskId: string; kind: Risk["type"]; date: string; daysAway: number
	headline: string; whyHtml: string; fixTitleHtml: string; fixHtml: string
	coverage: "covered" | "partly" | "open"
	/** the plan pays a card in more than one part */
	split: boolean
}

export function attention(state: HouseholdState, config: Config): AttentionItem[] {
	const current = new Map((state.forecast?.risks ?? []).map((r) => [r.id, r]))
	const out: AttentionItem[] = []
	for (const a of state.actions.values()) {
		if (a.status === "superseded") continue
		const risk = current.get(a.riskId) ?? state.risksSeen.get(a.riskId)
		if (!risk) continue
		const acct = state.accounts.get(risk.accountId)
		const when = humanDate(risk.date)
		let headline: string, why: string
		if (risk.type === "cheque_shortfall") {
			const c = [...state.commitments.values()].find((x) => x.chequeNo === risk.ref)
			headline = `${c?.purpose ?? "Cheque"} cheque ${risk.ref}${c ? ` to ${c.payee}` : ""} on ${when} could bounce`
			why = `{{A:${risk.accountId}}} is projected to hold {{F:before:${risk.id}}} just before it, short of the {{F:amount:${risk.id}}} cheque plus your safety buffer.`
		} else if (risk.type === "autopay_shortfall") {
			headline = `The card autopay on ${when} could fail`
			why = `{{A:${risk.accountId}}} is projected to hold {{F:before:${risk.id}}} just before the {{F:amount:${risk.id}}} autopay.`
		} else {
			headline = `${acct?.name ?? "Your card"} is due ${when}: pay in full to avoid interest`
			why = `The full balance is {{F:full:${risk.id}}}; the minimum is {{F:minimum:${risk.id}}}. Whatever stays unpaid is charged {{F:terms:${risk.accountId}:monthlyRatePct}} a month.`
		}
		let coverage: AttentionItem["coverage"]
		if (risk.type === "card_interest") {
			const granted = [...state.claims.values()].filter((c) => c.riskId === risk.id).reduce((s, c) => s + (state.grants.get(c.id)?.grantedMinor ?? 0), 0)
			coverage = granted >= (risk.fullMinor ?? 0) ? "covered" : granted > 0 ? "partly" : "open"
		} else coverage = !current.has(risk.id) ? "covered" : a.claimIds.length > 0 ? "partly" : "open"
		const t = render(a.title, state.facts, state.accounts)
		const b = render(a.body, state.facts, state.accounts)
		out.push({
			actionId: a.id, status: a.status, riskId: risk.id, kind: risk.type, date: risk.date, daysAway: daysBetween(config.asOf, risk.date),
			headline, whyHtml: render(why, state.facts, state.accounts).html, fixTitleHtml: t.html, fixHtml: b.html, coverage,
			split: a.claimIds.filter((id) => (state.grants.get(id)?.grantedMinor ?? 0) > 0).length > 1,
		})
	}
	return out.sort((x, y) => x.date.localeCompare(y.date))
}

export interface Upcoming { date: string; daysAway: number; accountName: string; label: string; amountText: string; direction: "in" | "out"; kind: string; estimated: boolean; sources: SourceRef[] }

/** The dated movements a household plans around: paydays, cheques, card payments, planned moves and big bills. */
export function upcoming(state: HouseholdState, config: Config): Upcoming[] {
	const f = state.forecast
	if (!f) return []
	const out: Upcoming[] = []
	const name = (id: string) => state.accounts.get(id)?.name ?? id
	for (const [accountId, flows] of Object.entries(f.flows)) {
		const acct = state.accounts.get(accountId)
		// Routine items stay off the list unless they are large: ten times the account's buffer.
		const big = (config.buffers[acct?.currency ?? ""] || 50000) * 10
		for (const fl of flows) {
			if (fl.date < config.asOf) continue
			if (fl.kind === "planned" && fl.amountMinor > 0) continue
			if (fl.kind === "recurring" && Math.abs(fl.amountMinor) < big) continue
			let label: string
			if (fl.kind === "cheque") { const c = [...state.commitments.values()].find((x) => x.chequeNo === fl.ref); label = `Cheque ${fl.ref}${c ? `: ${c.purpose}` : ""}` }
			else if (fl.kind === "autopay") label = `Card autopay${fl.ref ? ` for ${name(fl.ref)}` : ""}`
			else if (fl.kind === "planned") { const c = state.claims.get(fl.ref ?? ""); label = `Planned move to ${c ? name(c.to) : "another account"}` }
			else label = title(fl.label)
			const sign = fl.amountMinor >= 0 ? "+" : "-"
			out.push({ date: fl.date, daysAway: daysBetween(config.asOf, fl.date), accountName: name(accountId), label, amountText: `${sign}${formatMoney(Math.abs(fl.amountMinor), acct?.currency)}`,
				direction: fl.amountMinor >= 0 ? "in" : "out", kind: fl.kind, estimated: !!fl.estimated, sources: fl.sources })
		}
	}
	for (const r of f.risks.filter((x) => x.type === "card_interest")) {
		const nb = state.facts.get(`full:${r.id}`)
		out.push({ date: r.date, daysAway: daysBetween(config.asOf, r.date), accountName: name(r.accountId), label: "Card payment due", amountText: `-${formatMoney(r.fullMinor ?? 0, r.currency)}`,
			direction: "out", kind: "card_due", estimated: false, sources: nb?.sources ?? [] })
	}
	return out.filter((u) => u.sources.length > 0).sort((a, b) => a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction)).slice(0, 40)
}

export function checks(state: HouseholdState) {
	const docs = [...state.documents.values()]
	const statements = docs.filter((d) => d.kind === "statement")
	return {
		statements: {
			total: statements.length,
			verified: statements.filter((d) => d.status === "verified").length,
			reread: statements.filter((d) => d.status === "verified" && d.attempts > 1).map((d) => docLabel(d.id)),
			quarantined: statements.filter((d) => d.status === "quarantined").map((d) => ({ name: docLabel(d.id), reason: d.reason ?? "" })),
		},
		others: docs.filter((d) => d.kind !== "statement" && d.kind !== "unsupported").map((d) => ({ kind: d.kind, status: d.status })),
		unsupported: docs.filter((d) => d.kind === "unsupported").map((d) => d.file.split("/").pop()),
		rates: state.facts.list("fx:").map((f) => f.label),
		cheques: state.commitments.size,
		flags: state.flags.map((f) => f.reason),
		facts: state.facts.size,
	}
}
