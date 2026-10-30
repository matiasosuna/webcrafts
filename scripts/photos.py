#!/usr/bin/env python3
"""Find each business's own photos on its current website and attach them to its preview (data.photos).
Keeps real photos only: >= 500px wide, not logos/icons, deduped. Up to 8 per site.
Usage: photos.py [slug ...]   (no args = all previews in data/previews.jsonl)
"""
import concurrent.futures as cf, hashlib, html, io, json, re, subprocess, sys, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from audit import get, UA, CTX  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SKIP = re.compile(r"(logo|icon|favicon|sprite|badge|avatar|button|banner-ad|pixel|spacer|placeholder|loading|arrow|social|facebook|instagram|twitter|yelp|google|tripadvisor|payment|visa|mastercard|\.svg|\.gif)", re.I)
PAGES = ("", "/gallery", "/photos", "/menu", "/about", "/about-us", "/services")


def candidates(base, h):
    out = []
    for m in re.findall(r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)', h, re.I):
        out.append(m)
    for tag in re.findall(r"(?is)<img\b[^>]*>", h):
        srcset = re.search(r'(?:data-srcset|srcset)=["\']([^"\']+)', tag, re.I)
        if srcset:  # take the biggest entry
            parts = [p.strip().split(" ") for p in srcset.group(1).split(",") if p.strip()]
            parts.sort(key=lambda p: int(re.sub(r"\D", "", p[1]) or 0) if len(p) > 1 else 0)
            out.append(parts[-1][0])
        src = re.search(r'(?:data-src|data-lazy-src|src)=["\']([^"\']+)', tag, re.I)
        if src:
            out.append(src.group(1))
    out += re.findall(r"background(?:-image)?\s*:\s*url\(['\"]?([^'\")]+)", h, re.I)
    seen, res = set(), []
    for u in out:
        u = urllib.parse.urljoin(base, html.unescape(u.strip()))
        if u.startswith("http") and not SKIP.search(u) and u not in seen and not u.startswith("data:"):
            seen.add(u)
            res.append(u)
    return res


def check(u):
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "image/*"})
        with urllib.request.urlopen(req, timeout=12, context=CTX) as r:
            if "image" not in r.headers.get("content-type", "image"):
                return None
            b = r.read(4_000_000)
        im = Image.open(io.BytesIO(b))
        w, hgt = im.size
        if w < 500 or hgt < 300 or w / hgt > 3.2 or hgt / w > 1.6:
            return None
        small = im.convert("L").resize((8, 8))
        px = list(small.getdata())
        if max(px) - min(px) < 25:  # flat colour block, not a photo
            return None
        avg = sum(px) / 64
        return {"u": u, "w": w, "h": hgt, "k": "".join("1" if p > avg else "0" for p in px)}
    except Exception:
        return None


def photos_for(site):
    urls = []
    for p in PAGES:
        try:
            final, h = get(urllib.parse.urljoin(site, p) if p else site, timeout=12)
            urls += [u for u in candidates(final, h) if u not in urls]
        except Exception:
            pass
        if len(urls) > 60:
            break
    with cf.ThreadPoolExecutor(8) as ex:
        ok = [r for r in ex.map(check, urls[:60]) if r]
    keep, hashes = [], []
    for r in ok:  # drop near-duplicates (same image in different sizes)
        if any(sum(a != b for a, b in zip(r["k"], k)) < 6 for k in hashes):
            continue
        hashes.append(r["k"])
        keep.append(r["u"])
    return keep[:8]


def main():
    rows = [json.loads(l) for l in open(ROOT / "data/previews.jsonl")]
    if sys.argv[1:]:
        rows = [r for r in rows if r["slug"] in sys.argv[1:]]
    if not rows:
        return
    stmts, total = [], 0
    with cf.ThreadPoolExecutor(6) as ex:
        for r, ph in zip(rows, ex.map(lambda r: photos_for(r["old_site"]) if r.get("old_site") else [], rows)):
            print(f"{len(ph)} photos  {r['slug']}", file=sys.stderr)
            total += bool(ph)
            js = json.dumps(ph).replace("'", "''")
            stmts.append(f"UPDATE sites SET data = json_set(data, '$.photos', json('{js}')) WHERE slug = '{r['slug']}';")
    (ROOT / "data/.photos.sql").write_text("\n".join(stmts))
    subprocess.run(["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--file", str(ROOT / "data/.photos.sql")],
                   cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    print(f"{total}/{len(rows)} previews now have photos", file=sys.stderr)


if __name__ == "__main__":
    main()
