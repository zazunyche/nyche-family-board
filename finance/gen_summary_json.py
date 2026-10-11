#!/usr/bin/env python3
"""finance/gen_summary_json.py — build the aggregate summary that powers the
interactive dashboard. Writes finance-summary.json OUTSIDE the repo (served only
through the board's AUTHENTICATED /api/finance). Aggregates only — no account
numbers; descriptions trimmed. Idempotent; re-run after each statement drop."""
import sqlite3, os, json, datetime
DB=os.path.expanduser('~/Documents/Financial-Audit-2025-2026/finance.db')
OUT=os.path.expanduser('~/Documents/Financial-Audit-2025-2026/finance-summary.json')
c=sqlite3.connect(DB); c.row_factory=sqlite3.Row

def spend_rows():
    return c.execute("""SELECT substr(t.txn_date,1,7) month, COALESCE(t.category,'Review') category,
        CASE WHEN a.is_credit=1 THEN COALESCE(t.person,'Joint') ELSE 'Joint' END person,
        SUM(CASE WHEN a.is_credit=1 THEN t.amount ELSE -t.amount END) amount, COUNT(*) n
      FROM transactions t JOIN accounts a ON a.id=t.account_id
      WHERE ((a.is_credit=1 AND t.direction='charge') OR (a.is_credit=0 AND t.amount<0 AND t.is_transfer=0))
        AND t.txn_date IS NOT NULL AND t.txn_date NOT LIKE 'None%'
      GROUP BY month,category,person""").fetchall()

income=c.execute("""SELECT substr(txn_date,1,7) month, SUM(amount) amount FROM transactions t
  JOIN accounts a ON a.id=t.account_id WHERE a.is_credit=0 AND amount>0 AND is_transfer=0
  AND txn_date IS NOT NULL AND txn_date NOT LIKE 'None%' GROUP BY month""").fetchall()

biggest=c.execute("""SELECT t.txn_date date, COALESCE(t.category,'Review') category,
   ROUND(CASE WHEN a.is_credit=1 THEN t.amount ELSE -t.amount END) amount,
   CASE WHEN a.is_credit=1 THEN COALESCE(t.person,'Joint') ELSE 'Joint' END person,
   substr(t.description,1,36) descr
   FROM transactions t JOIN accounts a ON a.id=t.account_id
   WHERE ((a.is_credit=1 AND t.direction='charge') OR (a.is_credit=0 AND t.amount<0 AND t.is_transfer=0))
   AND t.txn_date IS NOT NULL AND t.txn_date NOT LIKE 'None%'
   ORDER BY amount DESC LIMIT 40""").fetchall()

accts=c.execute("SELECT institution,type,last4,is_credit,owner FROM accounts ORDER BY is_credit,institution").fetchall()
recon=c.execute("SELECT COUNT(*),SUM(reconciled) FROM statements").fetchone()

data={
 "generatedAt": None,  # stamped by caller if needed
 "months": sorted({r["month"] for r in spend_rows()} | {r["month"] for r in income}),
 "spend": [dict(month=r["month"],category=r["category"],person=r["person"],amount=round(r["amount"],2),n=r["n"]) for r in spend_rows()],
 "income": [dict(month=r["month"],amount=round(r["amount"],2)) for r in income],
 "biggest": [dict(date=r["date"],category=r["category"],amount=r["amount"],person=r["person"],descr=r["descr"]) for r in biggest],
 "accounts": [dict(institution=r["institution"],type=r["type"],last4=r["last4"],is_credit=r["is_credit"],owner=r["owner"]) for r in accts],
 "statements": {"total": recon[0], "reconciled": recon[1]},
}
with open(OUT,"w") as f: json.dump(data,f)
print("wrote",OUT,f"({len(data['spend'])} spend rows, {len(data['months'])} months)")
c.close()
