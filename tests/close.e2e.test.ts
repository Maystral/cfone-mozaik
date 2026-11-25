import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { runClose } from "../src/close.ts"
import { loadConfig } from "../src/config.ts"
import { laneChart } from "../src/report/lanes.ts"

const config = () => loadConfig({ CFONE_OFFLINE: "1", CFONE_OFFLINE_LATENCY_MS: "20" })

test("a full offline close finds the golden position, actions and cover", async () => {
	const r = await runClose({ config: config() })
	assert.equal(r.timedOut, false)
	for (const s of ["55,322.85", "19,182.73", "63,500.00", "EUR 2,051.89", "Not financial advice."]) assert.ok(r.brief!.plain.includes(s), `${s} missing from:\n${r.brief!.plain}`)
	assert.equal(r.actions.length, 3)
	assert.ok(r.actions.every((a) => a.plain.endsWith("Not financial advice.")))
	assert.ok(r.metrics.peakLoops >= 11, `peak ${r.metrics.peakLoops}`)
	assert.equal(r.metrics.rejections, 2)
	assert.equal(r.metrics.blocked, 0)
	assert.ok(r.metrics.participants >= 22, `participants ${r.metrics.participants}`)
	assert.ok(r.metrics.facts > 50)
	assert.match(r.brief!.html, /<h3>Household close to 31 Oct 2026<\/h3>/)
	assert.ok(!r.brief!.html.includes("**"))
	assert.ok(!/\d/.test(r.brief!.plain.replace(/(AED|EUR) [\d,]+\.\d{2}|\d{1,2} [A-Z][a-z]{2} \d{4}|cheque \d+|·\d{4}|\d+\.\d{4}|\d+(\.\d+)?%/g, "")), r.brief!.plain)
})

test("two closes in one process", async () => {
	const a = await runClose({ config: config() })
	const b = await runClose({ config: config() })
	assert.equal(b.timedOut, false)
	assert.deepEqual(b.actions.map((x) => x.plain).sort(), a.actions.map((x) => x.plain).sort())
})

test("lane chart draws one lane per agent", () => {
	const chart = laneChart([{ agentId: "a", loopId: "1", start: 0, end: 50 }, { agentId: "b", loopId: "2", start: 25, end: 100 }], new Map([["a", "Reader A"], ["b", "Clerk"]]), 20)
	const lines = chart.split("\n")
	assert.ok(lines.some((l) => l.startsWith("Reader A") && l.includes("▇")))
	assert.ok(lines.some((l) => l.startsWith("Clerk") && l.includes("▇")))
})

test("cli prints the metrics line", () => {
	const r = spawnSync("npx", ["tsx", "src/cli.ts"], { env: { ...process.env, CFONE_OFFLINE: "1", CFONE_OFFLINE_LATENCY_MS: "20" }, encoding: "utf8", timeout: 60000 })
	assert.equal(r.status, 0, r.stderr)
	assert.match(r.stdout, /peak concurrent loops: \d+/)
	assert.match(r.stdout, /Not financial advice\./)
	assert.match(r.stdout, /✗ rejected bank-b-card-2026-10/)
})

test("sentinels wake when the last clerk document completes intake, at demo latency", async () => {
	const r = await runClose({ config: loadConfig({ CFONE_OFFLINE: "1", CFONE_OFFLINE_LATENCY_MS: "150" }) })
	assert.equal(r.timedOut, false)
	assert.equal(r.actions.length, 3)
})
