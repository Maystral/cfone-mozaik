// Pre-event spike, kept as a reference for the build. Not imported by the app.
// Run from a scratch folder: npx tsx docs/reference/pdf-lines-spike.ts (writes bank-b-cc-2026-10.pdf in the current folder)
// THROWAWAY: can we generate a statement PDF with pdfkit and get stable numbered lines back with unpdf?
import PDFDocument from "pdfkit"
import { createWriteStream, readFileSync } from "node:fs"
import { getDocumentProxy } from "unpdf"

async function make(path: string) {
  const doc = new PDFDocument({ size: "A4", margin: 40 })
  const out = createWriteStream(path)
  doc.pipe(out)
  doc.font("Helvetica-Bold").fontSize(14).text("BANK B", 40, 40)
  doc.font("Helvetica").fontSize(9).text("Credit card statement   Card ending 5530   Period 01 Oct 2026 - 31 Oct 2026", 40, 60)
  const summary: [string, string][] = [["Previous balance", "7,080.95"], ["Payments and credits", "2,000.00"], ["Purchases", "1,066.40"], ["Finance charges", "165.13"], ["New balance", "6,312.48"], ["Minimum payment due", "315.62"], ["Payment due date", "20 Nov 2026"]]
  let y = 90
  for (const [k, v] of summary) { doc.text(k, 40, y); doc.text(v, 200, y, { width: 80, align: "right" }); y += 13 }
  y += 10
  doc.font("Helvetica-Bold").text("Date", 40, y); doc.text("Description", 110, y); doc.text("Amount (AED)", 400, y, { width: 100, align: "right" }); y += 14
  doc.font("Helvetica")
  const rows: [string, string, string][] = [["05 Oct", "STREAMING SUBSCRIPTION", "56.00"], ["11 Oct", "COFFEE SHOP", "42.00"], ["17 Oct", "ONLINE MARKETPLACE", "318.40"], ["18 Oct", "PAYMENT - THANK YOU", "2,000.00 CR"], ["24 Oct", "YOGA STUDIO", "650.00"]]
  for (const [d, desc, a] of rows) { doc.text(d, 40, y); doc.text(desc, 110, y); doc.text(a, 400, y, { width: 100, align: "right" }); y += 13 }
  doc.addPage()
  doc.text("Page 2: Important information. Fictional bank. Synthetic data.", 40, 40)
  doc.end()
  await new Promise<void>((r) => out.on("finish", () => r()))
}

type Item = { str: string; transform: number[]; width: number }
async function lines(path: string) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)))
  const pages: string[][] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items = (tc.items as Item[]).filter((i) => i.str.trim() !== "")
    const rows = new Map<number, Item[]>()
    for (const it of items) {
      const y = Math.round(it.transform[5] ?? 0)
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
      rows.set(key, [...(rows.get(key) ?? []), it])
    }
    const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, its]) =>
      its.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0)).map((i) => i.str.trim()).join("  "))
    pages.push(sorted)
  }
  return pages
}

await make("bank-b-cc-2026-10.pdf")
const pages = await lines("bank-b-cc-2026-10.pdf")
pages.forEach((ls, pi) => ls.forEach((l, li) => console.log(`p${pi + 1}:l${li + 1}  ${l}`)))
