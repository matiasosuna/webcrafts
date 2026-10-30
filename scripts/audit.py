#!/usr/bin/env python3
"""Visit each lead's website: find a contact email, score how dated the site is, and keep its own text.
Usage: audit.py data/austin.jsonl data/austin.audit.jsonl
"""
import concurrent.futures as cf, html, json, re, ssl, sys, urllib.request, urllib.parse
from datetime import date

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
CTX = ssl.create_default_context()
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
BAD_EMAIL = re.compile(r"(example\.|sentry|wixpress|@2x|\.png|\.jpg|\.gif|\.webp|domain\.com|yourname|email\.com|godaddy|squarespace|wordpress|cloudflare)", re.I)
PHONE_RE = re.compile(r"\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b")
YEAR = date.today().year
FREEMAIL = {"gmail.com", "yahoo.com", "aol.com", "hotmail.com", "outlook.com", "icloud.com", "att.net", "sbcglobal.net", "comcast.net", "live.com", "msn.com", "me.com", "verizon.net", "bellsouth.net", "earthlink.net"}


def get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        ct = r.headers.get("content-type", "")
        if "html" not in ct and ct:
            return r.geturl(), ""
        return r.geturl(), r.read(600_000).decode("utf-8", "ignore")



def text_of(h):
    h = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", h)
    return h


def tags(h, tag):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m))).strip() for m in re.findall(rf"(?is)<{tag}[^>]*>(.*?)</{tag}>", h)]


def emails_in(h, domain):
    found = set(m.lower() for m in re.findall(r'mailto:([^"\'?>\s]+)', h, re.I))
    found |= set(m.lower() for m in EMAIL_RE.findall(html.unescape(re.sub(r"<[^>]+>", " ", h))))
    found = {urllib.parse.unquote(e).strip(".") for e in found if not BAD_EMAIL.search(e) and len(e) < 60}
    # prefer the business's own domain, then common free mailboxes
    own = sorted(e for e in found if domain and e.split("@")[1].endswith(domain))
    free = sorted(e for e in found if e.split("@")[1] in FREEMAIL)
    return own + free  # anything else is usually a theme/agency placeholder


def audit(lead):
    try:
        return _audit(lead)
    except Exception as e:
        return dict(lead, ok=False, error='crash: ' + str(e)[:100])


def _audit(lead):
    site = lead["website"].strip()
    if not site.startswith("http"):
        site = "http://" + site
    out = dict(lead, ok=False)
    try:
        final, h = get(site)
    except Exception as e:
        out["error"] = str(e)[:120]
        return out
    out.update(ok=True, final_url=final)
    host = urllib.parse.urlparse(final).hostname or ""
    domain = host.removeprefix("www.")
    body = text_of(h)
    years = [int(y) for y in re.findall(r"(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})", h, re.I)]
    sig = {
        "https": final.startswith("https://"),
        "viewport": bool(re.search(r'<meta[^>]+name=["\']viewport', h, re.I)),
        "copyright": max(years) if years else None,
        "tables": len(re.findall(r"<table", h, re.I)),
        "flash_or_frames": bool(re.search(r"<(frameset|embed|object)[\s>]", h, re.I)),
        "builder": next((b for b in ("wix", "squarespace", "godaddy", "weebly", "wordpress", "shopify", "duda") if b in h.lower()), None),
        "size_kb": len(h) // 1024,
        "tel_link": bool(re.search(r'href=["\']tel:', h, re.I)),
        "meta_desc": bool(re.search(r'<meta[^>]+name=["\']description', h, re.I)),
        "parked": bool(re.search(r"(domain (is )?for sale|buy this domain|parked free|this domain may be for sale)", h, re.I)),
    }
    score = 0
    score += 3 if not sig["viewport"] else 0
    score += 2 if not sig["https"] else 0
    score += 2 if sig["copyright"] and sig["copyright"] <= YEAR - 5 else 0
    score += 1 if sig["tables"] >= 3 else 0
    score += 2 if sig["flash_or_frames"] else 0
    score += 3 if sig["parked"] else 0
    score += 1 if not sig["tel_link"] else 0
    score += 1 if not sig["meta_desc"] else 0
    sig["score"] = score
    out["signals"] = sig
    emails = emails_in(h, domain)
    if not emails:
        for path in ("/contact", "/contact-us", "/about", "/about-us"):
            try:
                _, h2 = get(urllib.parse.urljoin(final, path), timeout=10)
                emails = emails_in(h2, domain)
                if emails:
                    break
            except Exception:
                pass
    out["emails"] = emails[:3]
    out["content"] = {
        "title": (tags(h, "title") or [""])[0][:140],
        "description": (re.findall(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)', h, re.I) or [""])[0][:300],
        "h": [x for x in tags(body, "h1") + tags(body, "h2") + tags(body, "h3") if 3 < len(x) < 90][:15],
        "p": [x for x in tags(body, "p") if 60 < len(x) < 700][:8],
        "li": [x for x in tags(body, "li") if 3 < len(x) < 60][:40],
        "image": urllib.parse.urljoin(final, (re.findall(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', h, re.I) or [""])[0]) if re.search(r'og:image', h, re.I) else None,
        "phones": sorted(set(PHONE_RE.findall(re.sub(r"<[^>]+>", " ", body))))[:3],
    }
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    leads = [json.loads(l) for l in open(src)]
    with cf.ThreadPoolExecutor(16) as ex, open(dst, "w") as f:
        for i, r in enumerate(ex.map(audit, leads), 1):
            f.write(json.dumps(r) + "\n")
            if i % 50 == 0:
                print(f"{i}/{len(leads)}", file=sys.stderr)
    rows = [json.loads(l) for l in open(dst)]
    good = [r for r in rows if r.get("emails") and r.get("signals", {}).get("score", 0) >= 3]
    print(f"audited {len(rows)} · reachable {sum(r['ok'] for r in rows)} · with email {sum(bool(r.get('emails')) for r in rows)} · dated+email {len(good)}", file=sys.stderr)


if __name__ == "__main__":
    main()
