// Foto: ricerca automatica (sito del posto, Wikipedia, Wikimedia Commons)
// e caricamento delle vostre, ridimensionate nel browser.

const WIKI = 'https://it.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function stripHtml(s) {
  const d = document.createElement('div');
  d.innerHTML = String(s || '');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['di', 'del', 'della', 'dei', 'delle', 'da', 'la', 'il', 'lo', 'le', 'i', 'gli', 'e', 'al', 'alla', 'ai', 'the', 'de', 'do', 'da', 'osteria', 'trattoria', 'ristorante', 'bar', 'caffe', 'cantina', 'hotel', 'museo']);
export function similar(a, b) {
  const ta = norm(a).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  const tb = new Set(norm(b).split(' '));
  if (!ta.length) return false;
  const hit = ta.filter((w) => tb.has(w)).length;
  return hit / ta.length >= 0.5;
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}

// 1. Foto pubblicate sul sito del posto (serve la funzione su Supabase)
async function websiteImages(sb, url) {
  if (!url) return [];
  try {
    const { data, error } = await sb.functions.invoke('resolve-link', { body: { url, mode: 'menu' } });
    if (error || !data?.images?.length) return [];
    const credit = `Foto: ${data.site || 'sito del posto'}`;
    return data.images.map((u) => ({ url: u, thumb: u, credit, key: u }));
  } catch { return []; }
}
async function fromWebsite(sb, url) {
  return (await websiteImages(sb, url))[0] || null;
}

// 2. Voce di Wikipedia vicina con lo stesso nome
async function fromWikipedia(place) {
  try {
    const q = new URLSearchParams({
      action: 'query', generator: 'geosearch', ggscoord: `${place.lat}|${place.lng}`, ggsradius: '400', ggslimit: '15',
      prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '1200', format: 'json', origin: '*'
    });
    const j = await getJson(`${WIKI}?${q}`);
    const pages = Object.values(j?.query?.pages || {});
    const hit = pages.find((p) => p.thumbnail && similar(place.name, p.title) && !BAD_FILE.test(p.thumbnail.source));
    if (!hit) return null;
    return { url: hit.thumbnail.source, credit: `Foto: Wikipedia, voce "${hit.title}"` };
  } catch { return null; }
}

// 3. Foto libera scattata lì vicino su Wikimedia Commons
async function fromCommons(lat, lng, radius = 150) {
  try {
    const q = new URLSearchParams({
      action: 'query', generator: 'geosearch', ggsnamespace: '6', ggscoord: `${lat}|${lng}`, ggsradius: String(radius), ggslimit: '20',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1200', format: 'json', origin: '*'
    });
    const j = await getJson(`${COMMONS}?${q}`);
    const pages = Object.values(j?.query?.pages || {})
      .map((p) => ({ p, ii: p.imageinfo?.[0] }))
      .filter(({ p, ii }) => ii && /jpe?g/.test(ii.mime) && ii.width >= 800 && ii.width >= ii.height * 0.9 && !BAD_FILE.test(p.title))
      .sort((a, b) => (a.p.index ?? 0) - (b.p.index ?? 0));
    const best = pages[0];
    if (!best) return null;
    const meta = best.ii.extmetadata || {};
    const artist = stripHtml(meta.Artist?.value) || 'autore su Wikimedia Commons';
    const lic = stripHtml(meta.LicenseShortName?.value);
    return { url: best.ii.thumburl || best.ii.url, credit: `Foto: ${artist}${lic ? `, ${lic}` : ''}, Wikimedia Commons` };
  } catch { return null; }
}

// ─────────────────────────────────────────────
// Selezione di candidati, per scegliere a mano
// ─────────────────────────────────────────────
const BAD_FILE = /(\bISS\d|iss0\d\d|view[_ ]of[_ ]earth|from[_ ]space|satellite|sentinel|landsat|astronaut|nasa|\.svg|\.gif|\.tiff?|stemma|coat[_ ]of[_ ]arms|escudo|wappen|blason|bandiera|flag|bandera|map|mappa|mapa|karte|locator|location|logo|icon|sign|diagram|plan\b|pianta|panorama.*\.png)/i;

async function commonsInfo(titles) {
  if (!titles.length) return [];
  const q = new URLSearchParams({
    action: 'query', titles: titles.slice(0, 40).join('|'), prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1200', format: 'json', origin: '*'
  });
  const j = await getJson(`${COMMONS}?${q}`);
  const byTitle = new Map(Object.values(j?.query?.pages || {}).map((p) => [p.title, p]));
  return titles.map((t) => byTitle.get(t)).filter(Boolean).map(toCandidate).filter(Boolean);
}

function toCandidate(p) {
  const ii = p.imageinfo?.[0];
  if (!ii || !/jpe?g|webp/.test(ii.mime) || ii.width < 640 || BAD_FILE.test(p.title)) return null;
  const meta = ii.extmetadata || {};
  const artist = stripHtml(meta.Artist?.value) || 'autore su Wikimedia Commons';
  const lic = stripHtml(meta.LicenseShortName?.value);
  return {
    url: ii.thumburl || ii.url,
    thumb: (ii.thumburl || ii.url).replace(/\/\d+px-/, '/400px-'),
    credit: `Foto: ${artist}${lic ? `, ${lic}` : ''}, Wikimedia Commons`,
    key: p.title
  };
}

async function wikiMediaTitles(title) {
  try {
    const q = new URLSearchParams({ action: 'query', titles: title, prop: 'images', imlimit: '50', redirects: '1', format: 'json', origin: '*' });
    const j = await getJson(`${WIKI}?${q}`);
    const page = Object.values(j?.query?.pages || {})[0];
    // Su it.wikipedia i file si chiamano "File:…" come su Commons
    return (page?.images || []).map((i) => i.title).filter((t) => t && !BAD_FILE.test(t));
  } catch { return []; }
}

async function wikiTitleNear(place) {
  try {
    const q = new URLSearchParams({ action: 'query', list: 'geosearch', gscoord: `${place.lat}|${place.lng}`, gsradius: '400', gslimit: '15', format: 'json', origin: '*' });
    const j = await getJson(`${WIKI}?${q}`);
    return (j?.query?.geosearch || []).find((p) => similar(place.name, p.title))?.title || null;
  } catch { return null; }
}

async function commonsNearTitles(lat, lng, radius) {
  try {
    const q = new URLSearchParams({ action: 'query', list: 'geosearch', gsnamespace: '6', gscoord: `${lat}|${lng}`, gsradius: String(radius), gslimit: '30', format: 'json', origin: '*' });
    const j = await getJson(`${COMMONS}?${q}`);
    return (j?.query?.geosearch || []).map((p) => p.title);
  } catch { return []; }
}

async function commonsSearchTitles(text) {
  try {
    const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: `${text} filetype:bitmap`, srnamespace: '6', srlimit: '20', format: 'json', origin: '*' });
    const j = await getJson(`${COMMONS}?${q}`);
    return (j?.query?.search || []).map((p) => p.title);
  } catch { return []; }
}

function uniq(list) {
  const seen = new Set();
  return list.filter((c) => c && !seen.has(c.url) && seen.add(c.url));
}

// Fino a ~12 foto tra cui scegliere per un posto
export async function placeCandidates(sb, place) {
  const out = [...await websiteImages(sb, place.url)];
  const [wikiTitle, near] = await Promise.all([wikiTitleNear(place), commonsNearTitles(place.lat, place.lng, 200)]);
  const wikiFiles = wikiTitle ? await wikiMediaTitles(wikiTitle) : [];
  const titles = [...new Set([...wikiFiles, ...near])];
  try { out.push(...await commonsInfo(titles)); } catch { /* niente */ }
  if (out.length < 6) {
    try { out.push(...await commonsInfo(await commonsNearTitles(place.lat, place.lng, 800))); } catch { /* niente */ }
  }
  return uniq(out).slice(0, 18);
}

// Fino a ~12 foto tra cui scegliere per un viaggio
export async function tripCandidates(trip) {
  const name = (trip.destination?.split(',')[0] || trip.name || '').trim();
  const [wikiFiles, search] = await Promise.all([name ? wikiMediaTitles(name) : [], name ? commonsSearchTitles(name) : []]);
  let out = [];
  try { out = await commonsInfo([...new Set([...wikiFiles, ...search])]); } catch { /* niente */ }
  if (out.length < 6 && typeof trip.lat === 'number') {
    try { out.push(...await commonsInfo(await commonsNearTitles(trip.lat, trip.lng, 3000))); } catch { /* niente */ }
  }
  return uniq(out).slice(0, 12);
}

export async function findPlacePhoto(sb, place) {
  return (await fromWebsite(sb, place.url))
    || (await fromWikipedia(place))
    || (await fromCommons(place.lat, place.lng, 150))
    || (await fromCommons(place.lat, place.lng, 600));
}

// Copertina di un viaggio: la prima foto vera (niente stemmi, bandiere, mappe)
export async function findTripCover(trip) {
  return (await tripCandidates(trip))[0] || null;
}

// Ridimensiona e carica una foto vostra
async function resize(file, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  let w, h, draw;
  if (bmp) {
    w = bmp.width; h = bmp.height; draw = (ctx, W, H) => ctx.drawImage(bmp, 0, 0, W, H);
  } else {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    w = img.naturalWidth; h = img.naturalHeight; draw = (ctx, W, H) => ctx.drawImage(img, 0, 0, W, H);
  }
  const k = Math.min(1, max / Math.max(w, h));
  const W = Math.round(w * k);
  const H = Math.round(h * k);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  draw(canvas.getContext('2d'), W, H);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}

export async function uploadPhoto(sb, file, folder) {
  const blob = await resize(file);
  if (!blob) throw new Error('foto non leggibile');
  const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

export function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
