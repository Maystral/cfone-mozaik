# Submission text (paste into the form)

**Project name:** CFOne

**One line:** A team of agents that closes a household's books from statements of any bank,
format and currency, and warns before a payment bounces.

**Repository:** https://github.com/<you>/cfone

**Description**

A household's money sits across banks, cards for two people, currencies, and payments promised
months ahead in cheques and instalments. Banks hand out PDFs and CSV exports in their own
layouts; nothing reads them all or knows what is promised. CFOne takes statements from any bank,
the cheque register, payment plans, card terms and exchange rates, and a Mozaik swarm returns a
verified position in the home currency, a 90-day radar and sourced fixes: which transfer, how
much, by when, so a payment clears and a card does not charge interest, including cover from an
account in another currency. Every amount links to the statement line it came from, models
never type numbers, and nothing moves money. Synthetic data only. Not financial advice.

**How the agents run concurrently**

One Mozaik 4.2 runtime with twenty-two participants and no orchestrator. Participants react to
typed events through situation specifications and share one `HouseholdState`. Each LLM agent
starts its loop with `runLoop`, which is not awaited, on a fresh context, so one reader per
statement (ten in the demo) and the clerk's three loops run at the same time. The auditor reconciles
each statement the moment it lands, while others are still being read, and sends a reader back
with a hint when the numbers do not add up. The forecaster recomputes whenever verified facts
change; two sentinels then plan in parallel and compete for the same cash, and the treasurer
settles their claims by policy, independent of who was faster. A Mozaik interception handler
blocks any draft containing a number the model typed. Every run prints its lane chart and
measured peak concurrency. <!-- paste the metrics line from the live run -->

**Run:** `npm install && npm run demo` (no key needed), or with `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` for live models; `npm start` for the page.

**Screenshots / video:** <!-- docs/img/*.png, video link -->
