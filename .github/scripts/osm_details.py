"""Cerca su OpenStreetMap (Nominatim) i dettagli dei posti ancora da compilare
e li passa alla funzione enrich-places, che fa il resto (sito, foto, salvataggio).

OpenStreetMap blocca i server di Supabase, non quelli di GitHub: per questo il passaggio è qui.
"""
import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request

SB = "https://btyvzzmyzmlvyhxwavxd.supabase.co"
KEY = "sb_publishable_u8wHUg1_eKbo1U3nwGphRA_vVF-u8Vj"
UA = {"User-Agent": "carlottaemichele.it/1.0 (dettagli automatici dei posti)"}
STOP = set("di del della dei delle da la il lo le i gli e al alla alle ai the de do osteria trattoria ristorante bar caffe cantina hotel museo agriturismo farmhouse albergo rifugio locanda pizzeria enoteca vineria village chalet".split())
TYPE_WORDS = re.compile(r"\b(farmhouse|agriturismo|ristorante|trattoria|osteria|hotel|albergo|b&b|rifugio|locanda|pizzeria|enoteca|vineria|bar|caff[eè])\b", re.I)


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def similar(a, b):
    ta = [w for w in norm(a).split() if len(w) > 2 and w not in STOP]
    tb = set(norm(b).split())
    return bool(ta) and sum(w in tb for w in ta) / len(ta) >= 0.5


def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode() or "null")


def clean_url(u):
    if not u:
        return None
    s = str(u).split(";")[0].strip()
    if not re.match(r"^https?://", s, re.I):
        s = "https://" + s.lstrip("/")
    return s


def insta(v):
    if not v:
        return None
    s = str(v).strip()
    if s.startswith("http"):
        return s
    return f"https://www.instagram.com/{s.lstrip('@').rstrip('/')}/"


def lookup(p):
    names = [p["name"]]
    cleaned = re.sub(r"\s+", " ", TYPE_WORDS.sub(" ", p["name"])).strip()
    if cleaned and cleaned != p["name"]:
        names.append(cleaned)
    dlat, dlng = 0.012, 0.018
    vb = f"{p['lng']-dlng},{p['lat']+dlat},{p['lng']+dlng},{p['lat']-dlat}"
    for q in names:
        params = urllib.parse.urlencode({"q": q, "format": "jsonv2", "extratags": 1, "limit": 5, "bounded": 1, "viewbox": vb, "accept-language": "it"})
        try:
            res = get("https://nominatim.openstreetmap.org/search?" + params) or []
        except Exception as ex:  # noqa: BLE001
            print("  nominatim errore", ex)
            res = []
        time.sleep(1.2)
        hits = [r for r in res if r.get("name") and (similar(p["name"], r["name"]) or similar(r["name"], p["name"]))]
        if hits:
            t = {**(hits[0].get("extratags") or {})}
            pick = lambda *ks: next((t[k] for k in ks if t.get(k)), None)  # noqa: E731
            return {
                "website": clean_url(pick("website", "contact:website", "url")),
                "phone": pick("phone", "contact:phone", "contact:mobile"),
                "email": pick("email", "contact:email"),
                "opening_hours": pick("opening_hours"),
                "menu_url": clean_url(pick("website:menu", "menu:url", "contact:menu", "menu")),
                "instagram": insta(pick("contact:instagram", "instagram")),
            }
    return None


sel = "id,name,lat,lng"
todo = get(f"{SB}/rest/v1/places?select={sel}&enriched_at=is.null&lat=not.is.null&order=created_at.desc&limit=20",
           headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"}) or []
print(f"{len(todo)} posti da cercare")
if not todo:
    raise SystemExit(0)

found = {}
for p in todo:
    found[p["id"]] = lookup(p)
    print(" ", p["name"], "→", "trovato" if found[p["id"]] else "niente")

# Manda alla funzione a gruppi di 6 (ognuno legge anche il sito del posto)
ids = list(found)
for i in range(0, len(ids), 6):
    chunk = {k: found[k] for k in ids[i:i + 6]}
    body = json.dumps({"osm": chunk}).encode()
    try:
        out = get(f"{SB}/functions/v1/enrich-places", data=body, headers={
            "Content-Type": "application/json", "apikey": KEY, "x-enrich-token": os.environ["ENRICH_TOKEN"]})
        for d in (out or {}).get("done", []):
            print("  salvato:", d)
    except Exception as ex:  # noqa: BLE001
        print("  funzione errore", ex)
