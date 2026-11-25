// Owns the reservation ledger. Allocation is a pure function of the claims, so the outcome never depends on who was faster.
import type { Agent } from "@mozaik-ai/core"
import { codeParticipant, safely, type Ctx } from "./kit.ts"
import { emit, On } from "../events.ts"
import { allocate, diffGrants } from "../domain/treasury.ts"
import { forecastBase } from "./forecaster.ts"
import { pctOf } from "../money.ts"
import { humanDate } from "../dates.ts"
import type { Claim, Grant } from "../types.ts"

export interface ReserveArgs { riskId: string; fromAccount: string; to: string; amountFactId: string; byDate: string }
export interface ReserveResult { claimId: string; status: Grant["status"]; grantFactId: string; remainderFactId?: string; availableFactId: string; windowEnds: string; reason?: string }
export interface Treasurer { participant: Agent; reserve(args: ReserveArgs, owner: string): ReserveResult }

export function priorityOf(riskId: string): 1 | 2 | 3 {
	const type = riskId.split("-")[0]
	return type === "cheque" ? 1 : type === "autopay" ? 2 : 3
}

export function createTreasurer(ctx: Ctx): Treasurer {
	const { state } = ctx
	let seq = 0
	const conflicted = new Set<string>()

	const publishFacts = () => {
		const producer = participant.getId()
		for (const c of state.claims.values()) {
			const g = state.grants.get(c.id)
			if (!g) continue
			const from = state.accounts.get(c.fromAccount), to = state.accounts.get(c.to)
			const currency = from?.currency ?? ctx.config.homeCurrency
			const availId = `available:${c.fromAccount}:${c.byDate}`
			state.facts.put({ id: availId, label: `${from?.name ?? c.fromAccount} free cash from ${humanDate(c.byDate)} until ${humanDate(g.windowEnds)}`, kind: "money", value: g.availableMinor, currency, sources: state.forecast?.openings[c.fromAccount] ? [state.forecast.openings[c.fromAccount]!.source] : [], producer })
			state.facts.put({ id: `grant:${c.id}`, label: `Granted from ${from?.name ?? c.fromAccount} to ${to?.name ?? c.to} by ${humanDate(c.byDate)}`, kind: "money", value: g.grantedMinor, currency, sources: [{ factId: c.amountFactId }, { factId: availId }], derivedFrom: [c.amountFactId, availId], producer })
			const rest = c.requestedMinor - g.grantedMinor
			if (rest > 0) state.facts.put({ id: `remainder:${c.id}`, label: `Not covered by ${from?.name ?? c.fromAccount} in the window`, kind: "money", value: rest, currency, sources: [{ factId: c.amountFactId }, { factId: `grant:${c.id}` }], derivedFrom: [c.amountFactId, `grant:${c.id}`], producer })
			else state.facts.delete(`remainder:${c.id}`)
			const card = state.accounts.get(c.to)?.kind === "card" ? c.to : undefined
			const terms = card ? state.cardTerms.get(card) : undefined
			const risk = state.forecast?.risks.find((r) => r.id === c.riskId)
			if (terms && risk) {
				// Interest is charged on what is unpaid at the due date.
				const unpaid = c.byDate > risk.date ? g.grantedMinor : rest
				if (unpaid > 0) state.facts.put({ id: `interest-est:${c.id}`, label: `Estimated interest on the amount unpaid at the due date (${terms.monthlyRatePct}% a month)`, kind: "money", value: pctOf(unpaid, terms.monthlyRatePct), currency, sources: [{ factId: `terms:${card}:monthlyRatePct` }, { factId: c.byDate > risk.date ? `grant:${c.id}` : `remainder:${c.id}` }], producer })
				else state.facts.delete(`interest-est:${c.id}`)
			}
		}
	}

	const reallocate = (): { changed: string[]; bumped: { claimId: string; fromMinor: number; toMinor: number }[] } => {
		const prev = [...state.grants.values()]
		const next = allocate([...state.claims.values()], forecastBase(ctx))
		const diff = diffGrants(prev, next)
		const changed = new Set(diff.map((d) => d.claimId))
		for (const g of next) { if (!state.grants.has(g.claimId)) changed.add(g.claimId); state.grants.set(g.claimId, g) }
		for (const g of next) {
			const c = state.claims.get(g.claimId)!
			if (g.grantedMinor < c.requestedMinor && !conflicted.has(c.id)) { conflicted.add(c.id); state.metrics.conflicts++ }
		}
		publishFacts()
		return { changed: [...changed], bumped: diff.filter((d) => d.toMinor < d.fromMinor) }
	}

	const reserve = (args: ReserveArgs, owner: string): ReserveResult => {
		const fact = state.facts.get(args.amountFactId)
		if (!fact || fact.kind !== "money") throw new Error(`amountFactId "${args.amountFactId}" is not a known money fact`)
		if (!state.accounts.has(args.fromAccount)) throw new Error(`unknown account "${args.fromAccount}"`)
		if (!state.accounts.has(args.to)) throw new Error(`unknown account "${args.to}"`)
		if (!/^\d{4}-\d{2}-\d{2}$/.test(args.byDate)) throw new Error("byDate must be YYYY-MM-DD")
		// A sentinel re-planning the same claim updates it instead of piling up claims.
		let claim: Claim | undefined = [...state.claims.values()].find((c) => c.owner === owner && c.riskId === args.riskId && c.fromAccount === args.fromAccount && c.to === args.to && c.byDate === args.byDate)
		if (claim) claim.requestedMinor = Number(fact.value)
		else {
			claim = { id: `C${++seq}`, owner, riskId: args.riskId, priority: priorityOf(args.riskId), fromAccount: args.fromAccount, to: args.to, amountFactId: args.amountFactId, requestedMinor: Number(fact.value), byDate: args.byDate, seq }
			state.claims.set(claim.id, claim)
		}
		const { changed, bumped } = reallocate()
		const producer = participant.getId()
		for (const id of changed) emit(ctx.rt, "reservation.changed", producer, { claimId: id, grantedMinor: state.grants.get(id)!.grantedMinor })
		for (const b of bumped) { const c = state.claims.get(b.claimId)!; emit(ctx.rt, "reservation.bumped", producer, { claimId: b.claimId, owner: c.owner, fromMinor: b.fromMinor, toMinor: b.toMinor }) }
		const g = state.grants.get(claim.id)!
		return {
			claimId: claim.id, status: g.status, grantFactId: `grant:${claim.id}`, availableFactId: `available:${claim.fromAccount}:${claim.byDate}`, windowEnds: g.windowEnds,
			...(state.facts.has(`remainder:${claim.id}`) ? { remainderFactId: `remainder:${claim.id}` } : {}), ...(g.reason ? { reason: g.reason } : {}),
		}
	}

	const participant: Agent = codeParticipant("Treasurer", [
		{
			specification: new On("action.approved").or(new On("action.snoozed")),
			processor: {
				apply: ({ event }) => safely(ctx, "treasurer", () => {
					const a = state.actions.get((event.payload as { actionId: string }).actionId)
					if (a && a.status === "proposed") a.status = event.type === "action.approved" ? "approved" : "snoozed"
				}),
			},
		},
		{ specification: new On("forecast.updated"), processor: { apply: () => safely(ctx, "treasurer", publishFacts) } },
	])
	return { participant, reserve }
}
