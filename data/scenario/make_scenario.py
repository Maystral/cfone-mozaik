"""Synthetic CFOne example household: one source of truth for the generator and the golden values.

Fictional people and banks (Bank A, Bank B, Bank C), fictional merchants. Integer minor units
everywhere; exchange rates are 4-decimal strings applied with integer arithmetic.
Run: python3 data/scenario/make_scenario.py data/scenario
"""
import json, sys, calendar, re
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

def minor(x: str) -> int:
    return int((Decimal(x) * 100).quantize(Decimal("1")))

def fmt(m: int) -> str:
    s = "-" if m < 0 else ""
    m = abs(m)
    return f"{s}{m // 100:,}.{m % 100:02d}"

def pct_of(m: int, pct: str) -> int:
    return int((Decimal(m) * Decimal(pct) / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def rate_units(rate: str) -> int:          # "4.2500" -> 42500
    return int((Decimal(rate) * 10000).quantize(Decimal("1")))

def convert(m: int, rate: str) -> int:     # foreign minor -> home minor, half up
    return int((Decimal(m) * rate_units(rate) / 10000).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def need_in(home_m: int, rate: str) -> int:  # home minor -> foreign minor needed, rounded up
    q, r = divmod(home_m * 10000, rate_units(rate))
    return q + (1 if r else 0)

D = date.fromisoformat
AS_OF = D("2026-11-05")
HORIZON_END = AS_OF + timedelta(days=90)
HOME = "AED"
BUFFERS = {"AED": minor("500.00"), "EUR": minor("100.00")}
FX = {"date": "2026-10-31", "base": "EUR", "quote": "AED", "rate": "4.2500", "source": "Sample rate for the synthetic demo"}

people = [{"id": "luka", "name": "Luka"}, {"id": "mila", "name": "Mila"}]
banks = [
    {"id": "bank-a", "name": "Bank A", "note": "traditional bank with a cheque book, PDF statements"},
    {"id": "bank-b", "name": "Bank B", "note": "digital bank, PDF statements"},
    {"id": "bank-c", "name": "Bank C", "note": "bank in another country, EUR, CSV exports"},
]
A_CUR, A_CARD, B_CUR, B_CARD, C_CUR = "bank-a-current-4417", "bank-a-card-8821", "bank-b-current-0263", "bank-b-card-5530", "bank-c-current-7710"
accounts = [
    {"id": A_CUR, "bank": "bank-a", "kind": "current", "owner": "luka", "last4": "4417", "currency": "AED", "format": "pdf"},
    {"id": A_CARD, "bank": "bank-a", "kind": "card", "owner": "luka", "last4": "8821", "currency": "AED", "format": "pdf",
     "cardholders": [{"person": "luka", "last4": "8821", "role": "primary"}, {"person": "mila", "last4": "8839", "role": "supplementary"}],
     "limit": minor("40000.00"), "dueDay": 28, "autopay": {"from": A_CUR, "mode": "full"}},
    {"id": B_CUR, "bank": "bank-b", "kind": "current", "owner": "mila", "last4": "0263", "currency": "AED", "format": "pdf"},
    {"id": B_CARD, "bank": "bank-b", "kind": "card", "owner": "mila", "last4": "5530", "currency": "AED", "format": "pdf",
     "cardholders": [{"person": "mila", "last4": "5530", "role": "primary"}], "limit": minor("15000.00"), "dueDay": 20, "autopay": None},
    {"id": C_CUR, "bank": "bank-c", "kind": "current", "owner": "luka", "last4": "7710", "currency": "EUR", "format": "csv"},
]
card_terms = {
    A_CARD: {"minDuePct": "5", "monthlyRatePct": "3.49", "lateFee": minor("230.00")},
    B_CARD: {"minDuePct": "5", "monthlyRatePct": "3.25", "lateFee": minor("230.00"),
             "quirk": "finance charges appear only in the summary box, not in the transaction table"},
}

def rows(spec):
    return [{"date": d, "description": desc, "amountMinor": minor(a)} for d, desc, a in spec]

def card_rows(spec):  # purchases positive (owed), payments negative
    return [{"date": d, "description": desc, "amountMinor": minor(a), "card": c} for d, desc, a, c in spec]

statements = {
    A_CUR: {
        "2026-09": {"opening": minor("21204.85"), "rows": rows([
            ("2026-09-02", "CAR LOAN EMI 0091", "-3200.00"),
            ("2026-09-05", "ATM WITHDRAWAL MARINA", "-1000.00"),
            ("2026-09-12", "ELECTRICITY AND WATER BILL", "-842.60"),
            ("2026-09-14", "MOBILE POSTPAID", "-399.00"),
            ("2026-09-16", "GREENFIELD ACADEMY TERM 1 FEES", "-18500.00"),
            ("2026-09-27", "SALARY ACME TRADING LLC", "28000.00"),
            ("2026-09-28", "BANK A CARD AUTOPAY", "-10955.40"),
        ])},
        "2026-10": {"rows": rows([
            ("2026-10-02", "CAR LOAN EMI 0091", "-3200.00"),
            ("2026-10-05", "ATM WITHDRAWAL MARINA", "-1000.00"),
            ("2026-10-12", "ELECTRICITY AND WATER BILL", "-911.35"),
            ("2026-10-14", "MOBILE POSTPAID", "-399.00"),
            ("2026-10-20", "TRANSFER FROM BANK B", "2000.00"),
            ("2026-10-27", "SALARY ACME TRADING LLC", "28000.00"),
            ("2026-10-28", "BANK A CARD AUTOPAY", "-11687.15"),
        ])},
    },
    B_CUR: {
        "2026-09": {"opening": minor("3703.10"), "rows": rows([
            ("2026-09-10", "FITHUB MEMBERSHIP", "-350.00"),
            ("2026-09-18", "BANK B CARD PAYMENT", "-1200.00"),
            ("2026-09-22", "FRESH MART GROCERY", "-640.30"),
            ("2026-09-25", "SALARY BLUE OCEAN LLC", "22000.00"),
            ("2026-09-28", "LITTLE STARS NURSERY", "-3150.00"),
            ("2026-09-29", "FAMILY SUPPORT TRANSFER", "-12000.00"),
        ])},
        "2026-10": {"rows": rows([
            ("2026-10-10", "FITHUB MEMBERSHIP", "-350.00"),
            ("2026-10-18", "BANK B CARD PAYMENT", "-2000.00"),
            ("2026-10-20", "TRANSFER TO BANK A", "-2000.00"),
            ("2026-10-22", "FRESH MART GROCERY", "-712.80"),
            ("2026-10-25", "SALARY BLUE OCEAN LLC", "22000.00"),
            ("2026-10-28", "LITTLE STARS NURSERY", "-3150.00"),
            ("2026-10-29", "FAMILY SUPPORT TRANSFER", "-12000.00"),
        ])},
    },
    C_CUR: {
        "2026-09": {"opening": minor("4373.63"), "rows": rows([
            ("2026-09-03", "INSURANCE PREMIUM", "-45.00"),
            ("2026-09-15", "INTEREST", "3.10"),
            ("2026-09-20", "PHONE PLAN HOME", "-19.99"),
        ])},
        "2026-10": {"rows": rows([
            ("2026-10-03", "INSURANCE PREMIUM", "-45.00"),
            ("2026-10-15", "INTEREST", "3.25"),
            ("2026-10-20", "PHONE PLAN HOME", "-19.99"),
        ])},
    },
    A_CARD: {
        "2026-09": {"previous": minor("10955.40"), "rows": card_rows([
            ("2026-09-03", "HYPERMARKET MARINA", "486.25", "8821"),
            ("2026-09-06", "FUEL STATION", "210.00", "8821"),
            ("2026-09-09", "CINEMA DOWNTOWN", "145.00", "8821"),
            ("2026-09-11", "ONLINE MARKETPLACE", "1249.00", "8821"),
            ("2026-09-15", "SKYLINE AIRWAYS TICKETS", "3880.00", "8821"),
            ("2026-09-19", "RESTAURANT DOWNTOWN", "612.50", "8821"),
            ("2026-09-24", "FUEL STATION", "205.00", "8821"),
            ("2026-09-27", "HYPERMARKET MARINA", "532.80", "8821"),
            ("2026-09-28", "PAYMENT RECEIVED - THANK YOU", "-10955.40", "8821"),
            ("2026-09-04", "KIDS CLOTHING MALL", "389.00", "8839"),
            ("2026-09-08", "PHARMACY", "96.40", "8839"),
            ("2026-09-13", "FOOD DELIVERY APP", "154.30", "8839"),
            ("2026-09-17", "BEAUTY SALON MARINA", "450.00", "8839"),
            ("2026-09-21", "FOOD DELIVERY APP", "188.90", "8839"),
            ("2026-09-25", "HOME FURNISHINGS MALL", "3088.00", "8839"),
        ])},
        "2026-10": {"rows": card_rows([
            ("2026-10-02", "HYPERMARKET MARINA", "512.40", "8821"),
            ("2026-10-05", "FUEL STATION", "215.00", "8821"),
            ("2026-10-08", "ELECTRONICS STORE", "2799.00", "8821"),
            ("2026-10-12", "RESTAURANT DOWNTOWN", "487.00", "8821"),
            ("2026-10-16", "ONLINE MARKETPLACE", "864.50", "8821"),
            ("2026-10-20", "FUEL STATION", "220.00", "8821"),
            ("2026-10-23", "HARBOUR HOTEL BOOKING", "1950.00", "8821"),
            ("2026-10-28", "PAYMENT RECEIVED - THANK YOU", "-11687.15", "8821"),
            ("2026-10-29", "HYPERMARKET MARINA", "598.35", "8821"),
            ("2026-10-03", "PHARMACY", "112.60", "8839"),
            ("2026-10-07", "FOOD DELIVERY APP", "176.20", "8839"),
            ("2026-10-11", "KIDS CLOTHING MALL", "645.00", "8839"),
            ("2026-10-18", "BEAUTY SALON MARINA", "450.00", "8839"),
            ("2026-10-22", "FOOD DELIVERY APP", "203.70", "8839"),
            ("2026-10-26", "FURNITURE STORE", "3636.50", "8839"),
        ])},
    },
    B_CARD: {
        "2026-09": {"previous": minor("5980.00"), "rows": card_rows([
            ("2026-09-05", "STREAMING SUBSCRIPTION", "56.00", "5530"),
            ("2026-09-09", "COFFEE SHOP", "38.50", "5530"),
            ("2026-09-14", "BOOKSHOP MALL", "214.00", "5530"),
            ("2026-09-18", "PAYMENT - THANK YOU", "-1200.00", "5530"),
            ("2026-09-19", "YOGA STUDIO", "600.00", "5530"),
            ("2026-09-23", "ONLINE MARKETPLACE", "489.10", "5530"),
            ("2026-09-28", "SPORTS STORE MALL", "748.00", "5530"),
        ])},
        "2026-10": {"rows": card_rows([
            ("2026-10-05", "STREAMING SUBSCRIPTION", "56.00", "5530"),
            ("2026-10-11", "COFFEE SHOP", "42.00", "5530"),
            ("2026-10-17", "ONLINE MARKETPLACE", "318.40", "5530"),
            ("2026-10-18", "PAYMENT - THANK YOU", "-2000.00", "5530"),
            ("2026-10-24", "YOGA STUDIO", "650.00", "5530"),
        ])},
    },
}

cheques = [  # all drawn on Bank A current (the account with the cheque book)
    {"no": "000231", "payee": "Marina Heights Properties LLC", "amountMinor": minor("27500.00"), "date": "2026-02-22", "purpose": "Rent Q1"},
    {"no": "000232", "payee": "Marina Heights Properties LLC", "amountMinor": minor("27500.00"), "date": "2026-05-22", "purpose": "Rent Q2"},
    {"no": "000233", "payee": "Marina Heights Properties LLC", "amountMinor": minor("27500.00"), "date": "2026-08-22", "purpose": "Rent Q3"},
    {"no": "000234", "payee": "Marina Heights Properties LLC", "amountMinor": minor("27500.00"), "date": "2026-11-22", "purpose": "Rent Q4"},
    {"no": "000301", "payee": "Harbour Gate Developments", "amountMinor": minor("36000.00"), "date": "2027-01-15", "purpose": "Creekside Residences instalment 3"},
    {"no": "000302", "payee": "Harbour Gate Developments", "amountMinor": minor("36000.00"), "date": "2027-07-15", "purpose": "Creekside Residences instalment 4"},
    {"no": "000303", "payee": "Harbour Gate Developments", "amountMinor": minor("36000.00"), "date": "2028-01-15", "purpose": "Creekside Residences instalment 5"},
    {"no": "000304", "payee": "Harbour Gate Developments", "amountMinor": minor("36000.00"), "date": "2028-07-15", "purpose": "Creekside Residences instalment 6"},
    {"no": "000305", "payee": "Harbour Gate Developments", "amountMinor": minor("72000.00"), "date": "2029-01-15", "purpose": "Creekside Residences handover"},
]
payment_plan = {
    "project": "Creekside Residences, unit 1207 (fictional)", "developer": "Harbour Gate Developments", "price": minor("360000.00"),
    "instalments": [
        {"n": 1, "date": "2026-01-15", "pct": "10", "amountMinor": minor("36000.00"), "status": "paid"},
        {"n": 2, "date": "2026-07-15", "pct": "10", "amountMinor": minor("36000.00"), "status": "paid"},
        {"n": 3, "date": "2027-01-15", "pct": "10", "amountMinor": minor("36000.00"), "status": "due"},
        {"n": 4, "date": "2027-07-15", "pct": "10", "amountMinor": minor("36000.00"), "status": "due"},
        {"n": 5, "date": "2028-01-15", "pct": "10", "amountMinor": minor("36000.00"), "status": "due"},
        {"n": 6, "date": "2028-07-15", "pct": "10", "amountMinor": minor("36000.00"), "status": "due"},
        {"n": 7, "date": "2029-01-15", "pct": "20", "amountMinor": minor("72000.00"), "status": "due"},
        {"n": 8, "date": "2029-06-30", "pct": "20", "amountMinor": minor("72000.00"), "status": "on handover, bank finance"},
    ],
}
profile = {"asOf": AS_OF.isoformat(), "horizonDays": 90, "homeCurrency": HOME, "buffersMinor": BUFFERS,
           "priorities": {"cheque": 1, "autopay": 2, "card_payment": 3}}
currency_of = {a["id"]: a["currency"] for a in accounts}
current_ids = [a["id"] for a in accounts if a["kind"] == "current"]
bank_names = [b["name"].upper() for b in banks]

# ---------------- statements: control figures
def close_current(stmts):
    out, opening = {}, None
    for period in sorted(stmts):
        s = stmts[period]
        opening = s.get("opening", opening)
        debits = sum(-r["amountMinor"] for r in s["rows"] if r["amountMinor"] < 0)
        credits = sum(r["amountMinor"] for r in s["rows"] if r["amountMinor"] > 0)
        out[period] = {"opening": opening, "totalDebits": debits, "totalCredits": credits, "closing": opening - debits + credits}
        opening = out[period]["closing"]
    return out

def close_card(acct, stmts, terms):
    out, previous = {}, None
    due_day = next(a["dueDay"] for a in accounts if a["id"] == acct)
    for period in sorted(stmts):
        s = stmts[period]
        previous = s.get("previous", previous)
        purchases = sum(r["amountMinor"] for r in s["rows"] if r["amountMinor"] > 0)
        payments = sum(-r["amountMinor"] for r in s["rows"] if r["amountMinor"] < 0)
        unpaid = max(previous - payments, 0)
        finance = pct_of(unpaid, terms["monthlyRatePct"]) if unpaid > 0 else 0
        new = previous - payments + purchases + finance
        y, m = map(int, period.split("-"))
        due = date(y + (m // 12), m % 12 + 1, due_day)
        out[period] = {"previous": previous, "payments": payments, "purchases": purchases, "financeCharges": finance,
                       "newBalance": new, "minimumDue": pct_of(new, terms["minDuePct"]), "dueDate": due.isoformat(),
                       "tableOnlyBalance": previous - payments + purchases}
        previous = new
    return out

totals = {a: (close_current(statements[a]) if a in current_ids else close_card(a, statements[a], card_terms[a])) for a in statements}
assert totals[A_CUR]["2026-10"]["closing"] == minor("27110.35")
assert totals[B_CUR]["2026-10"]["closing"] == minor("10150.00")
assert totals[C_CUR]["2026-10"]["closing"] == minor("4250.00")
assert totals[A_CARD]["2026-10"]["newBalance"] == minor("12870.25")
assert totals[B_CARD]["2026-09"]["financeCharges"] == minor("155.35")
assert totals[B_CARD]["2026-10"]["newBalance"] == minor("6312.48")

# ---------------- recurring detection (two latest statements, current accounts)
def norm(desc):
    return re.sub(r"\s+", " ", re.sub(r"\d", "", desc)).strip()

def is_own_movement(desc):
    d = desc.upper()
    return any(b in d for b in bank_names) or "CARD PAYMENT" in d or "CARD AUTOPAY" in d

def recurring(acct):
    sep, octo = statements[acct]["2026-09"]["rows"], statements[acct]["2026-10"]["rows"]
    out = []
    for r in octo:
        if is_own_movement(r["description"]):
            continue
        n = norm(r["description"])
        match = [s for s in sep if norm(s["description"]) == n and (s["amountMinor"] > 0) == (r["amountMinor"] > 0)]
        if not match:
            continue
        s = match[0]
        ratio = abs(r["amountMinor"]) / abs(s["amountMinor"])
        if 0.85 <= ratio <= 1.15 and abs(D(r["date"]).day - D(s["date"]).day) <= 3:
            out.append({"accountId": acct, "description": n, "amountMinor": r["amountMinor"], "day": D(r["date"]).day})
    return out

rec = {a: recurring(a) for a in current_ids}

def months(start, end):
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

def day_in(y, m, d):
    return date(y, m, min(d, calendar.monthrange(y, m)[1]))

START = D("2026-11-01")
def baseline_flows():
    flows = {a: [] for a in current_ids}
    for acct, items in rec.items():
        for it in items:
            for y, m in months(START, HORIZON_END):
                d = day_in(y, m, it["day"])
                if START <= d <= HORIZON_END:
                    flows[acct].append({"date": d, "amountMinor": it["amountMinor"], "kind": "recurring", "label": it["description"]})
    for c in cheques:
        d = D(c["date"])
        if START <= d <= HORIZON_END:
            flows[A_CUR].append({"date": d, "amountMinor": -c["amountMinor"], "kind": "cheque", "label": f"Cheque {c['no']}", "ref": c["no"]})
    known = totals[A_CARD]["2026-10"]
    est = (totals[A_CARD]["2026-09"]["newBalance"] + totals[A_CARD]["2026-10"]["newBalance"]) // 2
    for y, m in months(START, HORIZON_END):
        d = date(y, m, 28)
        if START <= d <= HORIZON_END:
            amt = known["newBalance"] if d.isoformat() == known["dueDate"] else est
            flows[A_CUR].append({"date": d, "amountMinor": -amt, "kind": "autopay", "label": "Bank A card autopay", "estimated": d.isoformat() != known["dueDate"]})
    return flows, est

openings = {a: totals[a]["2026-10"]["closing"] for a in current_ids}

def series(acct, flows):
    bal, out, d, by_day = openings[acct], {}, START, {}
    for f in flows[acct]:
        by_day.setdefault(f["date"], []).append(f)
    while d <= HORIZON_END:
        for f in sorted(by_day.get(d, []), key=lambda f: -f["amountMinor"]):
            bal += f["amountMinor"]
        out[d] = bal
        d += timedelta(days=1)
    return out

def before(acct, flows, debit):
    bal = openings[acct]
    for f in sorted(flows[acct], key=lambda f: (f["date"], -f["amountMinor"])):
        if f is debit:
            return bal
        bal += f["amountMinor"]
    raise ValueError

def detect_risks(flows):
    risks = []
    for f in flows[A_CUR]:
        if f["kind"] in ("cheque", "autopay") and f["date"] >= AS_OF:
            b, need = before(A_CUR, flows, f), -f["amountMinor"]
            if b < need + BUFFERS["AED"]:
                rid = f"cheque-{f['ref']}" if f["kind"] == "cheque" else f"autopay-{A_CARD}-{f['date'].isoformat()}"
                risks.append({"id": rid, "type": f"{f['kind']}_shortfall", "accountId": A_CUR, "date": f["date"].isoformat(),
                              "amountMinor": need, "projectedBeforeMinor": b, "shortfallMinor": need + BUFFERS["AED"] - b})
    sc = totals[B_CARD]["2026-10"]
    risks.append({"id": f"card-{B_CARD}-{sc['dueDate']}", "type": "card_interest", "accountId": B_CARD, "date": sc["dueDate"],
                  "fullMinor": sc["newBalance"], "minimumMinor": sc["minimumDue"], "monthlyRatePct": card_terms[B_CARD]["monthlyRatePct"]})
    return risks

def income_dates(acct):
    out = []
    for it in rec[acct]:
        if it["amountMinor"] > 0:
            for y, m in months(START, HORIZON_END + timedelta(days=31)):
                out.append(day_in(y, m, it["day"]))
    return sorted(out)

def available(acct, flows, on):
    nxt = next(d for d in income_dates(acct) if d > on)
    s = series(acct, flows)
    return max(min(s[d] for d in s if on <= d < nxt) - BUFFERS[currency_of[acct]], 0), nxt

def allocate(claims, flows):
    flows = {k: list(v) for k, v in flows.items()}
    grants = []
    def window_end(c):
        return next(d for d in income_dates(c["from"]) if d > D(c["byDate"]))
    for c in sorted(claims, key=lambda c: (window_end(c), c["priority"], c["byDate"], c["id"])):
        if currency_of[c["from"]] != currency_of.get(c["to"], currency_of[c["from"]]):
            grants.append({**c, "grantedMinor": 0, "status": "refused", "reason": "different currencies"}); continue
        avail, nxt = available(c["from"], flows, D(c["byDate"]))
        g = min(c["requestedMinor"], avail)
        grants.append({**c, "grantedMinor": g, "availableMinor": avail, "windowEnds": nxt.isoformat(),
                       "status": "granted" if g == c["requestedMinor"] else ("partial" if g else "refused")})
        if g:
            flows[c["from"]].append({"date": D(c["byDate"]), "amountMinor": -g, "kind": "planned", "label": c["id"]})
            if c["to"] in flows:
                flows[c["to"]].append({"date": D(c["byDate"]), "amountMinor": g, "kind": "planned", "label": c["id"]})
    return grants, flows

flows0, a_card_estimate = baseline_flows()
risks0 = detect_risks(flows0)
r_rent = next(r for r in risks0 if r["id"] == "cheque-000234")
r_card = next(r for r in risks0 if r["type"] == "card_interest")
claims = [
    {"id": "rent", "riskId": r_rent["id"], "priority": 1, "from": B_CUR, "to": A_CUR, "requestedMinor": r_rent["shortfallMinor"], "byDate": "2026-11-21"},
    {"id": "card", "riskId": r_card["id"], "priority": 3, "from": B_CUR, "to": B_CARD, "requestedMinor": r_card["fullMinor"], "byDate": "2026-11-20"},
]
grants1, _ = allocate(claims, flows0)
remainder = r_card["fullMinor"] - next(g for g in grants1 if g["id"] == "card")["grantedMinor"]
claims.append({"id": "card-rest", "riskId": r_card["id"], "priority": 3, "from": B_CUR, "to": B_CARD, "requestedMinor": remainder, "byDate": "2026-11-25"})
grants2, flows2 = allocate(claims, flows0)
r_jan = next(r for r in detect_risks(flows2) if r["id"] == "cheque-000301")
claims.append({"id": "property", "riskId": r_jan["id"], "priority": 1, "from": B_CUR, "to": A_CUR, "requestedMinor": r_jan["shortfallMinor"], "byDate": "2027-01-14"})
grants3, flows3 = allocate(claims, flows0)
# a cross-currency claim is refused, never converted silently
probe, _ = allocate(claims + [{"id": "probe", "riskId": r_jan["id"], "priority": 1, "from": C_CUR, "to": A_CUR, "requestedMinor": 100, "byDate": "2027-01-14"}], flows0)
assert next(g for g in probe if g["id"] == "probe")["status"] == "refused"
g_jan = next(g for g in grants3 if g["id"] == "property")
residual = r_jan["shortfallMinor"] - g_jan["grantedMinor"]
assert residual == next(r for r in detect_risks(flows3) if r["id"] == "cheque-000301")["shortfallMinor"]
for acct in (B_CUR,):
    lows = [(d, b) for d, b in series(acct, flows3).items() if b < BUFFERS["AED"] and d >= AS_OF]
    assert not lows, lows[:3]

# cover suggestion: another-currency account whose free funds (min from the day before the risk to the horizon end, minus its buffer)
# cover the residual shortfall at the latest rate
c_series = series(C_CUR, flows3)
on = D(r_jan["date"]) - timedelta(days=1)
c_free = min(b for d, b in c_series.items() if d >= on) - BUFFERS["EUR"]
c_need = need_in(residual, FX["rate"])
assert c_need <= c_free

interest_est = pct_of(remainder, card_terms[B_CARD]["monthlyRatePct"])
c_home = convert(openings[C_CUR], FX["rate"])
have = openings[A_CUR] + openings[B_CUR] + c_home
owe = totals[A_CARD]["2026-10"]["newBalance"] + totals[B_CARD]["2026-10"]["newBalance"]
promised_90 = sum(c["amountMinor"] for c in cheques if AS_OF <= D(c["date"]) <= HORIZON_END)
promised_all = sum(c["amountMinor"] for c in cheques if D(c["date"]) >= AS_OF)

iso = lambda x: x.isoformat() if isinstance(x, date) else x
golden = {
    "asOf": AS_OF.isoformat(), "horizonEnd": HORIZON_END.isoformat(), "homeCurrency": HOME, "buffersMinor": BUFFERS, "fx": FX,
    "statements": totals,
    "position": {"haveMinor": have, "oweMinor": owe, "promised90Minor": promised_90, "promisedAllMinor": promised_all,
                 "haveByAccount": {A_CUR: openings[A_CUR], B_CUR: openings[B_CUR], C_CUR: {"minor": openings[C_CUR], "currency": "EUR", "homeMinor": c_home}}},
    "recurring": [r for a in current_ids for r in rec[a]], "bankACardAutopayEstimateMinor": a_card_estimate,
    "risksBaseline": [{k: iso(v) for k, v in r.items()} for r in risks0],
    "grantsRound1": grants1, "grantsFinal": grants3,
    "cardRemainderMinor": remainder, "cardInterestEstimateMinor": interest_est,
    "january": {"shortfallMinor": r_jan["shortfallMinor"], "fundedMinor": g_jan["grantedMinor"], "residualMinor": residual},
    "cover": {"riskId": r_jan["id"], "accountId": C_CUR, "currency": "EUR", "needMinor": c_need, "freeMinor": c_free},
}
scenario = {"_note": "Generator input for synthetic documents. Fictional people, banks and merchants. The app never reads this file.",
            "profile": profile, "people": people, "banks": banks, "accounts": accounts, "cardTerms": card_terms,
            "statements": statements, "cheques": cheques, "paymentPlan": payment_plan, "fx": [FX]}

out = sys.argv[1] if len(sys.argv) > 1 else "."
json.dump(scenario, open(f"{out}/household.scenario.json", "w"), indent=1, default=str)
json.dump(golden, open(f"{out}/golden.json", "w"), indent=1, default=str)

p = lambda k, v: print(f"  {k:<48} {v}")
print("Statements")
for a, per in totals.items():
    for k, t in per.items():
        print(f"  {a} {k} ({currency_of[a]}): " + ", ".join(f"{x}={fmt(y) if isinstance(y, int) else y}" for x, y in t.items()))
print("Position (31 Oct, AED)")
p("have (incl. Bank C EUR at 4.2500)", f"{fmt(have)}  (Bank C EUR {fmt(openings[C_CUR])} = AED {fmt(c_home)})")
p("owe", fmt(owe)); p("promised next 90 days", fmt(promised_90)); p("promised all future cheques", fmt(promised_all))
print("Recurring"); [p(f"{r['accountId']} {r['description']}", f"{fmt(r['amountMinor'])} day {r['day']}") for a in current_ids for r in rec[a]]
print("Baseline risks"); [p(r["id"], {k: fmt(v) if k.endswith("Minor") else v for k, v in r.items() if k not in ("id",)}) for r in risks0]
print("Final grants"); [p(g["id"], f"requested {fmt(g['requestedMinor'])} granted {fmt(g['grantedMinor'])} free {fmt(g.get('availableMinor', 0))} window to {g.get('windowEnds')}") for g in grants3]
p("card remainder on payday / est. finance charge", f"{fmt(remainder)} / {fmt(interest_est)}")
p("January shortfall / funded / residual", f"{fmt(r_jan['shortfallMinor'])} / {fmt(g_jan['grantedMinor'])} / {fmt(residual)}")
p("cover from Bank C (EUR): need / free", f"{fmt(c_need)} / {fmt(c_free)}")
