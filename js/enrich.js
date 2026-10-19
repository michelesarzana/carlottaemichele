// Dettagli automatici di un posto: sito, contatti, orari, menù.
// Fonte: OpenStreetMap (Overpass). Il menù, se manca, lo cerca la funzione
// resolve-link sul sito del locale.
import { similar } from './photos.js';

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function overpass(query) {
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (r.ok) return await r.json();
    } catch { /* prova il prossimo */ }
  }
  return null;
}

function cleanUrl(u) {
  if (!u) return null;
  let s = String(u).split(';')[0].trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try { return new URL(s).href; } catch { return null; }
}

function instaUrl(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^https?:\/\//.test(s)) return cleanUrl(s);
  return `https://www.instagram.com/${s.replace(/^@/, '').replace(/\/$/, '')}/`;
}

function dist(a, b) {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * k);
}

// Cerca il posto su OpenStreetMap vicino alle coordinate, con un nome simile
export async function osmDetails(place) {
  if (typeof place.lat !== 'number' || !place.name) return null;
  const q = `[out:json][timeout:15];nwr(around:150,${place.lat},${place.lng})["name"];out tags center 60;`;
  const j = await overpass(q);
  const els = (j?.elements || []).map((e) => ({
    tags: e.tags || {},
    lat: e.lat ?? e.center?.lat,
    lng: e.lon ?? e.center?.lon
  })).filter((e) => e.tags.name && similar(place.name, e.tags.name));
  if (!els.length) return null;
  els.sort((a, b) => dist(place, a) - dist(place, b));
  const t = els[0].tags;
  const get = (...keys) => keys.map((k) => t[k]).find(Boolean) || null;
  return {
    website: cleanUrl(get('website', 'contact:website', 'url')),
    phone: get('phone', 'contact:phone', 'contact:mobile'),
    email: get('email', 'contact:email'),
    opening_hours: get('opening_hours'),
    menu_url: cleanUrl(get('website:menu', 'menu:url', 'contact:menu', 'menu')),
    instagram: instaUrl(get('contact:instagram', 'instagram'))
  };
}

// Cerca il link al menù sul sito del locale (tramite la funzione su Supabase)
export async function findMenu(sb, website) {
  if (!website) return null;
  try {
    const { data, error } = await sb.functions.invoke('resolve-link', { body: { url: website, mode: 'menu' } });
    if (error) return null;
    return data?.menu || null;
  } catch { return null; }
}

// Tutto insieme: compila solo i campi vuoti
export async function enrichPlace(sb, place, categoryIsFood) {
  const out = {};
  const osm = await osmDetails(place).catch(() => null);
  if (osm) for (const [k, v] of Object.entries(osm)) if (v) out[k] = v;
  const site = place.url || out.website;
  if (categoryIsFood && !place.menu_url && !out.menu_url && site) {
    const menu = await findMenu(sb, site);
    if (menu) out.menu_url = menu;
  }
  return out;
}

// Orari OSM in italiano, versione leggibile
const DAYS = { Mo: 'lun', Tu: 'mar', We: 'mer', Th: 'gio', Fr: 'ven', Sa: 'sab', Su: 'dom', PH: 'festivi' };
export function prettyHours(s) {
  if (!s) return '';
  return String(s)
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
    .replace(/\boff\b/gi, 'chiuso')
    .replace(/24\/7/, 'sempre aperto')
    .split(';').map((x) => x.trim()).filter(Boolean);
}
