#!/usr/bin/env python3
"""Email the daily report to Matías (from matias@webcrafts.page via Zoho). Usage: report_mail.py "subject" report.md
The report is simple markdown (bold, ### headings, - lists): it goes as HTML for the phone, with a clean plain-text copy."""
import html, os, re, smtplib, ssl, sys
from email.message import EmailMessage


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


md = open(sys.argv[2]).read()
m = EmailMessage()
m["From"] = f"WebCrafts bot <{os.environ['ZOHO_SMTP_USER']}>"
m["To"] = os.environ.get("REPORT_TO", "osuna.devs@gmail.com")
m["Subject"] = sys.argv[1]
m.set_content(to_text(md))
m.add_alternative(to_html(md), subtype="html")
with smtplib.SMTP_SSL("smtppro.zoho.com", 465, context=ssl.create_default_context(), timeout=30) as s:
    s.login(os.environ["ZOHO_SMTP_USER"], os.environ["ZOHO_SMTP_PASS"])
    s.send_message(m)
