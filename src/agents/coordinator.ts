// Reads the drop folder, detects each document's kind from content, and routes it. Rates become facts by code.
import { readdir } from "node:fs/promises"
import { extname, join, basename } from "node:path"
import type { Agent } from "@mozaik-ai/core"
import { codeParticipant, safely, type Ctx } from "./kit.ts"
import { emit, On } from "../events.ts"
import { readPdfLines, readTextLines } from "../pdf/lines.ts"
import { detectKind } from "../pdf/detect.ts"
import { isIsoDate, humanDate } from "../dates.ts"
import type { Doc, PageLines } from "../types.ts"

export function parseRates(ctx: Ctx, doc: Doc, producer: string): { base: string; quote: string; date: string }[] {
	const lines = doc.pages[0]?.lines ?? []
	const header = (lines[0] ?? "").toLowerCase().split(",").map((c) => c.trim())
	const col = (n: string) => header.indexOf(n)
	const out: { base: string; quote: string; date: string }[] = []
	for (let i = 1; i < lines.length; i++) {
		const f = lines[i]!.split(",").map((c) => c.trim())
		const date = f[col("date")] ?? "", base = (f[col("base")] ?? "").toUpperCase(), quote = (f[col("quote")] ?? "").toUpperCase(), rate = f[col("rate")] ?? ""
		const note = col("source") >= 0 ? f.slice(col("source")).join(",") : ""
		if (!isIsoDate(date) || !/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || !/^\d+\.\d{4}$/.test(rate)) {
			ctx.state.log.push(`coordinator: ${doc.id} line ${i + 1} is not a rate, skipped`)
			continue
		}
		ctx.state.facts.put({ id: `fx:${base}:${quote}:${date}`, label: `${base} to ${quote} rate on ${humanDate(date)}${note ? ` (${note})` : ""}`, kind: "rate", value: rate, sources: [{ docId: doc.id, page: 1, line: i + 1 }], producer })
		out.push({ base, quote, date })
	}
	return out
}

export function createCoordinator(ctx: Ctx, spawnReader: (doc: Doc) => Agent, clerkId: () => string): Agent {
	const self = codeParticipant("Coordinator", [{
		specification: new On("close.requested"),
		processor: {
			apply: ({ event }) => safely(ctx, "coordinator", async () => {
				const folder = (event.payload as { folder?: string }).folder ?? ctx.config.dataDir
				ctx.state.pendingWork++
				try {
					const files = (await readdir(folder)).filter((f) => !f.startsWith(".")).sort()
					const docs: Doc[] = []
					for (const f of files) {
						const id = basename(f, extname(f))
						const doc: Doc = { id, file: join(folder, f), kind: "unsupported", pages: [], status: "received", attempts: 0 }
						let pages: PageLines[] | undefined
						try {
							const ext = extname(f).toLowerCase()
							if (ext === ".pdf") pages = await readPdfLines(doc.file)
							else if (ext === ".csv" || ext === ".txt") pages = await readTextLines(doc.file)
						} catch (e) {
							doc.reason = `unreadable: ${(e as Error).message}`
						}
						if (pages && pages.length > 0) { doc.pages = pages; doc.kind = detectKind(pages[0]!.lines) }
						if (doc.kind === "unsupported") { doc.status = "unsupported"; doc.reason ??= "no known document kind"; ctx.state.log.push(`coordinator: ${f} unsupported (${doc.reason})`) }
						ctx.state.documents.set(id, doc)
						docs.push(doc)
					}
					for (const doc of docs) {
						if (doc.kind === "statement") {
							const reader = spawnReader(doc)
							ctx.rt.join(reader)
							doc.assignee = reader.getId()
							emit(ctx.rt, "document.received", self.getId(), { docId: doc.id, kind: doc.kind, assignee: doc.assignee })
						} else if (doc.kind === "fx_rates") {
							const rates = parseRates(ctx, doc, self.getId())
							doc.status = "processed"
							for (const r of rates) emit(ctx.rt, "rates.added", self.getId(), r)
						} else if (doc.kind !== "unsupported") {
							doc.assignee = clerkId()
							emit(ctx.rt, "document.received", self.getId(), { docId: doc.id, kind: doc.kind, assignee: doc.assignee })
						}
					}
				} finally {
					ctx.state.pendingWork--
				}
			}),
		},
	}])
	return self
}
