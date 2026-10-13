#!/usr/bin/env python3
"""
scripts/email-scan.py — DETERMINISTIC household email scanner.
Replaces the headless-claude+Gmail-MCP gmail-scan that hung silently. Pipeline:
  IMAP fetch recent emails (reliable) -> CODE pre-filters to household-relevant
  candidates -> ONE batched LOCAL-model classification call (reliable, no cloud MCP)
  -> create board tasks (add.js) + Family calendar events (osascript) for actionable
  items -> print a digest. Dedupe via processed message-ids. Never hangs.

Conservative by design: only acts on clearly-actionable household mail; everything
is listed in the digest so nothing is created invisibly. Newsletters (ProCare) are
handled separately by newsletter-scan.py and are excluded here.

Usage: python3 scripts/email-scan.py [--hours N] [--dry-run]
"""
import imaplib, email, os, re, subprocess, sys, json, datetime
from email.header import decode_header
SENDER="zazunyche@gmail.com"
CREDS=os.path.expanduser("~/.zazu-email-creds")
PROCESSED=os.path.expanduser("~/.zazu-email-processed.json")
HERMES=os.path.expanduser("~/.local/bin/hermes")
BOARD=os.path.expanduser("~/Documents/src/family-board")
HOURS=int(sys.argv[sys.argv.index("--hours")+1]) if "--hours" in sys.argv else 12
DRY="--dry-run" in sys.argv
TODAY=datetime.date.today()
MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"]

# household-relevant sender hints (besides Fwd:/FW: and Mom). ProCare newsletters excluded (handled elsewhere).
RELEVANT=re.compile(r'(school|daycare|primrose|procare|hoa|homeowner|association|'
  r'pediatric|dental|clinic|hospital|appointment|insurance|acrisure|'
  r'georgiapower|ga power|natgas|water|utility|comcast|xfinity|at&t|'
  r'invoice|statement|bill|dmv|county|school|teacher|classroom)', re.I)
NOISE=re.compile(r'(no-?reply.*(promo|marketing|deals)|unsubscribe-only|newsletter@|marketing@)', re.I)

def hdr(m,k):
    v=m.get(k,"")
    try: return "".join(p.decode(e or "utf-8",errors="replace") if isinstance(p,bytes) else p for p,e in decode_header(v))
    except: return v

def body_text(msg):
    txt=""
    for p in (msg.walk() if msg.is_multipart() else [msg]):
        ct=p.get_content_type()
        if ct=="text/plain":
            try: txt=p.get_payload(decode=True).decode(errors="replace"); break
            except: pass
    if not txt:
        for p in (msg.walk() if msg.is_multipart() else [msg]):
            if p.get_content_type()=="text/html":
                h=p.get_payload(decode=True).decode(errors="replace")
                h=re.sub(r'(?is)<style.*?</style>|<script.*?</script>|<head.*?</head>',' ',h)
                txt=re.sub(r'(?s)<[^>]+>',' ',h); break
    return re.sub(r'\s+',' ',txt).strip()

def load_processed():
    try: return set(json.load(open(PROCESSED)))
    except: return set()
def save_processed(s):
    try: json.dump(sorted(s)[-500:],open(PROCESSED,"w"))
    except: pass

def classify(cands):
    """ONE batched local-model call. cands: list of dicts {i,from,subject,body}. Returns list of classifications."""
    blob="\n\n".join(f"EMAIL {c['i']}:\nFrom: {c['from']}\nSubject: {c['subject']}\nBody: {c['body'][:900]}" for c in cands)
    prompt=(f"Today is {TODAY.isoformat()}. You are a family household assistant. For EACH email below decide if it needs a "
      f"household action. Return STRICT JSON: an array of "
      f'{{"i":<email number>,"action":"event|task|maybe|skip","title":"short action title","category":"HOME|VEHICLES|FAMILY|ADMIN|YARD|GOALS",'
      f'"owner":"DAD|MOM|BOTH","due":"YYYY-MM-DD or null","date":"YYYY-MM-DD or null","time":"H:MMpm or null","notes":"1-line context"}}. '
      f'Rules: "event" = clearly needs action AND has a specific date to attend/do something. '
      f'"task" = clearly needs action, no hard date. '
      f'"maybe" = MIGHT need an action or follow-up but you are not sure — use "maybe" (never "skip") for anything that could matter. '
      f'"skip" = ONLY clearly no-action mail: marketing/promos, receipts for completed purchases, social notifications, newsletters. '
      f'When in any doubt, choose "maybe" so a human can confirm. Output ONLY the JSON array.\n\n'+blob)
    try:
        r=subprocess.run([HERMES,"-z",prompt,"-t","todo","-m","qwen3:4b","--provider","ollama","--in","/tmp"],
                         capture_output=True,text=True,timeout=600)
        mm=re.search(r'\[.*\]',r.stdout,re.S)
        return (json.loads(mm.group(0)) if mm else []),True
    except Exception as e:
        return [],False

def add_task(c):
    args=["node",os.path.join(BOARD,"board-tools","add.js"),"--title",c.get("title","Follow up (email)"),
          "--category",(c.get("category") or "ADMIN"),"--owner",(c.get("owner") or "BOTH"),
          "--priority","MEDIUM","--stage","ACTIVE","--source","email","--actor","ZAZU",
          "--notes",(c.get("notes") or "")[:300]]
    if c.get("due") and re.match(r'\d{4}-\d{2}-\d{2}',str(c["due"])): args+=["--due",c["due"]]
    if DRY: return "(dry-run) "+c.get("title","")
    out=subprocess.run(args,capture_output=True,text=True).stdout
    m=re.search(r't_[a-z0-9]+',out); return m.group(0) if m else "?"

def add_event(c):
    d=None
    try: d=datetime.date.fromisoformat(c["date"][:10])
    except: return
    hh,mm,allday=9,0,True
    mt=re.search(r'(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m',(c.get("time") or ""),re.I)
    if mt:
        hh=int(mt.group(1)); mm=int(mt.group(2) or 0)
        if mt.group(3).lower()=="p" and hh<12: hh+=12
        allday=False
    title=c.get("title","Household event")
    osa=(f'tell application "Calendar" to tell calendar "Family"\n set d to current date\n'
         f' set year of d to {d.year}\n set month of d to {MONTHS[d.month-1]}\n set day of d to {d.day}\n'
         f' set hours of d to {hh}\n set minutes of d to {mm}\n set seconds of d to 0\n'
         f' make new event with properties {{summary:"{title[:60].replace(chr(34),chr(39))}", start date:d, end date:(d + 90 * minutes)'
         f'{", allday event:true" if allday else ""}}}\nend tell')
    if not DRY: subprocess.run(["osascript","-e",osa],capture_output=True)

def main():
    pw=open(CREDS).read().strip()
    since=(datetime.datetime.now()-datetime.timedelta(hours=HOURS)).strftime("%d-%b-%Y")
    M=imaplib.IMAP4_SSL("imap.gmail.com"); M.login(SENDER,pw); M.select("INBOX")
    typ,data=M.search(None,f'(SINCE {since})')
    ids=data[0].split(); processed=load_processed()
    cands=[]; raw={}
    for n,i in enumerate(ids):
        x,dd=M.fetch(i,"(RFC822)"); msg=email.message_from_bytes(dd[0][1])
        mid=msg.get("Message-ID","").strip()
        if not mid or mid in processed: continue
        frm=hdr(msg,"From"); subj=hdr(msg,"Subject")
        if "procaresoftware" in frm.lower() and "newsletter" in subj.lower(): processed.add(mid); continue  # handled by newsletter-scan
        fwd=bool(re.match(r'\s*(fwd?|fw):',subj,re.I))
        if not (fwd or RELEVANT.search(frm+" "+subj)) or NOISE.search(frm):
            processed.add(mid); continue
        idx=len(cands); cands.append({"i":idx,"from":frm[:80],"subject":subj[:120],"body":body_text(msg)})
        raw[idx]=mid
    M.logout()
    if not cands:
        print("No new household-relevant emails to process.");
        if not DRY: save_processed(processed)
        return
    cls,ok=classify(cands)
    created=[]; needs=[]; skipped=0; skipped_subj=[]
    byi={c["i"]:c for c in cls if isinstance(c,dict) and "i" in c}
    for idx,cand in enumerate(cands):
        c=byi.get(idx); act=(c or {}).get("action")
        if act=="event":
            tid=add_task(c); add_event(c); created.append(("event",c.get("title"),c.get("date"),tid))
        elif act=="task":
            tid=add_task(c); created.append(("task",c.get("title"),c.get("due") or "no date",tid))
        elif act=="skip":
            skipped+=1; skipped_subj.append(cand["subject"])
        else:  # "maybe", missing, or unparseable -> SURFACE for confirmation, never silently drop
            needs.append({"subject":cand["subject"],"from":cand["from"],"why":(c or {}).get("notes") or (c or {}).get("title") or "unclassified"})
        if idx in raw: processed.add(raw[idx])
    if not DRY:
        save_processed(processed)
        try: json.dump({"at":TODAY.isoformat(),"needs":needs},open(os.path.expanduser("~/.zazu-email-pending.json"),"w"))
        except: pass
    # audit trail: log what was skipped as non-actionable
    for s in skipped_subj: print(f"[skip] {s}", file=sys.stderr)
    # digest
    if created or needs:
        if created:
            print(f"Added {len(created)} item(s) to the board/calendar:")
            for kind,title,when,tid in created: print(f"  • [{kind}] {title} — {when} ({tid})")
        if needs:
            print(f"\n❓ {len(needs)} item(s) I'm unsure about — reply and I'll add or drop:")
            for n in needs: print(f"  • {n['subject']}  (from {n['from'].split('<')[0].strip()})")
        print(f"\n(auto-skipped {skipped} clearly non-actionable; logged for audit)")
    else:
        print(f"Scanned {len(cands)} household email(s): {skipped} clearly non-actionable, 0 uncertain. parse_ok={ok}")

if __name__=="__main__": main()
