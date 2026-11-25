import { createHuman, type Human } from "@mozaik-ai/core"
import type { Ctx } from "./kit.ts"

/** The person running the close. Emits close.requested, action.approved and action.snoozed; the app never moves money. */
export function createYou(_ctx: Ctx): Human {
	return createHuman({ name: "You", capabilities: ["approve"], handlers: [] })
}
