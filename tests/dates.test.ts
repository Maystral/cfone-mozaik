import { test } from "node:test"
import assert from "node:assert/strict"
import { addDays, dayIn, humanDate, isIsoDate, isoFromPrinted } from "../src/dates.ts"

test("printed dates to ISO", () => {
	assert.equal(isoFromPrinted("31/10/2026"), "2026-10-31")
	assert.equal(isoFromPrinted("1 Oct 2026"), "2026-10-01")
	assert.equal(isoFromPrinted("2026-10-31"), "2026-10-31")
	assert.equal(isoFromPrinted("31/02/2026"), undefined)
	assert.equal(isIsoDate("2026-13-40"), false)
})
test("day arithmetic clamps to month end", () => {
	assert.equal(addDays("2026-12-31", 1), "2027-01-01")
	assert.equal(dayIn(2027, 2, 31), "2027-02-28")
	assert.equal(humanDate("2026-11-21"), "21 Nov 2026")
})
