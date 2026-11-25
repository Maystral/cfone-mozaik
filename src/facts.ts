// Facts: the only numbers that reach the screen. Only code participants create them.
import type { Account, Action, SourceRef } from "./types.ts"
import { formatMoney } from "./money.ts"
import { humanDate } from "./dates.ts"

export interface Fact {
	id: string; label: string; kind: "money" | "date" | "pct" | "rate" | "text"; value: number | string
	currency?: string; sources: SourceRef[]; derivedFrom?: string[]; producer: string
}

export function formatFact(f: Fact): string {
	switch (f.kind) {
		case "money": return formatMoney(Number(f.value), f.currency)
		case "pct": return `${f.value}%`
		case "date": return humanDate(String(f.value))
		default: return String(f.value)
	}
}

export class FactStore {
	private readonly facts = new Map<string, Fact>()
	put(f: Fact): void {
		if (f.kind === "money" && !f.currency) throw new Error(`money fact ${f.id} needs a currency`)
		this.facts.set(f.id, f)
	}
	get(id: string): Fact | undefined { return this.facts.get(id) }
	has(id: string): boolean { return this.facts.has(id) }
	delete(id: string): void { this.facts.delete(id) }
	get size(): number { return this.facts.size }
	list(prefix = ""): Fact[] { return [...this.facts.values()].filter((f) => f.id.startsWith(prefix)) }
	toPromptLines(prefix = ""): string[] { return this.list(prefix).map((f) => `[F:${f.id}] ${f.label} = ${formatFact(f)}`) }
}

export const PLACEHOLDER = /\{\{(F|D|A|C):([^{}]*)\}\}/g

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function render(text: string, facts: FactStore, accounts: Map<string, Account>): { plain: string; html: string; chips: { factId: string; text: string }[] } {
	const chips: { factId: string; text: string }[] = []
	let plain = "", html = "", last = 0
	for (const m of text.matchAll(PLACEHOLDER)) {
		const before = text.slice(last, m.index)
		plain += before; html += esc(before)
		const [, kind, id] = m as unknown as [string, string, string]
		if (kind === "F") {
			const f = facts.get(id)
			const shown = f ? formatFact(f) : `[missing ${id}]`
			plain += shown
			html += `<button class="chip" data-fact="${esc(id)}">${esc(shown)}</button>`
			if (f) chips.push({ factId: id, text: shown })
		} else if (kind === "D") {
			const shown = humanDate(id); plain += shown; html += esc(shown)
		} else if (kind === "A") {
			const shown = accounts.get(id)?.name ?? id; plain += shown; html += `<span class="acct">${esc(shown)}</span>`
		} else {
			const shown = `cheque ${id}`; plain += shown; html += esc(shown)
		}
		last = m.index! + m[0].length
	}
	plain += text.slice(last); html += esc(text.slice(last))
	return { plain, html, chips }
}

export const DISCLAIMER = "Not financial advice."

export function renderAction(a: Action, facts: FactStore, accounts: Map<string, Account>): { plain: string; html: string } {
	const t = render(a.title, facts, accounts), b = render(a.body, facts, accounts)
	return {
		plain: `${t.plain}\n${b.plain}\n${DISCLAIMER}`,
		html: `<h3>${t.html}</h3><p>${b.html}</p><p class="disclaimer">${DISCLAIMER}</p>`,
	}
}
