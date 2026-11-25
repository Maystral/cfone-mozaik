const $ = (id) => document.getElementById(id)
let mode = "login"
function setMode(m) {
	mode = m
	$("tab-login").setAttribute("aria-selected", String(m === "login"))
	$("tab-register").setAttribute("aria-selected", String(m === "register"))
	$("submit").textContent = m === "login" ? "Log in" : "Create account"
	$("password").autocomplete = m === "login" ? "current-password" : "new-password"
	$("error").textContent = ""
}
async function send(username, password) {
	$("error").textContent = ""
	const r = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) })
	if (r.ok) { location.href = "/"; return }
	$("error").textContent = (await r.json().catch(() => ({}))).error ?? "Something went wrong."
}
$("tab-login").onclick = () => setMode("login")
$("tab-register").onclick = () => setMode("register")
$("form").onsubmit = (e) => { e.preventDefault(); send($("username").value, $("password").value) }
$("demo").onclick = () => { setMode("login"); $("username").value = "demo"; $("password").value = "demo"; send("demo", "demo") }
