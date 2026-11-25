// Offline sentinels: claim, split around payday, then propose with placeholders. In chaos mode the first draft types a number.
import { registerPolicy, type PolicyInput, type PolicyStep } from "../offline-runner.ts"
import type { RiskView } from "../../agents/sentinels.ts"

function lastRisks(p: PolicyInput): RiskView[] | undefined {
	for (let i = p.calls.length - 1; i >= 0; i--) {
		const c = p.calls[i]!
		if (c.name === "get_risks" && c.output) { try { return (JSON.parse(c.output) as { risks: RiskView[] }).risks } catch { return undefined } }
	}
	return undefined
}

function coverText(v: RiskView): string {
	const c = v.cover[0]
	if (!c) return ""
	return ` {{A:${c.accountId}}} can close the gap with {{F:${c.factId}}}${c.rateFactId ? ` at the sourced rate {{F:${c.rateFactId}}}` : ""}; moving money between currencies is your call.`
}

export function draft(v: RiskView, kind: "cash" | "card"): { title: string; body: string; claimIds: string[] } {
	const claimIds = v.claims.map((c) => c.claimId)
	if (kind === "card") {
		const main = v.claims.find((c) => c.byDate <= v.byDate)
		const rest = v.claims.find((c) => c.byDate > v.byDate)
		const title = `Pay {{A:${v.accountId}}} by {{D:${v.date}}}`
		if (!main || main.status === "refused") return { title, claimIds, body: `{{A:${v.accountId}}} is due {{D:${v.date}}}: {{F:full:${v.riskId}}} in full, or at least the minimum {{F:minimum:${v.riskId}}}. There is no free cash to pay it in time; interest will be charged on what is unpaid.` }
		if (main.status === "granted") return { title, claimIds, body: `Pay {{F:${main.grantFactId}}} from {{A:${main.fromAccount}}} to {{A:${v.accountId}}} by {{D:${main.byDate}}}: the full balance, so no interest.` }
		const late = rest && rest.status !== "refused" ? ` and {{F:${rest.grantFactId}}} on {{D:${rest.byDate}}} after payday` : ""
		const interest = rest?.interestFactId ? ` Paying part after the due date costs about {{F:${rest.interestFactId}}} in interest.` : main.interestFactId ? ` The unpaid part costs about {{F:${main.interestFactId}}} in interest.` : ""
		return { title, claimIds, body: `Pay {{F:${main.grantFactId}}} from {{A:${main.fromAccount}}} to {{A:${v.accountId}}} by {{D:${main.byDate}}}${late}.${interest} The minimum due is {{F:minimum:${v.riskId}}}.` }
	}
	const what = v.chequeNo ? `{{C:${v.chequeNo}}}` : `the card autopay`
	const title = v.chequeNo ? `Cover {{C:${v.chequeNo}}} due {{D:${v.date}}}` : `Cover the card autopay on {{D:${v.date}}}`
	const c = v.claims[0]
	if (!c || c.status === "refused") return { title, claimIds, body: `${what} on {{D:${v.date}}} is short by {{F:shortfall:${v.riskId}}} and no account in the same currency has free cash in time.${coverText(v)}` }
	if (c.status === "granted") return { title, claimIds, body: `Move {{F:${c.grantFactId}}} from {{A:${c.fromAccount}}} to {{A:${c.to}}} by {{D:${c.byDate}}} so ${what} clears.` }
	return { title, claimIds, body: `Move {{F:${c.grantFactId}}} from {{A:${c.fromAccount}}} to {{A:${c.to}}} by {{D:${c.byDate}}}. That still leaves ${what} on {{D:${v.date}}} short by {{F:${c.remainderFactId ?? `shortfall:${v.riskId}`}}}.${coverText(v)}` }
}

function policy(kind: "cash" | "card") {
	return (p: PolicyInput): PolicyStep => {
		const last = p.calls.at(-1)
		if (!last) return { call: "get_risks", args: {} }
		if (last.name === "propose_action" && !last.output?.startsWith("BLOCKED")) return { say: "Proposed." }
		if (last.name === "reserve_funds") return { call: "get_risks", args: {} }
		const risks = lastRisks(p) ?? []
		const v = risks.find((r) => r.needs !== null)
		if (!v) return { say: "Nothing needs work." }
		if (v.needs === "claim") {
			const args = kind === "cash"
				? { riskId: v.riskId, fromAccount: v.fromCandidates![0]!, to: v.accountId, amountFactId: `shortfall:${v.riskId}`, byDate: v.byDate }
				: { riskId: v.riskId, fromAccount: v.payFrom!, to: v.accountId, amountFactId: `full:${v.riskId}`, byDate: v.byDate }
			return { call: "reserve_funds", args }
		}
		if (v.needs === "rest") {
			const main = v.claims.find((c) => c.byDate <= v.byDate)!
			return { call: "reserve_funds", args: { riskId: v.riskId, fromAccount: v.payFrom!, to: v.accountId, amountFactId: main.remainderFactId!, byDate: v.nextIncome! } }
		}
		const d = draft(v, kind)
		const blockedBefore = p.calls.some((c) => c.name === "propose_action" && c.output?.startsWith("BLOCKED"))
		if (p.chaos && !blockedBefore) return { call: "propose_action", args: { riskId: v.riskId, claimIds: d.claimIds, title: d.title, body: `Move AED 6,400 now. ${d.body}` } }
		return { call: "propose_action", args: { riskId: v.riskId, ...d } }
	}
}

registerPolicy("cash-sentinel", policy("cash"))
registerPolicy("card-sentinel", policy("card"))
