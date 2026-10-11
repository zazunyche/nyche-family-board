#!/usr/bin/env python3
"""
finance/phase2_transfers.py — Phase 2a: tag INTERNAL transfers so household
"money in / money out" isn't inflated or double-counted. Deterministic + idempotent.
  - CC payments (bank side pays our own card) → transfer
  - CC payments (card side, the matching leg)  → transfer
  - inter-account moves (checking<->savings, Cap One<->Chase)  → transfer
Merchant refunds/credits (e.g. AMAZON MKTPLACE PMTS) are NOT transfers.
Prints what got tagged + flags ambiguous items for human review. Local only.
"""
import sqlite3, os, re
DB=os.path.expanduser('~/Documents/Financial-Audit-2025-2026/finance.db')
c=sqlite3.connect(DB)

BANK_TRANSFER = [  # bank-side: paying our own cards, or moving between our accounts
 'CAPITAL ONE MOBILE PMT','CAPITAL ONE CRCARDPMT','AMEX EPAYMENT','CHASE CREDIT CRD',
 'JPMORGAN CHASE  CHASE ACH','JPMORGAN CHASE CHASE ACH','ONLINE TRANSFER',
 'CAPITAL ONE TRANSFER','INSTANT TRANSFER','PAYPAL TO NANA','TRANSFER TO SAV','TRANSFER FROM CHK',
]
CC_PAYMENT = [  # card-side: the card being paid off (NOT merchant refunds)
 'MOBILE PYMT','AUTOPAY PYMT','AUTOMATIC PAYMENT','AUTOPAY PAYMENT RECEIVED','PAYMENT - THANK YOU',
]
AMBIGUOUS = ['MSPBNA ACH TRNSFR']  # possibly external (brokerage) — leave untagged, flag for review

c.execute("UPDATE transactions SET is_transfer=0")
def tag(where, params=()):
    cur=c.execute(f"UPDATE transactions SET is_transfer=1 WHERE is_transfer=0 AND {where}", params)
    return cur.rowcount

n=0
# bank side (is_credit=0)
for pat in BANK_TRANSFER:
    n+=c.execute("""UPDATE transactions SET is_transfer=1 WHERE id IN (
        SELECT t.id FROM transactions t JOIN accounts a ON a.id=t.account_id
        WHERE a.is_credit=0 AND UPPER(t.description) LIKE ?)""",(f"%{pat}%",)).rowcount
# card side payments only (is_credit=1 AND direction='payment')
for pat in CC_PAYMENT:
    n+=c.execute("""UPDATE transactions SET is_transfer=1 WHERE id IN (
        SELECT t.id FROM transactions t JOIN accounts a ON a.id=t.account_id
        WHERE a.is_credit=1 AND t.direction='payment' AND UPPER(t.description) LIKE ?)""",(f"%{pat}%",)).rowcount
c.commit()

tagged=c.execute("SELECT COUNT(*),COALESCE(SUM(ABS(amount)),0) FROM transactions WHERE is_transfer=1").fetchone()
print(f"Tagged {tagged[0]} transfer legs, ${tagged[1]:,.0f} gross volume (excluded from income/spending).")

print("\n=== what got tagged (by description) ===")
for r in c.execute("""SELECT a.institution||' '||a.type, t.description, COUNT(*), SUM(ABS(t.amount))
   FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.is_transfer=1
   GROUP BY t.description ORDER BY SUM(ABS(t.amount)) DESC LIMIT 15"""):
    print(f"  [{r[0]}] {r[1][:42]:42} x{r[2]:3}  ${r[3]:,.0f}")

print("\n=== TRUE external income (bank inflows, transfers excluded), monthly ===")
for r in c.execute("""SELECT substr(txn_date,1,7) ym, SUM(amount)
   FROM transactions t JOIN accounts a ON a.id=t.account_id
   WHERE a.is_credit=0 AND t.amount>0 AND t.is_transfer=0 AND txn_date IS NOT NULL
   GROUP BY ym ORDER BY ym"""):
    print(f"  {r[0]}: ${r[1]:,.0f}")

print("\n⚠ AMBIGUOUS — left UNtagged, needs Dad's call (external income vs internal transfer):")
for pat in AMBIGUOUS:
    for r in c.execute("""SELECT a.institution||' '||a.type, t.description, COUNT(*), SUM(t.amount)
       FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE UPPER(t.description) LIKE ?
       GROUP BY t.description""",(f"%{pat}%",)):
        print(f"  [{r[0]}] {r[1][:42]:42} x{r[2]}  ${r[3]:,.0f}")
c.close()
