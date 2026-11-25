// Labels verified rows from a fixed list, on the fast model. Labels never change a number.
import { createAgent, type Agent } from "@mozaik-ai/core"
import { roleInstruction, startLoop, tool, type Ctx } from "./kit.ts"
import { emit, On } from "../events.ts"

export const CATEGORIES = ["groceries", "dining and delivery", "transport and fuel", "utilities and telecom", "housing", "childcare and education", "health and beauty",
	"insurance", "shopping", "travel", "entertainment and subscriptions", "fitness", "family support", "cash", "fees and interest", "income", "transfer"]

export function createCategoriser(ctx: Ctx): Agent {
	let self: Agent
	const assign = tool<{ statementId: string; items: { rowId: string; category: string; confidence: number }[] }>("assign_categories", "Assign one category from the list to each row.", {
		type: "object",
		properties: { statementId: { type: "string" }, items: { type: "array", items: { type: "object", properties: { rowId: { type: "string" }, category: { type: "string", enum: CATEGORIES }, confidence: { type: "number" } }, required: ["rowId", "category", "confidence"] } } },
		required: ["statementId", "items"],
	}, async (a) => {
		const s = ctx.state.statements.get(a.statementId)
		if (!s) throw new Error(`unknown statement "${a.statementId}"`)
		const bad = a.items.filter((i) => !CATEGORIES.includes(i.category) || !s.rows.some((r) => r.id === i.rowId))
		if (bad.length) throw new Error(`unknown row or category: ${bad.map((b) => `${b.rowId}=${b.category}`).join(", ")}`)
		for (const i of a.items) ctx.state.categories.set(i.rowId, { category: i.category, confidence: Math.max(0, Math.min(1, Number(i.confidence) || 0)) })
		emit(ctx.rt, "categories.assigned", self.getId(), { statementId: s.id, lowConfidence: a.items.filter((i) => i.confidence < 0.6).length })
		return { ok: true, assigned: a.items.length }
	})
	self = createAgent({
		name: "Categoriser",
		capabilities: ["categorise"],
		instruction: roleInstruction("categoriser", `You label bank statement rows. Use exactly one category per row from: ${CATEGORIES.join(", ")}. Money between the household's own accounts and card payments are "transfer". Give a confidence from 0 to 1. Call assign_categories once with every row.`),
		tools: [assign],
		handlers: [{
			specification: new On("statement.verified"),
			processor: {
				apply: ({ event }) => {
					const s = ctx.state.statements.get((event.payload as { statementId: string }).statementId)
					if (!s) return
					const own = new Set([...ctx.state.transfers.values()].flatMap((t) => { const p = t as { out: string; in: string }; return [p.out, p.in] }))
					const lines = s.rows.map((r) => `${r.id} | ${r.description} | ${(s.kind === "card" ? -r.amountMinor : r.amountMinor) >= 0 ? "in" : "out"}${own.has(r.id) ? " | own-account transfer" : ""}`)
					startLoop(ctx, self, `statementId=${s.id}\n${lines.join("\n")}`, { model: ctx.config.fastModel, maxOutputTokens: 2000 })
				},
			},
		}],
	})
	return self
}
