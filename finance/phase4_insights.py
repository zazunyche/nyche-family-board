#!/usr/bin/env python3
"""finance/phase4_insights.py — recurring/subscription detection, duplicate-charge
flags, and savings candidates. Deterministic. Injects 'recurring' + 'flags' into
finance-summary.json (for the dashboard) and prints a human report. Local only."""
import sqlite3, os, re, json, statistics as st
DB=os.path.expanduser('~/Documents/Financial-Audit-2025-2026/finance.db')
SUM=os.path.expanduser('~/Documents/Financial-Audit-2025-2026/finance-summary.json')
c=sqlite3.connect(DB)

PROC = re.compile(r'^(APLPAY IN \*|APLPAY \*?|PAYPAL \*|SQ \*|TST\*|IN \*|PY \*|MED\*|PHR\*|COT\*|VCO\*|TUM\*|WPY\*|WWP\*|SPI\*|TCKT\*)', re.I)
def norm(desc):
    u=(desc or "").upper().strip()
    u=PROC.sub('',u)                    # strip payment-processor prefix (Square/Toast/PayPal/etc.)
    u=re.split(r'\d', u)[0]             # drop from first digit (phone/store#/zip)
    u=re.sub(r'[*#].*$','',u)           # drop after remaining * or #
    return re.sub(r'\s+',' ',u).strip(' -.') or (desc or "")[:20].upper()

rows=c.execute("""SELECT t.txn_date, t.description, t.category,
   CASE WHEN a.is_credit=1 THEN t.amount ELSE -t.amount END amt,
   CASE WHEN a.is_credit=1 THEN COALESCE(t.person,'Joint') ELSE 'Joint' END person
   FROM transactions t JOIN accounts a ON a.id=t.account_id
   WHERE ((a.is_credit=1 AND t.direction='charge') OR (a.is_credit=0 AND t.amount<0 AND t.is_transfer=0))
   AND t.txn_date NOT LIKE 'None%' AND t.txn_date IS NOT NULL""").fetchall()

groups={}
for d,desc,cat,amt,person in rows:
    groups.setdefault(norm(desc),[]).append((d,amt,cat,person))

recurring=[]
for m,txns in groups.items():
    months={t[0][:7] for t in txns}
    if len(months)<4: continue                      # must span >=4 distinct months
    amts=[t[1] for t in txns]
    annual=round(sum(amts)/len(months)*12)
    cv = (st.pstdev(amts)/st.mean(amts)) if st.mean(amts) else 1
    recurring.append(dict(merchant=m, months=len(months), n=len(txns),
        typical=round(st.median(amts)), annualized=annual, category=txns[0][2],
        steady=bool(cv<0.15)))
recurring.sort(key=lambda r:-r["annualized"])

# duplicate charges: same merchant + same rounded amount within 3 days
flags=[]
for m,txns in groups.items():
    seen={}
    for d,amt,cat,person in txns:
        key=(round(amt))
        for (pd,pa) in seen.get(key,[]):
            try:
                from datetime import date
                dd=abs((date.fromisoformat(d)-date.fromisoformat(pd)).days)
            except: dd=99
            if dd<=3:
                flags.append(dict(type="possible-duplicate", merchant=m, amount=round(amt), dates=[pd,d]))
        seen.setdefault(key,[]).append((d,amt))

# inject into summary json for the dashboard
try:
    data=json.load(open(SUM)); data["recurring"]=recurring[:40]; data["flags"]=flags[:40]
    json.dump(data,open(SUM,"w")); injected=True
except Exception as e: injected=False

print(f"Recurring/subscription-like merchants (>=4 months): {len(recurring)}  | duplicate flags: {len(flags)}  | summary injected: {injected}")
print("\n=== top recurring by annualized run-rate (savings candidates) ===")
for r in recurring[:18]:
    tag="steady" if r["steady"] else "varies"
    print(f"  ${r['annualized']:>8,}/yr  {r['merchant'][:30]:30} ~${r['typical']:>6,}/mo x{r['months']}mo [{r['category']}, {tag}]")
if flags:
    print("\n=== possible duplicate charges (review) ===")
    for f in flags[:10]:
        print(f"  ${f['amount']:>6,}  {f['merchant'][:30]:30} {f['dates']}")
c.close()
