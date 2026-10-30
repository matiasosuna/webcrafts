#!/usr/bin/env python3
"""Design a one-off website for each business (not a template): Claude (Matías's plan, via CLAUDE_CODE_OAUTH_TOKEN) writes the
full page; if Claude is missing or out of quota, Gemini (free tier) does it.
Written from the business's own text and photos, then fact-checked by Gemini. Stored in sites.html; the worker adds the preview bar and buy section.
Usage: bespoke.py [slug ...]   (no args = every preview without a bespoke page yet)   --redo to overwrite
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_previews import key, MODELS, DEAD  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

PROMPT = """You are a top web designer. Design ONE custom homepage for this real local business. It must feel made for them only:
the layout, typography, colours, section order and small details should come from what this business is and how it talks about itself
(a Deep Ellum barbecue joint, a family dentist, a roofing crew and a nail lounge must look nothing alike). Avoid generic template looks.

HARD RULES
- Use ONLY facts from the business text below. Never invent prices, years, awards, reviews, testimonials, staff names, guarantees or menu items.
  You may rewrite their text to read better (plain, warm US English, short sentences, no hype words).
- Output a single complete HTML document (<!doctype html> ... </html>), CSS in one <style> tag. No JavaScript, no <script>, no forms, no iframes.
- Fonts: Google Fonts only (one <link>). Pick fonts that suit this business. Icons: inline SVG only.
- Images: use ONLY these exact URLs (they are the business's own photos), each at most once, with object-fit:cover. Never use any other image URL.
{photos}
- Must include: business name, what they do, their real services/menu/offer from the text, about, hours (if given), service areas (if given),
  address with a Google Maps link ({maps}), phone as a tel: link ({tel}), email (if given) shown as text.
- Mobile-first and responsive (looks great at 375px and 1280px), good contrast, big tap targets, a sticky or repeated "Call" action on mobile.
- Do NOT add any "preview", pricing, "buy", "WebCrafts" or footer credit; that is added later. Keep it under 45 KB.
Return only the HTML.

BUSINESS
Name: {name}
Category: {category}
Location: {address}, {city}, {region}
Phone: {phone}
Email: {email}
Hours: {hours}
Areas: {areas}

THEIR CURRENT WEBSITE TEXT
{text}
"""


def d1(sql_or_file, file=False):
    args = ["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--json"]
    args += ["--file", sql_or_file] if file else ["--command", sql_or_file]
    out = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out[out.index("[\n"):])[0]["results"]


def audit_content():
    c = {}
    for f in ROOT.glob("data/*.audit.jsonl"):
        for l in open(f):
            r = json.loads(l)
            if r.get("content"):
                c[r["osm"]] = r["content"]
    return c


CLAUDE = {"live": bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")) and bool(shutil.which("claude"))}


def claude(prompt):
    """One page from Claude Code in print mode, run in an empty folder so it has nothing to read or touch."""
    if not CLAUDE["live"]:
        return None
    with tempfile.TemporaryDirectory() as tmp:
        try:
            p = subprocess.run(["claude", "-p", "--model", "opus", "--output-format", "text"], input=prompt, cwd=tmp,
                               capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            print("  claude timed out", file=sys.stderr)
            return None
    if p.returncode != 0 or "<html" not in p.stdout.lower():
        # usage limit or auth problem: the rest of today's pages go to Gemini
        CLAUDE["live"] = False
        print(f"  claude unavailable (exit {p.returncode}), switching to Gemini", file=sys.stderr)
        return None
    return p.stdout


def design(k, prompt):
    return claude(prompt) or gemini(k, prompt)


def gemini(k, prompt, json_mode=False):
    cfg = {"temperature": 0.1, "responseMimeType": "application/json"} if json_mode else {"temperature": 1.0, "maxOutputTokens": 30000}
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": cfg}
    for attempt in range(6):
        live = [m for m in MODELS if m not in DEAD]
        if not live:
            return None
        model = live[0]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={k}"
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=240) as r:
                j = json.load(r)
            return "".join(p.get("text", "") for p in j["candidates"][0]["content"]["parts"])
        except Exception as e:
            if "429" in str(e) and attempt < 2:  # per-minute limit: wait it out before giving up on the better model
                time.sleep(65)
                continue
            if "429" in str(e) or "404" in str(e):
                DEAD.add(model)
                print(f"  {model} out of free quota, switching", file=sys.stderr)
                continue
            time.sleep(20 * (attempt + 1))
    return None


CHECK = """You are a strict fact-checker. Below is a business's own website text (SOURCE) and the visible text of a new page written for it (PAGE).
Go through PAGE line by line. Be paranoid: a claim is supported only if SOURCE literally says it (or the same fact in other words).
Pay special attention to every state, city, neighborhood and area name, every number and phone number, and every offer.
List every claim in PAGE that SOURCE does not support: places/areas served, years, awards, numbers, offers ("free consultation"), guarantees,
staff names, menu items, reviews, certifications. Generic friendly wording is fine. For each, give the exact PAGE substring and a replacement
that is supported by SOURCE (or "" to delete it). Return JSON: {{"fixes":[{{"find":"...","replace":"..."}}]}} (empty list if all is supported).

SOURCE
{src}

PAGE
{page}
"""


def visible(h):
    t = re.sub(r"(?is)<(style|svg)\b.*?</\1>", " ", h)
    t = re.sub(r"(?s)<[^>]+>", "\n", t)
    return re.sub(r"\n\s*\n+", "\n", t)[:12000]


def factcheck(k, h, src):
    out = gemini(k, CHECK.format(src=src, page=visible(h)), json_mode=True)
    try:
        fixes = json.loads(out)["fixes"]
    except Exception:
        return None
    for f in fixes:
        if f.get("find") and f["find"] in h:
            h = h.replace(f["find"], f.get("replace") or "")
            print(f"  fixed: {f['find'][:70]!r} -> {(f.get('replace') or '')[:50]!r}", file=sys.stderr)
    return h


def clean(h, n_photos):
    m = re.search(r"(?is)<!doctype html.*</html>", h)
    if not m:
        return None
    h = m.group(0)
    h = re.sub(r"(?is)<script\b.*?</script>", "", h)
    h = re.sub(r"(?is)<(iframe|object|embed|form)\b.*?(</\1>|>)", "", h)
    h = re.sub(r"""\son\w+\s*=\s*("[^"]*"|'[^']*')""", "", h)
    # drop any image the model made up
    h = re.sub(r"""(?i)<img\b[^>]*src=["'](?!/_p/[0-7]["'])[^"']*["'][^>]*>""", "", h)
    h = re.sub(r"""(?i)url\((["']?)(?!/_p/[0-7])(https?:)?//[^)]*\1\)""", "none", h)
    if len(h) > 95_000 or "<body" not in h.lower():
        return None
    return h


def main():
    redo = "--redo" in sys.argv
    slugs = [a for a in sys.argv[1:] if not a.startswith("--")]
    rows = d1("SELECT slug, name, data, html IS NOT NULL AS done FROM sites WHERE status = 'preview' AND slug != 'demo'")
    rows = [r for r in rows if (not slugs or r["slug"] in slugs) and (redo or slugs or not r["done"])]
    osm = {json.loads(l)["slug"]: json.loads(l)["osm"] for l in open(ROOT / "data/previews.jsonl")}
    content, k, ok = audit_content(), key(), 0
    for r in rows:
        d = json.loads(r["data"])
        c = content.get(osm.get(r["slug"]), {})
        photos = (d.get("photos") or ([d["image"]] if d.get("image") else []))[:8]
        plist = "\n".join(f"  /_p/{i}   (original file name: {p.rsplit('/', 1)[-1][:80]})" for i, p in enumerate(photos)) or "  (none: design without photos, use colour, type and SVG)"
        text = "\n".join([c.get("title", ""), c.get("description", ""), *c.get("h", []), *c.get("p", []), "Items: " + "; ".join(c.get("li", []))])[:9000]
        text += "\n\nSummary we already wrote: " + json.dumps({k2: d.get(k2) for k2 in ("tagline", "services", "about", "contact_line")})
        tel = "tel:" + re.sub(r"[^\d+]", "", d.get("phone") or "")
        maps = "https://www.google.com/maps/search/?api=1&query=" + urllib.request.quote(", ".join(x for x in (r["name"], d.get("address"), d.get("city"), d.get("region")) if x))
        prompt = PROMPT.format(photos=plist, maps=maps, tel=tel, name=r["name"], category=d.get("category"), address=d.get("address") or "",
                               city=d.get("city"), region=d.get("region"), phone=d.get("phone"), email=d.get("email"),
                               hours=json.dumps(d.get("hours") or []), areas=", ".join(d.get("areas") or []), text=text)
        print(f"→ {r['slug']}", file=sys.stderr)
        h = design(k, prompt)
        h = h and clean(h, len(photos))
        if not h or r["name"].split()[0].lower() not in h.lower():
            print("  skipped (bad output)", file=sys.stderr)
            if not CLAUDE["live"] and not [m for m in MODELS if m not in DEAD]:
                break
            continue
        h = factcheck(k, h, prompt.split('BUSINESS', 1)[1])  # contact details + their site text
        if not h:
            print("  skipped (fact-check failed)", file=sys.stderr)
            continue
        f = ROOT / "data/.bespoke.sql"
        f.write_text(f"UPDATE sites SET html = '{h.replace(chr(39), chr(39) * 2)}', updated_at = {int(time.time())} WHERE slug = '{r['slug']}';")
        d1(str(f), file=True)
        ok += 1
        print(f"  ok  https://{r['slug']}.webcrafts.page  ({len(h) // 1024} KB)", file=sys.stderr)
        time.sleep(6)
    print(f"{ok} bespoke pages built", file=sys.stderr)


if __name__ == "__main__":
    main()
