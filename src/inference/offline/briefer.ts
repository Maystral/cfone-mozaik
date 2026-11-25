// Offline briefer: a template filled with fact placeholders.
import { registerPolicy, type PolicyInput } from "../offline-runner.ts"

export function templateBrief(task: string): string {
	const periodEnd = /periodEnd=(\S+)/.exec(task)?.[1] ?? ""
	const has = (id: string) => task.includes(`[F:${id}]`)
	const actions = task.split("\n").filter((l) => l.startsWith("ACTION ")).map((l) => l.split(" | "))
	const risks = task.split("\n").filter((l) => l.startsWith("RISK ")).map((l) => /^RISK (\S+) (\S+)/.exec(l)!)
	const out = [`# Household close to {{D:${periodEnd}}}`, ""]
	out.push(`**Have** {{F:position:have}} · **Owe** {{F:position:owe}} · **Promised by cheque in the next ninety days** {{F:position:promised90}}`, "")
	if (risks.length) {
		out.push("## Risks in the next ninety days")
		for (const [, id = "", type] of risks) {
			if (type === "card_interest" && has(`full:${id}`)) out.push(`- Card due: {{F:full:${id}}} in full, minimum {{F:minimum:${id}}}.`)
			else if (has(`shortfall:${id}`)) out.push(`- ${id.startsWith("cheque-") ? `{{C:${id.slice(7)}}}` : "Card autopay"} is short by {{F:shortfall:${id}}}.`)
		}
		out.push("")
	}
	if (actions.length) {
		out.push("## Proposed actions")
		for (const [, title, body] of actions) out.push(`- **${title}**: ${body}`)
		out.push("")
	}
	out.push("Nothing moves until you approve it.")
	return out.join("\n")
}

registerPolicy("briefer", (p: PolicyInput) => {
	const last = p.calls.at(-1)
	if (last?.name === "publish_brief" && !last.output?.startsWith("BLOCKED")) return { say: "Published." }
	return { call: "publish_brief", args: { markdown: templateBrief(p.task) } }
})
