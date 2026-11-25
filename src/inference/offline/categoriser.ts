// Offline categoriser: keyword rules, first match wins.
import { registerPolicy, type PolicyInput } from "../offline-runner.ts"

const RULES: [RegExp, string][] = [
	[/FAMILY SUPPORT/i, "family support"],
	[/TRANSFER|CARD PAYMENT|AUTOPAY|PAYMENT RECEIVED|PAYMENT - THANK YOU/i, "transfer"],
	[/SALARY/i, "income"],
	[/FINANCE CHARGE|\bFEE\b/i, "fees and interest"],
	[/INSURANCE/i, "insurance"],
	[/ELECTRICITY|WATER|MOBILE|PHONE|INTERNET/i, "utilities and telecom"],
	[/HYPERMARKET|GROCERY|SUPERMARKET/i, "groceries"],
	[/RESTAURANT|FOOD DELIVERY|COFFEE/i, "dining and delivery"],
	[/FUEL|CAR LOAN|TAXI|PARKING/i, "transport and fuel"],
	[/NURSERY|ACADEMY|SCHOOL|KIDS/i, "childcare and education"],
	[/PHARMACY|BEAUTY|SALON|CLINIC/i, "health and beauty"],
	[/AIRWAYS|HOTEL|TICKETS/i, "travel"],
	[/STREAMING|CINEMA|SUBSCRIPTION/i, "entertainment and subscriptions"],
	[/FITHUB|YOGA|GYM|SPORTS/i, "fitness"],
	[/ATM/i, "cash"],
	[/RENT\b|FURNISHINGS|FURNITURE/i, "housing"],
	[/MARKETPLACE|ELECTRONICS|MALL|STORE|BOOKSHOP/i, "shopping"],
]

registerPolicy("categoriser", (p: PolicyInput) => {
	if (p.calls.some((c) => c.name === "assign_categories" && c.output && !c.output.startsWith("Error"))) return { say: "Done." }
	const statementId = /statementId=(\S+)/.exec(p.task)?.[1] ?? ""
	const items = p.task.split("\n").slice(1).flatMap((l) => {
		const [rowId, description = "", dir = "", own] = l.split(" | ")
		if (!rowId) return []
		if (own) return [{ rowId, category: "transfer", confidence: 0.95 }]
		if (/INTEREST/i.test(description)) return [{ rowId, category: dir === "in" ? "income" : "fees and interest", confidence: 0.8 }]
		const hit = RULES.find(([re]) => re.test(description))
		return [{ rowId, category: hit?.[1] ?? (dir === "in" ? "income" : "shopping"), confidence: hit ? 0.85 : 0.3 }]
	})
	return { call: "assign_categories", args: { statementId, items } }
})
