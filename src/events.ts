import { SemanticEvent, SituationSpecification, type SituationContext } from "@mozaik-ai/core"
import type { Runtime } from "./runtime.ts"

export const CF_EVENTS = [
	"close.requested", "document.received", "rates.added", "extraction.submitted",
	"statement.verified", "statement.rejected", "statement.quarantined",
	"commitment.added", "commitment.flagged", "terms.added", "agent.failed",
	"categories.assigned", "transfer.matched", "forecast.updated",
	"reservation.changed", "reservation.bumped", "action.proposed", "guard.blocked",
	"brief.published", "close.settled", "close.completed", "action.approved", "action.snoozed",
] as const
export type CfEventType = (typeof CF_EVENTS)[number]

export function emit(rt: Runtime, type: CfEventType, producerId: string, payload: object): void {
	rt.sendEvent(SemanticEvent.create(type, producerId, payload), producerId)
}

export class On extends SituationSpecification {
	constructor(private readonly type: string) { super() }
	isSatisfiedBy({ event }: SituationContext): boolean { return event.type === this.type }
}

export class FromOther extends SituationSpecification {
	isSatisfiedBy({ event, participant }: SituationContext): boolean { return event.producerId !== participant.getId() }
}

/** Payload `assignee` or `owner` is this participant. */
export class ForMe extends SituationSpecification {
	isSatisfiedBy({ event, participant }: SituationContext): boolean {
		const p = (event.payload ?? {}) as { assignee?: string; owner?: string }
		return p.assignee === participant.getId() || p.owner === participant.getId()
	}
}
