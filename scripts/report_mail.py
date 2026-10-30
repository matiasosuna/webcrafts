#!/usr/bin/env python3
"""Email the daily report to Matías (from matias@webcrafts.page via Zoho). Usage: report_mail.py "subject" report.md"""
import os, smtplib, ssl, sys
from email.message import EmailMessage

m = EmailMessage()
m["From"] = f"WebCrafts bot <{os.environ['ZOHO_SMTP_USER']}>"
m["To"] = os.environ.get("REPORT_TO", "osuna.devs@gmail.com")
m["Subject"] = sys.argv[1]
m.set_content(open(sys.argv[2]).read())
with smtplib.SMTP_SSL("smtppro.zoho.com", 465, context=ssl.create_default_context(), timeout=30) as s:
    s.login(os.environ["ZOHO_SMTP_USER"], os.environ["ZOHO_SMTP_PASS"])
    s.send_message(m)
