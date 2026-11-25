// Writes the household brief from facts only, once the close has settled. Behind the Number Guard.
import { createAgent, type Agent } from "@mozaik-ai/core"
import { roleInstruction, startLoop, tool, type Ctx } from "./kit.ts"
import { emit, On } from "../events.ts"
import { NumberGuard } from "./number-guard.ts"

export const BRIEFER_INSTRUCTION = `You write the household's month-end brief in short Markdown: what they have, owe and have promised; the risks in the next ninety days; the proposed actions and what each fixes; any cover available in another currency.
Write every amount as {{F:<factId>}}, dates as {{D:YYYY-MM-DD}}, accounts as {{A:<accountId>}}, cheques as {{C:<chequeNo>}}. Never type a digit outside a placeholder; a draft with a typed number is blocked.
Do not give advice beyond the proposed actions. Call publish_brief once.`

export function briefTask(ctx: Ctx): string {
	const { state } = ctx
	const periodEnd = [...state.statements.values()].map((s) => s.period.to).sort().at(-1) ?? ctx.config.asOf
	const live = [...state.actions.values()].filter((a) => a.status === "proposed" || a.status === "approved").sort((a, b) => a.riskId.localeCompare(b.riskId))
	const risks = state.forecast?.risks ?? []
	const lines = [
		`periodEnd=${periodEnd}`, `asOf=${ctx.config.asOf}`,
		"FACTS", ...state.facts.toPromptLines("position:"),
		...risks.flatMap((r) => [...state.facts.toPromptLines(`shortfall:${r.id}`), ...state.facts.toPromptLines(`full:${r.id}`)]),
		...state.facts.toPromptLines("cover:"),
		"RISKS", ...risks.map((r) => `RISK ${r.id} ${r.type} account=${r.accountId} date=${r.date}`),
		"ACTIONS", ...live.map((a) => `ACTION ${a.riskId} | ${a.title} | ${a.body}`),
	]
	return lines.join("\n")
}

export function createBriefer(ctx: Ctx): Agent {
	let self: Agent
	const publish = tool<{ markdown: string }>("publish_brief", "Publish the brief. Placeholders only for numbers.", { type: "object", properties: { markdown: { type: "string" } }, required: ["markdown"] }, async (a) => {
		ctx.state.brief = { markdown: a.markdown }
		emit(ctx.rt, "brief.published", self.getId(), { briefId: "brief" })
		return { ok: true }
	})
	const facts = tool<{ prefix?: string }>("get_facts", "Facts whose id starts with the prefix, as [F:id] label = value.", { type: "object", properties: { prefix: { type: "string" } } }, async (a) => ctx.state.facts.toPromptLines(a.prefix ?? "").slice(0, 200))
	self = createAgent({
		name: "Briefer",
		capabilities: ["brief"],
		instruction: roleInstruction("briefer", BRIEFER_INSTRUCTION),
		tools: [facts, publish],
		handlers: [{ specification: new On("close.settled"), processor: { apply: () => startLoop(ctx, self, briefTask(ctx), { intercept: new NumberGuard(ctx, self.getId()), maxOutputTokens: 3000 }) } }],
	})
	return self
}
