import type { Agent } from "@mozaik-ai/core"
import { codeParticipant, safely, type Ctx } from "./kit.ts"
import { emit, On } from "../events.ts"
import { matchTransfers } from "../domain/match.ts"

export function createMatcher(ctx: Ctx): Agent {
	const self: Agent = codeParticipant("Matcher", [{
		specification: new On("statement.verified"),
		processor: {
			apply: () => safely(ctx, "matcher", () => {
				for (const p of matchTransfers([...ctx.state.statements.values()])) {
					if (ctx.state.transfers.has(p.id)) continue
					ctx.state.transfers.set(p.id, p)
					emit(ctx.rt, "transfer.matched", self.getId(), { pairId: p.id })
				}
			}),
		},
	}])
	return self
}
