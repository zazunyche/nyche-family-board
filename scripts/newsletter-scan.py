#!/usr/bin/env python3
"""
scripts/newsletter-scan.py — DETERMINISTIC school-newsletter reader.
Replaces the headless-claude+Gmail-MCP flow that hung silently. Pipeline:
  IMAP fetch Primrose/ProCare newsletters (reliable) -> extract events with the
  LOCAL model (reliable, no cloud MCP) -> keep FUTURE events -> add to Apple
  "Family" calendar (deduped vs existing Primrose events that day) -> print digest.
Never hangs; always reports. Local model is slow (~min/newsletter) but newsletters
are ~monthly and already-processed ones are skipped.

Usage: python3 scripts/newsletter-scan.py [--since-days N] [--all] [--dry-run]
Prints a digest (stdout); the .sh wrapper relays it to Dad.
"""
import imaplib, email, os, re, subprocess, sys, json, datetime
SENDER="zazunyche@gmail.com"
CREDS=os.path.expanduser("~/.zazu-email-creds")
PROCESSED=os.path.expanduser("~/.zazu-newsletter-processed.json")
HERMES=os.path.expanduser("~/.local/bin/hermes")
SINCE_DAYS=int(sys.argv[sys.argv.index("--since-days")+1]) if "--since-days" in sys.argv else 45
ALL="--all" in sys.argv; DRY="--dry-run" in sys.argv
TODAY=datetime.date.today()
MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"]
DATE_RE=re.compile(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}',re.I)

def body_text(msg):
    html=""
    for p in (msg.walk() if msg.is_multipart() else [msg]):
        if p.get_content_type()=="text/html":
            try: html=p.get_payload(decode=True).decode(errors="replace"); break
            except: pass
    html=re.sub(r'(?is)<style.*?</style>|<script.*?</script>|<head.*?</head>',' ',html)
    t=re.sub(r'(?s)<[^>]+>',' ',html); t=re.sub(r'&nbsp;|&#160;',' ',t); t=re.sub(r'&amp;','&',t)
    return re.sub(r'\s+',' ',t).strip()

def _q(s): return '"'+s.replace('\\','\\\\').replace('"','\\"')+'"'
def load_processed():
    try: return set(json.load(open(PROCESSED)))
    except: return set()
def save_processed(s):
    try: json.dump(sorted(s),open(PROCESSED,"w"))
    except: pass

def extract_events(text, year):
    """LOCAL model -> list of {date,time,title}. Returns (events, ok)."""
    prompt=(f"The year is {year}. From this school newsletter, extract ONLY concrete dated events parents "
      f"should put on a calendar. Return STRICT JSON: an array of objects "
      f'{{"date":"YYYY-MM-DD","time":"H:MMpm or null","title":"short event name"}}. '
      f"Ignore staff intros, generic prose, and signup deadlines. Output ONLY the JSON array.\n\nNEWSLETTER:\n"+text[:6000])
    try:
        r=subprocess.run([HERMES,"-z",prompt,"-t","todo","-m","qwen3:4b","--provider","ollama","--in","/tmp"],
                         capture_output=True,text=True,timeout=600)
        out=r.stdout
        mm=re.search(r'\[.*\]',out,re.S)
        if not mm: return [],False
        arr=json.loads(mm.group(0))
        clean=[]
        for e in arr:
            d=e.get("date");
            if not d or not re.match(r'\d{4}-\d{2}-\d{2}',str(d)): continue
            clean.append({"date":d[:10],"time":(e.get("time") or None),"title":(e.get("title") or "event")[:60]})
        return clean,True
    except Exception:
        return [],False

def cal_has_primrose(d):
    osa=(f'tell application "Calendar" to tell calendar "Family"\n set c to 0\n set d0 to current date\n'
         f' set year of d0 to {d.year}\n set month of d0 to {MONTHS[d.month-1]}\n set day of d0 to {d.day}\n'
         f' set hours of d0 to 0\n set minutes of d0 to 0\n set seconds of d0 to 0\n set d1 to d0 + 1 * days\n'
         f' repeat with e in (every event whose start date ≥ d0 and start date < d1)\n'
         f'  if summary of e contains "Primrose" then set c to c + 1\n end repeat\n return c\nend tell')
    try: return int(subprocess.run(["osascript","-e",osa],capture_output=True,text=True).stdout.strip())>0
    except: return False

def add_event(title,d,timestr):
    hh,mm,allday=9,0,True
    mt=re.search(r'(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m',(timestr or ""),re.I)
    if mt:
        hh=int(mt.group(1)); mm=int(mt.group(2) or 0)
        if mt.group(3).lower()=="p" and hh<12: hh+=12
        allday=False
    osa=(f'tell application "Calendar" to tell calendar "Family"\n set d to current date\n'
         f' set year of d to {d.year}\n set month of d to {MONTHS[d.month-1]}\n set day of d to {d.day}\n'
         f' set hours of d to {hh}\n set minutes of d to {mm}\n set seconds of d to 0\n'
         f' make new event with properties {{summary:{_q(title)}, start date:d, end date:(d + 90 * minutes)'
         f'{", allday event:true" if allday else ""}}}\nend tell')
    if not DRY: subprocess.run(["osascript","-e",osa],capture_output=True)

def main():
    pw=open(CREDS).read().strip()
    since=(TODAY-datetime.timedelta(days=SINCE_DAYS)).strftime("%d-%b-%Y")
    M=imaplib.IMAP4_SSL("imap.gmail.com"); M.login(SENDER,pw); M.select("INBOX")
    typ,data=M.search(None,f'(SINCE {since} FROM "procaresoftware" SUBJECT "newsletter")')
    ids=data[0].split()
    processed=load_processed()
    added=[]; past=0; parsefail=[]; scanned=0
    for i in ids:
        x,dd=M.fetch(i,"(RFC822)"); msg=email.message_from_bytes(dd[0][1])
        mid=msg.get("Message-ID","").strip()
        if mid and mid in processed and not ALL: continue
        scanned+=1
        year=email.utils.parsedate_to_datetime(msg["Date"]).year
        text=body_text(msg)
        events,ok=extract_events(text,year)
        if not ok:
            cand=sorted(set(DATE_RE.findall(text)))
            parsefail.append((msg.get("Subject",""),cand[:8]))
            continue
        for e in events:
            try: d=datetime.date.fromisoformat(e["date"])
            except: continue
            if d<TODAY: past+=1; continue
            if cal_has_primrose(d): continue
            title=e["title"] if e["title"].lower().startswith(("aj","primrose")) else "AJ Primrose: "+e["title"]
            add_event(title,d,e["time"])
            added.append((e["date"],title,e["time"] or "all day"))
        if mid: processed.add(mid)
    M.logout()
    if not DRY: save_processed(processed)
    # digest
    if added:
        print(f"Added {len(added)} upcoming Primrose event(s) to the Family calendar (skipped {past} past):")
        for d,t,tm in sorted(added): print(f"  • {d} — {t} ({tm})")
    else:
        print(f"No new upcoming Primrose events to add (scanned {scanned} new newsletter(s), {past} past skipped).")
    if parsefail:
        print("\n⚠ Could not auto-parse these (review manually):")
        for subj,cand in parsefail: print(f"  • {subj} — dates seen: {', '.join(cand) or 'none'}")

if __name__=="__main__": main()
