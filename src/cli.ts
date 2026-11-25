// npm run demo: one close in the terminal, with the lane chart, the brief, the actions and the metrics.
import "dotenv/config"
import { loadConfig } from "./config.ts"
import { runClose } from "./close.ts"
import { laneChart } from "./report/lanes.ts"
import { installCrashGuard, quietCloudWarning } from "./logging.ts"
import { formatMoney } from "./money.ts"
import type { SemanticEvent } from "@mozaik-ai/core"

quietCloudWarning()
installCrashGuard((e) => console.error("! caught:", e instanceof Error ? e.message : e))
const config = loadConfig()
const t0 = Date.now()
const at = () => `${String(Date.now() - t0).padStart(6)}ms`
console.log(`CFOne · close from ${config.dataDir} · ${config.mode === "offline" ? "offline: scripted model" : `live: ${config.model}`} · as of ${config.asOf}\n`)

const p = (e: SemanticEvent) => (e.payload ?? {}) as Record<string, unknown>
function log(e: SemanticEvent) {
	const x = p(e)
	switch (e.type) {
		case "document.received": console.log(`${at()}  → ${x.docId} (${x.kind})`); break
		case "statement.verified": console.log(`${at()}  ✓ verified ${x.docId} as ${x.statementId}`); break
		case "statement.rejected": console.log(`${at()}  ✗ rejected ${x.docId}: ${x.hint}`); break
		case "statement.quarantined": console.log(`${at()}  ⚠ quarantined ${x.docId}: ${x.reason}`); break
		case "commitment.flagged": console.log(`${at()}  ⚑ flagged: ${x.reason}`); break
		case "reservation.bumped": console.log(`${at()}  ⇄ bumped claim ${x.claimId}: ${formatMoney(Number(x.fromMinor))} → ${formatMoney(Number(x.toMinor))}`); break
		case "guard.blocked": console.log(`${at()}  ⛔ blocked a draft from ${x.tool}: ${x.reason}`); break
		case "action.proposed": console.log(`${at()}  ✎ action proposed ${x.actionId}`); break
		case "agent.failed": console.log(`${at()}  ! agent failed: ${x.reason}`); break
		case "close.settled": console.log(`${at()}  ● settled, writing the brief`); break
	}
}

const r = await runClose({ config, onEvent: log })
const names = new Map(r.state.getParticipants().map((x) => [x.getId(), x.getManifest().name]))
console.log("\nSwarm lanes (one row per agent, time →)\n")
console.log(laneChart(r.state.spans, names))
console.log("\n" + (r.brief?.plain ?? "(no brief)"))
console.log("\nActions\n")
r.actions.forEach((a, i) => console.log(`${i + 1}. ${a.plain.replace(/\n/g, "\n   ")}\n`))
const m = r.metrics
console.log(`participants: ${m.participants} · peak concurrent loops: ${m.peakLoops} · LLM loops: ${m.loops} · rejections caught: ${m.rejections} · conflicts settled: ${m.conflicts} · drafts blocked: ${m.blocked} · facts: ${m.facts} · ${(r.durationMs / 1000).toFixed(1)}s`)
if (r.timedOut) console.error("The close timed out.")
process.exit(r.timedOut ? 1 : 0)
