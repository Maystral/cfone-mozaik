import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateDocuments } from "../tools/generate-documents.ts"
import { readPdfLines, readTextLines } from "../src/pdf/lines.ts"
import { detectKind } from "../src/pdf/detect.ts"

test("generator writes the fourteen synthetic documents", async () => {
	const out = mkdtempSync(join(tmpdir(), "cfone-gen-"))
	const files = await generateDocuments("data/scenario/household.scenario.json", out)
	assert.equal(files.length, 14)
	const fc = await readPdfLines(join(out, "bank-a-current-2026-10.pdf"))
	assert.equal(fc.length, 2)
	assert.ok(fc[0]!.lines.includes("31/10/2026  CLOSING BALANCE  27,110.35"))
	assert.ok(fc[0]!.lines.includes("Total debits  17,197.50  Total credits  30,000.00"))
	assert.ok(fc[0]!.lines.includes("02/10/2026  CAR LOAN EMI 0091  3,200.00  11,107.85"))
	assert.deepEqual(fc[1]!.lines, ["Fictional bank. Synthetic data for a demo."])
	const sc = await readPdfLines(join(out, "bank-b-card-2026-10.pdf"))
	assert.equal(sc[0]!.lines[7], "Finance charges  165.13")
	assert.equal(sc[0]!.lines.filter((l) => l.includes("165.13")).length, 1)
	const su = await readPdfLines(join(out, "bank-b-current-2026-10.pdf"))
	assert.equal(su[0]!.lines[7], "29 Oct 2026  FAMILY SUPPORT TRANSFER  -12,000.00  10,150.00")
	const ac = await readPdfLines(join(out, "bank-a-card-2026-10.pdf"))
	assert.ok(ac[0]!.lines.includes("New balance  12,870.25"))
	assert.ok(ac[0]!.lines.includes("28/10/2026  PAYMENT RECEIVED - THANK YOU  11,687.15 CR"))
	const reg = await readTextLines(join(out, "cheque-register.csv"))
	assert.equal(reg[0]!.lines.length, 10)
	assert.ok(reg[0]!.lines.includes("000234,Bank A current 4417,Marina Heights Properties LLC,27500.00,AED,2026-11-22,Rent Q4"))
	const kf = await readPdfLines(join(out, "card-key-facts.pdf"))
	assert.ok(kf[0]!.lines.some((l) => l.includes("Bank B credit card") && l.includes("Monthly rate 3.25%")))
	const plan = await readPdfLines(join(out, "payment-plan.pdf"))
	assert.ok(plan[0]!.lines.some((l) => l.includes("On handover (expected 30/06/2029)  20%  72,000.00  Bank finance")))
	const c = await readTextLines(join(out, "bank-c-current-2026-10.csv"))
	assert.equal(c[0]!.lines[1], "Bank C current 7710,EUR,LUKA,2026-10-01,2026-10-31,4311.74,4250.00")
	// Ruling: the plan's lines[6] is off by one; the data spec puts this row on p1:l6 (index 5).
	assert.equal(c[0]!.lines[5], "2026-10-20,PHONE PLAN HOME,-19.99,4250.00")
	const fx = await readTextLines(join(out, "fx-rates.csv"))
	assert.equal(fx[0]!.lines[1], "2026-10-31,EUR,AED,4.2500,Sample rate for the synthetic demo")
	const kinds: Record<string, string> = {}
	for (const f of files) {
		const pages = f.endsWith(".pdf") ? await readPdfLines(f) : await readTextLines(f)
		kinds[f.split("/").pop()!] = detectKind(pages[0]!.lines)
		for (const p of pages) for (const l of p.lines) assert.ok(!/\b(ADCB|Wio|Emirates NBD|FAB|Mashreq|HSBC|ENBD)\b/i.test(l), l)
	}
	assert.equal(Object.values(kinds).filter((k) => k === "statement").length, 10)
	assert.equal(kinds["cheque-register.csv"], "cheque_register")
	assert.equal(kinds["payment-plan.pdf"], "payment_plan")
	assert.equal(kinds["card-key-facts.pdf"], "card_terms")
	assert.equal(kinds["fx-rates.csv"], "fx_rates")
})
