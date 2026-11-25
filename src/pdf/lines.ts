// PDF or CSV to numbered lines. A reference "p<page>:l<line>" points at one printed line (both 1-based).
import { readFile } from "node:fs/promises"
import { getDocumentProxy } from "unpdf"
import type { PageLines } from "../types.ts"

type Item = { str: string; transform: number[] }

export async function readPdfLines(path: string): Promise<PageLines[]> {
	const data = new Uint8Array(await readFile(path))
	if (data.length === 0) throw new Error(`empty file: ${path}`)
	const pdf = await getDocumentProxy(data)
	const pages: PageLines[] = []
	for (let p = 1; p <= pdf.numPages; p++) {
		const page = await pdf.getPage(p)
		const tc = await page.getTextContent()
		const items = (tc.items as Item[]).filter((i) => typeof i.str === "string" && i.str.trim() !== "")
		const rows = new Map<number, Item[]>()
		for (const it of items) {
			const y = Math.round(it.transform[5] ?? 0)
			const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
			rows.set(key, [...(rows.get(key) ?? []), it])
		}
		const lines = [...rows.entries()]
			.sort((a, b) => b[0] - a[0])
			.map(([, its]) => its.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0)).map((i) => i.str.trim()).join("  "))
		pages.push({ page: p, lines })
	}
	return pages
}

/** A text file is one page, one line per non-empty text line. */
export async function readTextLines(path: string): Promise<PageLines[]> {
	const text = await readFile(path, "utf8")
	const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l !== "")
	return [{ page: 1, lines }]
}

export function parseRef(ref: string): { page: number; line: number } {
	const m = /^p(\d+):l(\d+)$/.exec(ref.trim())
	if (!m) throw new Error(`bad reference "${ref}" (expected p<page>:l<line>)`)
	return { page: Number(m[1]), line: Number(m[2]) }
}

export function formatRef(page: number, line: number): string {
	return `p${page}:l${line}`
}

export function lineAt(pages: PageLines[], ref: string): string | undefined {
	let r: { page: number; line: number }
	try { r = parseRef(ref) } catch { return undefined }
	return pages.find((p) => p.page === r.page)?.lines[r.line - 1]
}

const GROUPED = /^-?\d{1,3}(?:,\d{3})+\.\d{2}$/

/** Splits a line into tokens: whitespace separates; commas separate too, except inside a thousands-grouped amount. */
export function tokens(line: string): string[] {
	return line.trim().split(/\s+/).filter(Boolean).flatMap((t) => (GROUPED.test(t) || !t.includes(",") ? [t] : t.split(",").filter(Boolean)))
}

/** True when the printed text appears on the cited line as a whole token sequence. */
export function lineHasAmount(pages: PageLines[], ref: string, printed: string): boolean {
	const line = lineAt(pages, ref)
	if (line === undefined) return false
	const hay = tokens(line)
	const needle = printed.trim().split(/\s+/).filter(Boolean)
	if (needle.length === 0) return false
	for (let i = 0; i + needle.length <= hay.length; i++) {
		if (needle.every((n, j) => hay[i + j] === n)) return true
	}
	return false
}

/** The numbered text a reader sees: "p1:l1  BANK A". */
export function numbered(pages: PageLines[]): string {
	return pages.flatMap((p) => p.lines.map((l, i) => `${formatRef(p.page, i + 1)}  ${l}`)).join("\n")
}
