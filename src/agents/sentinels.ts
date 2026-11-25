// Two LLM sentinels watch the forecast: cash (cheques, autopays) and cards. They claim cash through the Treasurer
// and propose actions written with fact placeholders only. One loop per sentinel at a time.
import { createAgent, type Agent } from "@mozaik-ai/core"
import { intakeDone, OneAtATime, roleInstruction, startLoop, tool, type Ctx } from "./kit.ts"
import { emit, ForMe, On } from "../events.ts"
import { NumberGuard } from "./number-guard.ts"
import type { ReserveArgs, Treasurer } from "./treasurer.ts"
import { addDays } from "../dates.ts"
import { incomeDates } from "../domain/forecast.ts"
import { slug } from "../domain/statement.ts"
import type { Action, Risk } from "../types.ts"

export type SentinelKind = "cash" | "card"
const TYPES: Record<SentinelKind, Risk["type"][]> = { cash: ["cheque_shortfall", "autopay_shortfall"], card: ["card_interest"] }
export const MAX_LOOPS = 25

export interface RiskView {
	riskId: string; type: Risk["type"]; date: string; accountId: string; currency: string; chequeNo?: string
	facts: string[]; byDate: string; fromCandidates?: string[]; payFrom?: string; nextIncome?: string
	claims: { claimId: string; status: string; byDate: string; fromAccount: string; to: string; grantFactId: string; remainderFactId?: string; interestFactId?: string }[]
	cover: { factId: string; accountId: string; rateFactId?: string }[]
	action: { id: string; status: string; claimIds: string[] } | null
	needs: "claim" | "rest" | "action" | null
}

export function riskViews(ctx: Ctx, owner: string, kind: SentinelKind): RiskView[] {
	const { state, config } = ctx
	const f = state.forecast
	if (!f) return []
	const out: RiskView[] = []
	// Current risks, plus risks this sentinel's own claims already resolved (they still need their action).
	const current = new Set(f.risks.map((r) => r.id))
	const resolved = [...new Set([...state.claims.values()].filter((c) => c.owner === owner && !current.has(c.riskId)).map((c) => c.riskId))]
		.flatMap((id) => { const r = state.risksSeen.get(id); return r ? [r] : [] })
	for (const r of [...f.risks, ...resolved].filter((x) => TYPES[kind].includes(x.type)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
		const claims = [...state.claims.values()].filter((c) => c.owner === owner && c.riskId === r.id).sort((a, b) => a.byDate.localeCompare(b.byDate))
		const action = [...state.actions.values()].filter((a) => a.riskId === r.id && a.status !== "superseded").at(-1) ?? null
		const cover = state.facts.list(`cover:${r.id}:`).map((x) => ({ factId: x.id, accountId: x.id.split(":")[2]!, rateFactId: x.derivedFrom?.find((d) => d.startsWith("fx:")) }))
		const view: RiskView = {
			riskId: r.id, type: r.type, date: r.date, accountId: r.accountId, currency: r.currency, ...(r.type === "cheque_shortfall" ? { chequeNo: r.ref } : {}),
			facts: kind === "card" ? [`full:${r.id}`, `minimum:${r.id}`] : [`shortfall:${r.id}`, `before:${r.id}`, `amount:${r.id}`],
			byDate: kind === "card" ? r.date : addDays(r.date, -1),
			claims: claims.map((c) => {
				const g = state.grants.get(c.id)
				return { claimId: c.id, status: g?.status ?? "pending", byDate: c.byDate, fromAccount: c.fromAccount, to: c.to, grantFactId: `grant:${c.id}`,
					...(state.facts.has(`remainder:${c.id}`) ? { remainderFactId: `remainder:${c.id}` } : {}), ...(state.facts.has(`interest-est:${c.id}`) ? { interestFactId: `interest-est:${c.id}` } : {}) }
			}),
			cover, action: action ? { id: action.id, status: action.status, claimIds: action.claimIds } : null, needs: null,
		}
		if (kind === "cash") {
			const buffer = (a: string) => config.buffers[state.accounts.get(a)?.currency ?? ""] ?? 0
			const headroom = (a: string) => Math.min(...Object.entries(f.planned[a] ?? {}).filter(([d]) => d >= config.asOf && d < r.date).map(([, v]) => v)) - buffer(a)
			view.fromCandidates = [...state.accounts.values()].filter((a) => a.kind === "current" && a.currency === r.currency && a.id !== r.accountId && f.planned[a.id])
				.sort((a, b) => headroom(b.id) - headroom(a.id)).map((a) => a.id)
		} else {
			const card = state.accounts.get(r.accountId)
			const payFrom = state.cardTerms.get(r.accountId)?.autopayFrom ?? [...state.accounts.values()].find((a) => a.kind === "current" && card && slug(a.bank) === slug(card.bank) && a.currency === card.currency)?.id
			if (payFrom) {
				view.payFrom = payFrom
				view.nextIncome = incomeDates(payFrom, f.recurring, r.date, addDays(r.date, 62)).find((d) => d > r.date)
			}
		}
		view.needs = needsOf(view, kind, sigOf(ctx, view), action?.sig)
		out.push(view)
	}
	return out
}

/** What a proposal was based on; when it changes, the proposal is stale. */
export function sigOf(ctx: Ctx, v: RiskView): string {
	return JSON.stringify([v.claims.map((c) => [c.claimId, c.status, ctx.state.grants.get(c.claimId)?.grantedMinor]), v.cover.map((c) => c.factId)])
}

function needsOf(v: RiskView, kind: SentinelKind, sig: string, proposedSig?: string): RiskView["needs"] {
	const canClaim = kind === "cash" ? (v.fromCandidates?.length ?? 0) > 0 : !!v.payFrom
	if (v.claims.length === 0 && canClaim) return "claim"
	const main = v.claims.find((c) => c.byDate <= v.byDate)
	if (kind === "card" && main?.status === "partial" && main.remainderFactId && v.nextIncome && !v.claims.some((c) => c.byDate > v.byDate)) return "rest"
	if (!v.action) return "action"
	if (v.action.status === "proposed" && proposedSig !== sig) return "action"
	return null
}

export const SENTINEL_RULES = `Rules:
- Call get_risks first. Work on ONE risk per run: the earliest whose "needs" is not null. Stop when none needs work.
- needs "claim": call reserve_funds. Cash risks: fromAccount = fromCandidates[0], to = the risk's account, amountFactId = shortfall:<riskId>, byDate = the risk's byDate. Card risks: fromAccount = payFrom, to = the card, amountFactId = full:<riskId>, byDate = the due date.
- needs "rest" (card only): the first claim was partial; call reserve_funds for its remainderFactId from payFrom on nextIncome.
- Then propose_action for that risk, listing the claimIds it relies on. If no free cash is left, propose a heads-up instead of claiming again; mention any cover fact (another-currency account that can close the gap; moving money between currencies is the household's call).
- Write amounts ONLY as fact placeholders {{F:<factId>}}, dates as {{D:YYYY-MM-DD}}, accounts as {{A:<accountId>}}, cheques as {{C:<chequeNo>}}. Never type a digit outside a placeholder. A draft with a typed number is blocked; fix it and propose again.
- Facts named grant:, remainder: and interest-est: must belong to your own claims.`

export function createSentinel(ctx: Ctx, treasurer: Treasurer, kind: SentinelKind): Agent {
	const { state } = ctx
	let self: Agent
	let loops = 0
	let actionSeq = 0
	const name = kind === "cash" ? "Cash Sentinel" : "Card Sentinel"
	const role = kind === "cash" ? "cash-sentinel" : "card-sentinel"
	const pending = () => riskViews(ctx, self.getId(), kind).some((v) => v.needs !== null)

	const run = () => {
		if (state.pendingWork > 0) { setTimeout(run, 50).unref(); return }
		if (!pending() || loops >= MAX_LOOPS) { gate.settle(); return }
		loops++
		startLoop(ctx, self, `Check your ${kind === "cash" ? "cheque and autopay" : "card"} risks and act on the earliest that needs work.`, { intercept: new NumberGuard(ctx, self.getId()), maxOutputTokens: 3000 })
	}
	const gate = new OneAtATime(run)
	const kick = () => { if (intakeDone(state)) gate.trigger() }

	const tools = [
		tool("get_risks", "Your current risks with their fact ids, claims, cover suggestions, live action and what each needs next.", { type: "object", properties: {} }, async () => {
			const views = riskViews(ctx, self.getId(), kind)
			const ids = new Set(views.flatMap((v) => [...v.facts, ...v.claims.flatMap((c) => [c.grantFactId, c.remainderFactId, c.interestFactId]), ...v.cover.flatMap((c) => [c.factId, c.rateFactId])]).filter(Boolean) as string[])
			return { risks: views, facts: [...ids].filter((id) => state.facts.has(id)).flatMap((id) => state.facts.toPromptLines(id).filter((l) => l.startsWith(`[F:${id}]`))) }
		}),
		tool<{ prefix?: string }>("get_facts", "Facts whose id starts with the prefix, as [F:id] label = value.", { type: "object", properties: { prefix: { type: "string" } } }, async (a) => state.facts.toPromptLines(a.prefix ?? "").slice(0, 200)),
		tool<ReserveArgs>("reserve_funds", "Claim cash from a current account for a risk. Amount is a fact id. The Treasurer allocates by policy and answers with grant and remainder fact ids.", {
			type: "object", properties: { riskId: { type: "string" }, fromAccount: { type: "string" }, to: { type: "string" }, amountFactId: { type: "string" }, byDate: { type: "string" } }, required: ["riskId", "fromAccount", "to", "amountFactId", "byDate"],
		}, async (a) => {
			if (!riskViews(ctx, self.getId(), kind).some((v) => v.riskId === a.riskId)) throw new Error(`"${a.riskId}" is not one of your risks`)
			return treasurer.reserve(a, self.getId())
		}),
		tool<{ riskId: string; claimIds?: string[]; title: string; body: string }>("propose_action", "Propose an action for one risk. Text uses placeholders only. A new proposal for a risk replaces the old one.", {
			type: "object", properties: { riskId: { type: "string" }, claimIds: { type: "array", items: { type: "string" } }, title: { type: "string" }, body: { type: "string" } }, required: ["riskId", "title", "body"],
		}, async (a) => {
			const view = riskViews(ctx, self.getId(), kind).find((v) => v.riskId === a.riskId)
			if (!view) throw new Error(`"${a.riskId}" is not one of your risks`)
			for (const old of state.actions.values()) if (old.riskId === a.riskId && old.status === "proposed") old.status = "superseded"
			const action: Action = { id: `${kind}-${++actionSeq}-${a.riskId}`, riskId: a.riskId, owner: self.getId(), claimIds: a.claimIds ?? [], title: a.title, body: a.body, status: "proposed", sig: sigOf(ctx, view) }
			state.actions.set(action.id, action)
			emit(ctx.rt, "action.proposed", self.getId(), { actionId: action.id })
			return { ok: true, actionId: action.id }
		}),
	]

	self = createAgent({
		name,
		capabilities: ["plan"],
		instruction: roleInstruction(role, `You are the household's ${kind === "cash" ? "cash" : "card"} sentinel. ${kind === "cash" ? "You make sure cheques and card autopays clear." : "You make sure cards are paid before they charge interest, splitting a payment around payday when cash is short."}\n${SENTINEL_RULES}`),
		tools,
		handlers: [
			{ specification: new On("forecast.updated"), processor: { apply: ({ event }) => { if ((event.payload as { ready?: boolean }).ready) kick() } } },
			{ specification: new On("reservation.bumped").and(new ForMe()), processor: { apply: () => kick() } },
			{
				specification: new On("model.answer"),
				processor: { apply: ({ event }) => { if (event.producerId === self.getId()) { gate.settle(); if (!gate.busy && pending()) setTimeout(kick, 0) } } },
			},
		],
	})
	return self
}

export const createCashSentinel = (ctx: Ctx, t: Treasurer) => createSentinel(ctx, t, "cash")
export const createCardSentinel = (ctx: Ctx, t: Treasurer) => createSentinel(ctx, t, "card")
