// Deterministic 90-day forecast, per current account in its own currency.
import type { Account, CardTerms, Claim, Commitment, Grant, Minor, Risk, SourceRef, Statement } from "../types.ts"
import { addDays, dayIn, dayOf } from "../dates.ts"
import { neededIn } from "../money.ts"
import { detectRecurring, latestStatements, type Recurring } from "./recurring.ts"

export interface Flow { date: string; amountMinor: Minor; kind: "recurring" | "cheque" | "autopay" | "planned"; label: string; ref?: string; estimated?: boolean; sources: SourceRef[] }
export interface Rate { base: string; quote: string; date: string; rate: string; factId: string }
export interface ForecastInput {
	asOf: string; horizonDays: number; homeCurrency: string; buffers: Record<string, Minor>; rates: Rate[]
	statements: Statement[]; accounts: Account[]; commitments: Commitment[]; cardTerms: CardTerms[]; claims: Claim[]; grants: Grant[]
	matchedRowIds?: Set<string>
}
export interface Cover { riskId: string; accountId: string; currency: string; needMinor: Minor; freeMinor: Minor; rateFactId: string }
export interface Forecast {
	version: number; start: string; end: string
	flows: Record<string, Flow[]>
	baseline: Record<string, Record<string, Minor>>
	planned: Record<string, Record<string, Minor>>
	risks: Risk[]; cover: Cover[]; fingerprint: string
	openings: Record<string, { minor: Minor; date: string; source: SourceRef }>
	recurring: Recurring[]
}

/** Months (year, month) from the month of `from` to the month of `to`. */
export function* months(from: string, to: string): Generator<[number, number]> {
	let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7))
	const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7))
	while (y < ey || (y === ey && m <= em)) {
		yield [y, m]
		if (m === 12) { y++; m = 1 } else m++
	}
}

export function incomeDates(accountId: string, recurring: Recurring[], from: string, to: string): string[] {
	const out: string[] = []
	for (const it of recurring.filter((r) => r.accountId === accountId && r.amountMinor > 0))
		for (const [y, m] of months(from, to)) { const d = dayIn(y, m, it.day); if (d >= from && d <= to) out.push(d) }
	return [...new Set(out)].sort()
}

export const bufferOf = (input: { buffers: Record<string, Minor> }, currency: string): Minor => input.buffers[currency] ?? 0

/** Flows apply in (date, −amount) order: credits first, then smaller debits before larger ones. */
const flowOrder = (a: Flow, b: Flow) => a.date.localeCompare(b.date) || b.amountMinor - a.amountMinor

export function dailySeries(opening: Minor, flows: Flow[], start: string, end: string): Record<string, Minor> {
	const byDay = new Map<string, Minor>()
	for (const f of flows) byDay.set(f.date, (byDay.get(f.date) ?? 0) + f.amountMinor)
	const out: Record<string, Minor> = {}
	let bal = opening
	for (let d = start; d <= end; d = addDays(d, 1)) { bal += byDay.get(d) ?? 0; out[d] = bal }
	return out
}

/** Balance just before a given flow is applied. */
export function balanceBefore(opening: Minor, flows: Flow[], target: Flow): Minor {
	let bal = opening
	for (const f of [...flows].sort(flowOrder)) { if (f === target) return bal; bal += f.amountMinor }
	throw new Error("flow not in list")
}

export function latestRate(rates: Rate[], base: string, quote: string, onOrBefore?: string): Rate | undefined {
	return rates.filter((r) => r.base === base && r.quote === quote && (!onOrBefore || r.date <= onOrBefore)).sort((a, b) => b.date.localeCompare(a.date))[0]
}

interface Base { start: string; end: string; current: Account[]; openings: Forecast["openings"]; recurring: Recurring[]; baseFlows: Record<string, Flow[]> }

export function baseFlows(input: Omit<ForecastInput, "claims" | "grants">): Base {
	const current = input.accounts.filter((a) => a.kind === "current" && latestStatements(input.statements, a.id, 1).length > 0)
	const openings: Forecast["openings"] = {}
	let start = ""
	for (const a of current) {
		const s = latestStatements(input.statements, a.id, 1)[0]!
		const c = s.controls.closing
		if (!c) continue
		openings[a.id] = { minor: c.minor, date: s.period.to, source: c.source }
		const next = addDays(s.period.to, 1)
		if (!start || next < start) start = next
	}
	if (!start) start = input.asOf
	const end = addDays(input.asOf, input.horizonDays)
	const recurring = detectRecurring(input.statements, input.accounts, input.matchedRowIds)
	const flows: Record<string, Flow[]> = Object.fromEntries(current.map((a) => [a.id, [] as Flow[]]))
	for (const it of recurring) {
		const list = flows[it.accountId]
		if (!list) continue
		for (const [y, m] of months(start, end)) {
			const d = dayIn(y, m, it.day)
			if (d >= start && d <= end) list.push({ date: d, amountMinor: it.amountMinor, kind: "recurring", label: it.description, sources: it.sources })
		}
	}
	for (const c of input.commitments) {
		const list = flows[c.accountId]
		if (list && c.date >= start && c.date <= end) list.push({ date: c.date, amountMinor: -c.amountMinor, kind: "cheque", label: `Cheque ${c.chequeNo}`, ref: c.chequeNo, sources: [c.source] })
	}
	for (const t of input.cardTerms) {
		if (!t.autopayFrom || !flows[t.autopayFrom]) continue
		const [latest, prior] = latestStatements(input.statements, t.accountId, 2)
		if (!latest?.dueDate || !latest.controls.newBalance) continue
		const known = latest.controls.newBalance.minor
		const est = prior?.controls.newBalance ? Math.floor((known + prior.controls.newBalance.minor) / 2) : known
		const day = dayOf(latest.dueDate.iso)
		for (const [y, m] of months(start, end)) {
			const d = dayIn(y, m, day)
			if (d < start || d > end || d < latest.dueDate.iso) continue
			const isKnown = d === latest.dueDate.iso
			const sources: SourceRef[] = isKnown ? [latest.controls.newBalance.source, latest.dueDate.source]
				: [latest.controls.newBalance.source, ...(prior?.controls.newBalance ? [prior.controls.newBalance.source] : [])]
			flows[t.autopayFrom]!.push({ date: d, amountMinor: -(isKnown ? known : est), kind: "autopay", label: `Card autopay ${t.accountId}`, ref: t.accountId, ...(isKnown ? {} : { estimated: true }), sources })
		}
	}
	return { start, end, current, openings, recurring, baseFlows: flows }
}

export function plannedFlows(base: Record<string, Flow[]>, claims: Claim[], grants: Grant[]): Record<string, Flow[]> {
	const out: Record<string, Flow[]> = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, [...v]]))
	for (const g of grants) {
		const c = claims.find((x) => x.id === g.claimId)
		if (!c || g.grantedMinor <= 0) continue
		const sources: SourceRef[] = [{ factId: `grant:${c.id}` }]
		out[c.fromAccount]?.push({ date: c.byDate, amountMinor: -g.grantedMinor, kind: "planned", label: c.id, ref: c.id, sources })
		out[c.to]?.push({ date: c.byDate, amountMinor: g.grantedMinor, kind: "planned", label: c.id, ref: c.id, sources })
	}
	return out
}

export function buildForecast(input: ForecastInput, version: number): Forecast {
	const b = baseFlows(input)
	const planned = plannedFlows(b.baseFlows, input.claims, input.grants)
	const flows: Record<string, Flow[]> = {}
	const baseline: Forecast["baseline"] = {}
	const plannedSeries: Forecast["planned"] = {}
	for (const a of b.current) {
		const o = b.openings[a.id]
		if (!o) continue
		flows[a.id] = [...planned[a.id]!].sort(flowOrder)
		baseline[a.id] = dailySeries(o.minor, b.baseFlows[a.id]!, b.start, b.end)
		plannedSeries[a.id] = dailySeries(o.minor, planned[a.id]!, b.start, b.end)
	}
	const risks: Risk[] = []
	for (const a of b.current) {
		const o = b.openings[a.id]
		if (!o) continue
		const buffer = bufferOf(input, a.currency)
		for (const f of planned[a.id]!) {
			if ((f.kind !== "cheque" && f.kind !== "autopay") || f.date < input.asOf) continue
			const before = balanceBefore(o.minor, planned[a.id]!, f)
			const need = -f.amountMinor
			if (before >= need + buffer) continue
			const id = f.kind === "cheque" ? `cheque-${f.ref}` : `autopay-${f.ref}-${f.date}`
			risks.push({ id, type: f.kind === "cheque" ? "cheque_shortfall" : "autopay_shortfall", accountId: a.id, currency: a.currency, date: f.date, amountMinor: need, projectedBeforeMinor: before, shortfallMinor: need + buffer - before, ref: f.ref })
		}
	}
	for (const card of input.accounts.filter((a) => a.kind === "card")) {
		const terms = input.cardTerms.find((t) => t.accountId === card.id)
		if (terms?.autopayFrom) continue
		const latest = latestStatements(input.statements, card.id, 1)[0]
		const nb = latest?.controls.newBalance
		if (!latest?.dueDate || !nb || nb.minor <= 0 || latest.dueDate.iso < input.asOf) continue
		risks.push({ id: `card-${card.id}-${latest.dueDate.iso}`, type: "card_interest", accountId: card.id, currency: card.currency, date: latest.dueDate.iso, amountMinor: nb.minor, fullMinor: nb.minor, minimumMinor: latest.controls.minimumDue?.minor, ref: card.id })
	}
	risks.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))
	const cover: Cover[] = []
	for (const r of risks) {
		if (r.type === "card_interest" || !r.shortfallMinor) continue
		for (const a of b.current) {
			if (a.currency === r.currency || !plannedSeries[a.id]) continue
			const rate = latestRate(input.rates, a.currency, r.currency)
			if (!rate) continue
			const from = addDays(r.date, -1)
			const lows = Object.entries(plannedSeries[a.id]!).filter(([d]) => d >= from).map(([, v]) => v)
			if (lows.length === 0) continue
			const free = Math.min(...lows) - bufferOf(input, a.currency)
			const need = neededIn(r.shortfallMinor, rate.rate)
			if (free >= need) cover.push({ riskId: r.id, accountId: a.id, currency: a.currency, needMinor: need, freeMinor: free, rateFactId: rate.factId })
		}
	}
	const fingerprint = risks.map((r) => `${r.id}:${r.shortfallMinor ?? r.fullMinor ?? r.amountMinor}`).join("|")
	return { version, start: b.start, end: b.end, flows, baseline, planned: plannedSeries, risks, cover, fingerprint, openings: b.openings, recurring: b.recurring }
}
