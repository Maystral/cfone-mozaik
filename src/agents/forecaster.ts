// Projects every current account for 90 days and publishes the position, risks and cover as sourced facts.
import type { Agent } from "@mozaik-ai/core"
import { codeParticipant, safely, type Ctx } from "./kit.ts"
import { emit, On } from "../events.ts"
import { buildForecast, latestRate, type Forecast, type Rate } from "../domain/forecast.ts"
import { latestStatements } from "../domain/recurring.ts"
import { convert } from "../money.ts"
import { addDays, humanDate } from "../dates.ts"
import type { SourceRef } from "../types.ts"

export const DEBOUNCE_MS = 150
const TRIGGERS = ["statement.verified", "commitment.added", "terms.added", "rates.added", "reservation.changed", "action.approved", "transfer.matched"]

export function ratesFromFacts(ctx: Ctx): Rate[] {
	return ctx.state.facts.list("fx:").map((f) => { const [, base, quote, date] = f.id.split(":"); return { base: base!, quote: quote!, date: date!, rate: String(f.value), factId: f.id } })
}

const key = (s: SourceRef) => ("docId" in s ? `${s.docId}:${s.page}:${s.line}` : `f:${s.factId}`)
const uniq = (xs: SourceRef[]) => [...new Map(xs.map((s) => [key(s), s])).values()]

export function createForecaster(ctx: Ctx): Agent {
	const { state, config } = ctx
	let timer: NodeJS.Timeout | undefined
	let version = 0
	let lastSignature = ""

	const publish = () => {
		const accounts = [...state.accounts.values()]
		const statements = [...state.statements.values()]
		const rates = ratesFromFacts(ctx)
		const matched = new Set<string>([...state.transfers.values()].flatMap((t) => { const p = t as { out?: string; in?: string }; return [p.out ?? "", p.in ?? ""] }))
		const f: Forecast = buildForecast({
			asOf: config.asOf, horizonDays: config.horizonDays, homeCurrency: config.homeCurrency, buffers: config.buffers, rates,
			statements, accounts, commitments: [...state.commitments.values()], cardTerms: [...state.cardTerms.values()],
			claims: [...state.claims.values()], grants: [...state.grants.values()], matchedRowIds: matched,
		}, version + 1)
		const producer = self.getId()
		const home = config.homeCurrency
		// Position in the home currency; a balance without a rate is left out, never converted at 1:1.
		const missing = new Set<string>()
		const toHome = (minor: number, currency: string, date: string): { minor: number; rate?: Rate } | undefined => {
			if (currency === home) return { minor }
			const r = latestRate(rates, currency, home, date)
			if (!r) { missing.add(currency); return undefined }
			return { minor: convert(minor, r.rate), rate: r }
		}
		let have = 0
		const haveFrom: string[] = []
		for (const a of accounts.filter((x) => x.kind === "current")) {
			const s = latestStatements(statements, a.id, 1)[0]
			const c = s?.controls.closing
			if (!s || !c) continue
			const balId = `bal:${a.id}:${s.period.to}`
			const h = toHome(c.minor, a.currency, s.period.to)
			if (!h) continue
			have += h.minor
			haveFrom.push(balId)
			if (h.rate) {
				state.facts.put({ id: `home:${a.id}:${s.period.to}`, label: `${a.name} balance in ${home} at ${h.rate.rate}`, kind: "money", value: h.minor, currency: home, sources: [{ factId: balId }, { factId: h.rate.factId }], derivedFrom: [balId, h.rate.factId], producer })
				haveFrom.push(h.rate.factId, `home:${a.id}:${s.period.to}`)
			}
		}
		let owe = 0
		const oweFrom: string[] = []
		for (const a of accounts.filter((x) => x.kind === "card")) {
			const s = latestStatements(statements, a.id, 1)[0]
			const nb = s?.controls.newBalance
			if (!s || !nb) continue
			const h = toHome(nb.minor, a.currency, s.period.to)
			if (!h) continue
			owe += h.minor
			oweFrom.push(`stmt:${s.id}:newBalance`, ...(h.rate ? [h.rate.factId] : []))
		}
		const end = addDays(config.asOf, config.horizonDays)
		let promised = 0
		const promisedFrom: string[] = []
		for (const c of state.commitments.values()) {
			if (c.date < config.asOf || c.date > end) continue
			const h = toHome(c.amountMinor, c.currency, c.date)
			if (!h) continue
			promised += h.minor
			promisedFrom.push(`cheque:${c.chequeNo}:amount`)
		}
		const miss = missing.size ? ` (missing rate: ${[...missing].sort().join(", ")} left out)` : ""
		const fromFacts = (ids: string[]) => ids.map((factId) => ({ factId }))
		state.facts.put({ id: "position:have", label: `Have: current accounts in ${home}${miss}`, kind: "money", value: have, currency: home, sources: fromFacts(haveFrom), derivedFrom: haveFrom, producer })
		state.facts.put({ id: "position:owe", label: `Owe: card balances in ${home}${miss}`, kind: "money", value: owe, currency: home, sources: fromFacts(oweFrom), derivedFrom: oweFrom, producer })
		state.facts.put({ id: "position:promised90", label: `Promised by cheque in the next ${config.horizonDays} days${miss}`, kind: "money", value: promised, currency: home, sources: fromFacts(promisedFrom), derivedFrom: promisedFrom, producer })
		// Risks, with the lines they come from.
		for (const r of f.risks) {
			const name = state.accounts.get(r.accountId)?.name ?? r.accountId
			const when = humanDate(r.date)
			if (r.type === "card_interest") {
				const s = latestStatements(statements, r.accountId, 1)[0]!
				state.facts.put({ id: `full:${r.id}`, label: `${name} full new balance due ${when}`, kind: "money", value: r.fullMinor!, currency: r.currency, sources: [s.controls.newBalance!.source, ...(s.dueDate ? [s.dueDate.source] : [])], producer })
				if (r.minimumMinor !== undefined) state.facts.put({ id: `minimum:${r.id}`, label: `${name} minimum due ${when}`, kind: "money", value: r.minimumMinor, currency: r.currency, sources: [s.controls.minimumDue!.source], producer })
				continue
			}
			const flows = f.flows[r.accountId] ?? []
			const own = flows.find((x) => (x.kind === "cheque" || x.kind === "autopay") && x.date === r.date && -x.amountMinor === r.amountMinor)
			const prior = flows.filter((x) => x.date < r.date)
			const opening = f.openings[r.accountId]
			const sources = uniq([...(opening ? [opening.source] : []), ...prior.flatMap((x) => x.sources), ...(own?.sources ?? [])])
			const what = r.type === "cheque_shortfall" ? `cheque ${r.ref}` : `card autopay`
			state.facts.put({ id: `before:${r.id}`, label: `${name} projected balance just before ${what} on ${when}`, kind: "money", value: r.projectedBeforeMinor!, currency: r.currency, sources, producer })
			state.facts.put({ id: `shortfall:${r.id}`, label: `Shortfall for ${what} on ${when} (with buffer)`, kind: "money", value: r.shortfallMinor!, currency: r.currency, sources, producer })
			state.facts.put({ id: `amount:${r.id}`, label: `${what} due ${when}${own?.estimated ? " (estimated)" : ""}`, kind: "money", value: r.amountMinor, currency: r.currency, sources: own?.sources ?? [], producer })
		}
		for (const old of state.facts.list("cover:")) state.facts.delete(old.id)
		for (const c of f.cover) {
			const name = state.accounts.get(c.accountId)?.name ?? c.accountId
			state.facts.put({ id: `cover:${c.riskId}:${c.accountId}`, label: `${name} can cover the rest of ${c.riskId} at the sourced rate`, kind: "money", value: c.needMinor, currency: c.currency, sources: [{ factId: `shortfall:${c.riskId}` }, { factId: c.rateFactId }], derivedFrom: [`shortfall:${c.riskId}`, c.rateFactId], producer })
			state.facts.put({ id: `free:${c.riskId}:${c.accountId}`, label: `${name} free after its buffer`, kind: "money", value: c.freeMinor, currency: c.currency, sources: [f.openings[c.accountId]!.source], producer })
		}
		const signature = f.fingerprint + JSON.stringify(f.planned) + JSON.stringify(f.cover)
		if (signature === lastSignature && state.forecast) return
		lastSignature = signature
		version = f.version
		state.forecast = f
		emit(ctx.rt, "forecast.updated", producer, { version: f.version, riskFingerprint: f.fingerprint })
	}

	const trigger = () => {
		if (timer) clearTimeout(timer)
		else state.pendingWork++
		timer = setTimeout(() => {
			timer = undefined
			safely(ctx, "forecaster", () => { try { publish() } finally { state.pendingWork-- } })
		}, DEBOUNCE_MS)
	}

	const self: Agent = codeParticipant("Forecaster", TRIGGERS.map((t) => ({ specification: new On(t), processor: { apply: () => trigger() } })))
	return self
}
