"""Verifica i candidati di una guida su OpenStreetMap (Nominatim).

supabase/guides/<slug>.candidates.json → <slug>.resolved.json
Formato: lista di {name, query} oppure {"bbox": [sud, ovest, nord, est], "items": [...]}.
"""
import glob
import json
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "carlottaemichele.it geocoder (github action)"}


def nominatim(q, bbox=None):
    params = {"q": q, "format": "jsonv2", "limit": 3, "addressdetails": 1, "extratags": 1, "accept-language": "it"}
    if bbox:
        s, w, n, e = bbox
        params.update({"viewbox": f"{w},{n},{e},{s}", "bounded": 1})
    req = urllib.request.Request("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params), headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.loads(r.read().decode())
    except Exception as ex:  # noqa: BLE001
        return [{"error": str(ex)}]
    out = []
    for x in res:
        t = x.get("extratags") or {}
        out.append({
            "name": x.get("name"), "display": x.get("display_name"), "lat": float(x["lat"]), "lng": float(x["lon"]),
            "type": f'{x.get("category")}/{x.get("type")}',
            "website": t.get("website") or t.get("contact:website"), "phone": t.get("phone") or t.get("contact:phone"),
            "opening_hours": t.get("opening_hours"),
        })
    return out


for path in glob.glob("supabase/guides/*.candidates.json"):
    out = path.replace(".candidates.json", ".resolved.json")
    data = json.load(open(path))
    bbox, items = (data.get("bbox"), data["items"]) if isinstance(data, dict) else (None, data)
    result = []
    for it in items:
        hits = nominatim(it.get("query") or it["name"], bbox)
        time.sleep(1.2)
        result.append({"name": it["name"], "nominatim": hits})
    json.dump(result, open(out, "w"), ensure_ascii=False, indent=1)
    print("scritto", out)
