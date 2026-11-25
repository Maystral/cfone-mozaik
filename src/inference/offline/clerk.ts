// Offline clerk: CSV rows to commitments, plan instalments without a cheque to flags, key-facts lines to terms.
import { registerPolicy, type PolicyInput, type PolicyStep } from "../offline-runner.ts"
import { isoFromPrinted } from "../../dates.ts"

interface L { ref: string; text: string; cols: string[] }
const parse = (task: string): L[] => task.split("\n").flatMap((raw) => { const m = /^(p\d+:l\d+)  (.*)$/.exec(raw); return m ? [{ ref: m[1]!, text: m[2]!, cols: m[2]!.split(/\s{2,}/) }] : [] })

export function clerkPlan(task: string): PolicyStep[] {
	const docId = /docId=(\S+)/.exec(task)?.[1] ?? ""
	const kind = /kind=(\S+)/.exec(task)?.[1] ?? ""
	const lines = parse(task)
	const steps: PolicyStep[] = []
	if (kind === "cheque_register") {
		const head = lines[0]?.text.toLowerCase().split(",") ?? []
		const at = (f: string[], n: string) => f[head.indexOf(n)] ?? ""
		for (const l of lines.slice(1)) {
			const f = l.text.split(",")
			const date = at(f, "date")
			steps.push({ call: "add_commitment", args: { docId, chequeNo: at(f, "cheque_no"), account: at(f, "account"), payee: at(f, "payee"), amount: { text: at(f, "amount"), source: l.ref }, currency: at(f, "currency"), date: { text: date, iso: isoFromPrinted(date) ?? date, source: l.ref }, purpose: at(f, "purpose") } })
		}
	} else if (kind === "payment_plan") {
		for (const l of lines) {
			const method = l.cols[l.cols.length - 1] ?? ""
			if (!/^\d+$/.test(l.cols[0] ?? "") || /paid|cheque/i.test(method)) continue
			steps.push({ call: "flag", args: { docId, reason: `Instalment ${l.cols[0]} (${l.cols[1]}) is paid by ${method.toLowerCase()}, not by cheque: informational, not in the cash forecast.`, sources: [l.ref] } })
		}
	} else if (kind === "card_terms") {
		const autopay = lines.filter((l) => /automatically from .*ending (\d{4})/i.test(l.text))
		for (const l of lines) {
			const card = l.cols.find((c) => /credit card$/i.test(c))
			const rate = /Monthly rate ([\d.]+)%/i.exec(l.text)?.[1]
			const min = /Minimum due ([\d.]+)%/i.exec(l.text)?.[1]
			const fee = /Late payment fee ([A-Z]{3} [\d,]+\.\d{2})/i.exec(l.text)?.[1]
			if (!card || !rate || !min || !fee) continue
			const ap = autopay.find((a) => a.text.toLowerCase().startsWith(card.toLowerCase()))
			const last4 = ap ? /ending (\d{4})/i.exec(ap.text)?.[1] : undefined
			steps.push({ call: "add_card_terms", args: { docId, card, monthlyRatePct: rate, minimumDuePct: min, lateFee: { text: fee, source: l.ref }, source: l.ref, ...(ap && last4 ? { autopayFromLast4: last4, autopaySource: ap.ref } : {}) } })
		}
	}
	steps.push({ call: "finish_document", args: { docId } })
	return steps
}

registerPolicy("clerk", (p: PolicyInput) => {
	const steps = clerkPlan(p.task)
	const step = steps[p.calls.length]
	return step ?? { say: "Done." }
})
