// Document kind from content only: never the bank name or the file name.
import type { DocKind } from "../types.ts"

const DATE_START = /^(?:\d{2}\/\d{2}\/\d{4}|\d{1,2} [A-Z][a-z]{2} \d{4}|\d{4}-\d{2}-\d{2})\b/

function csvHeader(line: string): string[] | undefined {
	if (!line.includes(",") || /\s{2}/.test(line)) return undefined
	const cols = line.toLowerCase().split(",").map((c) => c.trim())
	return cols.every((c) => /^[a-z_ ]+$/.test(c)) ? cols : undefined
}

export function detectKind(lines: string[]): DocKind {
	if (lines.length === 0) return "unsupported"
	const header = csvHeader(lines[0]!)
	if (header) {
		const has = (n: string) => header.some((c) => c.includes(n))
		if (has("cheque") && has("payee")) return "cheque_register"
		if (has("base") && has("quote") && has("rate")) return "fx_rates"
		if ((has("date") && has("amount")) || (has("opening") && has("closing"))) return "statement"
		return "unsupported"
	}
	const text = lines.join("\n").toLowerCase()
	if (text.includes("payment plan") || /instal+ment schedule/.test(text)) return "payment_plan"
	if (text.includes("key facts")) return "card_terms"
	const head = lines.slice(0, 6).join(" ").toLowerCase()
	const dated = lines.filter((l) => DATE_START.test(l.trim())).length
	if (head.includes("statement") && dated >= 2) return "statement"
	return "unsupported"
}
