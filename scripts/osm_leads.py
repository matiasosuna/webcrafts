#!/usr/bin/env python3
"""Pull local businesses from OpenStreetMap (free) for one city.
Usage: osm_leads.py "Austin" "US-TX" out.jsonl            businesses that list a website
       osm_leads.py "Austin" "US-TX" out.jsonl --noweb    businesses with a phone and NO website (or only Facebook/Instagram/Yelp),
                                                          chains left out: this is who the product is for, reached by phone
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


SOCIAL = ("facebook.com", "instagram.com", "yelp.com")


def query(city, iso, noweb=False):
    parts = []
    for k, vals in KEEP.items():
        sel = f'["{k}"]' if vals is None else f'["{k}"~"^({"|".join(sorted(vals))})$"]'
        if noweb:
            for ph in ("phone", "contact:phone"):
                parts.append(f'nwr(area.c){sel}["name"]["{ph}"][!"website"][!"contact:website"][!"brand"][!"brand:wikidata"];')
                parts.append(f'nwr(area.c){sel}["name"]["{ph}"]["website"~"facebook|instagram|yelp"][!"brand"][!"brand:wikidata"];')
            continue
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
    noweb = "--noweb" in sys.argv
    els = run(query(city, iso, noweb))
    n, seen = 0, set()
    with open(out, "w") as f:
        for e in els:
            t = e.get("tags", {})
            site = t.get("website") or t.get("contact:website")
            social = bool(site) and any(x in site for x in SOCIAL)
            if noweb:
                key = (t["name"].lower(), t.get("phone") or t.get("contact:phone"))
                if key in seen or (site and not social):
                    continue
                seen.add(key)
            elif not site or social:
                continue
            kind = next((f"{k}={t[k]}" for k in KEEP if k in t), "")
            f.write(json.dumps({
                "osm": f"{e['type']}/{e['id']}", "name": t["name"].split(";")[0].strip(), "kind": kind, "website": site,
                "phone": t.get("phone") or t.get("contact:phone"), "email": t.get("email") or t.get("contact:email"),
                "street": " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x) or None,
                "city": t.get("addr:city") or city, "region": iso.split("-")[1], "hours": t.get("opening_hours"),
                **({"noweb": True, "social": site, "cuisine": t.get("cuisine"), "description": t.get("description"),
                    "zip": t.get("addr:postcode")} if noweb else {}),
            }) + "\n")
            n += 1
    print(f"{city}: {n} businesses {'without' if noweb else 'with'} website", file=sys.stderr)


if __name__ == "__main__":
    main()
