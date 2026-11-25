// CFOne page: where you stand, what needs attention, what is coming, and how it was checked.
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const day = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`
const longDay = (iso) => `${day(iso)} ${iso.slice(0, 4)}`
const inDays = (n) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30)} months`)
let state = null
let refreshTimer = null
let source = null
const docCache = new Map()

async function refresh() {
	refreshTimer = null
	const r = await fetch("/api/state")
	if (r.status === 401) { location.href = "/login"; return }
	state = await r.json()
	render()
}
const soon = (ms = 250) => { if (!refreshTimer) refreshTimer = setTimeout(refresh, ms) }
const chip = (f) => (f ? `<button class="chip" data-fact="${esc(f.id)}" title="${esc(f.label)}">${esc(f.text)}</button>` : "—")

function render() {
	const s = state
	$("mode").textContent = s.mode === "offline" ? "demo mode (no AI key)" : "live AI"
	$("run").disabled = s.running
	$("run").textContent = s.running ? "Checking…" : "Check again"
	$("asof").textContent = s.periodEnd ? `As of ${longDay(s.asOf)} · from statements up to ${longDay(s.periodEnd)}` : ""
	renderHero(s)
	renderAttention(s)
	renderRadar(s)
	renderUpcoming(s)
	renderChecks(s)
	renderLanes(s)
	$("brief").innerHTML = s.brief ? s.brief.html : '<p class="empty">Written when the check finishes.</p>'
}

function stage(s) {
	if (!s.running && s.brief) return 5
	if (s.brief) return 5
	if (s.attention.length) return 4
	if (s.forecast) return 3
	if (s.documents.length) return s.documents.some((d) => d.status === "verified") ? 2 : 1
	return 0
}

function renderHero(s) {
	const st = stage(s)
	const names = ["Read your documents", "Check every total", "Project 90 days", "Plan fixes", "Write summary"]
	$("steps").hidden = !s.running && st === 5
	$("steps").innerHTML = names.map((n, i) => `<li class="${i + 1 < st || (i + 1 === st && !s.running) ? "done" : i + 1 === st ? "now" : ""}">${n}</li>`).join("")
	const ready = !s.running || st >= 4
	const pending = '<span class="pending">…</span>'
	$("have").innerHTML = ready ? chip(s.position.have) : pending
	$("owe").innerHTML = ready ? chip(s.position.owe) : pending
	$("promised").innerHTML = ready ? chip(s.position.promised90) : pending
	const miss = s.position.have && /missing rate[^)]*/.exec(s.position.have.label)
	$("have-note").textContent = miss ? `${miss[0]}: not counted` : "current accounts, in your home currency"
	if (!s.documents.length && !s.running) { $("headline").textContent = "Press “Check again” to read the statements"; $("lede").textContent = ""; return }
	if (st < 4) {
		const stm = s.documents.filter((d) => d.kind === "statement")
		const done = stm.filter((d) => d.status === "verified" || d.status === "quarantined").length
		$("headline").textContent = st < 3 ? `Reading your statements… ${done} of ${stm.length} checked` : "Looking ahead 90 days…"
		$("lede").textContent = "This takes a few seconds."
		return
	}
	const open = s.attention.filter((a) => a.coverage !== "covered")
	const soonest = s.attention[0]
	$("headline").textContent = open.length
		? `${open.length === 1 ? "One payment" : `${open.length} payments`} in the next 90 days ${open.length === 1 ? "needs" : "need"} a decision`
		: s.attention.length ? "Every risk in the next 90 days has a plan" : "Nothing at risk in the next 90 days"
	$("lede").innerHTML = soonest
		? `${s.attention.length} ${s.attention.length === 1 ? "item" : "items"} below, the first ${inDays(soonest.daysAway)}. Each comes with a suggested fix you can approve.`
		: "All cheques and card payments are covered by what is in your accounts."
}

const COVER = { covered: ["ok", "The plan covers it"], partly: ["warn", "Partly covered: decision needed"], open: ["bad", "Not covered"] }
function renderAttention(s) {
	if (!s.attention.length) { $("attention").innerHTML = `<p class="empty">${s.running ? "Planning…" : "Nothing needs your attention."}</p>`; return }
	$("attention").innerHTML = s.attention.map((a) => {
		const [cls, label] = a.kind === "card_interest" && a.coverage === "covered" ? (a.split ? ["warn", "Plan pays it in two parts: small interest"] : ["ok", "Plan pays it in full"]) : COVER[a.coverage]
		const btns = a.status === "proposed"
			? `<button class="primary" data-approve="${esc(a.actionId)}">Approve plan</button><button data-snooze="${esc(a.actionId)}">Remind me later</button>`
			: `<span class="done-pill">${a.status === "approved" ? "✓ Plan approved" : "Snoozed"}</span>`
		return `<article class="card ${cls}">
			<div class="when"><span class="date">${esc(day(a.date))}</span><span class="rel">${esc(inDays(a.daysAway))}</span></div>
			<div class="body">
				<span class="pill ${cls}">${esc(label)}</span>
				<h3>${esc(a.headline)}</h3>
				<p class="why">${a.whyHtml}</p>
				<div class="fix"><div class="fix-k">Suggested fix</div><p>${a.fixHtml}</p></div>
				<div class="btns">${btns}</div>
				<p class="nfa">Not financial advice.</p>
			</div></article>`
	}).join("")
}

function renderRadar(s) {
	const f = s.forecast
	if (!f || (s.running && stage(s) < 4)) { $("radar").innerHTML = '<p class="empty">The outlook appears once every statement is checked.</p>'; return }
	const accts = s.accounts.filter((a) => a.kind === "current" && f.planned[a.id])
	$("radar").innerHTML = accts.map((a) => {
		const plan = f.planned[a.id], base = f.baseline[a.id]
		const days = Object.keys(plan).filter((d) => d >= s.asOf)
		const vals = [...days.map((d) => plan[d]), ...days.map((d) => base[d]), 0]
		const lo = Math.min(...vals), hi = Math.max(...vals)
		const W = 640, H = 110, top = 16, bottom = 18
		const x = (i) => (i / Math.max(1, days.length - 1)) * W
		const y = (v) => top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - top - bottom)
		const path = (ser) => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(ser[d]).toFixed(1)}`).join("")
		const ticks = days.map((d, i) => [d, i]).filter(([d]) => d.endsWith("-01")).map(([d, i]) => `<line class="tick" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${H - bottom}"/><text class="tick-l" x="${x(i) + 3}" y="${H - 4}">${MONTHS[Number(d.slice(5, 7)) - 1]}</text>`).join("")
		const risks = f.risks.filter((r) => r.accountId === a.id && plan[r.date] !== undefined && r.date >= s.asOf)
		const marks = risks.map((r) => { const i = days.indexOf(r.date); return `<circle class="risk" cx="${x(i)}" cy="${y(plan[r.date])}" r="5"><title>${esc(r.id)}</title></circle><text class="risk-l" x="${Math.min(x(i) + 7, W - 60)}" y="${Math.max(y(plan[r.date]) - 6, 12)}">${esc(day(r.date))}</text>` }).join("")
		const zero = lo < 0 ? `<line class="zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/><text class="zero-l" x="2" y="${y(0) - 3}">0</text>` : ""
		const bal = Object.values(s.facts).filter((ff) => ff.id.startsWith(`bal:${a.id}:`)).sort((p, q) => p.id.localeCompare(q.id)).at(-1)
		const balDate = bal ? bal.id.split(":").at(-1) : ""
		const status = risks.length ? `<span class="pill bad">${risks.length} payment${risks.length > 1 ? "s" : ""} at risk</span>` : `<span class="pill ok">stays above your buffer</span>`
		return `<div class="acct"><div class="acct-h"><span class="acct-n">${esc(a.name)}</span><span class="acct-b">${bal ? `${esc(day(balDate))}: ${chip(bal)}` : ""} ${status}</span></div>
			<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(a.name)}: projected balance for 90 days">${ticks}${zero}<path class="base" d="${path(base)}"/><path class="plan" d="${path(plan)}"/>${marks}</svg></div>`
	}).join("")
}

let showAll = false
function renderUpcoming(s) {
	if (!s.upcoming.length || (s.running && stage(s) < 4)) { $("upcoming").innerHTML = ""; return }
	const list = showAll ? s.upcoming : s.upcoming.slice(0, 8)
	const more = s.upcoming.length > 8 ? `<li class="more"><button class="link" id="more">${showAll ? "Show fewer" : `Show all ${s.upcoming.length}`}</button></li>` : ""
	$("upcoming").innerHTML = list.map((u) => [u, s.upcoming.indexOf(u)]).map(([u, i]) => `<li class="${u.direction}">
		<span class="u-date">${esc(day(u.date))}</span>
		<span class="u-what">${esc(u.label)}${u.estimated ? ' <span class="est">estimate</span>' : ""}<span class="u-acct">${esc(u.accountName)}</span></span>
		<button class="u-amt chip" data-up="${i}">${esc(u.amountText)}</button></li>`).join("") + more
}

function renderChecks(s) {
	const c = s.checks
	if (!c) { $("checks").innerHTML = ""; return }
	const li = (icon, cls, html) => `<li class="${cls}"><span class="ic">${icon}</span><span>${html}</span></li>`
	const items = []
	items.push(li("✓", "ok", `<b>${c.statements.verified} of ${c.statements.total} statements</b> match their own printed totals to the cent before any number counts.`))
	if (c.statements.reread.length) items.push(li("↻", "warn", `<b>${c.statements.reread.length} needed a second read</b> (${c.statements.reread.map(esc).join(", ")}): the cross-check found a gap, the reader went back and found the missing line.`))
	for (const q of c.statements.quarantined) items.push(li("⚠", "bad", `<b>${esc(q.name)} was left out</b>: ${esc(q.reason)}.`))
	if (c.cheques) items.push(li("✓", "ok", `<b>${c.cheques} cheques</b>, the payment plan and card terms read and linked to their lines.`))
	for (const f of c.flags) items.push(li("ⓘ", "info", esc(f)))
	if (c.rates.length) items.push(li("✓", "ok", `Other currencies converted only at the rate in your rates file (${c.rates.map(esc).join("; ")}). A currency without a rate is left out, never guessed.`))
	if (s.metrics?.blocked) items.push(li("⛔", "warn", `<b>${s.metrics.blocked} draft${s.metrics.blocked > 1 ? "s" : ""} blocked</b> because the AI typed a number itself. Only amounts computed from your documents can appear.`))
	else items.push(li("✓", "ok", "No AI-typed numbers: every amount is computed by code from your documents."))
	if (c.unsupported.length) items.push(li("ⓘ", "info", `Skipped files we could not read: ${c.unsupported.map(esc).join(", ")}.`))
	$("checks").innerHTML = items.join("")
}

function renderLanes(s) {
	if (!s.spans.length) { $("lanes").innerHTML = '<p class="empty">Appears when a check runs.</p>'; return }
	const t1 = Math.max(...s.spans.map((x) => x.end ?? x.start), 1)
	const rows = []
	for (const sp of s.spans) if (!rows.some((r) => r.agentId === sp.agentId)) rows.push(sp)
	$("lanes").innerHTML = rows.map((r) => {
		const bars = s.spans.filter((x) => x.agentId === r.agentId).map((x) => `<span class="bar${x.end === undefined ? " open" : ""}" style="left:${(x.start / t1) * 100}%;width:${Math.max((((x.end ?? t1) - x.start) / t1) * 100, 0.8)}%"></span>`).join("")
		return `<div class="lane"><span class="name" title="${esc(r.label)}">${esc(r.label)}</span><span class="track">${bars}</span></div>`
	}).join("") + `<div class="lane axis"><span></span><span class="axis-l"><span>start</span><span>${(t1 / 1000).toFixed(1)} s</span></span></div>`
	const m = s.metrics
	if (m) $("metrics").innerHTML = `Up to <b>${m.peakLoops}</b> assistants working at once · <b>${m.rejections}</b> statements sent back for a second read · <b>${m.conflicts}</b> clashes over the same cash settled by rule · <b>${m.blocked}</b> drafts blocked for made-up numbers.`
}

async function showSources(title, sources, append = false) {
	$("drawer").hidden = false
	if (!append) { $("drawer-title").textContent = title; $("drawer-body").innerHTML = "" }
	const parts = []
	for (const src of sources) {
		if (src.factId) {
			const g = state.facts[src.factId]
			parts.push(`<div class="src"><div class="doc">worked out from</div>${g ? `<button class="chip block" data-fact="${esc(g.id)}">${esc(g.label)}: ${esc(g.text)}</button>` : esc(src.factId)}</div>`)
			continue
		}
		if (!docCache.has(src.docId)) docCache.set(src.docId, await (await fetch(`/api/doc/${encodeURIComponent(src.docId)}`)).json())
		const doc = docCache.get(src.docId)
		const lines = doc.pages?.find((p) => p.page === src.page)?.lines ?? []
		const from = Math.max(0, src.line - 3), to = Math.min(lines.length, src.line + 2)
		const shown = lines.slice(from, to).map((l, i) => `<span${from + i + 1 === src.line ? ' class="hl"' : ""}>${esc(l)}</span>`).join("\n")
		parts.push(`<div class="src"><div class="doc">${esc(src.docId)} · page ${src.page}, line ${src.line}</div><pre>${shown}</pre></div>`)
	}
	$("drawer-body").insertAdjacentHTML("beforeend", parts.join(""))
}

document.addEventListener("click", async (e) => {
	const t = e.target.closest("button")
	if (!t) return
	if (t.id === "more") { showAll = !showAll; renderUpcoming(state); return }
	if (t.dataset.fact) { const f = state.facts[t.dataset.fact]; if (f) await showSources(`${f.label}: ${f.text}`, f.sources) }
	else if (t.dataset.up !== undefined) { const u = state.upcoming[Number(t.dataset.up)]; await showSources(`${u.label} · ${u.amountText}`, u.sources) }
	else if (t.dataset.approve || t.dataset.snooze) {
		const id = t.dataset.approve ?? t.dataset.snooze
		t.disabled = true
		await fetch(`/api/actions/${encodeURIComponent(id)}/${t.dataset.approve ? "approve" : "snooze"}`, { method: "POST" })
		soon(400)
	}
})
$("drawer-close").onclick = () => { $("drawer").hidden = true }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("drawer").hidden = true })

function listen() {
	if (source) source.close()
	source = new EventSource("/api/events")
	source.onmessage = (m) => { const e = JSON.parse(m.data); soon(e.type === "close.completed" ? 50 : 300) }
}

$("run").onclick = async () => {
	const r = await fetch("/api/close", { method: "POST" })
	if (r.status === 202) { listen(); soon(50) }
}
fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((me) => { if (me) $("who").textContent = me.username })
$("logout").onclick = async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/login" }
refresh().then(() => { if (state?.running) listen() })
setInterval(() => { if (state?.running) soon(0) }, 700)
