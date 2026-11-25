// One Reader per statement. It copies printed text with page:line references; it never computes.
import { createAgent, type Agent } from "@mozaik-ai/core"
import { roleInstruction, startLoop, tool, type Ctx } from "./kit.ts"
import { emit, ForMe, On } from "../events.ts"
import { numbered } from "../pdf/lines.ts"
import type { Doc, ExtractionArgs } from "../types.ts"

const PRINTED = { type: "object", properties: { text: { type: "string", description: "exactly as printed, e.g. \"3,200.00\", \"11,687.15 CR\", \"-12,000.00\", \"AED 8,362.80\"" }, source: { type: "string", description: "p<page>:l<line> of the line that prints it" } }, required: ["text", "source"] }
const CONTROL_NAMES = ["opening", "closing", "totalDebits", "totalCredits", "previousBalance", "paymentsAndCredits", "purchases", "financeCharges", "newBalance", "minimumDue"]

export const READER_INSTRUCTION = `You read one bank statement of any bank and layout, given as numbered lines "p<page>:l<line>  text" (PDF columns are joined by two spaces; CSV exports are one page, one record per line).
Call submit_extraction once with:
- currency: the ISO 4217 code printed on the statement (e.g. AED, EUR).
- account: the bank name as printed in the header (e.g. "Bank A"), product "current" or "credit_card", the last four digits printed for the account or primary card, the holder's name as printed.
- period: from and to as YYYY-MM-DD.
- controls: the statement's own figures from its header or summary lines (opening, closing, totalDebits, totalCredits for accounts; previousBalance, paymentsAndCredits, purchases, financeCharges, newBalance, minimumDue for cards) and dueDate for cards. Each is the text exactly as printed plus the p:l reference of its line.
- rows: one row per transaction line in the table, in printed order. Copy the amount exactly as printed with its p:l reference, and the running balance when the row shows one. date as YYYY-MM-DD; description as printed. direction: for accounts, decide from the running balance (balance went up = credit) or the sign; for cards, "CR" or a leading minus means credit, otherwise debit. cardLast4 when the row sits under a cardholder section.
Never compute, total or round anything. Never invent a line. Balance-forward and closing lines are controls, not rows.
If the task carries "HINT ref=<p:l>", that line is a charge printed only in the summary: add it as one more row with derived: true, the statement's last day as its date, the label as description and the amount and reference of that line.`

export function createReader(ctx: Ctx, doc: Doc): Agent {
	let self: Agent
	const submit = tool<ExtractionArgs>("submit_extraction", "Submit what the statement prints: currency, account, period, control figures and rows, each amount with its p:l source.", {
		type: "object",
		properties: {
			docId: { type: "string" },
			currency: { type: "string" },
			account: { type: "object", properties: { bank: { type: "string" }, product: { type: "string", enum: ["current", "credit_card"] }, last4: { type: "string" }, holder: { type: "string" } }, required: ["bank", "product", "last4", "holder"] },
			period: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
			controls: { type: "object", properties: { ...Object.fromEntries(CONTROL_NAMES.map((n) => [n, PRINTED])), dueDate: { type: "object", properties: { text: { type: "string" }, iso: { type: "string" }, source: { type: "string" } }, required: ["text", "iso", "source"] } } },
			rows: { type: "array", items: { type: "object", properties: { date: { type: "string" }, description: { type: "string" }, amount: PRINTED, direction: { type: "string", enum: ["debit", "credit"] }, balance: PRINTED, cardLast4: { type: "string" }, derived: { type: "boolean" } }, required: ["date", "description", "amount", "direction"] } },
		},
		required: ["currency", "account", "period", "controls", "rows"],
	}, async (args) => {
		if (["verified", "quarantined"].includes(doc.status)) return `${doc.id} is already ${doc.status}; nothing to do.`
		const ex: ExtractionArgs = { ...args, docId: doc.id, controls: args.controls ?? {}, rows: Array.isArray(args.rows) ? args.rows : [] }
		doc.attempts++
		const list = ctx.state.extractions.get(doc.id) ?? []
		list.push(ex)
		ctx.state.extractions.set(doc.id, list)
		emit(ctx.rt, "extraction.submitted", self.getId(), { docId: doc.id, attempt: doc.attempts })
		const status: string = doc.status
		const verdict = status === "verified" || status === "quarantined" ? status : `rejected: ${doc.reason ?? ""}`
		return `Submitted attempt ${doc.attempts}. Auditor: ${verdict}. Stop here; a rejection arrives as a new task.`
	})
	const read = (extra = "") => startLoop(ctx, self, `docId=${doc.id}\n${extra}${numbered(doc.pages)}`, { maxOutputTokens: 12000 })
	self = createAgent({
		name: `Reader ${doc.id}`,
		capabilities: ["read"],
		instruction: roleInstruction("reader", READER_INSTRUCTION),
		tools: [submit],
		handlers: [
			{ specification: new On("document.received").and(new ForMe()), processor: { apply: () => read() } },
			{
				specification: new On("statement.rejected").and(new ForMe()),
				processor: {
					apply: ({ event }) => {
						const p = event.payload as { hint: string; hintRef?: string; attempt: number }
						read(`Your extraction (attempt ${p.attempt}) was rejected by the Auditor: ${p.hint}\n${p.hintRef ? `HINT ref=${p.hintRef}\n` : ""}Read the statement again and submit a corrected extraction.\n\n`)
					},
				},
			},
		],
	})
	return self
}
