#!/usr/bin/env python3
"""Turn audited leads into preview sites in D1 (status=preview).
Copy is written by Gemini Flash (free tier) using ONLY the business's own published text.
Usage: build_previews.py data/austin.audit.jsonl [--limit 20] [--min-score 3]
Writes data/previews.jsonl (slug, email, name…) for the mailer.
"""
import argparse, json, os, re, subprocess, sys, time, unicodedata, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ["gemini-3.5-flash", "gemini-3-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
DEAD = set()  # models that hit their daily free quota
THEMES = {
    "trades": ["craft=", "plumb", "electric", "hvac", "roof", "handyman", "carpent", "paint", "locksmith", "hardware", "builder", "construction"],
    "clean": ["laundry", "dry_cleaning", "clean", "car_wash", "pool"],
    "beauty": ["hairdresser", "beauty", "massage", "tattoo", "nail", "salon", "barber", "spa"],
    "food": ["cafe", "restaurant", "fast_food", "bakery", "butcher", "deli", "confectionery", "coffee", "wine", "seafood"],
    "health": ["dentist", "clinic", "doctors", "healthcare", "optician", "therapist", "chiropract"],
    "auto": ["car_repair", "tyres", "car=", "motorcycle", "auto"],
    "outdoor": ["garden", "landscap", "lawn", "tree", "florist"],
    "pets": ["pet", "veterinar", "grooming"],
}


def theme_for(kind, name):
    s = f"{kind} {name}".lower()
    for t, keys in THEMES.items():
        if any(k in s for k in keys):
            return t
    return "pro"


def key():
    if os.environ.get("GEMINI_API_KEY"):  # GitHub Actions
        return os.environ["GEMINI_API_KEY"]
    for p in (Path.home() / "Projects/estudia-ai/.env",):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("no GEMINI_API_KEY")


PROMPT = """You write the content for a one-page website for a real local business, using ONLY facts from its current website text below.
Rules: never invent facts (no years in business, licenses, awards, guarantees, prices, reviews or names that are not in the text).
Plain, warm, specific US English. Short sentences. No hype words like "premier", "top-notch", "best-in-class".
Return JSON with keys:
 category: short business category, e.g. "Plumbing", "Hair salon"
 headline: 3-8 words, specific to this business (may be the business name)
 tagline: one sentence, max 22 words, what they do and for whom
 services: 3 to 6 items {{t: 2-5 words, d: one sentence max 18 words}}, taken from what the text says they offer
 about: 2-4 sentences, from the text
 areas: list of towns/neighborhoods they say they serve (empty if none)
 hours: list of [days, hours] pairs only if stated (else empty)
 contact_line: one short sentence inviting people to call or visit

Business: {name} ({kind}) in {city}, {region}
Phone: {phone}
Current website text:
{text}
"""


def gen(k, lead):
    c = lead["content"]
    text = "\n".join([c["title"], c["description"], *c["h"], *c["p"], "Items: " + "; ".join(c["li"])])[:9000]
    body = {
        "contents": [{"parts": [{"text": PROMPT.format(name=lead["name"], kind=lead["kind"], city=lead["city"], region=lead["region"],
                                                       phone=lead.get("phone") or ", ".join(c["phones"]), text=text)}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.4},
    }
    for attempt in range(6):
        live = [m for m in MODELS if m not in DEAD]
        if not live:
            return None
        model = live[0]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={k}"
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                j = json.load(r)
            return json.loads(j["candidates"][0]["content"]["parts"][0]["text"])
        except Exception as e:
            if ("429" in str(e) and attempt >= 1) or "404" in str(e):
                DEAD.add(model)
                print(f"  {model} out of free quota, switching", file=sys.stderr)
                continue
            wait = 15 * (attempt + 1)
            print(f"  gemini retry {attempt + 1}: {str(e)[:80]} (wait {wait}s)", file=sys.stderr)
            time.sleep(wait)
    return None


def slugify(name, taken):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"&", " and ", s)
    s = re.sub(r"\b(llc|inc|co|ltd|the)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40].strip("-") or "site"
    base, n = s, 2
    while s in taken:
        s, n = f"{base}-{n}", n + 1
    taken.add(s)
    return s


def sql_str(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--min-score", type=int, default=3)
    a = ap.parse_args()
    out_path = ROOT / "data/previews.jsonl"
    done = {json.loads(l)["osm"] for l in open(out_path)} if out_path.exists() else set()
    taken = {json.loads(l)["slug"] for l in open(out_path)} if out_path.exists() else set()
    # the database is the source of truth (local files were lost once with the Mac): never reuse a slug or email it already has
    out = subprocess.run(["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--json", "--command",
                          "SELECT slug, lower(email) AS email FROM sites"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    known = json.loads(out[out.index("[\n"):])[0]["results"]
    taken |= {r["slug"] for r in known}
    leads = [json.loads(l) for l in open(a.src)]
    free = {"gmail.com", "yahoo.com", "aol.com", "hotmail.com", "outlook.com", "icloud.com", "att.net", "sbcglobal.net", "comcast.net", "live.com", "msn.com", "me.com", "verizon.net", "bellsouth.net", "earthlink.net"}
    for l in leads:
        dom = (re.sub(r"^https?://(www\.)?", "", l.get("final_url") or "").split("/")[0]).lower()
        l["emails"] = [e for e in l.get("emails") or [] if e.split("@")[1] in free or (dom and e.split("@")[1].endswith(dom.split(":")[0]))]
    seen_email = {r["email"] for r in known if r["email"]}
    leads = [l for l in leads if l.get("emails") and not (l["emails"][0] in seen_email or seen_email.add(l["emails"][0]))]
    leads = [l for l in leads if l.get("emails") and l.get("signals", {}).get("score", 0) >= a.min_score and l["osm"] not in done]
    leads.sort(key=lambda l: -l["signals"]["score"])
    k = key()
    stmts, rows = [], []
    for lead in leads[: a.limit]:
        print(f"→ {lead['name']}", file=sys.stderr)
        g = gen(k, lead)
        if not g or not g.get("services"):
            continue
        slug = slugify(lead["name"], taken)
        phone = lead.get("phone") or (lead["content"]["phones"] or [None])[0]
        data = {
            "theme": theme_for(lead["kind"], lead["name"]), "category": g.get("category"), "headline": g.get("headline"),
            "tagline": g.get("tagline"), "services": g.get("services", [])[:6], "about": g.get("about"), "areas": g.get("areas", [])[:12],
            "hours": g.get("hours", [])[:7], "contact_line": g.get("contact_line"), "phone": phone, "address": lead.get("street"),
            "city": lead.get("city"), "region": lead.get("region"), "email": lead["emails"][0],
            "image": (lead["content"].get("image") or "").startswith("https://") and lead["content"]["image"] or None,
        }
        now = int(time.time())
        stmts.append(
            f"INSERT OR IGNORE INTO sites (slug, name, data, status, email, created_at, updated_at) VALUES "
            f"({sql_str(slug)}, {sql_str(lead['name'])}, {sql_str(json.dumps(data))}, 'preview', {sql_str(lead['emails'][0])}, {now}, {now});"
        )
        rows.append({"osm": lead["osm"], "slug": slug, "name": lead["name"], "email": lead["emails"][0], "old_site": lead.get("final_url"),
                     "signals": lead["signals"], "category": data["category"], "city": data["city"], "created": now})
        time.sleep(4)  # stay well inside the free-tier rate limit
    if not stmts:
        print("nothing new", file=sys.stderr)
        return
    sql = ROOT / "data/.insert.sql"
    sql.write_text("\n".join(stmts))
    subprocess.run(["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--file", str(sql)], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL)
    with open(out_path, "a") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"created {len(rows)} previews", file=sys.stderr)
    for r in rows:
        print(f"https://{r['slug']}.webcrafts.page")


if __name__ == "__main__":
    main()
