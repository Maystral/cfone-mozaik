import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, createWriteStream } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import PDFDocument from "pdfkit"
import { readPdfLines, readTextLines, parseRef, formatRef, lineAt, lineHasAmount } from "../src/pdf/lines.ts"
import { detectKind } from "../src/pdf/detect.ts"

async function drawSample(path: string) {
	const doc = new PDFDocument({ size: "A4", margin: 40 })
	const out = createWriteStream(path)
	doc.pipe(out)
	doc.font("Helvetica-Bold").fontSize(14).text("BANK B", 40, 40)
	doc.font("Helvetica").fontSize(9).text("Credit card statement   Card ending 5530", 40, 60)
	const summary: [string, string][] = [["Previous balance", "7,080.95"], ["Payments and credits", "2,000.00"], ["Purchases", "1,066.40"], ["Finance charges", "165.13"], ["New balance", "6,312.48"], ["Minimum payment due", "315.62"], ["Payment due date", "20 Nov 2026"]]
	let y = 90
	for (const [k, v] of summary) { doc.text(k, 40, y); doc.text(v, 200, y, { width: 80, align: "right" }); y += 13 }
	y += 10
	doc.text("Date", 40, y); doc.text("Description", 110, y); doc.text("Amount (AED)", 400, y, { width: 100, align: "right" }); y += 14
	const rows: [string, string, string][] = [["05 Oct", "STREAMING SUBSCRIPTION", "56.00"], ["11 Oct", "COFFEE SHOP", "42.00"], ["17 Oct", "ONLINE MARKETPLACE", "318.40"], ["18 Oct", "PAYMENT - THANK YOU", "2,000.00 CR"], ["24 Oct", "YOGA STUDIO", "650.00"]]
	for (const [d, desc, a] of rows) { doc.text(d, 40, y); doc.text(desc, 110, y); doc.text(a, 400, y, { width: 100, align: "right" }); y += 13 }
	doc.addPage()
	doc.text("Fictional bank. Synthetic data for a demo.", 40, 40)
	doc.end()
	await new Promise<void>((r) => out.on("finish", () => r()))
}

test("PDF lines come back numbered and searchable", async () => {
	const dir = mkdtempSync(join(tmpdir(), "cfone-pdf-"))
	const file = join(dir, "s.pdf")
	await drawSample(file)
	const pages = await readPdfLines(file)
	assert.equal(pages.length, 2)
	assert.equal(pages[0]!.lines[5], "Finance charges  165.13")
	assert.equal(lineAt(pages, "p1:l6"), "Finance charges  165.13")
	assert.equal(lineAt(pages, "p9:l1"), undefined)
	assert.ok(lineHasAmount(pages, "p1:l14", "2,000.00 CR"))
	assert.ok(lineHasAmount(pages, "p1:l14", "2,000.00"))
	assert.ok(!lineHasAmount(pages, "p1:l3", "165.13"))
	assert.ok(!lineHasAmount(pages, "p1:l3", "7,080.9"))
	assert.deepEqual(parseRef("p2:l11"), { page: 2, line: 11 })
	assert.equal(formatRef(2, 11), "p2:l11")
	assert.throws(() => parseRef("l11"))
})

test("text lines: one page, CSV fields searchable", async () => {
	const dir = mkdtempSync(join(tmpdir(), "cfone-csv-"))
	const file = join(dir, "c.csv")
	writeFileSync(file, "date,description,amount,balance\r\n2026-10-20,PHONE PLAN HOME,-19.99,4250.00\n2026-10-21,X,12.00,14250.00\n")
	const pages = await readTextLines(file)
	assert.equal(pages.length, 1)
	assert.equal(pages[0]!.lines.length, 3)
	assert.ok(lineHasAmount(pages, "p1:l2", "-19.99"))
	assert.ok(lineHasAmount(pages, "p1:l2", "4250.00"))
	assert.ok(!lineHasAmount(pages, "p1:l3", "4250.00"))
	assert.ok(!lineHasAmount(pages, "p1:l3", "2.00"))
})

test("corrupt PDF rejects", async () => {
	const dir = mkdtempSync(join(tmpdir(), "cfone-bad-"))
	const file = join(dir, "empty.pdf")
	writeFileSync(file, "")
	await assert.rejects(readPdfLines(file))
})

test("document kind from content", () => {
	assert.equal(detectKind(["BANK B", "Credit card statement", "05 Oct 2026  COFFEE SHOP  42.00", "17 Oct 2026  ONLINE MARKETPLACE  318.40"]), "statement")
	assert.equal(detectKind(["ANY OTHER BANK", "Monthly statement", "2026-10-03  RENT  -900.00", "2026-10-09  SALARY  2,500.00"]), "statement")
	assert.equal(detectKind(["BANK A", "STATEMENT OF ACCOUNT", "x", "01/10/2026  BALANCE BROUGHT FORWARD  14,307.85", "02/10/2026  CAR LOAN EMI 0091  3,200.00  11,107.85"]), "statement")
	assert.equal(detectKind(["account,currency,holder,period_from,period_to,opening_balance,closing_balance", "Bank C current 7710,EUR,LUKA,2026-10-01,2026-10-31,4311.74,4250.00"]), "statement")
	assert.equal(detectKind(["cheque_no,account,payee,amount,currency,date,purpose"]), "cheque_register")
	assert.equal(detectKind(["date,base,quote,rate,source"]), "fx_rates")
	assert.equal(detectKind(["Statement of intent", "no dated rows here"]), "unsupported")
	assert.equal(detectKind(["HARBOUR GATE DEVELOPMENTS", "PAYMENT PLAN"]), "payment_plan")
	assert.equal(detectKind(["CARD KEY FACTS (SYNTHETIC)"]), "card_terms")
	assert.equal(detectKind(["hello"]), "unsupported")
	assert.equal(detectKind([]), "unsupported")
})
