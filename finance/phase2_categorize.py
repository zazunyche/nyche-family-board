#!/usr/bin/env python3
"""
finance/phase2_categorize.py — Phase 2b: categorize SPENDING with a pinned
taxonomy + deterministic merchant rules (first match wins). Long tail → 'Review'
(Hermes refines later). Builds the summary views. Run AFTER phase2_transfers.py.
Spending = credit-card charges + bank outflows that are NOT internal transfers.
Local only; idempotent.
"""
import sqlite3, os
DB=os.path.expanduser('~/Documents/Financial-Audit-2025-2026/finance.db')
c=sqlite3.connect(DB)

# Ordered rules: (category, [UPPERCASE substrings]). Specific before generic.
RULES = [
 ("Mortgage",        ["PENNYMAC"]),
 ("Auto loan",       ["AUTO LOAN","MODEL X"]),
 ("Childcare",       ["TWINKLE TOES","NANNY"]),
 ("Home services",   ["PROPERTY MEDICS","ASTAR HEAT","MASTER ROOTER","NORTHWEST EXTERMIN","MOXIE PEST",
                       "PEACHTREE PEST","TE CERTIFIED ELECT","ANYANSI GROUP","TOP PERFORMANCE SERVICES",
                       "HANDYMAN","PLUMB","LAWN","ROOFING"]),
 ("Savings & investments",["DIR ACH CONTRIB","PATH2COLLEGE","COLLEGE SAVINGS","529 PLAN","529 CONTRIB"]),  # e.g. GA DIR ACH CONTRIB = 529 (Dad confirmed)
 ("Utilities",       ["GA NATGAS","SPI*GA NATGAS","GEORGIA POWER","GPC PAYMENTUS","GPC ","DEKALB CO",
                       "ATT*BILL","AT&T","COMCAST","XFINITY"]),
 ("Insurance",       ["PROGRESSIVE","NORTHWESTERN M","ACRISURE","STATE FARM","GEICO","ALLSTATE",
                       "MERRIMACK INSURANCE","NORFOLK & DEDHAM"]),
 ("Taxes & govt",    ["LINK2GOVCOR","DEKALBCTY-TAXES","GW DEKALBCTY","COMPTROLLER","IRS ","DMV",
                       "PASSPORTSERVICES","MA TREASURER","TREASURER","CITY OF ","COUNTY"]),
 ("Housing/HOA",     ["PANTHER CREEK ASSOCIATIO","HOA","HOMEOWNER","ASSOCIATION DUES","HEMLANE"]),
 ("Kids/activities", ["LOVEVERY","ZOO CREW","GAME SHOW BATTLE","MICKI","CHILDREN","KIDSTOP","PLAYGROUND"]),
 ("Cash/ATM",        ["ATM WITHDRAWAL","APPLE CASH","DIGITAL CARD PURCHASE - APPLE"]),
 ("Financial/advisor",["CAPG, LLC","ADVICEPAY","CHARLES SCHWAB","FIDELITY","VANGUARD","CPA","FRAIMCPA"]),
 ("Giving/donations",["KINGDOM EMPOWERMEN","EJI.ORG","CHURCH","TITHE","DONATION"]),
 ("Groceries",       ["COSTCO","BUFORD HIGHWAY FARMERS","WHOLEFDS","WHOLE FOODS","KROGER","PUBLIX",
                       "TRADER JOE","MARINA RETAIL","HBI GHANA","MALLAM"]),
 ("Dining",          ["RESTAURANT","CAFE","COFFEE","STARBUCKS","PATE A CHOUX","QUATTRO LOUNGE","ALLEY BAR",
                       "HONEY SUCKLE","TRIBECA","KENZO","NANDOS","BLOOM BAR","BLU PENGUIN","POLO BEACH",
                       "ILONA HOSPITALITY","THEIA","TOTAL MALLAM","BAR ","GRILL","PIZZA","WONDER*",
                       "OMAKASE","OSUMA SUYA","BASSMENT","TST*","F&B","SUYA","DOORDASH","UBER EATS"]),
 ("Beauty/personal", ["STYLES BY","BARBER","NAILS GEEK","GIGI LUXURY SPA","MASSAGE ENVY","SALON","SPA"]),
 ("Travel",          ["DELTA AIR","HERTZ","AIRBNB","MARRIOTT","HILTON","UNITED AIR","EXPEDIA","HOTEL",
                       "BUDGET RENT A CAR","RESIDENCE INN","CROWNE PLAZA","EUROSTAR","RENT A CAR","INN "]),
 ("Transport/fuel",  ["SHELL","CHEVRON","EXXON","QUIKTRIP","UBER","LYFT","MARTA","PARKING","TOLL"]),
 ("Health/medical",  ["CHOA","MED*","PHR*","PHARMACY","CVS","WALGREENS","DENTAL","HOSPITAL","CLINIC",
                       "PASSPORT HEALTH","UROLOGY","EMBRYO","OPTIO","MEDICAL"]),
 ("Shopping",        ["AMAZON","AMZN","TARGET","WALMART","ZARA","OLD NAVY","DECATHLON","WYZE","BEST BUY",
                       "APPLE.COM","IKEA","HOME DEPOT","LOWES"]),
 ("Subscriptions",   ["KINDLE","SIMPLISAFE","NETFLIX","SPOTIFY","HULU","ICLOUD","GOOGLE *","PRIME VIDEO",
                       "LUMEN","PAYPAL *LUMEN"]),
 ("Auto/BMW",        ["GLOBAL IMPORTS BMW","BMW","AUTONATION","TIRE","JIFFY LUBE"]),
 ("Transfers to people",["ZELLE MONEY SENT","ZELLE TO"]),  # payments to individuals (support/gifts/services)
 ("Bank fees/interest",["INTEREST CHARGE","ANNUAL FEE","LATE FEE","SERVICE FEE","FOREIGN TRANS"]),
]

c.execute("UPDATE transactions SET category=NULL")
def categorize(desc):
    u=(desc or "").upper()
    for cat,subs in RULES:
        if any(s in u for s in subs): return cat
    return "Review"

# spending rows: CC charges, or bank outflows that are not transfers
rows=c.execute("""SELECT t.id, t.description FROM transactions t JOIN accounts a ON a.id=t.account_id
   WHERE (a.is_credit=1 AND t.direction='charge') OR (a.is_credit=0 AND t.amount<0 AND t.is_transfer=0)""").fetchall()
for tid,desc in rows:
    c.execute("UPDATE transactions SET category=? WHERE id=?", (categorize(desc), tid))
c.commit()

def spend_amt(sql_where, params=()):
    return c.execute(f"""SELECT COALESCE(SUM(CASE WHEN a.is_credit=1 THEN t.amount ELSE -t.amount END),0)
       FROM transactions t JOIN accounts a ON a.id=t.account_id
       WHERE ((a.is_credit=1 AND t.direction='charge') OR (a.is_credit=0 AND t.amount<0 AND t.is_transfer=0))
       AND {sql_where}""", params).fetchone()[0]

total=spend_amt("1=1")
reviewed=spend_amt("t.category!='Review'")
print(f"Spending categorized: ${reviewed:,.0f} of ${total:,.0f}  ({100*reviewed/total:.0f}% covered; rest = Review)")
print("\n=== spend by category (2025-26, CC charges + external bank debits) ===")
for r in c.execute("""SELECT t.category, SUM(CASE WHEN a.is_credit=1 THEN t.amount ELSE -t.amount END) s, COUNT(*)
   FROM transactions t JOIN accounts a ON a.id=t.account_id
   WHERE (a.is_credit=1 AND t.direction='charge') OR (a.is_credit=0 AND t.amount<0 AND t.is_transfer=0)
   GROUP BY t.category ORDER BY s DESC"""):
    print(f"  {r[0]:22} ${r[1]:>10,.0f}  ({r[2]} txns)")
print("\n=== per-person credit-card spend ===")
for r in c.execute("""SELECT COALESCE(person,'(bank)'), SUM(amount), COUNT(*) FROM transactions t
   JOIN accounts a ON a.id=t.account_id WHERE a.is_credit=1 AND t.direction='charge'
   GROUP BY person ORDER BY 2 DESC"""):
    print(f"  {r[0]:8} ${r[1]:>10,.0f}  ({r[2]} charges)")
print("\n=== biggest single expenses (review-worthy) ===")
for r in c.execute("""SELECT t.txn_date, t.category, ROUND(CASE WHEN a.is_credit=1 THEN t.amount ELSE -t.amount END) amt, substr(t.description,1,34)
   FROM transactions t JOIN accounts a ON a.id=t.account_id
   WHERE (a.is_credit=1 AND t.direction='charge') OR (a.is_credit=0 AND t.amount<0 AND t.is_transfer=0)
   ORDER BY amt DESC LIMIT 10"""):
    print(f"  {r[0]}  ${r[2]:>8,.0f}  {r[1]:16} {r[3]}")
c.close()
