#!/usr/bin/env python3
"""Pull local businesses that list a website from OpenStreetMap (free) for one city.
Usage: osm_leads.py "Austin" "US-TX" out.jsonl
"""
import json, sys, time, urllib.request, urllib.parse

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
UA = "webcrafts-leads/1.0 (matias@webcrafts.page)"

KEEP = {
    "craft": None,  # all crafts: plumber, electrician, hvac, roofer, carpenter, painter…
    "shop": {"hairdresser", "beauty", "florist", "bakery", "butcher", "car_repair", "tyres", "bicycle", "pet", "pet_grooming",
             "tailor", "dry_cleaning", "laundry", "massage", "tattoo", "optician", "locksmith", "hardware", "furniture",
             "jewelry", "gift", "deli", "confectionery", "coffee", "wine", "seafood", "garden_centre", "car", "motorcycle"},
    "amenity": {"cafe", "restaurant", "fast_food", "dentist", "veterinarian", "car_wash", "driving_school", "childcare", "clinic", "doctors"},
    "office": {"accountant", "lawyer", "insurance", "estate_agent", "tax_advisor", "architect", "therapist"},
    "healthcare": None,
    "leisure": {"fitness_centre", "sports_centre", "dance"},
}


def query(city, iso):
    parts = []
    for k, vals in KEEP.items():
        sel = f'["{k}"]' if vals is None else f'["{k}"~"^({"|".join(sorted(vals))})$"]'
        parts.append(f'nwr(area.c){sel}["name"]["website"];')
        parts.append(f'nwr(area.c){sel}["name"]["contact:website"];')
    return f"""[out:json][timeout:180];
area["ISO3166-2"="{iso}"]->.s;
area["name"="{city}"]["boundary"="administrative"](area.s)->.c;
({''.join(parts)});
out tags center;"""


def run(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(8):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=200) as r:
                body = r.read()
            return json.loads(body)["elements"]
        except Exception as e:
            wait = min(120, 10 * 2 ** attempt)
            print(f"[{url}] {e!s:.80} — retry in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit("overpass unavailable")


def main():
    city, iso, out = sys.argv[1], sys.argv[2], sys.argv[3]
    els = run(query(city, iso))
    n = 0
    with open(out, "w") as f:
        for e in els:
            t = e.get("tags", {})
            site = t.get("website") or t.get("contact:website")
            if not site or any(x in site for x in ("facebook.com", "instagram.com", "yelp.com")):
                continue
            kind = next((f"{k}={t[k]}" for k in KEEP if k in t), "")
            f.write(json.dumps({
                "osm": f"{e['type']}/{e['id']}", "name": t.get("name"), "kind": kind, "website": site,
                "phone": t.get("phone") or t.get("contact:phone"), "email": t.get("email") or t.get("contact:email"),
                "street": " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x) or None,
                "city": t.get("addr:city") or city, "region": iso.split("-")[1], "hours": t.get("opening_hours"),
            }) + "\n")
            n += 1
    print(f"{city}: {n} businesses with website", file=sys.stderr)


if __name__ == "__main__":
    main()
