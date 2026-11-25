import { test } from "node:test"
import assert from "node:assert/strict"
import { FactStore, render, renderAction } from "../src/facts.ts"
import { checkDraft } from "../src/domain/guard.ts"
import type { Account, Action } from "../src/types.ts"

const accounts = new Map<string, Account>([
	["bank-b-current-0263", { id: "bank-b-current-0263", bank: "Bank B", kind: "current", currency: "AED", last4: "0263", holder: "MILA", name: "Bank B current ·0263" }],
	["bank-a-current-4417", { id: "bank-a-current-4417", bank: "Bank A", kind: "current", currency: "AED", last4: "4417", holder: "LUKA", name: "Bank A current ·4417" }],
])
function store() {
	const facts = new FactStore()
	facts.put({ id: "grant:C1", label: "Granted for cheque 000234", kind: "money", value: 640000, currency: "AED", sources: [{ factId: "shortfall:cheque-000234" }], producer: "treasurer" })
	facts.put({ id: "cheque:000234:amount", label: "Cheque 000234", kind: "money", value: 2750000, currency: "AED", sources: [{ docId: "cheque-register", page: 1, line: 5 }], producer: "clerk" })
	facts.put({ id: "terms:bank-b-card-5530:monthlyRatePct", label: "Bank B card monthly rate", kind: "pct", value: "3.25", sources: [], producer: "clerk" })
	return facts
}

test("placeholders render as formatted values with chips", () => {
	const facts = store()
	const out = render("Move {{F:grant:C1}} from {{A:bank-b-current-0263}} to {{A:bank-a-current-4417}} by {{D:2026-11-21}} so {{C:000234}} clears.", facts, accounts)
	assert.equal(out.plain, "Move AED 6,400.00 from Bank B current ·0263 to Bank A current ·4417 by 21 Nov 2026 so cheque 000234 clears.")
	assert.equal(out.chips[0]!.factId, "grant:C1")
	assert.equal(out.chips[0]!.text, "AED 6,400.00")
	assert.match(out.html, /data-fact="grant:C1"/)
	facts.put({ id: "cover:cheque-000301:bank-c-current-7710", label: "Bank C can cover", kind: "money", value: 205189, currency: "EUR", sources: [{ factId: "fx:EUR:AED:2026-10-31" }], producer: "forecaster" })
	assert.equal(render("{{F:cover:cheque-000301:bank-c-current-7710}}", facts, accounts).plain, "EUR 2,051.89")
	assert.equal(render("{{F:terms:bank-b-card-5530:monthlyRatePct}}", facts, accounts).plain, "3.25%")
	assert.equal(render("<b>{{F:grant:C1}}</b>", facts, accounts).html.includes("<b>"), false)
})

test("the draft checker blocks unsourced numbers and foreign facts", () => {
	const facts = store()
	assert.deepEqual(checkDraft("Move AED 6,400 by 21 Nov", facts), { ok: false, reason: "unsourced number \"6,400\"" })
	assert.deepEqual(checkDraft("Move {{F:nope}}", facts), { ok: false, reason: "unknown fact \"nope\"" })
	assert.equal(checkDraft("Move {{F:grant:C1}} by {{D:2026-11-21}}", facts, { claimIds: ["C1"] }).ok, true)
	assert.equal(checkDraft("Move {{F:grant:C1}}", facts, { claimIds: ["C2"] }).ok, false)
	assert.equal(checkDraft("by {{D:2026-13-40}}", facts).ok, false)
	assert.equal(checkDraft("so {{C:000234}} clears", facts).ok, true)
	assert.equal(checkDraft("so {{C:6400}} clears", facts).ok, false)
	assert.equal(checkDraft("from {{A:bank-b-current-0263}}", facts, { accountIds: new Set(accounts.keys()) }).ok, true)
	assert.equal(checkDraft("from {{A:6,400}}", facts, { accountIds: new Set(accounts.keys()) }).ok, false)
	assert.equal(checkDraft("Pay in full before the due date.", facts).ok, true)
})

test("actions render with the disclaimer and facts list as prompt lines", () => {
	const facts = store()
	const action: Action = { id: "a1", riskId: "cheque-000234", owner: "x", claimIds: ["C1"], title: "Cover {{C:000234}}", body: "Move {{F:grant:C1}}.", status: "proposed" }
	assert.match(renderAction(action, facts, accounts).plain, /Not financial advice\.$/)
	assert.match(renderAction(action, facts, accounts).html, /Not financial advice\./)
	assert.equal(facts.toPromptLines("grant:")[0], "[F:grant:C1] Granted for cheque 000234 = AED 6,400.00")
	assert.equal(facts.list("cheque:").length, 1)
	assert.equal(facts.has("grant:C1"), true)
})
