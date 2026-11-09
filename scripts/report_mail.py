#!/usr/bin/env python3
"""Queue the daily report for Matías. Usage: report_mail.py "subject" report.md
It goes into the D1 outbox; the Worker emails it from matias@webcrafts.page (Cloudflare Email Service) on its next
cron run (every 20 min in US hours), only to Matías. The report is simple markdown (bold, ### headings, - lists):
it goes as HTML for the phone, with a clean plain-text copy."""
import html, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def to_html(md):
    out, in_list = [], False
    for line in md.splitlines():
        t = html.escape(line)
        t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
        t = re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', t)
        if line.startswith("- "):
            if not in_list:
                out.append('<ul style="padding-left:18px;margin:0 0 10px">')
                in_list = True
            out.append(f'<li style="margin:5px 0">{t[2:]}</li>')
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        if line.startswith("### "):
            out.append(f'<h3 style="font-size:16px;margin:18px 0 6px">{t[4:]}</h3>')
        elif line.strip():
            out.append(f'<p style="margin:0 0 10px">{t}</p>')
    if in_list:
        out.append("</ul>")
    return '<div style="font:15px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#1d1b18">' + "".join(out) + "</div>"


def to_text(md):
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", md)
    return re.sub(r"(?m)^### ", "", t)


q = lambda s: "'" + s.replace("'", "''") + "'"
md = open(sys.argv[2]).read()
f = ROOT / "data/.outbox.sql"
f.parent.mkdir(exist_ok=True)
f.write_text(f"INSERT INTO outbox (subject, text, html, created_at) VALUES ({q(sys.argv[1])}, {q(to_text(md))}, {q(to_html(md))}, {int(time.time())});")
subprocess.run(["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--json", "--file", str(f)], cwd=ROOT, capture_output=True, check=True)
f.unlink()
