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

async function resolveShort(req: Request, start: URL) {
  if (!SHORT.some((r) => r.test(start.hostname))) return json(req, { error: 'solo link corti di Google Maps' }, 400);
  let current = start;
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it', 'Accept': 'text/html' } });
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
  return json(req, { url: current.href });
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'metodo non valido' }, 405);

  let start: URL;
  let mode = 'resolve';
  try {
    const body = await req.json();
    start = new URL(String(body.url).trim());
    if (body.mode === 'og') mode = 'og';
  } catch {
    return json(req, { error: 'link non valido' }, 400);
  }
  if (start.protocol !== 'https:' && start.protocol !== 'http:') return json(req, { error: 'link non valido' }, 400);

  try {
    return mode === 'og' ? await ogImage(req, start) : await resolveShort(req, start);
  } catch (e) {
    return json(req, { error: String(e?.message || e) }, 502);
  }
});
