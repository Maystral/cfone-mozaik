# Synthetic data spec

Everything the demo reads is generated from `data/scenario/household.scenario.json`, which
`data/scenario/make_scenario.py` writes together with `data/scenario/golden.json` (the values
the close must find). People, banks, merchants, landlord and developer are fictional; the banks
are simply Bank A, Bank B and Bank C. The app never reads the scenario or golden files; only
tests do.

Regenerate the scenario: `python3 data/scenario/make_scenario.py data/scenario`
Render the documents: `npm run gen` (writes `data/synthetic/`, committed to the repo)

## Household

- Luka and Mila, an example household. As of **5 Nov 2026**; horizon 90 days (to 3 Feb 2027).
- Home currency **AED**; one account abroad in **EUR**. Buffer kept in every current account:
  AED 500.00, EUR 100.00.
- Exchange rate: EUR → AED **4.2500** on 31 Oct 2026, a sample rate in `fx-rates.csv`.

| App account id | What | Currency | Statements | Holder |
|---|---|---|---|---|
| `bank-a-current-4417` | Bank A current account, with the cheque book | AED | PDF | Luka |
| `bank-a-card-8821` | Bank A credit card: primary 8821 (Luka), supplementary 8839 (Mila); limit 40,000.00; due on the 28th; autopay of the full balance from `bank-a-current-4417` | AED | PDF | Luka |
| `bank-b-current-0263` | Bank B current account | AED | PDF | Mila |
| `bank-b-card-5530` | Bank B credit card; limit 15,000.00; due on the 20th; no autopay | AED | PDF | Mila |
| `bank-c-current-7710` | Bank C current account in another country | EUR | CSV export | Luka |

App account id = `<bank slug>-<current|card>-<last four of the account or primary card>`; the
bank slug is the printed bank name in lower case with spaces as hyphens (`Bank A` → `bank-a`).

## Documents in `data/synthetic/` (14)

| File | Kind | Layout |
|---|---|---|
| `bank-a-current-2026-09.pdf`, `bank-a-current-2026-10.pdf` | statement | A, 2 pages |
| `bank-a-card-2026-09.pdf`, `bank-a-card-2026-10.pdf` | statement | B, 2 pages |
| `bank-b-current-2026-09.pdf`, `bank-b-current-2026-10.pdf` | statement | C, 2 pages |
| `bank-b-card-2026-09.pdf`, `bank-b-card-2026-10.pdf` | statement | D, 2 pages |
| `bank-c-current-2026-09.csv`, `bank-c-current-2026-10.csv` | statement | E, CSV |
| `cheque-register.csv` | cheque_register | CSV |
| `payment-plan.pdf` | payment_plan | 1 page |
| `card-key-facts.pdf` | card_terms | 1 page |
| `fx-rates.csv` | fx_rates | CSV |

Page 2 of each PDF statement carries one line: `Fictional bank. Synthetic data for a demo.`
No logos, colours or wording borrowed from any real bank.

## Layouts (as lines come back from `readPdfLines` or `readTextLines`, PDF columns joined by two spaces)

PDF amounts carry thousands separators and two decimals; CSV amounts are plain (`4311.74`).
Five layouts on purpose: the app has no bank-specific code, so the readers must cope with
different orders, sign conventions, date formats and file types.

**A. Bank A current account.** Debit and credit sit in separate columns, which the text does
not preserve, so direction comes from the running balance (as on many real statements).

```
BANK A
STATEMENT OF ACCOUNT
Account holder  LUKA  Current account ending 4417  Currency AED
Period  01/10/2026 to 31/10/2026
Date  Description  Debit  Credit  Balance
01/10/2026  BALANCE BROUGHT FORWARD  14,307.85
02/10/2026  CAR LOAN EMI 0091  3,200.00  11,107.85
...
31/10/2026  CLOSING BALANCE  27,110.35
Total debits  17,197.50  Total credits  30,000.00
```

**B. Bank A credit card.** Summary first, then one section per cardholder, rows by date.
Credits end in ` CR`.

```
BANK A
CREDIT CARD STATEMENT
Primary card ending 8821  Currency AED  Statement period 01/10/2026 to 31/10/2026  Credit limit 40,000.00
Previous balance  11,687.15
Payments and credits  11,687.15
Purchases and debits  12,870.25
New balance  12,870.25
Minimum amount due  643.51
Payment due date  28/11/2026
Cardholder  LUKA  card ending 8821
Date  Description  Amount
02/10/2026  HYPERMARKET MARINA  512.40
28/10/2026  PAYMENT RECEIVED - THANK YOU  11,687.15 CR
...
Cardholder  MILA  card ending 8839  supplementary
...
```

**C. Bank B current account.** Newest first, signed amounts, running balance.

```
BANK B
Account statement
MILA  AED account ending 0263
1 Oct 2026 - 31 Oct 2026
Opening balance  AED 8,362.80
Closing balance  AED 10,150.00
Date  Description  Amount  Balance
29 Oct 2026  FAMILY SUPPORT TRANSFER  -12,000.00  10,150.00
...
10 Oct 2026  FITHUB MEMBERSHIP  -350.00  8,012.80
```

**D. Bank B credit card.** The finance charge is printed **only in the summary**, not in the
table. This quirk is copied from a real card layout and is what the Auditor catches: table
rows alone come to 6,147.35 against a new balance of 6,312.48.

```
BANK B
Credit card statement
MILA  Card ending 5530  Limit AED 15,000.00
1 Oct 2026 - 31 Oct 2026
Previous balance  7,080.95
Payments and credits  2,000.00
Purchases  1,066.40
Finance charges  165.13
New balance  6,312.48
Minimum payment due  315.62
Payment due date  20 Nov 2026
Date  Description  Amount (AED)
05 Oct 2026  STREAMING SUBSCRIPTION  56.00
18 Oct 2026  PAYMENT - THANK YOU  -2,000.00
...
```

**E. Bank C current account, CSV export (EUR).** A header record, then rows oldest first with
a running balance. No thousands separators.

```
account,currency,holder,period_from,period_to,opening_balance,closing_balance
Bank C current 7710,EUR,LUKA,2026-10-01,2026-10-31,4311.74,4250.00
date,description,amount,balance
2026-10-03,INSURANCE PREMIUM,-45.00,4266.74
2026-10-15,INTEREST,3.25,4269.99
2026-10-20,PHONE PLAN HOME,-19.99,4250.00
```

**Cheque register** (`cheque-register.csv`), nine rows, all drawn on Bank A current 4417:

```
cheque_no,account,payee,amount,currency,date,purpose
000234,Bank A current 4417,Marina Heights Properties LLC,27500.00,AED,2026-11-22,Rent Q4
000301,Bank A current 4417,Harbour Gate Developments,36000.00,AED,2027-01-15,Creekside Residences instalment 3
...
```

**Payment plan** (`payment-plan.pdf`): Harbour Gate Developments, Creekside Residences unit
1207, price AED 360,000.00, eight instalments (two paid, five by cheque, and the last one
"On handover (expected 30/06/2029)  20%  72,000.00  Bank finance", which has no cheque and
should be flagged by the Clerk as informational).

**Card key facts** (`card-key-facts.pdf`), one line per fact:

```
CARD KEY FACTS (SYNTHETIC)
Bank A credit card  Monthly rate 3.49%  Minimum due 5% of new balance  Late payment fee AED 230.00
Bank B credit card  Monthly rate 3.25%  Minimum due 5% of new balance  Late payment fee AED 230.00
Interest is charged on the amount unpaid at the due date. Paying the full new balance keeps purchases interest-free.
Bank A credit card pays the full new balance automatically from current account ending 4417.
```

**Exchange rates** (`fx-rates.csv`), read by code, not by a model:

```
date,base,quote,rate,source
2026-10-31,EUR,AED,4.2500,Sample rate for the synthetic demo
```

## Golden values (from `golden.json`)

Statements:

| Statement | Control figures |
|---|---|
| Bank A current Sep (AED) | opening 21,204.85, debits 34,897.00, credits 28,000.00, closing 14,307.85 |
| Bank A current Oct (AED) | opening 14,307.85, debits 17,197.50, credits 30,000.00, closing 27,110.35 |
| Bank B current Sep (AED) | opening 3,703.10, debits 17,340.30, credits 22,000.00, closing 8,362.80 |
| Bank B current Oct (AED) | opening 8,362.80, debits 20,212.80, credits 22,000.00, closing 10,150.00 |
| Bank C current Sep (EUR) | opening 4,373.63, debits 64.99, credits 3.10, closing 4,311.74 |
| Bank C current Oct (EUR) | opening 4,311.74, debits 64.99, credits 3.25, closing 4,250.00 |
| Bank A card Sep (AED) | previous 10,955.40, payments 10,955.40, purchases 11,687.15, new 11,687.15, min 584.36, due 2026-10-28 |
| Bank A card Oct (AED) | previous 11,687.15, payments 11,687.15, purchases 12,870.25, new 12,870.25, min 643.51, due 2026-11-28 |
| Bank B card Sep (AED) | previous 5,980.00, payments 1,200.00, purchases 2,145.60, finance 155.35 (summary only), new 7,080.95, min 354.05, due 2026-10-20 |
| Bank B card Oct (AED) | previous 7,080.95, payments 2,000.00, purchases 1,066.40, finance 165.13 (summary only), new 6,312.48, min 315.62, due 2026-11-20 |

Position on 31 Oct, in AED: have **55,322.85** (Bank A 27,110.35 + Bank B 10,150.00 +
Bank C EUR 4,250.00 at 4.2500 = 18,062.50), owe **19,182.73**, promised in the next 90 days
**63,500.00** (all future cheques 243,500.00).

Recurring items (from September and October):

| Account | Item | Amount | Day |
|---|---|---|---|
| Bank A current | CAR LOAN EMI | −3,200.00 | 2 |
| Bank A current | ATM WITHDRAWAL MARINA | −1,000.00 | 5 |
| Bank A current | ELECTRICITY AND WATER BILL | −911.35 | 12 |
| Bank A current | MOBILE POSTPAID | −399.00 | 14 |
| Bank A current | SALARY ACME TRADING LLC | +28,000.00 | 27 |
| Bank B current | FITHUB MEMBERSHIP | −350.00 | 10 |
| Bank B current | FRESH MART GROCERY | −712.80 | 22 |
| Bank B current | SALARY BLUE OCEAN LLC | +22,000.00 | 25 |
| Bank B current | LITTLE STARS NURSERY | −3,150.00 | 28 |
| Bank B current | FAMILY SUPPORT TRANSFER | −12,000.00 | 29 |
| Bank C current (EUR) | INSURANCE PREMIUM | −45.00 | 3 |
| Bank C current (EUR) | INTEREST | +3.25 | 15 |
| Bank C current (EUR) | PHONE PLAN HOME | −19.99 | 20 |

Not recurring: GREENFIELD ACADEMY TERM 1 FEES (September only); own-account movements, which
are rows naming a household bank or containing `CARD PAYMENT` or `CARD AUTOPAY`. Bank A card
autopay for December and January is estimated at 12,278.70 (mean of the September and October
new balances).

Risks on the baseline forecast (all AED):

| Risk id | Date | Detail |
|---|---|---|
| `cheque-000234` | 2026-11-22 | rent 27,500.00; balance before 21,600.00; shortfall 6,400.00 (with buffer) |
| `card-bank-b-card-5530-2026-11-20` | 2026-11-20 | full 6,312.48, minimum 315.62, rate 3.25% a month |
| `cheque-000301` | 2027-01-15 | instalment 36,000.00; balance before 13,930.35; shortfall 22,569.65 |
| `autopay-bank-a-card-8821-2027-01-28` | 2027-01-28 | estimated 12,278.70; balance before 5,930.35; shortfall 6,848.35 |

Treasurer outcome (order-independent; claims move money only between accounts in the same
currency):

| Claim | From → to | Requested | Granted | Free cash in window |
|---|---|---|---|---|
| rent cheque 000234 by 21 Nov (priority 1) | Bank B current → Bank A current | 6,400.00 | 6,400.00 | 8,587.20 until 25 Nov |
| Bank B card by 20 Nov (priority 3) | Bank B current → Bank B card | 6,312.48 | 2,187.20 | 2,187.20 until 25 Nov |
| Bank B card remainder on 25 Nov | Bank B current → Bank B card | 4,125.28 | 4,125.28 | 5,787.20 until 25 Dec |
| property cheque 000301 by 14 Jan (priority 1) | Bank B current → Bank A current | 16,169.65 | 7,449.12 | 7,449.12 until 25 Jan |

Estimated finance charge on the card remainder: 134.07 (3.25% of 4,125.28). After the
November plan the January shortfall is 16,169.65, of which 7,449.12 can come from Bank B;
**8,720.53 remains**, the heads-up ten weeks before the cheque.

Cover suggestion: Bank C (EUR) can close that gap. It needs **EUR 2,051.89** at 4.2500
(8,720.53 ÷ 4.2500, rounded up to the cent), against EUR 3,919.78 free (the lowest projected
Bank C balance from 14 Jan to the horizon end, minus the EUR 100.00 buffer). Moving money
between currencies is a suggestion, not a reservation.

A claim between accounts in different currencies is refused with the reason
`different currencies`, never converted silently.

Matcher pairs (5): Bank A current autopay ↔ Bank A card payment (28 Sep, 28 Oct); Bank B
current card payment ↔ Bank B card payment (18 Sep, 18 Oct); Bank B current → Bank A current
transfer (20 Oct, 2,000.00). The 18 Oct card payment and the 20 Oct transfer are both
2,000.00 and must not be crossed.
