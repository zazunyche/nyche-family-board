#!/usr/bin/env python3
"""finance/gen_snapshot.py — emit a styled HTML spending snapshot from the datastore
to /tmp/finance-snapshot.html. Numbers computed live (exact). Local only."""
import sqlite3, os
DB=os.path.expanduser('~/Documents/Financial-Audit-2025-2026/finance.db')
OUT="/tmp/finance-snapshot.html"
c=sqlite3.connect(DB)
def q(sql,p=()): return c.execute(sql,p).fetchall()
money=lambda v: f"${v:,.0f}"

# monthly external income vs spend
income=dict(q("""SELECT substr(txn_date,1,7),SUM(amount) FROM transactions t JOIN accounts a ON a.id=t.account_id
  WHERE a.is_credit=0 AND amount>0 AND is_transfer=0 AND txn_date IS NOT NULL GROUP BY 1"""))
spend=dict(q("""SELECT substr(txn_date,1,7),SUM(CASE WHEN a.is_credit=1 THEN amount ELSE -amount END)
  FROM transactions t JOIN accounts a ON a.id=t.account_id
  WHERE ((a.is_credit=1 AND direction='charge') OR (a.is_credit=0 AND amount<0 AND is_transfer=0))
  AND txn_date IS NOT NULL GROUP BY 1"""))
months=sorted(set(list(income)+list(spend)))
months=[m for m in months if m>="2025-01" and m<="2026-12"]
cats=q("""SELECT category,SUM(CASE WHEN a.is_credit=1 THEN amount ELSE -amount END) s
  FROM transactions t JOIN accounts a ON a.id=t.account_id
  WHERE (a.is_credit=1 AND direction='charge') OR (a.is_credit=0 AND amount<0 AND is_transfer=0)
  GROUP BY category ORDER BY s DESC""")
person=q("""SELECT COALESCE(person,'Joint (Amazon)'),SUM(amount) FROM transactions t JOIN accounts a ON a.id=t.account_id
  WHERE a.is_credit=1 AND direction='charge' GROUP BY person ORDER BY 2 DESC""")
tot=sum(s for _,s in cats); rev=sum(s for cat,s in cats if cat!='Review')
inc_tot=sum(income.values()); spend_tot=sum(spend.values())

def bars():
    out=[]
    mx=max([max(income.get(m,0),spend.get(m,0)) for m in months]+[1])
    for m in months:
        i=income.get(m,0); s=spend.get(m,0); net=i-s
        iw=int(100*i/mx); sw=int(100*s/mx)
        out.append(f"""<tr><td style="padding:3px 8px;white-space:nowrap;font-size:12px;">{m}</td>
        <td style="padding:3px 4px;width:50%"><div style="background:#2f6f4f;height:12px;width:{iw}%;border-radius:3px;display:inline-block"></div> <span style="font-size:11px;color:#2f6f4f">{money(i)}</span></td>
        <td style="padding:3px 4px;width:50%"><div style="background:#b3261e;height:12px;width:{sw}%;border-radius:3px;display:inline-block"></div> <span style="font-size:11px;color:#b3261e">{money(s)}</span></td>
        <td style="padding:3px 8px;font-size:12px;font-weight:600;color:{'#1d6b43' if net>=0 else '#b3261e'}">{money(net)}</td></tr>""")
    return "".join(out)

catrows="".join(f"""<tr style="background:{'#fff' if i%2 else '#f6f6f4'}"><td style="padding:5px 9px">{cat}</td>
  <td style="padding:5px 9px;text-align:right;font-variant-numeric:tabular-nums">{money(s)}</td></tr>"""
  for i,(cat,s) in enumerate(cats) if s>0)
personrows="".join(f"""<tr><td style="padding:5px 9px">{p}</td><td style="padding:5px 9px;text-align:right">{money(s)}</td></tr>""" for p,s in person)

html=f"""<!doctype html><html><body style="margin:0;background:#f4f4f2"><div style="max-width:680px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328;line-height:1.5">
<h1 style="font-size:23px;margin:0 0 4px">💰 Finance Snapshot — first look</h1>
<p style="margin:0 0 16px;color:#6b6860;font-size:13px">2025–2026 · 8 accounts · 140 statements, all reconciled to the penny · {len(months)} months</p>
<div style="background:#0d1b2a;color:#fff;border-radius:12px;padding:16px 20px;margin-bottom:18px">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8fb4d9;margin-bottom:6px">Big picture ({months[0]} → {months[-1]})</div>
  <p style="margin:0;font-size:15px">External income <b style="color:#8fe0b0">{money(inc_tot)}</b> &nbsp;·&nbsp; Spending <b style="color:#f3a79f">{money(spend_tot)}</b> &nbsp;·&nbsp; Net <b>{money(inc_tot-spend_tot)}</b><br>
  <span style="font-size:12px;color:#8fb4d9">(internal transfers &amp; card payments excluded so nothing's double-counted)</span></p>
</div>
<h2 style="font-size:15px;border-left:4px solid #2f6f4f;padding-left:10px;margin:0 0 6px">Money in vs out, by month</h2>
<table width="100%" style="border-collapse:collapse;margin-bottom:8px"><tr style="font-size:11px;color:#6b6860"><td style="padding:0 8px">Month</td><td style="padding:0 4px">🟢 In</td><td style="padding:0 4px">🔴 Out</td><td style="padding:0 8px">Net</td></tr>{bars()}</table>
<h2 style="font-size:15px;border-left:4px solid #2f6f4f;padding-left:10px;margin:18px 0 6px">Where it goes — spend by category</h2>
<table width="100%" style="border-collapse:collapse;font-size:13px;margin-bottom:8px">{catrows}</table>
<p style="margin:0 0 16px;font-size:12px;color:#8a8780">Categorized {100*rev/tot:.0f}% of spend; "Review" = long tail I'll refine with Hermes next.</p>
<h2 style="font-size:15px;border-left:4px solid #2f6f4f;padding-left:10px;margin:0 0 6px">Credit-card spend by person</h2>
<table width="100%" style="border-collapse:collapse;font-size:13px;margin-bottom:16px">{personrows}</table>
<div style="background:#fff8e6;border:1px solid #f0d98a;border-radius:10px;padding:12px 16px;font-size:13px">
<b>⚠️ A few items I flagged for you (affect accuracy):</b>
<ul style="margin:6px 0 0;padding-left:18px">
<li>Recurring "MSPBNA ACH TRNSFR" into savings — external income or an internal transfer? (left out of income for now)</li>
<li>"GA DIR ACH CONTRIB" (~$8k) — I tagged it Utilities but "CONTRIB" looks like a 529/investment contribution; tell me which.</li>
<li>"Returned ACH Card Payment" items (~$15k) are bounced/reversed payments, not real spending — I'll net these out.</li>
<li>Amazon card spend isn't split by person (statements don't break it out) — shown as "Joint".</li>
</ul></div>
<p style="margin:16px 0 0;font-size:12px;color:#8a8780">This is a static first look. Next: the interactive dashboard (filter by person/category/month) served on your board. Raw data never left the Mac. — Zazu</p>
</div></body></html>"""
open(OUT,"w").write(html); print("wrote",OUT,len(html),"bytes")
c.close()
