// npm run gen: renders data/synthetic/ from data/scenario/household.scenario.json.
import PDFDocument from "pdfkit"
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { cardTotals, currentTotals, keyFacts, layoutA, layoutB, layoutC, layoutD, layoutE, paymentPlan, plain, type PdfDoc, type Scenario } from "./layouts.ts"

const PITCH = 13

async function writePdf(path: string, doc: PdfDoc): Promise<void> {
	const pdf = new PDFDocument({ size: "A4", margin: 40, info: { Title: "Synthetic document", CreationDate: new Date(Date.UTC(2026, 10, 1)) } })
	const out = createWriteStream(path)
	pdf.pipe(out)
	doc.pages.forEach((lines, i) => {
		if (i > 0) pdf.addPage()
		let y = 40
		for (const line of lines) {
			for (const cell of line) {
				pdf.font(cell.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
				if (cell.right !== undefined) pdf.text(cell.text, cell.x, y, { width: cell.right - cell.x, align: "right", lineBreak: false })
				else pdf.text(cell.text, cell.x, y, { lineBreak: false })
			}
			y += PITCH
		}
	})
	pdf.end()
	await new Promise<void>((r, j) => { out.on("finish", () => r()); out.on("error", j) })
}

export async function generateDocuments(scenarioPath: string, outDir: string): Promise<string[]> {
	const s: Scenario = JSON.parse(readFileSync(scenarioPath, "utf8"))
	mkdirSync(outDir, { recursive: true })
	const files: string[] = []
	const bankName = (id: string) => s.banks.find((b: { id: string }) => b.id === id).name as string
	const person = (id: string) => (s.people.find((p: { id: string }) => p.id === id).name as string).toUpperCase()
	const acct = (id: string) => s.accounts.find((a: { id: string }) => a.id === id)
	for (const a of s.accounts) {
		const stmts = s.statements[a.id] as Record<string, Scenario>
		const bank = bankName(a.bank)
		const holder = person(a.owner)
		if (a.kind === "current") {
			const totals = currentTotals(stmts)
			for (const period of Object.keys(stmts).sort()) {
				const t = totals[period]!
				const rows = stmts[period].rows
				const stem = `${a.id.replace(/-\d{4}$/, "")}-${period}`
				if (a.format === "csv") {
					const f = join(outDir, `${stem}.csv`)
					writeFileSync(f, layoutE(bank, a.last4, holder, a.currency, period, t, rows))
					files.push(f)
				} else {
					const f = join(outDir, `${stem}.pdf`)
					const layout = a.bank === "bank-a" ? layoutA : layoutC
					await writePdf(f, layout(bank, holder, a.last4, a.currency, period, t, rows))
					files.push(f)
				}
			}
		} else {
			const terms = s.cardTerms[a.id]
			const totals = cardTotals(stmts, { monthlyRatePct: terms.monthlyRatePct, minDuePct: terms.minDuePct }, a.dueDay)
			for (const period of Object.keys(stmts).sort()) {
				const t = totals[period]!
				const rows = stmts[period].rows
				const f = join(outDir, `${a.id.replace(/-\d{4}$/, "")}-${period}.pdf`)
				const doc = a.cardholders.length > 1
					? layoutB(bank, a.cardholders.map((h: Scenario) => ({ name: person(h.person), last4: h.last4, role: h.role })), a.currency, a.limit, period, t, rows)
					: layoutD(bank, holder, a.last4, a.currency, a.limit, period, t, rows)
				await writePdf(f, doc)
				files.push(f)
			}
		}
	}
	const chequeAcct = acct(s.accounts.find((a: Scenario) => a.kind === "current" && a.bank === "bank-a").id)
	const reg = ["cheque_no,account,payee,amount,currency,date,purpose",
		...s.cheques.map((c: Scenario) => `${c.no},${bankName(chequeAcct.bank)} current ${chequeAcct.last4},${c.payee},${plain(c.amountMinor)},${chequeAcct.currency},${c.date},${c.purpose}`)]
	const regFile = join(outDir, "cheque-register.csv")
	writeFileSync(regFile, reg.join("\n") + "\n")
	files.push(regFile)
	const planFile = join(outDir, "payment-plan.pdf")
	await writePdf(planFile, paymentPlan(s.paymentPlan, person(chequeAcct.owner)))
	files.push(planFile)
	const kfFile = join(outDir, "card-key-facts.pdf")
	await writePdf(kfFile, keyFacts(s.accounts.filter((a: Scenario) => a.kind === "card").map((a: Scenario) => ({
		bank: bankName(a.bank), monthlyRatePct: s.cardTerms[a.id].monthlyRatePct, minDuePct: s.cardTerms[a.id].minDuePct, lateFee: s.cardTerms[a.id].lateFee,
		autopayFromLast4: a.autopay ? acct(a.autopay.from).last4 : undefined,
	}))))
	files.push(kfFile)
	const fxFile = join(outDir, "fx-rates.csv")
	writeFileSync(fxFile, ["date,base,quote,rate,source", ...s.fx.map((r: Scenario) => `${r.date},${r.base},${r.quote},${r.rate},${r.source}`)].join("\n") + "\n")
	files.push(fxFile)
	return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const files = await generateDocuments("data/scenario/household.scenario.json", "data/synthetic")
	console.log(`wrote ${files.length} files to data/synthetic/`)
}
