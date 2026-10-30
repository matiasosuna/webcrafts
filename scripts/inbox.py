#!/usr/bin/env python3
"""Read matias@webcrafts.page (Zoho IMAP, read-only: BODY.PEEK, nothing is marked or deleted).
- Replies are listed (the daily GitHub issue shows them). Opt-outs and bounces go to the D1 `suppress` table.
- Sent folder: any business we emailed by hand or from the old Mac script gets sites.sent_at, so the Worker never emails it twice.
Needs ZOHO_SMTP_USER / ZOHO_SMTP_PASS (env, or ~/ingresos-analisis/.env).
"""
import email, imaplib, json, os, re, subprocess, sys, time
from email.header import decode_header, make_header
from email.utils import parseaddr, getaddresses, parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEEN = ROOT / "data/inbox_seen.json"
OPTOUT = re.compile(r"^\s*(no|nope|no thanks|not interested|stop|unsubscribe|remove( me)?)\b", re.I)
BOUNCE = re.compile(r"mailer-daemon|postmaster", re.I)


def env():
    e = {k: os.environ[k] for k in ("ZOHO_SMTP_USER", "ZOHO_SMTP_PASS") if os.environ.get(k)}
    f = Path.home() / "ingresos-analisis/.env"
    if len(e) < 2 and f.exists():
        e = {**dict(l.split("=", 1) for l in f.read_text().splitlines() if "=" in l and not l.startswith("#")), **e}
    return e


def d1(sql):
    out = subprocess.run(["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--json", "--command", sql],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out[out.index("[\n"):])[0]["results"]


q = lambda s: "'" + s.replace("'", "''") + "'"


def body_of(m):
    for part in (m.walk() if m.is_multipart() else [m]):
        if part.get_content_type() == "text/plain":
            return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore")
    return ""


def fetch(im, folder, last=300):
    if im.select(folder, readonly=True)[0] != "OK":
        return
    _, ids = im.search(None, "ALL")
    for i in ids[0].split()[-last:]:
        _, d = im.fetch(i, "(BODY.PEEK[])")
        yield i, email.message_from_bytes(d[0][1])


def main():
    e = env()
    if not e.get("ZOHO_SMTP_PASS"):
        sys.exit("no Zoho password: skipping inbox")
    seen = set(json.loads(SEEN.read_text())) if SEEN.exists() and SEEN.read_text().strip() else set()
    im = imaplib.IMAP4_SSL("imappro.zoho.com", 993)
    im.login(e["ZOHO_SMTP_USER"], e["ZOHO_SMTP_PASS"])

    # 1. who did we already email? (Sent folder)
    sites = {r["email"]: r["slug"] for r in d1("SELECT slug, lower(email) AS email FROM sites WHERE sent_at IS NULL AND email IS NOT NULL")}
    marks = {}
    for _, m in fetch(im, "Sent", 500):
        for _, to in getaddresses(m.get_all("To", [])):
            slug = sites.get(to.lower())
            if slug and slug not in marks:
                try:
                    marks[slug] = int(parsedate_to_datetime(m["Date"]).timestamp())
                except Exception:
                    marks[slug] = int(time.time())
    for slug, ts in marks.items():
        d1(f"UPDATE sites SET sent_at = {ts} WHERE slug = {q(slug)} AND sent_at IS NULL")
    if marks:
        print(f"marked as already emailed: {', '.join(sorted(marks))}", file=sys.stderr)

    # 2. replies, opt-outs, bounces
    new, supp = [], []
    for i, m in fetch(im, "INBOX"):
        mid = m.get("Message-ID") or i.decode()
        if mid in seen:
            continue
        seen.add(mid)
        frm = parseaddr(m.get("From"))[1].lower()
        if "dmarc" in frm:  # deliverability reports from Gmail/Outlook, not people
            continue
        subj = str(make_header(decode_header(m.get("Subject") or "")))
        text = body_of(m).strip()
        first = next((l for l in text.splitlines() if l.strip() and not l.startswith(">")), "")
        if BOUNCE.search(frm):
            ours = {r["email"] for r in d1("SELECT lower(email) AS email FROM sites WHERE email IS NOT NULL")}
            bad = next((b.lower() for b in re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", text) if b.lower() in ours), None)
            if bad:
                supp.append((bad, "bounce"))
            kind = "BOUNCE"
        elif OPTOUT.search(first) or "unsubscribe" in subj.lower():
            supp.append((frm, "opt-out"))
            kind = "OPT-OUT"
        else:
            kind = "REPLY"
        new.append((kind, frm, subj, first[:200]))
    im.logout()
    for addr, why in supp:
        d1(f"INSERT OR IGNORE INTO suppress (email, why, created_at) VALUES ({q(addr)}, {q(why)}, {int(time.time())})")
    SEEN.parent.mkdir(exist_ok=True)
    SEEN.write_text(json.dumps(sorted(seen)))
    for k, frm, subj, first in new:
        print(f"- **{k}** {frm} — {subj} — {first}")
    print(f"{len(new)} new emails", file=sys.stderr)


if __name__ == "__main__":
    main()
