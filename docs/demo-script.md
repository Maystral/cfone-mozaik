# Demo script (Fri 27 Nov, 17:00 to 19:00, about 3 minutes)

Setup before the slot: page open at `http://localhost:3000`, terminal ready, live key loaded,
backup recording on the desktop, offline mode one keystroke away (`CFONE_OFFLINE=1 npm start`).

| Time | Say | Show |
|---|---|---|
| 0:00 | "Our money sits in several banks and cards for two people, in two currencies, and some of it is already promised in cheques for rent and an apartment. Every app shows one slice. Nobody can tell us if next month's payments clear." | Title slide or the empty page |
| 0:20 | "CFOne is a team of agents that closes our books from whatever statements the banks give us, PDF or CSV, any currency, and warns before something breaks. Everything you'll see is synthetic: Bank A, Bank B and Bank C." | Drop folder: ten statements, cheque register, payment plan, key facts, rates |
| 0:30 | "Run. One reader per statement and the clerk start at once, on one Mozaik runtime." | Press Run; swarm lanes fill in parallel |
| 0:50 | "The auditor checks each statement the moment it lands. This card statement doesn't add up: 165.13 short. The auditor finds that number in the summary box, a quirk copied from a real card layout, and sends the reader back. Second read: verified." | Red ✗ then green ✓ on the Bank B card lane; click the hint |
| 1:15 | "Now the radar. The rent cheque from Bank A on 22 November would bounce: 6,400 short with our buffer. And the Bank B card is due on the 20th." | Radar with the 22 Nov marker |
| 1:30 | "Two sentinels plan at the same time and both want Bank B's cash before payday. The treasurer settles it by policy: the cheque wins, the card gets 2,187.20 now, which covers the minimum, and the rest on payday. Estimated interest: 134.07." | ⇄ on both sentinel lanes; actions appear |
| 1:55 | "No model can type a number here. Every amount is a fact computed by code, with a source. When a draft had a raw number, the guard blocked it." | Click a chip: the source line; show the blocked counter |
| 2:15 | "And the heads-up: the 15 January property cheque is 8,720.53 short at the current pace, but the euro account in Bank C covers it with 2,051.89 euros at the rate in the file. Ten weeks to act, not ten minutes." | Third action |
| 2:30 | "I approve the plan. The forecast redraws. Nothing moves money; I do." | Approve; radar updates |
| 2:40 | "Twenty-two participants, no orchestrator, peak of N loops at once, two rejections caught, one conflict settled, zero invented numbers. It runs without an API key from the README." | Metrics line |
| 2:55 | "CFOne: see everything you have, owe and have promised, and fix problems before they happen." | Closing slide |

**If the live model fails:** switch to offline mode and say so: "same agents and checks,
scripted model". If the network is down entirely, play the backup recording.

**Likely questions:**
- *Is this a pipeline?* No orchestrator calls agents. Each reacts to events; the lanes show
  overlap, and the Observer measures it.
- *Why are some agents code?* Arithmetic, conversions and money allocation must be exact and
  auditable. Models read, plan and write; code counts.
- *Does it need a parser per bank?* No. Readers take any layout; the auditor checks every
  statement against its own totals, whatever the bank.
- *Real banks?* A private build reads our real statements at home. The hackathon version uses
  synthetic documents by rule.
- *What if a model misreads?* The source check and the gate catch it; two failures quarantine
  the statement and it never counts.
