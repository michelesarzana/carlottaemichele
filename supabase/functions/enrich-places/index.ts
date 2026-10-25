// enrich-places
// Compila in automatico i posti nuovi: sito, telefono, email, Instagram, orari, menù e foto.
// Gira sul server, quindi funziona anche se chiudete l'app subito dopo aver salvato.
//
// La chiama il database a ogni posto nuovo (trigger) e ogni 15 minuti (controllo periodico).
// Non prende parametri: lavora solo sui posti ancora da compilare, e compila solo i campi vuoti.
//
// Fonti, in ordine:
//   1. Google Places API, solo se c'è il segreto GOOGLE_PLACES_KEY (facoltativo)
//   2. OpenStreetMap (Overpass)
//   3. il sito del posto (contatti, menù, foto)
//   4. per la foto: sito, Wikipedia, Wikimedia Commons
//
// Va pubblicata senza verifica JWT (--no-verify-jwt), come resolve-link.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GKEY = Deno.env.get('GOOGLE_PLACES_KEY') || '';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const BOT_UA = 'carlottaemichele.it/1.0 (dettagli automatici dei posti)';
const FOOD = new Set(['ristoranti', 'bar', 'vino']);
const BATCH = 8;

type Place = {
  id: string; name: string; category_id: string; lat: number; lng: number;
  area: string | null; address: string | null; url: string | null;
  phone: string | null; email: string | null; instagram: string | null; menu_url: string | null;
  opening_hours: string | null; photo_url: string | null; photo_source: string | null; enriched_at: string | null;
};
type Photo = { url: string; credit: string };

// ─── utilità ───────────────────────────────────────────────

async function get(url: string | URL, init: RequestInit = {}, ms = 9000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } catch { return null; } finally { clearTimeout(t); }
}

async function getJson(url: string | URL, init: RequestInit = {}, ms = 9000) {
  const r = await get(url, { ...init, headers: { 'User-Agent': BOT_UA, ...(init.headers || {}) } }, ms);
  if (!r?.ok) return null;
  try { return await r.json(); } catch { return null; }
}

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}

function norm(s: string) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['di', 'del', 'della', 'dei', 'delle', 'da', 'la', 'il', 'lo', 'le', 'i', 'gli', 'e', 'al', 'alla', 'ai', 'the', 'de', 'do', 'osteria', 'trattoria', 'ristorante', 'bar', 'caffe', 'cantina', 'hotel', 'museo']);
function similar(a: string, b: string) {
  const ta = norm(a).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  const tb = new Set(norm(b).split(' '));
  if (!ta.length) return false;
  return ta.filter((w) => tb.has(w)).length / ta.length >= 0.5;
}

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * k);
}

function cleanUrl(u?: string | null) {
  if (!u) return null;
  let s = String(u).split(';')[0].trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try { return new URL(s).href; } catch { return null; }
}

function instaUrl(v?: string | null) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^https?:\/\//.test(s)) return cleanUrl(s);
  return `https://www.instagram.com/${s.replace(/^@/, '').replace(/\/$/, '')}/`;
}

function stripHtml(s?: string) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function isPrivateHost(h: string) {
  return /^(localhost|.*\.local|.*\.internal)$/i.test(h) ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(h) ||
    h.includes(':') || /^\d+$/.test(h);
}

// ─── 1. Google Places API (facoltativa) ────────────────────

const GDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n: number) => String(n ?? 0).padStart(2, '0');

// Orari di Google nel formato di OpenStreetMap, che il sito sa già mostrare
function googleHours(h: any): string | null {
  const periods = h?.periods;
  if (!Array.isArray(periods) || !periods.length) return null;
  if (periods.length === 1 && periods[0].open && !periods[0].close) return '24/7';
  const byDay = new Map<number, string[]>();
  for (const p of periods) {
    if (!p.open) continue;
    const d = p.open.day;
    const span = `${pad(p.open.hour)}:${pad(p.open.minute)}-${p.close ? `${pad(p.close.hour)}:${pad(p.close.minute)}` : '24:00'}`;
    byDay.set(d, [...(byDay.get(d) || []), span]);
  }
  return [1, 2, 3, 4, 5, 6, 0].map((d) => `${GDAYS[d]} ${byDay.get(d)?.join(',') || 'off'}`).join('; ');
}

async function google(place: Place) {
  if (!GKEY) return null;
  const body = {
    textQuery: [place.name, place.address || place.area].filter(Boolean).join(', '),
    languageCode: 'it',
    maxResultCount: 3,
    locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 300 } }
  };
  const j = await getJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GKEY,
      'X-Goog-FieldMask': 'places.displayName,places.location,places.internationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.photos'
    },
    body: JSON.stringify(body)
  });
  const hit = (j?.places || []).find((p: any) =>
    p.location && dist(place, { lat: p.location.latitude, lng: p.location.longitude }) < 300);
  if (!hit) return null;
  return {
    website: cleanUrl(hit.websiteUri),
    phone: hit.internationalPhoneNumber || null,
    opening_hours: googleHours(hit.regularOpeningHours),
    photo: hit.photos?.[0] || null
  };
}

// La foto di Google la copiamo nel nostro archivio: l'indirizzo di Google contiene la chiave
async function googlePhoto(place: Place, photo: any): Promise<Photo | null> {
  if (!GKEY || !photo?.name) return null;
  const r = await get(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1600&key=${GKEY}`, {}, 15000);
  if (!r?.ok || !/image\//.test(r.headers.get('content-type') || '')) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  const path = `places/auto-${place.id}.jpg`;
  const up = await fetch(`${SB_URL}/storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': r.headers.get('content-type')!, 'x-upsert': 'true' },
    body: bytes
  });
  if (!up.ok) return null;
  const author = photo.authorAttributions?.[0]?.displayName;
  return { url: `${SB_URL}/storage/v1/object/public/photos/${path}?v=${Date.now().toString(36)}`, credit: `Foto: ${author ? `${author} su ` : ''}Google Maps` };
}

// ─── 2. OpenStreetMap ──────────────────────────────────────

async function osm(place: Place) {
  const q = `[out:json][timeout:15];nwr(around:150,${place.lat},${place.lng})["name"];out tags center 60;`;
  let j: any = null;
  for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    j = await getJson(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 20000);
    if (j) break;
  }
  const els = (j?.elements || [])
    .map((e: any) => ({ tags: e.tags || {}, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
    .filter((e: any) => e.tags.name && similar(place.name, e.tags.name));
  if (!els.length) return null;
  els.sort((a: any, b: any) => dist(place, a) - dist(place, b));
  const t = els[0].tags;
  const pick = (...keys: string[]) => keys.map((k) => t[k]).find(Boolean) || null;
  return {
    website: cleanUrl(pick('website', 'contact:website', 'url')),
    phone: pick('phone', 'contact:phone', 'contact:mobile'),
    email: pick('email', 'contact:email'),
    opening_hours: pick('opening_hours'),
    menu_url: cleanUrl(pick('website:menu', 'menu:url', 'contact:menu', 'menu')),
    instagram: instaUrl(pick('contact:instagram', 'instagram'))
  };
}

// ─── 3. il sito del posto ──────────────────────────────────

async function site(url: string | null) {
  if (!url) return null;
  let start: URL;
  try { start = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(start.protocol) || isPrivateHost(start.hostname)) return null;
  const res = await get(start, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'it-IT,it' } });
  if (!res?.ok) return null;
  const html = (await res.text()).slice(0, 800_000);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: m[1].replace(/&amp;/g, '&'),
    text: stripHtml(m[2]).toLowerCase()
  }));
  const score = (l: { href: string; text: string }) => {
    const h = l.href.toLowerCase();
    let s = 0;
    if (/\bmen[uù]\b|menu/.test(l.text)) s += 5;
    if (/\bla carta\b|\bcarta\b|\bpiatti\b|\bproposte\b|\bcucina\b|\bfood\b|\bdegustazion/.test(l.text)) s += 3;
    if (/men[uù]|carta|food|piatti/.test(h)) s += 3;
    if (/\.pdf($|\?)/.test(h)) s += 1;
    if (/vini|wine|bevande|drink/.test(l.text) && s < 5) s -= 1;
    if (/^(mailto|tel|javascript):/.test(h)) s = -10;
    return s;
  };
  const best = links.map((l) => ({ ...l, s: score(l) })).filter((l) => l.s >= 3).sort((a, b) => b.s - a.s)[0];
  let menu: string | null = null;
  if (best) {
    try {
      const u = new URL(best.href, res.url);
      if (/^https?:$/.test(u.protocol)) menu = u.href;
    } catch { /* niente */ }
  }
  const tel = links.find((l) => /^tel:/i.test(l.href))?.href.replace(/^tel:/i, '').trim() ||
    html.match(/(?:tel|telefono|phone)[^0-9+]{0,20}(\+?\d[\d .\/-]{7,16}\d)/i)?.[1] || null;
  const mail = links.find((l) => /^mailto:/i.test(l.href))?.href.replace(/^mailto:/i, '').split('?')[0].trim() || null;
  const insta = links.map((l) => l.href).find((h) => /instagram\.com\/[A-Za-z0-9_.]+/.test(h) && !/\/(p|reel|explore)\//.test(h)) || null;

  const BAD = /(logo|icon|favicon|badge|seal|sprite|placeholder|avatar|banner-ad|payment|flag|stemma|screenshot|removebg|gemini_generated)/i;
  const imgs: string[] = [];
  const push = (raw?: string) => {
    if (!raw) return;
    let src = raw.replace(/&amp;/g, '&').split(/\s+/)[0];
    try { src = new URL(src, res.url).href.replace(/^http:/, 'https:'); } catch { return; }
    if (!/\.(jpe?g|webp)(\?|$)/i.test(src) || BAD.test(src)) return;
    if (/squarespace-cdn\.com/.test(src) && !/format=/.test(src)) src += (src.includes('?') ? '&' : '?') + 'format=1500w';
    if (!imgs.includes(src)) imgs.push(src);
  };
  push(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1]);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    push(m[0].match(/\bdata-(?:src|image)=["']([^"']+)["']/i)?.[1] || m[0].match(/\bsrc=["']([^"']+)["']/i)?.[1]);
  }
  let phone: string | null = null;
  try { phone = tel ? decodeURIComponent(tel) : null; } catch { phone = tel; }
  return {
    menu_url: menu,
    phone,
    email: mail ? mail.replace(/%40/g, '@') : null,
    instagram: instaUrl(insta),
    photo: imgs[0] ? { url: imgs[0], credit: `Foto: ${new URL(res.url).hostname.replace(/^www\./, '')}` } : null
  };
}

// ─── 4. foto libere ────────────────────────────────────────

const BAD_FILE = /(\bISS\d|iss0\d\d|view[_ ]of[_ ]earth|from[_ ]space|satellite|sentinel|landsat|astronaut|nasa|\.svg|\.gif|\.tiff?|stemma|coat[_ ]of[_ ]arms|escudo|wappen|blason|bandiera|flag|bandera|map|mappa|mapa|karte|locator|location|logo|icon|sign|diagram|plan\b|pianta|panorama.*\.png)/i;

async function wikipedia(place: Place): Promise<Photo | null> {
  const q = new URLSearchParams({
    action: 'query', generator: 'geosearch', ggscoord: `${place.lat}|${place.lng}`, ggsradius: '400', ggslimit: '15',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '1200', format: 'json'
  });
  const j = await getJson(`https://it.wikipedia.org/w/api.php?${q}`);
  const hit = Object.values<any>(j?.query?.pages || {}).find((p) => p.thumbnail && similar(place.name, p.title) && !BAD_FILE.test(p.thumbnail.source));
  return hit ? { url: hit.thumbnail.source, credit: `Foto: Wikipedia, voce "${hit.title}"` } : null;
}

async function commons(lat: number, lng: number, radius: number): Promise<Photo | null> {
  const q = new URLSearchParams({
    action: 'query', generator: 'geosearch', ggsnamespace: '6', ggscoord: `${lat}|${lng}`, ggsradius: String(radius), ggslimit: '20',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1200', format: 'json'
  });
  const j = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  const best = Object.values<any>(j?.query?.pages || {})
    .map((p) => ({ p, ii: p.imageinfo?.[0] }))
    .filter(({ p, ii }) => ii && /jpe?g/.test(ii.mime) && ii.width >= 800 && ii.width >= ii.height * 0.9 && !BAD_FILE.test(p.title))
    .sort((a, b) => (a.p.index ?? 0) - (b.p.index ?? 0))[0];
  if (!best) return null;
  const meta = best.ii.extmetadata || {};
  const artist = stripHtml(meta.Artist?.value) || 'autore su Wikimedia Commons';
  const lic = stripHtml(meta.LicenseShortName?.value);
  return { url: best.ii.thumburl || best.ii.url, credit: `Foto: ${artist}${lic ? `, ${lic}` : ''}, Wikimedia Commons` };
}

// ─── un posto ──────────────────────────────────────────────

async function enrich(place: Place) {
  const patch: Record<string, unknown> = {};
  const used: string[] = [];
  const fill = (col: keyof Place, v: unknown, source: string) => {
    if (!v || place[col] || patch[col]) return;
    patch[col] = v;
    if (!used.includes(source)) used.push(source);
  };
  const needsDetails = !place.enriched_at;
  const needsPhoto = !place.photo_url && place.photo_source !== 'none' && place.photo_source !== 'own';

  const g = await google(place).catch(() => null);
  let website = place.url;
  if (needsDetails) {
    if (g) {
      fill('url', g.website, 'Google');
      fill('phone', g.phone, 'Google');
      fill('opening_hours', g.opening_hours, 'Google');
    }
    const o = await osm(place).catch(() => null);
    if (o) {
      fill('url', o.website, 'OpenStreetMap');
      for (const k of ['phone', 'email', 'opening_hours', 'instagram'] as const) fill(k, o[k], 'OpenStreetMap');
      if (FOOD.has(place.category_id)) fill('menu_url', o.menu_url, 'OpenStreetMap');
    }
    website = place.url || (patch.url as string) || null;
  }

  const s = website ? await site(website).catch(() => null) : null;
  if (needsDetails && s) {
    fill('phone', s.phone, 'sito');
    fill('email', s.email, 'sito');
    fill('instagram', s.instagram, 'sito');
    if (FOOD.has(place.category_id)) fill('menu_url', s.menu_url, 'sito');
  }

  if (needsPhoto) {
    const photo = s?.photo
      || (g?.photo ? await googlePhoto(place, g.photo).catch(() => null) : null)
      || await wikipedia(place).catch(() => null)
      || await commons(place.lat, place.lng, 150).catch(() => null)
      || await commons(place.lat, place.lng, 600).catch(() => null);
    if (photo) Object.assign(patch, { photo_url: photo.url, photo_credit: photo.credit, photo_source: 'auto' });
    else patch.photo_source = 'none';
  }
  if (needsDetails) patch.enriched_at = new Date().toISOString();

  // Scrive solo i campi che erano vuoti
  const r = await db(`places?id=eq.${place.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return { name: place.name, filled: Object.keys(patch).filter((k) => !['enriched_at', 'photo_source', 'photo_credit'].includes(k)), from: used, ok: r.ok };
}

// ─── richiesta ─────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Solo i posti da compilare: dettagli mai cercati, o senza foto e mai cercata
  const sel = 'id,name,category_id,lat,lng,area,address,url,phone,email,instagram,menu_url,opening_hours,photo_url,photo_source,enriched_at';
  const filter = 'or=(enriched_at.is.null,and(photo_url.is.null,photo_source.is.null))';
  const r = await db(`places?select=${sel}&${filter}&lat=not.is.null&order=created_at.desc&limit=${BATCH}`);
  if (!r.ok) return new Response(JSON.stringify({ error: await r.text() }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  const todo: Place[] = await r.json();

  const done = [];
  for (const p of todo) done.push(await enrich(p).catch((e) => ({ name: p.name, error: String(e?.message || e) })));
  return new Response(JSON.stringify({ google: !!GKEY, done }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
