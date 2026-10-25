// resolve-link
// mode "resolve" (default): apre un link corto di Google Maps e restituisce l'indirizzo completo.
// mode "og": legge l'immagine di anteprima (og:image) di un sito, per la foto del posto.
// Niente proxy aperto: in uscita solo l'indirizzo finale o l'URL di un'immagine.
// Va pubblicata senza verifica JWT (--no-verify-jwt): i nuovi progetti Supabase
// usano chiavi che il controllo automatico non riconosce.

const SHORT = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/];
const FOLLOW = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/, /(^|\.)google\.[a-z.]+$/];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

function unwrapConsent(u: URL): URL {
  if (/consent\.google\./.test(u.hostname)) {
    const c = u.searchParams.get('continue');
    if (c) return new URL(c);
  }
  return u;
}

function isMapsUrl(u: URL) {
  return /(^|\.)google\.[a-z.]+$/.test(u.hostname) && (/\/maps/.test(u.pathname) || u.searchParams.has('q') || u.searchParams.has('cid'));
}

function isPrivateHost(h: string) {
  return /^(localhost|.*\.local|.*\.internal)$/i.test(h) ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(h) ||
    h.includes(':') || /^\d+$/.test(h);
}

// Se Google risponde con una pagina invece di un rimando, cerca l'indirizzo nel codice
function urlFromHtml(html: string): URL | null {
  const clean = html.replace(/\\u0026/g, '&').replace(/\\u003d/g, '=').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const m = clean.match(/https:\/\/www\.google\.[a-z.]+\/maps\/[^"'\s<>\\]+/) ||
    clean.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>]+)/i) ||
    clean.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!m) return null;
  try { return new URL(m[1] || m[0]); } catch { return null; }
}

const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'it-IT,it',
  'Accept': 'text/html',
  // Salta la pagina del consenso cookie che Google mostra in Europa
  'Cookie': 'CONSENT=YES+cb; SOCS=CAI'
};

function coordsFromUrl(s: string) {
  const m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    s.match(/[?&](?:q|ll|query|sll|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

// Coordinate e nome dalla pagina di Google Maps
async function inspectPage(u: URL) {
  try {
    const res = await fetch(u, { headers: HEADERS });
    const html = (await res.text()).slice(0, 1_500_000);
    const finalUrl = res.url;
    let coords = coordsFromUrl(finalUrl);
    if (!coords) {
      const s = html.match(/staticmap\?[^"']*?center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/) ||
        html.match(/markers=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/);
      if (s) coords = { lat: Number(s[1]), lng: Number(s[2]) };
    }
    if (!coords) {
      // APP_INITIALIZATION_STATE=[[[zoom, lng, lat] …
      const a = html.match(/APP_INITIALIZATION_STATE=\[\[\[(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\]/);
      if (a) coords = { lat: Number(a[3]), lng: Number(a[2]) };
    }
    const title = html.match(/<meta[^>]+(?:property|itemprop)=["'](?:og:title|name)["'][^>]+content=["']([^"']+)["']/i)?.[1];
    return { finalUrl, coords, title: title ? title.replace(/&amp;/g, '&').replace(/ · .*$/, '').trim() : null };
  } catch {
    return { finalUrl: u.href, coords: null, title: null };
  }
}

// Posizione da Google Places (nome + indirizzo dal link). Mai oltre la quota gratuita.
const GKEY = Deno.env.get('GOOGLE_PLACES_KEY') || '';
const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
async function quota(kind: string, max = 800) {
  if (!SB_URL || !SB_KEY) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/use_quota`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind, p_max: max })
    });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}
async function googleLocate(text: string) {
  if (!GKEY || !text || !(await quota('locate'))) return null;
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GKEY,
        // Solo campi della fascia "Pro": quota gratuita di 5.000 al mese
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify({ textQuery: text, languageCode: 'it', maxResultCount: 1 })
    });
    if (!r.ok) return null;
    const p = (await r.json())?.places?.[0];
    if (!p?.location) return null;
    return { lat: p.location.latitude, lng: p.location.longitude, name: p.displayName?.text || null, address: p.formattedAddress || null };
  } catch { return null; }
}

async function resolveShort(req: Request, start: URL) {
  if (!SHORT.some((r) => r.test(start.hostname))) return json(req, { error: 'solo link corti di Google Maps' }, 400);
  let current = start;
  const hops: string[] = [];
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, { redirect: 'manual', headers: HEADERS });
    hops.push(`${res.status} ${current.hostname}`);
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel();
      const next = unwrapConsent(new URL(loc, current));
      if (!FOLLOW.some((r) => r.test(next.hostname))) break;
      current = next;
      if (isMapsUrl(current)) break;
      continue;
    }
    // Nessun rimando: prova a leggere l'indirizzo dalla pagina
    const html = (await res.text()).slice(0, 400_000);
    const found = urlFromHtml(html);
    if (found && FOLLOW.some((r) => r.test(found.hostname))) current = unwrapConsent(found);
    break;
  }

  // Nome e indirizzo dal parametro q (tipico dei link condivisi da iPhone)
  const q = current.searchParams.get('q') || current.searchParams.get('query') || '';
  const isText = q && !/^-?\d+\.\d+,/.test(q);
  let coords = coordsFromUrl(current.href);
  let title: string | null = null;
  if (!coords && isMapsUrl(current)) {
    const page = await inspectPage(current);
    coords = page.coords;
    title = page.title;
    hops.push(`pagina: ${coords ? 'coordinate trovate' : 'niente coordinate'}`);
  }
  const parts = isText ? q.split(',').map((s) => s.trim()).filter(Boolean) : [];
  let gname: string | null = null;
  let gaddress: string | null = null;
  if (!coords && isText) {
    const g = await googleLocate(q);
    if (g) {
      coords = { lat: g.lat, lng: g.lng };
      gname = g.name;
      gaddress = g.address;
      hops.push('google: posizione trovata');
    } else hops.push('google: niente');
  }
  return json(req, {
    url: current.href,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    name: gname || title || parts[0] || null,
    address: gaddress || (parts.length > 1 ? parts.slice(1).join(', ') : null),
    hops
  });
}

async function ogImage(req: Request, start: URL) {
  if (isPrivateHost(start.hostname)) return json(req, { error: 'indirizzo non valido' }, 400);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(start, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'it-IT,it' }, signal: ctrl.signal });
    if (!res.ok || !/text\/html/.test(res.headers.get('content-type') || '')) return json(req, { image: null });
    const reader = res.body!.getReader();
    let html = '';
    const dec = new TextDecoder();
    while (html.length < 300_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    await reader.cancel();
    const pick = (re: RegExp) => html.match(re)?.[1];
    const raw =
      pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
      pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (!raw) return json(req, { image: null });
    const img = new URL(raw.replace(/&amp;/g, '&'), res.url);
    if (img.protocol !== 'https:' && img.protocol !== 'http:') return json(req, { image: null });
    return json(req, { image: img.href, site: new URL(res.url).hostname });
  } catch {
    return json(req, { image: null });
  } finally {
    clearTimeout(timer);
  }
}

// Cerca il link al menù nella home del locale
async function findMenu(req: Request, start: URL) {
  if (isPrivateHost(start.hostname)) return json(req, { error: 'indirizzo non valido' }, 400);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(start, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'it-IT,it' }, signal: ctrl.signal });
    if (!res.ok) return json(req, { menu: null });
    const html = (await res.text()).slice(0, 800_000);
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
      href: m[1].replace(/&amp;/g, '&'),
      text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
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
      const u = new URL(best.href, res.url);
      if (u.protocol === 'https:' || u.protocol === 'http:') menu = u.href;
    }
    // Contatti scritti sul sito
    const tel = links.find((l) => /^tel:/i.test(l.href))?.href.replace(/^tel:/i, '').trim() ||
      html.match(/(?:tel|telefono|phone)[^0-9+]{0,20}(\+?\d[\d .\/-]{7,16}\d)/i)?.[1] || null;
    const mail = links.find((l) => /^mailto:/i.test(l.href))?.href.replace(/^mailto:/i, '').split('?')[0].trim() || null;
    const insta = links.map((l) => l.href).find((h) => /instagram\.com\/[A-Za-z0-9_.]+/.test(h) && !/\/(p|reel|explore)\//.test(h)) || null;
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] || null;
    // Foto vere della pagina: jpg/webp, niente loghi, icone, badge
    const BAD = /(logo|icon|favicon|badge|seal|sprite|placeholder|avatar|banner-ad|payment|flag|stemma|screenshot|removebg|gemini_generated|award|winner|entrepreneur|dummy|blank|pixel|tripadvisor|google|facebook|instagram)/i;
    const imgs: string[] = [];
    const push = (raw?: string) => {
      if (!raw) return;
      let src = raw.replace(/&amp;/g, '&').replace(/\\\//g, '/').split(/\s+/)[0];
      try { src = new URL(src, res.url).href.replace(/^http:/, 'https:'); } catch { return; }
      if (!/\.(jpe?g|webp)(\?|$|\/)/i.test(src) || BAD.test(src)) return;
      // Wix: dall'URL ridimensionato all'originale
      const wix = src.match(/^(https:\/\/static\.wixstatic\.com\/media\/[^/]+?\.(?:jpe?g|webp))/i);
      if (wix) src = wix[1];
      // WordPress: niente -300x200, si usa il file originale
      src = src.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|webp))/i, '$1').replace(/\.(jpe?g)\.webp$/i, '.$1');
      if (/squarespace-cdn\.com/.test(src) && !/format=/.test(src)) src += (src.includes('?') ? '&' : '?') + 'format=1500w';
      if (!imgs.includes(src)) imgs.push(src);
    };
    if (og) push(og);
    for (const m of html.matchAll(/(?:https?:)?\/\/[^"'\s()<>]+?\.(?:jpe?g|webp)(?:\?[^"'\s()<>]*)?/gi)) push(m[0]);
    return json(req, {
      menu,
      phone: tel ? decodeURIComponent(tel).replace(/^\/+/, '').replace(/\s+/g, ' ').trim() : null,
      email: mail ? decodeURIComponent(mail) : null,
      instagram: insta,
      image: imgs[0] || null,
      images: imgs.slice(0, 12),
      site: new URL(res.url).hostname
    });
  } catch {
    return json(req, { menu: null });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'metodo non valido' }, 405);

  let start: URL;
  let mode = 'resolve';
  try {
    const body = await req.json();
    start = new URL(String(body.url).trim());
    if (body.mode === 'og' || body.mode === 'menu') mode = body.mode;
  } catch {
    return json(req, { error: 'link non valido' }, 400);
  }
  if (start.protocol !== 'https:' && start.protocol !== 'http:') return json(req, { error: 'link non valido' }, 400);

  try {
    if (mode === 'og') return await ogImage(req, start);
    if (mode === 'menu') return await findMenu(req, start);
    return await resolveShort(req, start);
  } catch (e) {
    return json(req, { error: String(e?.message || e) }, 502);
  }
});
