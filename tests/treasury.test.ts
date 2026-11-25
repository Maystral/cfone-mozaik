import { test } from "node:test"
import assert from "node:assert/strict"
import { allocate, diffGrants } from "../src/domain/treasury.ts"
import { buildForecast } from "../src/domain/forecast.ts"
import type { Claim, Grant } from "../src/types.ts"
import { addDays } from "../src/dates.ts"
import { baseInput } from "./helpers/household.ts"

const B = "bank-b-current-0263", A = "bank-a-current-4417", CARD = "bank-b-card-5530"
const claim = (id: string, seq: number, riskId: string, priority: 1 | 2 | 3, to: string, requestedMinor: number, byDate: string, fromAccount = B): Claim =>
	({ id, owner: "t", riskId, priority, fromAccount, to, amountFactId: "", requestedMinor, byDate, seq })
const rent = claim("C1", 1, "cheque-000234", 1, A, 640000, "2026-11-21")
const card = claim("C2", 2, "card-bank-b-card-5530-2026-11-20", 3, CARD, 631248, "2026-11-20")
const cardRest = claim("C3", 3, "card-bank-b-card-5530-2026-11-20", 3, CARD, 412528, "2026-11-25")
const property = claim("C4", 4, "cheque-000301", 1, A, 1616965, "2027-01-14")
const grantFor = (gs: Grant[], c: Claim) => gs.find((g) => g.claimId === c.id)!
function* permutations<T>(xs: T[]): Generator<T[]> {
	if (xs.length <= 1) { yield xs; return }
	for (let i = 0; i < xs.length; i++) for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i]!, ...p]
}

test("rent outranks the card inside the paycheck window", async () => {
	const base = await baseInput()
	const g1 = allocate([rent, card], base)
	assert.equal(grantFor(g1, rent).grantedMinor, 640000)
	assert.equal(grantFor(g1, rent).availableMinor, 858720)
	assert.equal(grantFor(g1, rent).windowEnds, "2026-11-25")
	assert.equal(grantFor(g1, card).grantedMinor, 218720)
	assert.equal(grantFor(g1, card).status, "partial")
})

test("final allocation is order independent and keeps the buffer", async () => {
	const base = await baseInput()
	const g3 = allocate([rent, card, cardRest, property], base)
	assert.equal(grantFor(g3, cardRest).grantedMinor, 412528)
	assert.equal(grantFor(g3, cardRest).availableMinor, 578720)
	assert.equal(grantFor(g3, property).grantedMinor, 744912)
	assert.equal(grantFor(g3, property).status, "partial")
	assert.equal(grantFor(g3, property).windowEnds, "2027-01-25")
	for (const order of permutations([rent, card, cardRest, property])) assert.deepEqual(allocate(order, base), g3)
	const claims = [rent, card, cardRest, property]
	const f = buildForecast({ ...base, claims, grants: g3 }, 1)
	for (const c of claims) {
		const g = grantFor(g3, c)
		for (let d = c.byDate; d < g.windowEnds; d = addDays(d, 1)) assert.ok(f.planned[B]![d]! >= 50000, `${c.id} ${d}`)
	}
})

test("a bump shows up as a decreased grant", async () => {
	const base = await baseInput()
	assert.deepEqual(diffGrants(allocate([card], base), allocate([rent, card], base)), [{ claimId: card.id, fromMinor: 631248, toMinor: 218720 }])
})

test("a claim across currencies is refused", async () => {
	const base = await baseInput()
	const cross = claim("X", 5, "cheque-000301", 1, A, 100, "2027-01-14", "bank-c-current-7710")
	const g = grantFor(allocate([rent, card, cardRest, property, cross], base), cross)
	assert.deepEqual({ status: g.status, reason: g.reason, grantedMinor: g.grantedMinor }, { status: "refused", reason: "different currencies", grantedMinor: 0 })
})
