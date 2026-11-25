// The Clerk turns the cheque register, payment plans and card key facts into sourced commitments and terms.
import { createAgent, type Agent } from "@mozaik-ai/core"
import { roleInstruction, startLoop, tool, type Ctx } from "./kit.ts"
import { emit, ForMe, On } from "../events.ts"
import { lineAt, lineHasAmount, numbered, parseRef } from "../pdf/lines.ts"
import { isoFromPrinted } from "../dates.ts"
import { isPrintedAmount, parsePrinted } from "../money.ts"
import { accountIdFor, refOf, slug } from "../domain/statement.ts"
import type { CardTerms, Doc, PrintedAmount, PrintedDate } from "../types.ts"

export const CLERK_INSTRUCTION = `You are the household's clerk. You get one document as numbered lines "p<page>:l<line>  text": a cheque register, a payment plan or a card key facts sheet.
- Cheque register: call add_commitment once per cheque, copying cheque number, account as printed (e.g. "Bank A current 4417"), payee, amount and currency exactly as printed, date and purpose, each with the p:l of its line.
- Payment plan: instalments paid by post-dated cheque are already in the cheque register. Call flag for each future instalment that is not paid by cheque (for example paid on handover or by bank finance), quoting its line as the reason and source.
- Card key facts: call add_card_terms once per card, with the card as printed (e.g. "Bank B credit card"), the monthly rate and minimum due percentages as printed (digits only, e.g. "3.25"), the late fee exactly as printed, and autopayFromLast4 when a line says the card is paid automatically from an account (the last four digits printed there), each with p:l sources.
Never compute anything. When done, call finish_document.`

const PRINTED = { type: "object", properties: { text: { type: "string" }, source: { type: "string" } }, required: ["text", "source"] }
const PDATE = { type: "object", properties: { text: { type: "string" }, iso: { type: "string" }, source: { type: "string" } }, required: ["text", "iso", "source"] }

interface CommitmentArgs { docId?: string; chequeNo: string; account: string; payee: string; amount: PrintedAmount; currency: string; date: PrintedDate; purpose: string }
interface TermsArgs { docId?: string; card: string; monthlyRatePct: string; minimumDuePct: string; lateFee: PrintedAmount; autopayFromLast4?: string; source: string; autopaySource?: string }
interface PendingTerms { bank: string; args: TermsArgs; doc: Doc }

export function createClerk(ctx: Ctx): Agent {
	const { state } = ctx
	let self: Agent
	const pending: PendingTerms[] = []
	const docOf = (docId?: string) => { const d = docId ? state.documents.get(docId) : undefined; if (!d || d.assignee !== self.getId()) throw new Error(`unknown document "${docId}"`); return d }
	const onLine = (doc: Doc, ref: string, text: string) => { parseRef(ref); const l = lineAt(doc.pages, ref); if (l === undefined) throw new Error(`${ref} does not exist`); if (!l.includes(text)) throw new Error(`"${text}" is not printed on ${ref}`); return l }

	const registerTerms = (accountId: string, t: PendingTerms) => {
		const a = t.args, src = refOf(t.doc.id, a.source)
		const autopayFrom = a.autopayFromLast4 ? accountIdFor(t.bank, "current", a.autopayFromLast4) : undefined
		const terms: CardTerms = { accountId, monthlyRatePct: a.monthlyRatePct, minimumDuePct: a.minimumDuePct, lateFeeMinor: parsePrinted(a.lateFee.text).minor, ...(autopayFrom ? { autopayFrom } : {}), sources: [src, ...(a.autopaySource ? [refOf(t.doc.id, a.autopaySource)] : [])] }
		state.cardTerms.set(accountId, terms)
		const name = state.accounts.get(accountId)?.name ?? accountId
		state.facts.put({ id: `terms:${accountId}:monthlyRatePct`, label: `${name} monthly rate`, kind: "pct", value: a.monthlyRatePct, sources: [src], producer: self.getId() })
		state.facts.put({ id: `terms:${accountId}:minimumDuePct`, label: `${name} minimum due`, kind: "pct", value: a.minimumDuePct, sources: [src], producer: self.getId() })
		state.facts.put({ id: `terms:${accountId}:lateFee`, label: `${name} late payment fee`, kind: "money", value: terms.lateFeeMinor, currency: /^[A-Z]{3}/.exec(a.lateFee.text)?.[0] ?? state.accounts.get(accountId)?.currency ?? ctx.config.homeCurrency, sources: [refOf(t.doc.id, a.lateFee.source)], producer: self.getId() })
		if (autopayFrom) state.facts.put({ id: `terms:${accountId}:autopayFrom`, label: `${name} is paid automatically from`, kind: "text", value: autopayFrom, sources: a.autopaySource ? [refOf(t.doc.id, a.autopaySource)] : [src], producer: self.getId() })
		emit(ctx.rt, "terms.added", self.getId(), { accountId })
	}
	/** Card terms name a bank and a card; the card's account id needs its last four, known once its statement is verified. */
	const resolvePending = () => {
		for (const t of [...pending]) {
			const cards = [...state.accounts.values()].filter((a) => a.kind === "card" && slug(a.bank) === slug(t.bank))
			if (cards.length !== 1) continue
			pending.splice(pending.indexOf(t), 1)
			registerTerms(cards[0]!.id, t)
		}
	}

	const addCommitment = tool<CommitmentArgs>("add_commitment", "Record one cheque from the register, copying printed values with the p:l of their line.", {
		type: "object",
		properties: { docId: { type: "string" }, chequeNo: { type: "string" }, account: { type: "string" }, payee: { type: "string" }, amount: PRINTED, currency: { type: "string" }, date: PDATE, purpose: { type: "string" } },
		required: ["chequeNo", "account", "payee", "amount", "currency", "date", "purpose"],
	}, async (a) => {
		const doc = docOf(a.docId)
		const line = onLine(doc, a.amount.source, a.chequeNo)
		if (!isPrintedAmount(a.amount.text) || !lineHasAmount(doc.pages, a.amount.source, a.amount.text)) throw new Error(`amount "${a.amount.text}" is not printed on ${a.amount.source}`)
		onLine(doc, a.date.source, a.date.text)
		if (!line.includes(a.currency) || !/^[A-Z]{3}$/.test(a.currency)) throw new Error(`currency "${a.currency}" is not printed on ${a.amount.source}`)
		const iso = isoFromPrinted(a.date.text)
		if (!iso || (a.date.iso && a.date.iso !== iso)) throw new Error(`date "${a.date.text}" does not match ${a.date.iso}`)
		const m = /^(.*?)\s+(current|card)\s+(\d{4})$/i.exec(a.account.trim())
		if (!m || !line.includes(a.account.trim())) throw new Error(`account "${a.account}" must be printed as "<bank> current <last four>" on ${a.amount.source}`)
		const accountId = accountIdFor(m[1]!, m[2]!.toLowerCase() === "current" ? "current" : "card", m[3]!)
		const id = `cheque-${a.chequeNo}`
		const minor = parsePrinted(a.amount.text).minor
		state.commitments.set(id, { id, chequeNo: a.chequeNo, accountId, payee: a.payee, amountMinor: minor, currency: a.currency, date: iso, purpose: a.purpose, source: refOf(doc.id, a.amount.source) })
		state.facts.put({ id: `cheque:${a.chequeNo}:amount`, label: `Cheque ${a.chequeNo} to ${a.payee} (${a.purpose})`, kind: "money", value: minor, currency: a.currency, sources: [refOf(doc.id, a.amount.source)], producer: self.getId() })
		emit(ctx.rt, "commitment.added", self.getId(), { commitmentId: id })
		return { ok: true, commitmentId: id }
	})
	const addTerms = tool<TermsArgs>("add_card_terms", "Record one card's terms from the key facts, copying printed values with the p:l of their line.", {
		type: "object",
		properties: { docId: { type: "string" }, card: { type: "string" }, monthlyRatePct: { type: "string" }, minimumDuePct: { type: "string" }, lateFee: PRINTED, autopayFromLast4: { type: "string" }, autopaySource: { type: "string" }, source: { type: "string" } },
		required: ["card", "monthlyRatePct", "minimumDuePct", "lateFee", "source"],
	}, async (a) => {
		const doc = docOf(a.docId)
		const line = onLine(doc, a.source, a.card)
		if (!/^\d+(\.\d+)?$/.test(a.monthlyRatePct) || !line.includes(`${a.monthlyRatePct}%`)) throw new Error(`monthly rate "${a.monthlyRatePct}%" is not printed on ${a.source}`)
		if (!/^\d+(\.\d+)?$/.test(a.minimumDuePct) || !line.includes(`${a.minimumDuePct}%`)) throw new Error(`minimum due "${a.minimumDuePct}%" is not printed on ${a.source}`)
		if (!isPrintedAmount(a.lateFee.text) || !lineHasAmount(doc.pages, a.lateFee.source, a.lateFee.text)) throw new Error(`late fee "${a.lateFee.text}" is not printed on ${a.lateFee.source}`)
		if (a.autopayFromLast4) {
			if (!/^\d{4}$/.test(a.autopayFromLast4) || !a.autopaySource) throw new Error("autopayFromLast4 needs four digits and an autopaySource")
			const l = onLine(doc, a.autopaySource, a.autopayFromLast4)
			if (!l.toLowerCase().includes(a.card.toLowerCase())) throw new Error(`${a.autopaySource} does not mention ${a.card}`)
		}
		const bank = a.card.replace(/\s+(credit\s+)?card.*$/i, "").trim()
		pending.push({ bank, args: a, doc })
		resolvePending()
		return { ok: true }
	})
	const flag = tool<{ docId?: string; reason: string; sources: string[] }>("flag", "Flag something the household should know that is not a cheque, with the p:l lines it comes from.", {
		type: "object", properties: { docId: { type: "string" }, reason: { type: "string" }, sources: { type: "array", items: { type: "string" } } }, required: ["reason", "sources"],
	}, async (a) => {
		const doc = docOf(a.docId)
		const sources = (a.sources ?? []).map((s) => { onLine(doc, s, ""); return refOf(doc.id, s) })
		if (sources.length === 0) throw new Error("a flag needs at least one source line")
		const refs = sources.map((s) => ("docId" in s ? `${s.docId}:p${s.page}:l${s.line}` : s.factId)).join(",")
		state.flags.push({ reason: a.reason, sources: refs })
		emit(ctx.rt, "commitment.flagged", self.getId(), { reason: a.reason, sources: refs })
		return { ok: true }
	})
	const finish = tool<{ docId?: string }>("finish_document", "Mark the document done.", { type: "object", properties: { docId: { type: "string" } }, required: ["docId"] }, async (a) => {
		const doc = docOf(a.docId)
		doc.status = "processed"
		return { ok: true }
	})

	self = createAgent({
		name: "Clerk",
		capabilities: ["commitments", "terms"],
		instruction: roleInstruction("clerk", CLERK_INSTRUCTION),
		tools: [addCommitment, addTerms, flag, finish],
		handlers: [
			{
				specification: new On("document.received").and(new ForMe()),
				processor: {
					apply: ({ event }) => {
						const { docId, kind } = event.payload as { docId: string; kind: string }
						const doc = state.documents.get(docId)
						if (doc) startLoop(ctx, self, `docId=${docId}\nkind=${kind}\n${numbered(doc.pages)}`, { maxOutputTokens: 4000 })
					},
				},
			},
			{ specification: new On("statement.verified"), processor: { apply: () => { if (pending.length) resolvePending() } } },
		],
	})
	return self
}

