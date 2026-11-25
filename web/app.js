// CFOne page: live swarm lanes over server-sent events, the radar, sourced actions and the source drawer.
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
let state = null
let refreshTimer = null
let source = null
const docCache = new Map()

async function refresh() {
	refreshTimer = null
	const r = await fetch("/api/state")
	state = await r.json()
	render()
}
const soon = (ms = 250) => { if (!refreshTimer) refreshTimer = setTimeout(refresh, ms) }

function chip(f) { return f ? `<button class="chip" data-fact="${esc(f.id)}">${esc(f.text)}</button>` : "—" }

function render() {
	const s = state
	$("mode").textContent = s.mode === "offline" ? "offline: scripted model" : `live: ${s.model}`
	$("run").disabled = s.running
	$("run").textContent = s.running ? "Running…" : "Run close"
	$("have").innerHTML = chip(s.position.have)
	$("owe").innerHTML = chip(s.position.owe)
	$("promised").innerHTML = chip(s.position.promised90)
	const miss = s.position.have && /missing rate/.exec(s.position.have.label)
	$("have-note").textContent = miss ? s.position.have.label.replace(/^.*\((.*)\)$/, "$1") : "current accounts, home currency"
	renderLanes(s)
	renderRadar(s)
	renderActions(s)
	$("brief").innerHTML = s.brief ? s.brief.html : '<p class="empty">Written when the close settles.</p>'
}

function renderLanes(s) {
	if (!s.spans.length) return
	const now = Math.max(...s.spans.map((x) => x.end ?? x.start), 1)
	const t1 = s.running ? Math.max(now, performance.now() - (window.__t0 ?? performance.now())) : now
	const agents = []
	for (const sp of s.spans) if (!agents.includes(sp.agentId)) agents.push(sp.agentId)
	$("lanes").innerHTML = agents.map((a) => {
		const spans = s.spans.filter((x) => x.agentId === a)
		const bars = spans.map((x) => { const l = (x.start / t1) * 100, w = (((x.end ?? t1) - x.start) / t1) * 100; return `<span class="bar${x.end === undefined ? " open" : ""}" style="left:${l}%;width:${Math.max(w, 0.6)}%"></span>` }).join("")
		return `<div class="lane"><span class="name" title="${esc(spans[0].name)}">${esc(spans[0].name.replace(/^Reader /, "📄 "))}</span><span class="track">${bars}</span></div>`
	}).join("")
	const m = s.metrics
	if (m) $("metrics").innerHTML = `<b>${m.peakLoops}</b> peak concurrent loops · <b>${m.loops}</b> loops · <b>${m.rejections}</b> rejections caught · <b>${m.conflicts}</b> conflicts settled · <b>${m.blocked}</b> drafts blocked`
}

function renderRadar(s) {
	const f = s.forecast
	if (!f) return
	const accts = s.accounts.filter((a) => a.kind === "current" && f.planned[a.id])
	$("radar").innerHTML = accts.map((a) => {
		const plan = f.planned[a.id], base = f.baseline[a.id]
		const days = Object.keys(plan)
		const vals = [...Object.values(plan), ...Object.values(base), 0]
		const lo = Math.min(...vals), hi = Math.max(...vals)
		const W = 600, H = 80, x = (i) => (i / (days.length - 1)) * W, y = (v) => H - 4 - ((v - lo) / Math.max(1, hi - lo)) * (H - 14)
		const path = (ser) => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(ser[d]).toFixed(1)}`).join("")
		const risks = f.risks.filter((r) => r.accountId === a.id && plan[r.date] !== undefined)
		const marks = risks.map((r) => { const i = days.indexOf(r.date); return `<circle class="risk" cx="${x(i)}" cy="${y(plan[r.date])}" r="4"><title>${esc(r.id)}</title></circle><text class="risk-label" x="${Math.min(x(i) + 6, W - 70)}" y="12">✗ ${esc(new Date(r.date + "T00:00:00Z").toUTCString().slice(5, 11))}</text>` }).join("")
		const last = days[days.length - 1]
		return `<div class="radar-acct"><div class="lbl"><span>${esc(a.name)} (${esc(a.currency)})</span><span>${esc(a.currency)} ${(plan[last] / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} on ${last}</span></div>
			<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(a.name)} projected balance"><line class="zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/><path class="base" d="${path(base)}"/><path class="plan" d="${path(plan)}"/>${marks}</svg></div>`
	}).join("") + '<p class="legend">Solid: with the proposed plan · dashed: before it · ✗ a payment that would not clear.</p>'
}

function renderActions(s) {
	if (!s.actions.length) return
	$("actions").innerHTML = s.actions.map((a) => `<div class="action"><div>${a.html}</div><div class="btns">${a.status === "proposed"
		? `<button data-approve="${esc(a.id)}" class="primary">Approve</button><button data-snooze="${esc(a.id)}">Snooze</button>`
		: `<span class="status">${esc(a.status)}</span>`}</div></div>`).join("")
}

async function openFact(id, depth = 0) {
	const f = state?.facts[id]
	if (!f) return
	$("drawer").hidden = false
	if (depth === 0) $("drawer-title").textContent = `${f.label}: ${f.text}`
	const parts = []
	for (const src of f.sources) {
		if (src.factId) {
			const g = state.facts[src.factId]
			parts.push(`<div class="src"><div class="doc">computed from</div>${g ? `<button class="chip" data-fact="${esc(g.id)}">${esc(g.label)}: ${esc(g.text)}</button>` : esc(src.factId)}</div>`)
			continue
		}
		if (!docCache.has(src.docId)) docCache.set(src.docId, await (await fetch(`/api/doc/${encodeURIComponent(src.docId)}`)).json())
		const doc = docCache.get(src.docId)
		const lines = doc.pages?.find((p) => p.page === src.page)?.lines ?? []
		const from = Math.max(0, src.line - 3), to = Math.min(lines.length, src.line + 2)
		const shown = lines.slice(from, to).map((l, i) => { const n = from + i + 1; return `<span${n === src.line ? ' class="hl"' : ""}>p${src.page}:l${String(n).padEnd(3)} ${esc(l)}</span>` }).join("\n")
		parts.push(`<div class="src"><div class="doc">${esc(src.docId)} · p${src.page}:l${src.line}</div><pre>${shown}</pre></div>`)
	}
	$("drawer-body").innerHTML = (depth === 0 ? "" : $("drawer-body").innerHTML) + parts.join("")
}

document.addEventListener("click", async (e) => {
	const t = e.target.closest("button")
	if (!t) return
	if (t.dataset.fact) { $("drawer-body").innerHTML = ""; await openFact(t.dataset.fact) }
	else if (t.dataset.approve || t.dataset.snooze) {
		const id = t.dataset.approve ?? t.dataset.snooze
		await fetch(`/api/actions/${encodeURIComponent(id)}/${t.dataset.approve ? "approve" : "snooze"}`, { method: "POST" })
		soon(400)
	}
})
$("drawer-close").onclick = () => { $("drawer").hidden = true }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("drawer").hidden = true })

const TICK = {
	"statement.verified": (p) => ["good", `✓ verified ${p.docId}`],
	"statement.rejected": (p) => ["bad", `✗ rejected ${p.docId}: ${p.hint}`],
	"statement.quarantined": (p) => ["bad", `⚠ quarantined ${p.docId}: ${p.reason}`],
	"commitment.flagged": (p) => ["warn", `⚑ ${p.reason}`],
	"reservation.bumped": (p) => ["warn", `⇄ claim ${p.claimId} bumped by a higher-priority claim`],
	"guard.blocked": (p) => ["bad", `⛔ blocked a draft: ${p.reason}`],
	"action.proposed": (p) => ["good", `✎ action proposed`],
	"close.settled": () => ["", "● settled, writing the brief"],
	"close.completed": () => ["good", "● close complete"],
	"action.approved": () => ["good", "✔ approved; plan redrawn"],
}

function listen() {
	if (source) source.close()
	source = new EventSource("/api/events")
	source.onmessage = (m) => {
		const e = JSON.parse(m.data)
		const t = TICK[e.type]
		if (t) { const [cls, text] = t(e.payload); const li = document.createElement("li"); li.className = cls; li.textContent = text; $("ticker").prepend(li) }
		soon(e.type === "close.completed" ? 50 : 300)
	}
}

$("run").onclick = async () => {
	$("ticker").innerHTML = ""
	$("lanes").innerHTML = ""
	const r = await fetch("/api/close", { method: "POST" })
	if (r.status === 202) { window.__t0 = performance.now(); listen(); soon(50) }
}

refresh().then(() => { if (state.running) listen() })
setInterval(() => { if (state?.running) soon(0) }, 700)
