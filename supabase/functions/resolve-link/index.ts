// resolve-link: apre un link corto di Google Maps e restituisce l'indirizzo completo.
// Solo domini di Google Maps (niente proxy aperto). Richiede un utente loggato.

const ALLOWED = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/];
const FOLLOW = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/, /(^|\.)google\.[a-z.]+$/];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function unwrapConsent(u: URL): URL {
  // In Europa Google a volte passa da consent.google.com?continue=<url vero>
  if (/consent\.google\./.test(u.hostname)) {
    const c = u.searchParams.get('continue');
    if (c) return new URL(c);
  }
  return u;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'metodo non valido' }, 405);

  let start: URL;
  try {
    const { url } = await req.json();
    start = new URL(String(url));
  } catch {
    return json({ error: 'link non valido' }, 400);
  }
  if (start.protocol !== 'https:' && start.protocol !== 'http:') return json({ error: 'link non valido' }, 400);
  if (!ALLOWED.some((r) => r.test(start.hostname))) return json({ error: 'solo link corti di Google Maps' }, 400);

  let current = start;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Accept-Language': 'it-IT,it' }
    });
    await res.body?.cancel();
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) break;
    const next = unwrapConsent(new URL(loc, current));
    if (!FOLLOW.some((r) => r.test(next.hostname))) break;
    current = next;
    // Arrivati su un indirizzo completo di Maps: basta così
    if (/\/maps\//.test(current.pathname) || current.searchParams.has('q')) break;
  }

  return json({ url: current.href });
});
