import { test } from "node:test"
import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import { createServer } from "../src/server.ts"
import { loadConfig } from "../src/config.ts"

test("the page runs a close over SSE, shows cited lines and takes approvals", async () => {
	const server = createServer(loadConfig({ CFONE_OFFLINE: "1", CFONE_OFFLINE_LATENCY_MS: "20" }))
	await new Promise<void>((r) => server.listen(0, r))
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
	const get = (p: string) => fetch(base + p)
	const post = (p: string) => fetch(base + p, { method: "POST" })
	try {
		const home = await get("/")
		assert.equal(home.status, 200)
		assert.match(await home.text(), /Not financial advice/)
		assert.equal((await get("/app.js")).status, 200)
		assert.equal((await get("/style.css")).status, 200)
		assert.equal((await get("/nope")).status, 404)
		const first = await post("/api/close")
		assert.equal(first.status, 202)
		assert.ok((await first.json()).runId)
		assert.equal((await post("/api/close")).status, 409)
		// SSE until the close completes
		const res = await get("/api/events")
		assert.equal(res.headers.get("content-type"), "text/event-stream")
		const reader = res.body!.getReader()
		const dec = new TextDecoder()
		let buf = "", done = false
		const deadline = Date.now() + 20000
		while (!done && Date.now() < deadline) {
			const { value, done: end } = await reader.read()
			if (end) break
			buf += dec.decode(value)
			done = buf.includes("\"type\":\"close.completed\"")
		}
		await reader.cancel()
		assert.ok(done, "close.completed over SSE")
		assert.ok(!buf.includes("\"context\""), "loop payloads are reduced to ids")
		const doc = await (await get("/api/doc/bank-b-card-2026-10")).json()
		assert.equal(doc.pages[0].lines[7], "Finance charges  165.13")
		assert.equal((await get("/api/doc/missing")).status, 404)
		const state = await (await get("/api/state")).json()
		assert.equal(state.running, false)
		assert.equal(state.position.have.text, "AED 55,322.85")
		assert.equal(state.actions.length, 3)
		assert.ok(state.actions.every((a: { html: string }) => a.html.includes("Not financial advice.")))
		assert.ok(state.facts["shortfall:cheque-000234"].sources.length > 0)
		assert.ok(state.spans.length > 10)
		assert.match(state.brief.html, /data-fact="position:have"/)
		const before = state.forecast.version
		const id = state.actions[0].id
		assert.equal((await post(`/api/actions/${id}/approve`)).status, 200)
		assert.equal((await post("/api/actions/nope/approve")).status, 404)
		let after = state
		for (let i = 0; i < 20 && after.forecast.version <= before; i++) { await new Promise((r) => setTimeout(r, 50)); after = await (await get("/api/state")).json() }
		assert.ok(after.forecast.version > before)
		assert.equal(after.actions.find((a: { id: string }) => a.id === id).status, "approved")
		assert.equal((await post("/api/close")).status, 202, "a new close after the first finished")
		await new Promise((r) => setTimeout(r, 50))
	} finally {
		server.closeAllConnections()
		await new Promise((r) => server.close(r))
	}
})
