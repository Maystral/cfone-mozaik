// The gate: a statement counts only when its cited lines exist and it agrees with its own printed figures.
import type { Agent } from "@mozaik-ai/core"
import { codeParticipant, safely, type Ctx } from "./kit.ts"
import { emit, On } from "../events.ts"
import { citedRefs, findHint, reconcile, sourceCheck } from "../domain/reconcile.ts"
import { statementFromExtraction } from "../domain/statement.ts"
import { formatMoney } from "../money.ts"
import { humanDate, isIsoDate } from "../dates.ts"
import { CONTROL_NAMES, type Doc, type ExtractionArgs } from "../types.ts"

export const MAX_ATTEMPTS = 3

const CONTROL_LABEL: Record<string, string> = { opening: "opening balance", closing: "closing balance", totalDebits: "total debits", totalCredits: "total credits", previousBalance: "previous balance", paymentsAndCredits: "payments and credits", purchases: "purchases", financeCharges: "finance charges", newBalance: "new balance", minimumDue: "minimum due" }

function shapeCheck(ex: ExtractionArgs): string[] {
	const out: string[] = []
	if (!/^[A-Z]{3}$/.test(ex.currency ?? "")) out.push(`currency "${ex.currency}" is not an ISO code`)
	if (!ex.account?.bank || !/^\d{4}$/.test(ex.account?.last4 ?? "") || !["current", "credit_card"].includes(ex.account?.product)) out.push("account needs bank, product and last four digits")
	if (!isIsoDate(ex.period?.from ?? "") || !isIsoDate(ex.period?.to ?? "")) out.push("period needs from and to as YYYY-MM-DD")
	if (ex.controls?.dueDate && !isIsoDate(ex.controls.dueDate.iso)) out.push("dueDate.iso is not a date")
	ex.rows.forEach((r, i) => { if (!isIsoDate(r.date)) out.push(`row ${i + 1}: date "${r.date}" is not YYYY-MM-DD`) })
	return out
}

export function createAuditor(ctx: Ctx): Agent {
	const { state } = ctx
	const quarantine = (doc: Doc, reason: string) => {
		doc.status = "quarantined"
		doc.reason = reason
		emit(ctx.rt, "statement.quarantined", self.getId(), { docId: doc.id, reason })
	}
	const self: Agent = codeParticipant("Auditor", [
		{
			specification: new On("extraction.submitted"),
			processor: {
				apply: ({ event }) => safely(ctx, "auditor", () => {
					const { docId } = event.payload as { docId: string }
					const doc = state.documents.get(docId)
					const ex = state.extractions.get(docId)?.at(-1)
					if (!doc || !ex || doc.status === "verified" || doc.status === "quarantined") return
					let failures = shapeCheck(ex)
					if (failures.length === 0) failures = sourceCheck(ex, doc.pages)
					let hint: string | undefined, hintRef: string | undefined, diffMinor = 0
					if (failures.length === 0) {
						const r = reconcile(ex)
						if (r.ok) {
							const { statement, account } = statementFromExtraction(ex, doc.attempts)
							if (!state.accounts.has(account.id)) state.accounts.set(account.id, account)
							state.statements.set(statement.id, statement)
							const acctName = state.accounts.get(account.id)!.name
							for (const name of CONTROL_NAMES) {
								const c = statement.controls[name]
								if (c) state.facts.put({ id: `stmt:${statement.id}:${name}`, label: `${acctName} ${CONTROL_LABEL[name]} (${statement.id.split(":")[1]})`, kind: "money", value: c.minor, currency: statement.currency, sources: [c.source], producer: self.getId() })
							}
							if (statement.dueDate) state.facts.put({ id: `stmt:${statement.id}:dueDate`, label: `${acctName} payment due date`, kind: "date", value: statement.dueDate.iso, sources: [statement.dueDate.source], producer: self.getId() })
							const closing = statement.controls.closing
							if (statement.kind === "current" && closing) state.facts.put({ id: `bal:${account.id}:${statement.period.to}`, label: `${acctName} balance on ${humanDate(statement.period.to)}`, kind: "money", value: closing.minor, currency: statement.currency, sources: [closing.source], producer: self.getId() })
							doc.status = "verified"
							doc.reason = undefined
							emit(ctx.rt, "statement.verified", self.getId(), { docId, statementId: statement.id, accountId: account.id })
							return
						}
						failures = r.failures
						diffMinor = r.diffMinor
						const h = r.diffMinor ? findHint(r.diffMinor, doc.pages, citedRefs(ex)) : undefined
						if (h) { hint = `difference ${formatMoney(r.diffMinor)} equals '${h.label}' on ${h.ref}`; hintRef = h.ref }
					}
					hint ??= failures[0] ?? "extraction failed"
					doc.reason = hint
					if (doc.attempts >= MAX_ATTEMPTS) { quarantine(doc, `failed ${doc.attempts} reads: ${hint}`); return }
					doc.status = "rejected"
					emit(ctx.rt, "statement.rejected", self.getId(), { docId, assignee: doc.assignee, diffMinor, hint, ...(hintRef ? { hintRef } : {}), attempt: doc.attempts })
				}),
			},
		},
		{
			specification: new On("agent.failed"),
			processor: {
				apply: ({ event }) => safely(ctx, "auditor", () => {
					const { agentId } = event.payload as { agentId: string }
					for (const doc of state.documents.values())
						if (doc.kind === "statement" && doc.assignee === agentId && doc.status !== "verified" && doc.status !== "quarantined") quarantine(doc, "reader failed")
				}),
			},
		},
	])
	return self
}
