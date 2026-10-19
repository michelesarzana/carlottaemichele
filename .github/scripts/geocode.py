"""Verifica i candidati di una guida su OpenStreetMap.

Per ogni file supabase/guides/*.candidates.json scrive *.resolved.json con:
- le corrispondenze trovate su Overpass (nome simile nell'area della Valpolicella allargata)
- il risultato di Nominatim per l'indirizzo
"""
import glob
import json
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "carlottaemichele.it geocoder (github action)"}
BBOX = (45.40, 10.70, 45.68, 11.10)  # sud, ovest, nord, est


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def overpass(key):
    safe = key.replace('"', "")
    q = f'[out:json][timeout:90];nwr["name"~"{safe}",i]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});out tags center;'
    for ep in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            j = get(ep, ("data=" + urllib.parse.quote(q)).encode())
            out = []
            for e in j.get("elements", []):
                t = e.get("tags", {})
                if not any(k in t for k in ("amenity", "shop", "tourism", "craft")):
                    continue
                out.append({
                    "name": t.get("name"),
                    "lat": e.get("lat") or e.get("center", {}).get("lat"),
                    "lng": e.get("lon") or e.get("center", {}).get("lon"),
                    "amenity": t.get("amenity") or t.get("shop") or t.get("tourism"),
                    "addr": " ".join(filter(None, [t.get("addr:street"), t.get("addr:housenumber"), t.get("addr:city")])),
                    "website": t.get("website") or t.get("contact:website"),
                    "phone": t.get("phone") or t.get("contact:phone"),
                    "opening_hours": t.get("opening_hours"),
                })
            return out
        except Exception as ex:  # noqa: BLE001
            last = str(ex)
    return [{"error": last}]


def nominatim(address):
    q = urllib.parse.urlencode({"q": address, "format": "jsonv2", "limit": 2, "addressdetails": 1})
    try:
        return [{"display": x["display_name"], "lat": float(x["lat"]), "lng": float(x["lon"]), "type": x.get("type")}
                for x in get("https://nominatim.openstreetmap.org/search?" + q)]
    except Exception as ex:  # noqa: BLE001
        return [{"error": str(ex)}]


for path in glob.glob("supabase/guides/*.candidates.json"):
    items = json.load(open(path))
    # Una sola richiesta Overpass per tutti i candidati, con qualche tentativo
    pattern = "|".join(it["key"] for it in items)
    allosm = [{"error": "nessun tentativo"}]
    for attempt in range(4):
        allosm = overpass(pattern)
        if not (allosm and "error" in allosm[0]):
            break
        time.sleep(10)
    result = []
    for it in items:
        k = it["key"].lower()
        osm = [o for o in allosm if "error" in o or (o.get("name") and k in o["name"].lower())]
        nom = nominatim(it["address"])
        if not nom or "error" in nom[0]:
            nom = nominatim(it["name"] + ", " + it["address"])
        time.sleep(1.2)
        result.append({"name": it["name"], "osm": osm, "nominatim": nom})
    out = path.replace(".candidates.json", ".resolved.json")
    json.dump(result, open(out, "w"), ensure_ascii=False, indent=1)
    print("scritto", out)
