#!/usr/bin/env python3
"""Turn businesses WITHOUT a website (osm_leads.py --noweb) into previews in D1 (status=preview, data.noweb=true).
There is no site text to work from, so the page is written later by bespoke.py from the public listing only
(name, kind, address, hours, phone). Matías reaches them by phone/WhatsApp from /llamar; the few with a public email get one.
Usage: build_noweb.py data/noweb-austin.jsonl [--limit 20]
Prints the new preview URLs (one per line).
"""
import argparse, json, re, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_previews import fit, slugify, sql_str, theme_for  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LABEL = {
    "shop=hairdresser": "Hair salon", "shop=beauty": "Beauty salon", "shop=florist": "Florist", "shop=bakery": "Bakery",
    "shop=butcher": "Butcher", "shop=car_repair": "Auto repair", "shop=tyres": "Tire shop", "shop=bicycle": "Bike shop",
    "shop=pet": "Pet store", "shop=pet_grooming": "Pet grooming", "shop=tailor": "Tailor", "shop=dry_cleaning": "Dry cleaner",
    "shop=laundry": "Laundromat", "shop=massage": "Massage", "shop=tattoo": "Tattoo studio", "shop=optician": "Optician",
    "shop=locksmith": "Locksmith", "shop=hardware": "Hardware store", "shop=furniture": "Furniture store", "shop=jewelry": "Jewelry store",
    "shop=gift": "Gift shop", "shop=deli": "Deli", "shop=confectionery": "Sweets shop", "shop=coffee": "Coffee shop", "shop=wine": "Wine shop",
    "shop=seafood": "Seafood market", "shop=garden_centre": "Garden center", "shop=car": "Car dealer", "shop=motorcycle": "Motorcycle shop",
    "amenity=cafe": "Cafe", "amenity=restaurant": "Restaurant", "amenity=fast_food": "Restaurant", "amenity=dentist": "Dentist",
    "amenity=veterinarian": "Veterinarian", "amenity=car_wash": "Car wash", "amenity=driving_school": "Driving school",
    "amenity=childcare": "Childcare", "amenity=clinic": "Clinic", "amenity=doctors": "Doctor's office", "office=accountant": "Accountant",
    "office=lawyer": "Law office", "office=insurance": "Insurance agency", "office=estate_agent": "Real estate agency",
    "office=tax_advisor": "Tax preparer", "office=architect": "Architect", "office=therapist": "Therapist",
    "leisure=fitness_centre": "Gym", "leisure=sports_centre": "Sports center", "leisure=dance": "Dance studio",
}


FOOD = ("amenity=restaurant", "amenity=fast_food", "amenity=cafe", "shop=coffee", "shop=bakery", "shop=deli")
BY_NAME = [("barber", "Barbershop"), ("nail", "Nail salon"), ("lash", "Lash studio"), ("brow", "Brow studio"), ("spa", "Spa"),
           ("tint", "Window tinting"), ("body", None), ("tattoo", "Tattoo studio")]


def label(kind, cuisine, name=""):
    """OSM is coarse (every barber is shop=hairdresser): the name says more."""
    n = name.lower()
    if kind in ("shop=hairdresser", "shop=beauty", "shop=car_repair"):
        for word, lab in BY_NAME:
            if word in n and lab:
                return lab
    if kind in ("amenity=restaurant", "amenity=fast_food") and cuisine:
        return cuisine.split(";")[0].replace("_", " ").title() + " restaurant"
    return LABEL.get(kind) or kind.split("=")[-1].replace("_", " ").capitalize()


def hours_of(oh):
    """'Mo-Fr 09:00-17:00; Sa 10:00-14:00' -> [['Mo-Fr', '09:00-17:00'], ['Sa', '10:00-14:00']]"""
    out = []
    for part in (oh or "").split(";"):
        p = part.strip().split(" ", 1)
        if len(p) == 2 and re.search(r"\d", p[1]):
            out.append([p[0], p[1]])
    return out[:7]


def d1(sql):
    out = subprocess.run(["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--json", "--command", sql],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out[out.index("[\n"):])[0]["results"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--limit", type=int, default=20)
    a = ap.parse_args()
    known = d1("SELECT slug, json_extract(data, '$.osm') AS osm, json_extract(data, '$.phone') AS phone FROM sites")
    taken = {r["slug"] for r in known}
    seen = {r["osm"] for r in known if r["osm"]} | {re.sub(r"\D", "", r["phone"] or "")[-10:] for r in known if r["phone"]}
    leads = [json.loads(l) for l in open(a.src)]
    leads = [l for l in leads if l.get("phone") and l["osm"] not in seen and re.sub(r"\D", "", l["phone"])[-10:] not in seen]
    # a full address and hours mean the listing is alive and the page has something real to show
    leads.sort(key=lambda l: -(fit(l.get("kind", "")) + 2 * bool(l.get("street")) + 2 * bool(l.get("hours"))))
    stmts, slugs = [], []
    now = int(time.time())
    for l in leads[: a.limit]:
        slug = slugify(l["name"], taken)
        data = {
            "noweb": True, "osm": l["osm"], "theme": theme_for(l["kind"], l["name"]), "category": label(l["kind"], l.get("cuisine"), l["name"]),
            "phone": l["phone"].split(";")[0].strip(), "address": l.get("street"), "city": l.get("city"), "region": l.get("region"),
            "zip": l.get("zip"), "hours": hours_of(l.get("hours")), "email": l.get("email"), "social": l.get("social"),
            "cuisine": l.get("cuisine") if l["kind"] in FOOD else None, "description": l.get("description"),
        }
        stmts.append(
            "INSERT OR IGNORE INTO sites (slug, name, data, status, email, created_at, updated_at) VALUES "
            f"({sql_str(slug)}, {sql_str(l['name'])}, {sql_str(json.dumps(data))}, 'preview', {sql_str(l.get('email'))}, {now}, {now});"
        )
        slugs.append(slug)
    if not stmts:
        print("nothing new", file=sys.stderr)
        return
    sql = ROOT / "data/.noweb.sql"
    sql.parent.mkdir(exist_ok=True)
    sql.write_text("\n".join(stmts))
    subprocess.run(["npx", "-y", "wrangler@3", "d1", "execute", "webcrafts", "--remote", "--file", str(sql)], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL)
    print(f"created {len(slugs)} no-website previews", file=sys.stderr)
    for s in slugs:
        print(f"https://{s}.webcrafts.page")


if __name__ == "__main__":
    main()
