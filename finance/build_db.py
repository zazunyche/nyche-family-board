#!/usr/bin/env python3
"""
finance/build_db.py — Phase 1 of the family finance audit.
DETERMINISTIC extraction of statement PDFs into a local SQLite datastore, with
reconciliation against each statement's own stated balances (accuracy gate).
Code does the math — no LLM guesses numbers. Everything stays local.

DB + raw data live OUTSIDE the git repo (sensitive). Code is tracked.

Usage: python3 finance/build_db.py [--docs DIR] [--db PATH]
"""
import os, re, sys, glob, sqlite3
from pypdf import PdfReader

HOME = os.path.expanduser("~")
DOCS = os.path.join(HOME, "Documents", "Financial-Audit-2025-2026", "ecFinanceDocsv1")
DB   = os.path.join(HOME, "Documents", "Financial-Audit-2025-2026", "finance.db")
args = sys.argv[1:]
if "--docs" in args: DOCS = args[args.index("--docs")+1]
if "--db"   in args: DB   = args[args.index("--db")+1]

MONTHS = {m:i+1 for i,m in enumerate(
    ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"])}

def money(s): return float(s.replace(",","").replace("$","").strip())
def text_of(path):
    r = PdfReader(path)
    return "\n".join((p.extract_text() or "") for p in r.pages)

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, institution TEXT, type TEXT, last4 TEXT,
  is_credit INTEGER, owner TEXT, UNIQUE(institution,type,last4));
CREATE TABLE IF NOT EXISTS statements(
  id INTEGER PRIMARY KEY, account_id INTEGER, period_start TEXT, period_end TEXT,
  begin_balance REAL, end_balance REAL, total_in REAL, total_out REAL,
  source_file TEXT, parsed_ok INTEGER, reconciled INTEGER, note TEXT,
  UNIQUE(account_id, source_file));
CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY, account_id INTEGER, statement_id INTEGER,
  txn_date TEXT, description TEXT, amount REAL, direction TEXT,
  category TEXT, is_transfer INTEGER, balance_after REAL, source_file TEXT);
"""

def db_connect():
    con = sqlite3.connect(DB); con.executescript(SCHEMA); return con

def upsert_account(con, inst, typ, last4, is_credit, owner="JOINT"):
    # owner: DAD | MOM | JOINT  — enables per-person filtering on top of the household view.
    con.execute("INSERT OR IGNORE INTO accounts(institution,type,last4,is_credit,owner) VALUES(?,?,?,?,?)",
                (inst,typ,last4,is_credit,owner))
    return con.execute("SELECT id FROM accounts WHERE institution=? AND type=? AND last4=?",
                       (inst,typ,last4)).fetchone()[0]

# ── Capital One 360 bank (checking + savings in one statement) ────────────────
CO_SUMMARY = re.compile(r'(360 Checking|360 Performance Savings)\.+(\d{4})\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})')
CO_TXN = re.compile(
    r'^(?P<mon>[A-Z][a-z]{2})\s+(?P<day>\d{1,2})\s+(?P<desc>.*?)\s+(?P<dc>Debit|Credit)\s+(?P<sign>[-+])\s+\$(?P<amt>[\d,]+\.\d{2})\s+\$(?P<bal>[\d,]+\.\d{2})$')
CO_OPEN = re.compile(r'^([A-Z][a-z]{2})\s+(\d{1,2})\s+(Opening|Closing) Balance\s+\$([\d,]+\.\d{2})$')

def parse_capone_bank(path):
    """Return list of account dicts: {type,last4,begin,end,period_*,txns:[...]}"""
    txt = text_of(path); lines = [l.strip() for l in txt.splitlines() if l.strip()]
    base = os.path.basename(path)
    ym = re.match(r'(\d{4})(\d{2})(\d{2})', base)
    year = int(ym.group(1)) if ym else None
    # period
    mper = re.search(r'([A-Z][a-z]{2}) (\d{1,2}) - ([A-Z][a-z]{2}) (\d{1,2}),\s*(\d{4})', txt)
    pstart=pend=None
    if mper:
        y=int(mper.group(5)); year=year or y
        pstart=f"{y}-{MONTHS[mper.group(1)]:02d}-{int(mper.group(2)):02d}"
        pend  =f"{y}-{MONTHS[mper.group(3)]:02d}-{int(mper.group(4)):02d}"
    # account summary → begin/end per account (reconciliation targets)
    accts={}
    for m in CO_SUMMARY.finditer(txt):
        typ = "checking" if "Checking" in m.group(1) else "savings"
        accts[typ] = dict(type=typ, last4=m.group(2), begin=money(m.group(3)),
                          end=money(m.group(4)), period_start=pstart, period_end=pend, txns=[])
    # Segment by Opening..Closing Balance; join each segment's lines so that
    # transactions whose description WRAPS onto the next text line are kept whole,
    # then extract each txn by anchoring on the trailing "Debit|Credit +/- $amt $bal".
    segs=[]; cur=None
    for l in lines:
        mo=CO_OPEN.match(l)
        if mo:
            if mo.group(3)=="Opening": cur=dict(begin=money(mo.group(4)), lines=[])
            elif cur is not None: cur["end"]=money(mo.group(4)); segs.append(cur); cur=None
            continue
        if cur is not None: cur["lines"].append(l)
    TXN=re.compile(r'([A-Z][a-z]{2})\s+(\d{1,2})\s+(.*?)\s+(Debit|Credit)\s+([-+])\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})')
    for seg in segs:
        a=next((a for a in accts.values() if abs(a["begin"]-seg["begin"])<0.005), None)
        if a is None: continue
        joined=" ".join(seg["lines"])
        for m in TXN.finditer(joined):
            amt=money(m.group(6)); signed = amt if m.group(5)=='+' else -amt
            mon=m.group(1); day=int(m.group(2))
            d=f"{year}-{MONTHS[mon]:02d}-{day:02d}" if mon in MONTHS else None
            a["txns"].append(dict(date=d, desc=re.sub(r'\s+',' ',m.group(3)).strip(),
                amount=signed, direction=('in' if signed>0 else 'out'),
                balance_after=money(m.group(7))))
    return list(accts.values())

def load_capone_bank(con):
    files = sorted(glob.glob(os.path.join(DOCS, "capone - bank", "*.pdf")))
    rows=[]
    for f in files:
        try: accts=parse_capone_bank(f)
        except Exception as e:
            rows.append((os.path.basename(f),"ERROR",str(e)[:60])); continue
        for a in accts:
            aid=upsert_account(con,"Capital One",a["type"],a["last4"],0,owner="JOINT")  # 360 bank: joint w/ Nana Yaa
            tin=sum(t["amount"] for t in a["txns"] if t["amount"]>0)
            tout=sum(-t["amount"] for t in a["txns"] if t["amount"]<0)
            # reconcile: begin + net == end  (and last balance == end)
            net=sum(t["amount"] for t in a["txns"])
            recon = abs((a["begin"]+net)-a["end"])<0.01
            con.execute("""INSERT OR REPLACE INTO statements
              (account_id,period_start,period_end,begin_balance,end_balance,total_in,total_out,source_file,parsed_ok,reconciled,note)
              VALUES(?,?,?,?,?,?,?,?,1,?,?)""",
              (aid,a["period_start"],a["period_end"],a["begin"],a["end"],tin,tout,os.path.basename(f),
               1 if recon else 0, None if recon else f"net {a['begin']+net:.2f} vs end {a['end']:.2f}"))
            sid=con.execute("SELECT id FROM statements WHERE account_id=? AND source_file=?",
                            (aid,os.path.basename(f))).fetchone()[0]
            con.execute("DELETE FROM transactions WHERE statement_id=?", (sid,))
            for t in a["txns"]:
                con.execute("""INSERT INTO transactions
                  (account_id,statement_id,txn_date,description,amount,direction,balance_after,source_file)
                  VALUES(?,?,?,?,?,?,?,?)""",
                  (aid,sid,t["date"],t["desc"],t["amount"],t["direction"],t["balance_after"],os.path.basename(f)))
            rows.append((os.path.basename(f),a["type"],
                         "OK" if recon else "RECON-FAIL", f"in {tin:,.0f} out {tout:,.0f}", len(a["txns"])))
    return rows

def main():
    con=db_connect()
    print(f"DOCS={DOCS}\nDB={DB}\n")
    print("=== Capital One 360 bank ===")
    rows=load_capone_bank(con)
    con.commit()
    ok=sum(1 for r in rows if len(r)>2 and r[2]=="OK")
    fail=[r for r in rows if len(r)>2 and r[2] in ("RECON-FAIL","ERROR")]
    for r in rows: print("  ", " | ".join(str(x) for x in r))
    print(f"\nreconciled OK: {ok} | problems: {len(fail)}")
    # quick household cashflow rollup (Capital One only, so far)
    print("\n=== Capital One monthly cashflow (in / out / net) ===")
    for row in con.execute("""SELECT period_end, SUM(total_in), SUM(total_out), SUM(total_in-total_out)
                              FROM statements GROUP BY period_end ORDER BY period_end"""):
        if row[0]: print(f"  {row[0]}: in ${row[1]:,.0f}  out ${row[2]:,.0f}  net ${row[3]:,.0f}")
    con.close()

if __name__=="__main__": main()
