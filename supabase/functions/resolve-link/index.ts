// resolve-link
// mode "resolve" (default): apre un link corto di Google Maps e restituisce l'indirizzo completo.
// mode "og": legge l'immagine di anteprima (og:image) di un sito, per la foto del posto.
// Richiede un utente loggato. Niente proxy aperto: domini limitati o solo l'URL dell'immagine in uscita.

const SHORT = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/];
const FOLLOW = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/, /(^|\.)google\.[a-z.]+$/];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function unwrapConsent(u: URL): URL {
  if (/consent\.google\./.test(u.hostname)) {
    const c = u.searchParams.get('continue');
    if (c) return new URL(c);
  }
  return u;
}

function isPrivateHost(h: string) {
  return /^(localhost|.*\.local|.*\.internal)$/i.test(h) ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(h) ||
    h.includes(':') || /^\d+$/.test(h);
}

async function resolveShort(start: URL) {
  if (!SHORT.some((r) => r.test(start.hostname))) return json({ error: 'solo link corti di Google Maps' }, 400);
  let current = start;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it' } });
    await res.body?.cancel();
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) break;
    const next = unwrapConsent(new URL(loc, current));
    if (!FOLLOW.some((r) => r.test(next.hostname))) break;
    current = next;
    if (/\/maps\//.test(current.pathname) || current.searchParams.has('q')) break;
  }
  return json({ url: current.href });
}

async function ogImage(start: URL) {
  if (isPrivateHost(start.hostname)) return json({ error: 'indirizzo non valido' }, 400);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(start, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'it-IT,it' }, signal: ctrl.signal });
    if (!res.ok || !/text\/html/.test(res.headers.get('content-type') || '')) return json({ image: null });
    // Leggi solo l'inizio della pagina
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
    if (!raw) return json({ image: null });
    const img = new URL(raw.replace(/&amp;/g, '&'), res.url);
    if (img.protocol !== 'https:' && img.protocol !== 'http:') return json({ image: null });
    return json({ image: img.href, site: new URL(res.url).hostname });
  } catch {
    return json({ image: null });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'metodo non valido' }, 405);

  let start: URL;
  let mode = 'resolve';
  try {
    const body = await req.json();
    start = new URL(String(body.url));
    if (body.mode === 'og') mode = 'og';
  } catch {
    return json({ error: 'link non valido' }, 400);
  }
  if (start.protocol !== 'https:' && start.protocol !== 'http:') return json({ error: 'link non valido' }, 400);

  return mode === 'og' ? ogImage(start) : resolveShort(start);
});
