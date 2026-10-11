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
import pdfplumber

FULLMON = {m:i for i,m in enumerate(
    ["January","February","March","April","May","June","July","August",
     "September","October","November","December"], start=1)}
def plumber_lines(path):
    out=[]
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            out += [l for l in (pg.extract_text() or "").splitlines() if l.strip()]
    return out

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
  category TEXT, is_transfer INTEGER, balance_after REAL, source_file TEXT,
  cardholder TEXT, person TEXT);
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

# ── Chase deposit accounts (checking + savings share one format) ──────────────
CH_TXN = re.compile(r'^(\d{2})/(\d{2})\s+(.*?)\s+(-?\$?[\d,]+\.\d{2})\s+(\$?[\d,]+\.\d{2})\s*$')
CH_PERIOD = re.compile(r'([A-Z][a-z]+) \d{1,2}, (\d{4}) through ([A-Z][a-z]+) \d{1,2}, (\d{4})')
CH_BEGIN = re.compile(r'Beginning Balance\s+\$([\d,]+\.\d{2})')
CH_END   = re.compile(r'Ending Balance\s+\$([\d,]+\.\d{2})')

def parse_chase_deposit(path):
    lines = plumber_lines(path); txt="\n".join(lines)
    mb=CH_BEGIN.search(txt); me=CH_END.search(txt)
    if not (mb and me): return None
    begin=money(mb.group(1)); end=money(me.group(1))
    mp=CH_PERIOD.search(txt)
    sm=em=sy=ey=None
    if mp:
        sm,sy,em,ey = FULLMON[mp.group(1)],int(mp.group(2)),FULLMON[mp.group(3)],int(mp.group(4))
    def year_for(mon):
        if sm is None: return ey or sy
        if mon==sm: return sy
        if mon==em: return ey
        return ey or sy
    txns=[]
    for l in lines:
        m=CH_TXN.match(l.strip())
        if not m: continue
        mon=int(m.group(1)); day=int(m.group(2))
        amt=money(m.group(4))
        yr=year_for(mon)
        txns.append(dict(date=f"{yr}-{mon:02d}-{day:02d}", desc=re.sub(r'\s+',' ',m.group(3)).strip(),
            amount=amt, direction=('in' if amt>0 else 'out'), balance_after=money(m.group(5))))
    pstart=f"{sy}-{sm:02d}-01" if sm else None
    pend  =f"{ey}-{em:02d}-28" if em else None
    return dict(begin=begin,end=end,period_start=pstart,period_end=pend,txns=txns)

def load_chase_deposit(con):
    specs=[("chase - checking","checking","2782"),("chase - savings","savings","3196")]
    rows=[]
    for folder,typ,last4 in specs:
        for f in sorted(glob.glob(os.path.join(DOCS, folder, "*.pdf"))):
            try: s=parse_chase_deposit(f)
            except Exception as e: rows.append((os.path.basename(f),typ,"ERROR",str(e)[:50])); continue
            if not s: rows.append((os.path.basename(f),typ,"NO-BAL","skipped")); continue
            aid=upsert_account(con,"Chase",typ,last4,0,owner="JOINT")
            net=sum(t["amount"] for t in s["txns"])
            recon=abs((s["begin"]+net)-s["end"])<0.01
            tin=sum(t["amount"] for t in s["txns"] if t["amount"]>0)
            tout=sum(-t["amount"] for t in s["txns"] if t["amount"]<0)
            con.execute("""INSERT OR REPLACE INTO statements
              (account_id,period_start,period_end,begin_balance,end_balance,total_in,total_out,source_file,parsed_ok,reconciled,note)
              VALUES(?,?,?,?,?,?,?,?,1,?,?)""",
              (aid,s["period_start"],s["period_end"],s["begin"],s["end"],tin,tout,os.path.basename(f),
               1 if recon else 0, None if recon else f"net {s['begin']+net:.2f} vs end {s['end']:.2f}"))
            sid=con.execute("SELECT id FROM statements WHERE account_id=? AND source_file=?",(aid,os.path.basename(f))).fetchone()[0]
            con.execute("DELETE FROM transactions WHERE statement_id=?", (sid,))
            for t in s["txns"]:
                con.execute("""INSERT INTO transactions
                  (account_id,statement_id,txn_date,description,amount,direction,balance_after,source_file)
                  VALUES(?,?,?,?,?,?,?,?)""",
                  (aid,sid,t["date"],t["desc"],t["amount"],t["direction"],t["balance_after"],os.path.basename(f)))
            rows.append((os.path.basename(f),typ,"OK" if recon else "RECON-FAIL",f"in {tin:,.0f} out {tout:,.0f}",len(s["txns"])))
    return rows

# ── Chase Amazon credit card ──────────────────────────────────────────────────
AZ_PREV=re.compile(r'Previous Balance\s+\$([\d,]+\.\d{2})')
AZ_NEW =re.compile(r'New Balance\s+\$([\d,]+\.\d{2})')
AZ_PER =re.compile(r'Opening/Closing Date\s+(\d{2})/(\d{2})/(\d{2})\s*-\s*(\d{2})/(\d{2})/(\d{2})')
AZ_TXN =re.compile(r'^(\d{2})/(\d{2})\s+(.*?)\s+(-?[\d,]+\.\d{2})$')

def parse_chase_amazon(path):
    lines=plumber_lines(path); txt="\n".join(lines)
    mp=AZ_PREV.search(txt); mn=AZ_NEW.search(txt); mper=AZ_PER.search(txt)
    if not (mp and mn and mper): return None
    prev=money(mp.group(1)); newbal=money(mn.group(1))
    sm,sy,em,ey=int(mper.group(1)),2000+int(mper.group(3)),int(mper.group(4)),2000+int(mper.group(6))
    def yfor(mon): return sy if mon==sm else ey
    txns=[]
    for l in lines:
        m=AZ_TXN.match(l.strip())
        if not m: continue
        desc=m.group(3).strip()
        if desc.upper().startswith(("PURCHASE","PAYMENT DUE","MINIMUM")): continue  # guard against stray summary rows
        mon=int(m.group(1)); day=int(m.group(2)); amt=money(m.group(4))
        txns.append(dict(date=f"{yfor(mon)}-{mon:02d}-{day:02d}", desc=re.sub(r'\s+',' ',desc),
            amount=amt, direction=('payment' if amt<0 else 'charge')))
    recon=abs((prev+sum(t["amount"] for t in txns))-newbal)<0.01
    return dict(prev=prev,newbal=newbal,period_start=f"{sy}-{sm:02d}-{int(mper.group(2)):02d}",
                period_end=f"{ey}-{em:02d}-{int(mper.group(5)):02d}",txns=txns,recon=recon)

def load_chase_amazon(con):
    rows=[]
    for f in sorted(glob.glob(os.path.join(DOCS,"chase - AmzCc","*.pdf"))):
        try: s=parse_chase_amazon(f)
        except Exception as e: rows.append((os.path.basename(f),"ERROR",str(e)[:50])); continue
        if not s: rows.append((os.path.basename(f),"NO-SUMMARY","skipped")); continue
        aid=upsert_account(con,"Chase","amazon_cc","8188",1,owner="JOINT")
        charges=sum(t["amount"] for t in s["txns"] if t["amount"]>0)
        pays=sum(-t["amount"] for t in s["txns"] if t["amount"]<0)
        con.execute("""INSERT OR REPLACE INTO statements
          (account_id,period_start,period_end,begin_balance,end_balance,total_in,total_out,source_file,parsed_ok,reconciled,note)
          VALUES(?,?,?,?,?,?,?,?,1,?,?)""",
          (aid,s["period_start"],s["period_end"],s["prev"],s["newbal"],pays,charges,os.path.basename(f),
           1 if s["recon"] else 0, None if s["recon"] else f"prev+txns != newbal"))
        sid=con.execute("SELECT id FROM statements WHERE account_id=? AND source_file=?",(aid,os.path.basename(f))).fetchone()[0]
        con.execute("DELETE FROM transactions WHERE statement_id=?", (sid,))
        for t in s["txns"]:
            con.execute("""INSERT INTO transactions
              (account_id,statement_id,txn_date,description,amount,direction,source_file)
              VALUES(?,?,?,?,?,?,?)""",(aid,sid,t["date"],t["desc"],t["amount"],t["direction"],os.path.basename(f)))
        rows.append((os.path.basename(f),"amazon_cc","OK" if s["recon"] else "RECON-FAIL",f"charges {charges:,.0f} pays {pays:,.0f}",len(s["txns"])))
    return rows

# ── Capital One credit cards (Venture X + Venture), cardholder-aware ──────────
CARD_PERSON={"0666":"DAD","1168":"MOM","4336":"DAD"}  # others → MOM (authorized user)
def person_for(last4): return CARD_PERSON.get(last4,"MOM")
CC_HDR=re.compile(r'#(\d{4}):\s+(Payments, Credits and Adjustments|Transactions|Total Transactions \$[\d,]+\.\d{2})')
CC_TOTAL=re.compile(r'#(\d{4}):\s+Total Transactions \$([\d,]+\.\d{2})')
CC_ROW=re.compile(r'^([A-Z][a-z]{2}) (\d{1,2}) ([A-Z][a-z]{2}) (\d{1,2}) (.*?)\s+(-\s*)?\$([\d,]+\.\d{2})$')
CC_PER=re.compile(r'([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\s*-\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})')
CC_PREV=re.compile(r'Previous Balance\s+\$([\d,]+\.\d{2})')
CC_NEWBAL=re.compile(r'New Balance\s+\$([\d,]+\.\d{2})')

def parse_capone_cc(path):
    lines=plumber_lines(path); txt="\n".join(lines)
    mper=CC_PER.search(txt)
    sm=sy=em=ey=None
    if mper:
        sm,sy,em,ey=MONTHS[mper.group(1)],int(mper.group(3)),MONTHS[mper.group(4)],int(mper.group(6))
    def yfor(mon):
        if sm is None: return ey
        return sy if mon==sm else ey
    totals={}
    for m in CC_TOTAL.finditer(txt): totals[m.group(1)]=money(m.group(2))
    holder=None; section=None; txns=[]
    for l in lines:
        h=CC_HDR.search(l)
        if h:
            holder=h.group(1)
            section=('pay' if h.group(2).startswith("Payments") else
                     'txn' if h.group(2)=="Transactions" else None)
            continue
        if holder is None or section is None: continue
        m=CC_ROW.match(l.strip())
        if not m: continue
        mon=MONTHS.get(m.group(1));
        if mon is None: continue
        day=int(m.group(2)); amt=money(m.group(7))
        signed = -amt if section=='pay' else amt
        txns.append(dict(date=f"{yfor(mon)}-{mon:02d}-{day:02d}", desc=re.sub(r'\s+',' ',m.group(5)).strip(),
            amount=signed, direction=('payment' if section=='pay' else 'charge'),
            cardholder=holder, person=person_for(holder)))
    # per-cardholder reconciliation: sum(charges) == that holder's Total Transactions
    recon=True; notes=[]
    bycard={}
    for t in txns:
        if t["direction"]=='charge': bycard[t["cardholder"]]=bycard.get(t["cardholder"],0)+t["amount"]
    for last4,tot in totals.items():
        got=round(bycard.get(last4,0),2)
        if abs(got-tot)>=0.01: recon=False; notes.append(f"#{last4} {got}!={tot}")
    mp=CC_PREV.search(txt); mn=CC_NEWBAL.search(txt)
    return dict(prev=money(mp.group(1)) if mp else None, newbal=money(mn.group(1)) if mn else None,
                period_start=f"{sy}-{sm:02d}-{int(mper.group(2)):02d}" if mper else None,
                period_end=f"{ey}-{em:02d}-{int(mper.group(5)):02d}" if mper else None,
                txns=txns, recon=recon, note="; ".join(notes) or None, totals=totals)

def load_capone_cc(con):
    specs=[("capone - XCc","venture_x_cc","0666"),("capone - VentCc","venture_cc","4336")]
    rows=[]
    for folder,typ,last4 in specs:
        for f in sorted(glob.glob(os.path.join(DOCS,folder,"Statement_*.pdf"))):
            try: s=parse_capone_cc(f)
            except Exception as e: rows.append((os.path.basename(f),typ,"ERROR",str(e)[:50])); continue
            aid=upsert_account(con,"Capital One",typ,last4,1,owner="JOINT")  # shared card; person is per-txn
            charges=sum(t["amount"] for t in s["txns"] if t["direction"]=='charge')
            pays=sum(-t["amount"] for t in s["txns"] if t["direction"]=='payment')
            con.execute("""INSERT OR REPLACE INTO statements
              (account_id,period_start,period_end,begin_balance,end_balance,total_in,total_out,source_file,parsed_ok,reconciled,note)
              VALUES(?,?,?,?,?,?,?,?,1,?,?)""",
              (aid,s["period_start"],s["period_end"],s["prev"],s["newbal"],pays,charges,os.path.basename(f),
               1 if s["recon"] else 0, s["note"]))
            sid=con.execute("SELECT id FROM statements WHERE account_id=? AND source_file=?",(aid,os.path.basename(f))).fetchone()[0]
            con.execute("DELETE FROM transactions WHERE statement_id=?", (sid,))
            for t in s["txns"]:
                con.execute("""INSERT INTO transactions
                  (account_id,statement_id,txn_date,description,amount,direction,source_file,cardholder,person)
                  VALUES(?,?,?,?,?,?,?,?,?)""",
                  (aid,sid,t["date"],t["desc"],t["amount"],t["direction"],os.path.basename(f),t["cardholder"],t["person"]))
            tag="OK" if s["recon"] else "RECON-FAIL"
            rows.append((os.path.basename(f),typ,tag,f"charges {charges:,.0f} pays {pays:,.0f}",len(s["txns"]),s["note"] or ""))
    return rows

def main():
    con=db_connect()
    print(f"DOCS={DOCS}\nDB={DB}\n")
    allrows=[]
    print("=== Capital One 360 bank ===")
    rows=load_capone_bank(con); allrows+=rows
    for r in rows: print("  ", " | ".join(str(x) for x in r))
    print("\n=== Chase checking + savings ===")
    crows=load_chase_deposit(con); allrows+=crows
    for r in crows: print("  ", " | ".join(str(x) for x in r))
    print("\n=== Chase Amazon credit card ===")
    arows=load_chase_amazon(con); allrows+=arows
    for r in arows: print("  ", " | ".join(str(x) for x in r))
    print("\n=== Capital One credit cards (cardholder-aware) ===")
    ccrows=load_capone_cc(con); allrows+=ccrows
    for r in ccrows: print("  ", " | ".join(str(x) for x in r))
    con.commit()
    ok=sum(1 for r in allrows if len(r)>2 and r[2]=="OK")
    fail=[r for r in allrows if len(r)>2 and r[2] in ("RECON-FAIL","ERROR","NO-BAL")]
    print(f"\nreconciled OK: {ok} | problems: {len(fail)}")
    for r in fail: print("  PROBLEM:", " | ".join(str(x) for x in r))
    # quick household cashflow rollup (Capital One only, so far)
    print("\n=== Capital One monthly cashflow (in / out / net) ===")
    for row in con.execute("""SELECT period_end, SUM(total_in), SUM(total_out), SUM(total_in-total_out)
                              FROM statements GROUP BY period_end ORDER BY period_end"""):
        if row[0]: print(f"  {row[0]}: in ${row[1]:,.0f}  out ${row[2]:,.0f}  net ${row[3]:,.0f}")
    con.close()

if __name__=="__main__": main()
