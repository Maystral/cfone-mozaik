// Paycheck-window allocation of scarce cash between competing claims. A pure function of the claims.
import type { Claim, Grant, Minor } from "../types.ts"
import { addDays } from "../dates.ts"
import { baseFlows, bufferOf, dailySeries, incomeDates, type Flow, type ForecastInput } from "./forecast.ts"

export function allocate(claims: Claim[], input: Omit<ForecastInput, "claims" | "grants">): Grant[] {
	const b = baseFlows(input)
	const flows: Record<string, Flow[]> = Object.fromEntries(Object.entries(b.baseFlows).map(([k, v]) => [k, [...v]]))
	const currencyOf = (id: string) => input.accounts.find((a) => a.id === id)?.currency
	const incomeEnd = addDays(b.end, 31)
	const windowEnd = (c: Claim): string => incomeDates(c.fromAccount, b.recurring, b.start, incomeEnd).find((d) => d > c.byDate) ?? addDays(b.end, 1)
	const ordered = [...claims].map((c) => ({ c, w: windowEnd(c) }))
		.sort((x, y) => x.w.localeCompare(y.w) || x.c.priority - y.c.priority || x.c.byDate.localeCompare(y.c.byDate) || x.c.seq - y.c.seq || x.c.id.localeCompare(y.c.id))
	const grants = new Map<string, Grant>()
	for (const { c, w } of ordered) {
		const from = currencyOf(c.fromAccount), to = currencyOf(c.to)
		if (!from || !flows[c.fromAccount] || !b.openings[c.fromAccount]) { grants.set(c.id, { claimId: c.id, grantedMinor: 0, availableMinor: 0, windowEnds: w, status: "refused", reason: "unknown source account" }); continue }
		if (to && to !== from) { grants.set(c.id, { claimId: c.id, grantedMinor: 0, availableMinor: 0, windowEnds: w, status: "refused", reason: "different currencies" }); continue }
		const series = dailySeries(b.openings[c.fromAccount]!.minor, flows[c.fromAccount]!, b.start, b.end)
		const window = Object.entries(series).filter(([d]) => d >= c.byDate && d < w).map(([, v]) => v)
		const available: Minor = window.length ? Math.max(0, Math.min(...window) - bufferOf(input, from)) : 0
		const granted = Math.min(c.requestedMinor, available)
		grants.set(c.id, { claimId: c.id, grantedMinor: granted, availableMinor: available, windowEnds: w,
			status: granted === c.requestedMinor ? "granted" : granted > 0 ? "partial" : "refused", ...(granted === 0 && c.requestedMinor > 0 ? { reason: "no free cash in the window" } : {}) })
		if (granted > 0) {
			const sources = [{ factId: `grant:${c.id}` }]
			flows[c.fromAccount]!.push({ date: c.byDate, amountMinor: -granted, kind: "planned", label: c.id, ref: c.id, sources })
			flows[c.to]?.push({ date: c.byDate, amountMinor: granted, kind: "planned", label: c.id, ref: c.id, sources })
		}
	}
	// Grants in the order the claims were given, so callers can rely on a stable shape.
	return [...claims].sort((x, y) => x.seq - y.seq || x.id.localeCompare(y.id)).map((c) => grants.get(c.id)!)
}

export function diffGrants(prev: Grant[], next: Grant[]): { claimId: string; fromMinor: Minor; toMinor: Minor }[] {
	const out: { claimId: string; fromMinor: Minor; toMinor: Minor }[] = []
	for (const n of next) {
		const p = prev.find((g) => g.claimId === n.claimId)
		if (p && p.grantedMinor !== n.grantedMinor) out.push({ claimId: n.claimId, fromMinor: p.grantedMinor, toMinor: n.grantedMinor })
	}
	return out
}
