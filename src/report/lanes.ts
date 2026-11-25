// An ASCII lane chart of loop spans: one lane per agent, time left to right.
import type { Span } from "../types.ts"

export function laneChart(spans: Span[], names: Map<string, string>, width = 60): string {
	if (spans.length === 0) return "(no loops)"
	const t0 = Math.min(...spans.map((s) => s.start))
	const t1 = Math.max(...spans.map((s) => s.end ?? s.start))
	const scale = (t: number) => Math.min(width - 1, Math.floor(((t - t0) / Math.max(1, t1 - t0)) * width))
	const agents = [...new Set(spans.map((s) => s.agentId))].sort((a, b) => Math.min(...spans.filter((s) => s.agentId === a).map((s) => s.start)) - Math.min(...spans.filter((s) => s.agentId === b).map((s) => s.start)))
	const label = (id: string) => names.get(id) ?? id
	const pad = Math.max(...agents.map((a) => label(a).length)) + 2
	const rows = agents.map((a) => {
		const lane = new Array(width).fill(" ")
		for (const s of spans.filter((x) => x.agentId === a)) for (let i = scale(s.start); i <= scale(s.end ?? t1); i++) lane[i] = "▇"
		return label(a).padEnd(pad) + lane.join("")
	})
	rows.push(" ".repeat(pad) + "0ms".padEnd(width - String(t1 - t0).length - 2) + `${t1 - t0}ms`)
	return rows.join("\n")
}
