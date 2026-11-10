#!/usr/bin/env python3
"""
Regression test for the ProCare / Primrose "FYI" skip filter in scripts/email-scan.py.

WHY THIS EXISTS
---------------
ProCare childcare notifications (daily summaries, activity reports) are pure FYI but
repeatedly leaked into the board as actionable tasks/events, polluting the overdue /
stale / resistance lists with daily noise. Two real leaks had to be hand-closed:
  - t_x8atspk  "Childcare summary for Aiden"      (even got a calendar event)
  - t_0485p92  "Review Aiden's daily summary"
and the gmail-scan log shows the same class arriving as "Daily summary for 11/03/2026
- Aiden" and "Childcare summary for Aiden - 2026-11-04".

The root cause was that these summaries arrive *forwarded* (the From header is the
forwarder, not procaresoftware) or *center-branded* (Primrose), so a From-only filter
was bypassed. The fix (PROCARE_FYI subject match AND PROCARE_CTX context match against
From + body) was verified once with ad-hoc tests that were then discarded. This file
makes that coverage durable, using the ACTUAL subjects that leaked in production, so
the leak class cannot silently regress.

It calls the live is_procare_fyi() from email-scan.py, so breakage fails here whether it
is a loosened PROCARE_FYI (e.g. dropping "childcare summary"), a narrowed PROCARE_CTX, OR
a change to the drop logic itself (AND->OR, dropping the From+body context check).

Run: python3 scripts/tests/test_email_scan_fyi.py   (exit 0 = all pass)
No network, no IMAP — email-scan.py guards its IMAP work behind __main__.
"""
import importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCAN = os.path.normpath(os.path.join(HERE, "..", "email-scan.py"))

spec = importlib.util.spec_from_file_location("email_scan", SCAN)
es = importlib.util.module_from_spec(spec)
spec.loader.exec_module(es)  # safe: IMAP runs only under `if __name__=="__main__"`


def is_fyi_dropped(subj, frm="", body=""):
    """Calls the PRODUCTION drop decision directly — es.is_procare_fyi(), the same
    function main() uses to skip a message. Exercising the real function (not a
    reimplementation of the boolean) means breakage to the AND/body-check combination in
    email-scan.py — not just a loosened regex — fails here too. main() passes body_text(msg)
    as the body arg; this test supplies the already-extracted body text equivalently."""
    return es.is_procare_fyi(subj, frm, body)


# (name, subject, from, body, expected_dropped)
CASES = [
    # --- REAL production leaks: MUST be dropped (expected_dropped=True) ---
    ("leak_childcare_summary_direct",
     "Childcare summary for Aiden", "notifications@procaresoftware.com", "", True),
    ("leak_childcare_summary_forwarded",   # From is the forwarder; procare only in body
     "Fwd: Childcare summary for Aiden - 2026-11-04", "nconduah2@gmail.com",
     "Begin forwarded message: From: Primrose School <no-reply@procaresoftware.com>", True),
    ("leak_review_daily_summary",
     "Review Aiden's daily summary", "nconduah2@gmail.com",
     "Your Procare daily summary is ready", True),
    ("leak_daily_summary_for_date",
     "Daily summary for 11/03/2026 - Aiden AJ Essilfie-Conduah",
     "no-reply@procaresoftware.com", "", True),
    ("leak_center_branded_primrose",       # Primrose branding, no procaresoftware string
     "Daily report for your child", "frontdesk@primrose-smyrna.com",
     "Primrose School of Smyrna daily report", True),
    ("leak_activity_report",
     "Activity report - Aiden", "no-reply@procaresoftware.com", "", True),

    # --- Actionable ProCare/Primrose mail: MUST flow through (expected_dropped=False) ---
    ("actionable_evacuation",              # the real Nov-18 Safe School Evacuation item
     "Safe School Evacuation", "office@primrose-smyrna.com",
     "Primrose School evacuation drill notification for November 18th", False),
    ("actionable_invoice",
     "Your Procare invoice is due", "billing@procaresoftware.com",
     "Primrose tuition payment due", False),
    ("actionable_permission_slip",
     "Permission slip needed for field trip", "office@primrose-smyrna.com",
     "Please sign the attached Procare permission slip", False),
    ("actionable_incident",
     "Incident report for Aiden", "office@primrose-smyrna.com",
     "A Procare incident report requires your acknowledgement", False),

    # --- Over-filter guard: unrelated third party with "summary for" but NO procare/
    #     primrose context must NOT be dropped (would be a silent data-loss bug) ---
    ("unrelated_summary_for_no_context",
     "Summary for your bank account", "statements@somebank.com",
     "Your monthly account summary is attached", False),
    ("unrelated_newsletter_no_context",
     "Our weekly newsletter", "news@localpaper.com",
     "This week's community newsletter", False),
]


def main():
    failures = []
    for name, subj, frm, body, expected in CASES:
        got = is_fyi_dropped(subj, frm, body)
        status = "ok " if got == expected else "FAIL"
        if got != expected:
            failures.append((name, expected, got))
        print(f"  [{status}] {name:38s} dropped={got} (expected {expected})")
    print()
    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for name, exp, got in failures:
            print(f"  - {name}: expected dropped={exp}, got {got}")
        sys.exit(1)
    print(f"All {len(CASES)} cases pass — ProCare FYI filter correctly classifies "
          "real production leak subjects and lets actionable mail through.")


if __name__ == "__main__":
    main()
