// npm start: the page on http://localhost:3000. Same runtime code as the CLI; one close at a time.
import "dotenv/config"
import { createServer as httpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { SemanticEvent } from "@mozaik-ai/core"
import { loadConfig, type Config } from "./config.ts"
import { renderBrief, startClose, type RunningClose } from "./close.ts"
import { summarize } from "./agents/observer.ts"
import { emit } from "./events.ts"
import { formatFact } from "./facts.ts"
import { installCrashGuard, quietCloudWarning } from "./logging.ts"
import { renderAction } from "./facts.ts"

const WEB = resolve(fileURLToPath(new URL("../web/", import.meta.url)))
const STATIC: Record<string, [string, string]> = { "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/style.css": ["style.css", "text/css; charset=utf-8"] }
const QUIET = new Set(["inference.stream", "message_received.completed", "inference.completed", "interception.started", "interception.finished"])

export function createServer(config: Config): Server {
	let run: RunningClose | undefined
	let running = false
	let runSeq = 0
	let buffer: string[] = []
	const clients = new Set<ServerResponse>()

	const send = (e: SemanticEvent) => {
		if (QUIET.has(e.type)) return
		const line = `data: ${JSON.stringify(summarize(e))}\n\n`
		buffer.push(line)
		for (const c of clients) c.write(line)
	}

	const json = (res: ServerResponse, status: number, body: unknown) => {
		res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
		res.end(JSON.stringify(body))
	}

	const stateBody = () => {
		const s = run?.ctx.state
		if (!s) return { mode: config.mode, model: config.model, running, facts: {}, actions: [], position: {}, metrics: null, spans: [], forecast: null, brief: null, accounts: [], documents: [] }
		const facts = Object.fromEntries(s.facts.list().map((f) => [f.id, { id: f.id, label: f.label, kind: f.kind, text: formatFact(f), currency: f.currency, sources: f.sources, derivedFrom: f.derivedFrom ?? [] }]))
		const names = Object.fromEntries(s.getParticipants().map((p) => [p.getId(), p.getManifest().name]))
		const f = s.forecast
		return {
			mode: config.mode, model: config.model, running, asOf: config.asOf, homeCurrency: config.homeCurrency,
			position: { have: facts["position:have"], owe: facts["position:owe"], promised90: facts["position:promised90"] },
			facts,
			actions: [...s.actions.values()].filter((a) => a.status !== "superseded").sort((a, b) => a.riskId.localeCompare(b.riskId)).map((a) => ({ id: a.id, riskId: a.riskId, status: a.status, ...renderAction(a, s.facts, s.accounts) })),
			brief: renderBrief(s) ?? null,
			forecast: f ? { version: f.version, start: f.start, end: f.end, planned: f.planned, baseline: f.baseline, risks: f.risks, cover: f.cover } : null,
			accounts: [...s.accounts.values()],
			documents: [...s.documents.values()].map((d) => ({ id: d.id, kind: d.kind, status: d.status, attempts: d.attempts, reason: d.reason })),
			metrics: s.metrics,
			spans: s.spans.map((x) => ({ ...x, name: names[x.agentId] ?? x.agentId })),
		}
	}

	return httpServer(async (req: IncomingMessage, res: ServerResponse) => {
		try {
			const url = new URL(req.url ?? "/", "http://x")
			const path = url.pathname
			if (req.method === "GET" && STATIC[path]) {
				const [file, type] = STATIC[path]!
				res.writeHead(200, { "content-type": type, "cache-control": "no-store" })
				res.end(await readFile(resolve(WEB, file)))
				return
			}
			if (req.method === "POST" && path === "/api/close") {
				if (running) return json(res, 409, { error: "a close is already running" })
				running = true
				buffer = []
				const runId = `run-${++runSeq}`
				run = startClose({ config, onEvent: send })
				run.done.then(() => { running = false }, () => { running = false })
				return json(res, 202, { runId })
			}
			if (req.method === "GET" && path === "/api/events") {
				res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" })
				for (const line of buffer) res.write(line)
				clients.add(res)
				req.on("close", () => clients.delete(res))
				return
			}
			if (req.method === "GET" && path === "/api/state") return json(res, 200, stateBody())
			const doc = /^\/api\/doc\/([\w.-]+)$/.exec(path)
			if (req.method === "GET" && doc) {
				const d = run?.ctx.state.documents.get(doc[1]!)
				return d ? json(res, 200, { id: d.id, kind: d.kind, status: d.status, pages: d.pages }) : json(res, 404, { error: "unknown document" })
			}
			const act = /^\/api\/actions\/([\w.:-]+)\/(approve|snooze)$/.exec(path)
			if (req.method === "POST" && act) {
				const s = run?.ctx.state
				const a = s?.actions.get(act[1]!)
				if (!run || !a) return json(res, 404, { error: "unknown action" })
				if (a.status !== "proposed") return json(res, 409, { error: `action is ${a.status}` })
				emit(run.ctx.rt, act[2] === "approve" ? "action.approved" : "action.snoozed", run.youId, { actionId: a.id })
				return json(res, 200, { id: a.id, status: a.status })
			}
			json(res, 404, { error: "not found" })
		} catch (e) {
			json(res, 500, { error: (e as Error).message })
		}
	})
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	quietCloudWarning()
	installCrashGuard((e) => console.error("! caught:", e instanceof Error ? e.message : e))
	const config = loadConfig()
	createServer(config).listen(config.port, () => console.log(`CFOne on http://localhost:${config.port} (${config.mode === "offline" ? "offline: scripted model" : `live: ${config.model}`})`))
}

