import { test } from "node:test"
import assert from "node:assert/strict"
import { createHuman } from "@mozaik-ai/core"
import { parsePrinted, formatMoney, pctOf, convert, neededIn } from "../src/money.ts"
import { loadConfig } from "../src/config.ts"
import { createRuntime, HouseholdState } from "../src/runtime.ts"
import { emit, On } from "../src/events.ts"
import { golden, scenario } from "./helpers/scenario.ts"

test("parsePrinted reads printed amounts", () => {
	assert.deepEqual(parsePrinted("3,200.00"), { minor: 320000, credit: false })
	assert.deepEqual(parsePrinted("11,687.15 CR"), { minor: 1168715, credit: true })
	assert.deepEqual(parsePrinted("-12,000.00"), { minor: 1200000, credit: true })
	assert.deepEqual(parsePrinted("AED 8,362.80"), { minor: 836280, credit: false })
	assert.deepEqual(parsePrinted("4311.74"), { minor: 431174, credit: false })
	assert.throws(() => parsePrinted("abc"))
})

test("formatMoney, pctOf and conversions", () => {
	assert.equal(formatMoney(640000), "6,400.00")
	assert.equal(formatMoney(-590000), "-5,900.00")
	assert.equal(formatMoney(205189, "EUR"), "EUR 2,051.89")
	assert.equal(pctOf(412528, "3.25"), 13407)
	assert.equal(pctOf(508095, "3.25"), 16513)
	assert.equal(convert(425000, "4.2500"), 1806250)
	assert.equal(neededIn(872053, "4.2500"), 205189)
})

test("loadConfig picks the mode from keys", () => {
	assert.equal(loadConfig({}).mode, "offline")
	assert.equal(loadConfig({ ANTHROPIC_API_KEY: "x" }).model, "claude-sonnet-5-5")
	assert.equal(loadConfig({ OPENAI_API_KEY: "x" }).model, "gpt-5.5")
	assert.equal(loadConfig({ ANTHROPIC_API_KEY: "x", CFONE_OFFLINE: "1" }).mode, "offline")
	assert.equal(loadConfig({ CFONE_OPENAI_BASE_URL: "http://localhost:11434/v1", CFONE_MODEL: "local-model" }).mode, "compatible")
	assert.equal(loadConfig({}).asOf, "2026-11-05")
	assert.equal(loadConfig({}).homeCurrency, "AED")
	assert.deepEqual(loadConfig({}).buffers, { AED: 50000, EUR: 10000 })
})

test("events reach matching participants and runtimes are independent", () => {
	const a = createRuntime(), b = createRuntime()
	a.initializeRuntime({ state: new HouseholdState(loadConfig({})) })
	b.initializeRuntime({ state: new HouseholdState(loadConfig({})) })
	const seen: string[] = []
	const h = createHuman({ name: "H", capabilities: [], handlers: [{ specification: new On("close.requested"), processor: { apply: ({ event }) => { seen.push(event.type) } } }] })
	a.join(h)
	emit(a, "close.requested", h.getId(), { folder: "x" })
	assert.deepEqual(seen, ["close.requested"])
	assert.throws(() => emit(b, "close.requested", h.getId(), {}))
})

test("scenario helpers load golden values with app account ids", () => {
	assert.equal(golden.position.haveMinor, 5532285)
	assert.ok(scenario.accounts.some((a: { id: string }) => a.id === "bank-c-current-7710"))
})
