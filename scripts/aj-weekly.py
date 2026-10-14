#!/usr/bin/env python3
"""
scripts/aj-weekly.py — "AJ this week" digest (sibling of newsletter-scan; shares the
engine, separate job). Reads the past week's ProCare DAILY SUMMARY emails, summarizes
them with the LOCAL model into a warm parent-facing digest + an interests line, and
appends the interests line to a rolling profile. Deterministic fetch; never hangs.

Prints the digest to stdout (the .sh wrapper texts it to Dad + Mom). Use --dry-run to
preview without appending to the profile.

Usage: python3 scripts/aj-weekly.py [--days 7] [--dry-run]
"""
import imaplib, email, os, re, subprocess, sys, datetime
from email.header import decode_header
SENDER="zazunyche@gmail.com"
CREDS=os.path.expanduser("~/.zazu-email-creds")
HERMES=os.path.expanduser("~/.local/bin/hermes")
PROFILE=os.path.expanduser("~/Documents/aj-interests-profile.md")
DAYS=int(sys.argv[sys.argv.index("--days")+1]) if "--days" in sys.argv else 7
DRY="--dry-run" in sys.argv
TODAY=datetime.date.today()

def dh(m,k):
    v=m.get(k,"")
    try: return "".join(p.decode(e or "utf-8",errors="replace") if isinstance(p,bytes) else p for p,e in decode_header(v))
    except: return v

def body_text(msg):
    txt=""
    for p in (msg.walk() if msg.is_multipart() else [msg]):
        if p.get_content_type()=="text/plain":
            try: txt=p.get_payload(decode=True).decode(errors="replace"); break
            except: pass
    if not txt:
        for p in (msg.walk() if msg.is_multipart() else [msg]):
            if p.get_content_type()=="text/html":
                h=p.get_payload(decode=True).decode(errors="replace")
                h=re.sub(r'(?is)<style.*?</style>|<script.*?</script>|<head.*?</head>',' ',h)
                txt=re.sub(r'(?s)<[^>]+>',' ',h); break
    txt=re.sub(r'\*{3,}',' ',txt); txt=re.sub(r'-{3,}',' ',txt)
    return re.sub(r'\s+',' ',txt).strip()

def main():
    pw=open(CREDS).read().strip()
    since=(TODAY-datetime.timedelta(days=DAYS)).strftime("%d-%b-%Y")
    M=imaplib.IMAP4_SSL("imap.gmail.com"); M.login(SENDER,pw); M.select("INBOX")
    typ,data=M.search(None,f'(SINCE {since} FROM "procaresoftware" SUBJECT "Daily summary")')
    ids=data[0].split()
    days=[]
    for i in ids:
        x,dd=M.fetch(i,"(RFC822)"); msg=email.message_from_bytes(dd[0][1])
        subj=dh(msg,"Subject"); md=re.search(r'(\d{2}/\d{2}/\d{4})',subj)
        body=body_text(msg)
        # The daily report's "Learning Summary: ..." lines describe what AJ actually did —
        # extract them deterministically (the local model is too unreliable for free-form
        # narrative, and these reports are personal so they must NOT go to a cloud model).
        sums=re.findall(r'Learning Summary:\s*(.+?)\s*(?:Learning Outcome|Photo|Wonder Time|Early Art|Signed|Slept|Breakfast|Lunch|Snack|$)', body, re.S)
        sums=[re.sub(r'\s+',' ',s).strip().rstrip('. ') for s in sums if len(s.strip())>8]
        days.append((md.group(1) if md else "?", sums))
    M.logout()
    if not days:
        print(f"===DIGEST===\nNo AJ daily summaries in the last {DAYS} days (daycare may have been closed)."); return
    # dedupe activity lines across the week
    seen=set(); activities=[]
    for d,sums in sorted(days):
        for s in sums:
            k=s.lower()[:50]
            if k in seen: continue
            seen.add(k); activities.append(s)
    # interest themes by keyword hits
    THEMES={"animals & nature":r'animal|tree|nature|park|insect|bug|leaf|plant|outdoor|garden|weather|bird',
            "art & making":r'\bart\b|paint|draw|colou?r|sculpt|dough|craft|glue|collage|creat',
            "music & movement":r'music|sing|song|dance|march|movement|rhythm|instrument',
            "books & stories":r'book|story|read|poem|rhyme',
            "building & blocks":r'block|build|stack|tower|construct|lego',
            "numbers & shapes":r'number|count|shape|pattern|\bsort|\bmatch|size',
            "letters & language":r'letter|alphabet|\bword|\bname|writ',
            "water & sensory":r'water|sand|sensory|texture|touch|pour|splash',
            "sharing & friends":r'friend|shar|help|cooperat|\bturn|\bkind|feeling|emotion'}
    allt=" ".join(activities).lower()
    top=sorted(THEMES,key=lambda n:-len(re.findall(THEMES[n],allt)))
    top=[t for t in top if re.search(THEMES[t],allt)][:5]
    if top and not DRY:
        try:
            with open(PROFILE,"a") as f: f.write(f"- week of {TODAY.isoformat()}: {', '.join(top)}\n")
        except: pass
    dd=sorted(d for d,_ in days)
    lines=[f"🧒 AJ this week ({dd[0]}–{dd[-1]}, {len(days)} days of reports)","","What he got up to:"]
    for s in activities[:10]: lines.append(f"• {s[:130]}")
    if top: lines+=["","Interests showing up: "+", ".join(top)]
    print("===DIGEST==="); print("\n".join(lines))

if __name__=="__main__": main()
