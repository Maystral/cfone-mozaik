// The Number Guard's check: a draft may carry numbers only inside placeholders that point at known facts.
import { PLACEHOLDER, type FactStore } from "../facts.ts"
import { isIsoDate } from "../dates.ts"

export function checkDraft(text: string, facts: FactStore, opts: { claimIds?: string[]; accountIds?: Set<string> } = {}): { ok: true } | { ok: false; reason: string } {
	for (const m of text.matchAll(PLACEHOLDER)) {
		const [, kind, id] = m as unknown as [string, string, string]
		if (kind === "F") {
			if (!facts.has(id)) return { ok: false, reason: `unknown fact "${id}"` }
			const own = /^(grant|remainder|interest-est):(.+)$/.exec(id)
			if (own && opts.claimIds && !opts.claimIds.includes(own[2]!)) return { ok: false, reason: `fact "${id}" belongs to another claim` }
		} else if (kind === "D") {
			if (!isIsoDate(id)) return { ok: false, reason: `invalid date "${id}"` }
		} else if (kind === "A") {
			if (opts.accountIds ? !opts.accountIds.has(id) : !/^[a-z0-9-]+-(current|card)-\d{4}$/.test(id)) return { ok: false, reason: `unknown account "${id}"` }
		} else if (kind === "C") {
			if (!facts.has(`cheque:${id}:amount`)) return { ok: false, reason: `unknown cheque "${id}"` }
		}
	}
	const rest = text.replace(PLACEHOLDER, " ")
	const digit = /\d[\d,.]*/.exec(rest)
	if (digit) return { ok: false, reason: `unsourced number "${digit[0].replace(/[.,]+$/, "")}"` }
	if (/\{\{|\}\}/.test(rest)) return { ok: false, reason: "malformed placeholder" }
	return { ok: true }
}
