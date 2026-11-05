#!/usr/bin/env python3
"""Check that every preview fits the screen, from a phone to a big monitor: no text cut off at the edges and no page that
scrolls sideways. A page that only looked right on the size it was tested on went out broken once (West Torrance, 5-nov).
Usage: check_layout.py [slug ...]   (no slugs = every no-website preview)
       --fix   ask Claude to repair the broken ones (layout only), upload, and check again
Runs in GitHub Actions (headless Chromium), never on Matías's Mac. Exit 1 if a page is still broken.
"""
import json, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bespoke import CLAUDE, claude, clean, d1, visible  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WIDTHS = [360, 768, 1024, 1280, 1440, 1920]

# Text whose box sticks out of the screen, or out of a box that hides overflow. Sideways scrollers (a strip of cards you swipe),
# moving tickers and decorative aria-hidden text are meant to run past the edge, so they don't count.
CHECK_JS = r"""() => {
  const W = innerWidth, out = [];
  if (document.documentElement.scrollWidth > W + 1) out.push('the page scrolls sideways');
  const skip = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (p.getAttribute('aria-hidden') === 'true' || s.animationName !== 'none') return true;
      if (/(auto|scroll)/.test(s.overflowX)) return true;
    }
    return false;
  };
  const clipBox = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === 'hidden' || s.overflowX === 'clip') return p.getBoundingClientRect();
    }
    return null;
  };
  const seen = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const t = walk.currentNode, el = t.parentElement;
    if (!el || seen.has(el) || !t.textContent.trim()) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0' || skip(el)) continue;
    const c = clipBox(el), left = Math.max(0, c ? c.left : 0), right = Math.min(W, c ? c.right : W);
    const r = document.createRange();
    r.selectNodeContents(t);
    for (const b of r.getClientRects()) {
      if (b.width < 1 || b.height < 1 || b.right < 0 || b.left > W) continue;  // skip links parked off-screen
      if (b.right > right + 2 || b.left < left - 2) {
        seen.add(el);
        out.push(`cut off: "${t.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}" (font ${s.fontSize}, text ${Math.round(b.left)}-${Math.round(b.right)}px, room ${Math.round(left)}-${Math.round(right)}px)`);
        break;
      }
    }
  }
  return out;
}"""

FIX = """This HTML page is a finished design. It has layout bugs: at some screen widths, text is cut off at the edge or the page
scrolls sideways. Here is what a browser measured (width of the window: problems):
{issues}

Fix ONLY these layout bugs, so that every word fits on screen at every width from 320px to 2560px:
- size big display headings with clamp() and vw (e.g. clamp(48px, 15vw, 220px)), never a fixed px size that can be wider than its column;
  check media queries too (a rule for wide screens caused this before)
- let long words and headings wrap or shrink (min-width:0 on grid/flex children, overflow-wrap:anywhere where needed)
Keep everything else exactly as it is: the same text, colours, fonts, sections, order and look. Do not add or remove content.
Reply with the complete corrected HTML document only, from <!doctype html> to </html>, nothing else.

{html}
"""


def check(page, slug):
    """{width: [problems]} for the live page."""
    page.goto(f"https://{slug}.webcrafts.page/?layout-check={int(time.time())}", wait_until="networkidle", timeout=60000)
    page.evaluate("document.fonts.ready.then(() => true)")
    found = {}
    for w in WIDTHS:
        page.set_viewport_size({"width": w, "height": 900})
        page.wait_for_timeout(250)
        p = page.evaluate(CHECK_JS)
        if p:
            found[w] = p
    return found


def fmt(found):
    return "\n".join(f"- {w}px: " + "; ".join(p[:6]) for w, p in found.items())


def upload(slug, h):
    f = ROOT / "data/.layout.sql"
    f.parent.mkdir(exist_ok=True)
    f.write_text(f"UPDATE sites SET html = '{h.replace(chr(39), chr(39) * 2)}', updated_at = {int(time.time())} WHERE slug = '{slug}';")
    d1(str(f), file=True)


def html_of(slug):
    return d1(f"SELECT html FROM sites WHERE slug = '{slug}'")[0]["html"]


def repair(page, slug, found):
    """Up to two tries with Claude; keeps whichever version has the fewest problems (the original if nothing helped)."""
    orig = html_of(slug)
    best, best_n = orig, sum(map(len, found.values()))
    for attempt in (1, 2):
        out = claude(FIX.format(issues=fmt(found), html=best))
        h = out and clean(out, 8)
        # a repair must not lose content: same name, about the same amount of visible text
        if not h or slug.split("-")[0] not in h.lower() or len(visible(h)) < 0.85 * len(visible(best)):
            print(f"  try {attempt}: bad repair, skipped", file=sys.stderr)
            continue
        upload(slug, h)
        found = check(page, slug)
        n = sum(map(len, found.values()))
        print(f"  try {attempt}: {n} problems left", file=sys.stderr)
        if n < best_n:
            best, best_n = h, n
        if n == 0:
            return {}
    upload(slug, best)
    return check(page, slug) if best_n else {}


def main():
    fix = "--fix" in sys.argv
    slugs = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not slugs:
        rows = d1("SELECT slug FROM sites WHERE status = 'preview' AND html IS NOT NULL AND json_extract(data, '$.noweb') = 1 ORDER BY slug")
        slugs = [r["slug"] for r in rows]
    broken = {}
    with sync_playwright() as pw:
        page = pw.chromium.launch().new_page()
        for slug in slugs:
            try:
                found = check(page, slug)
            except Exception as e:  # a page that doesn't even load is broken too
                found = {0: [f"did not load: {str(e)[:80]}"]}
            print(f"{'ok    ' if not found else 'BROKEN'} {slug}", file=sys.stderr)
            if found and fix and CLAUDE["live"]:
                print(fmt(found), file=sys.stderr)
                found = repair(page, slug, found)
                print(f"  -> {'fixed' if not found else 'still broken'}", file=sys.stderr)
            if found:
                broken[slug] = found
    print(json.dumps({"checked": len(slugs), "broken": {s: {str(w): p for w, p in f.items()} for s, f in broken.items()}}, indent=1))
    print(f"{len(slugs) - len(broken)}/{len(slugs)} pages fit every screen", file=sys.stderr)
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
