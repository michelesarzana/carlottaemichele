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
function similar(a, b) {
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

// 1. Immagine di anteprima del sito del posto (serve la funzione su Supabase)
async function fromWebsite(sb, url) {
  if (!url) return null;
  try {
    const { data, error } = await sb.functions.invoke('resolve-link', { body: { url, mode: 'og' } });
    if (error || !data?.image) return null;
    return { url: data.image, credit: `Foto: ${data.site || 'sito del posto'}` };
  } catch { return null; }
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
    const hit = pages.find((p) => p.thumbnail && similar(place.name, p.title));
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
      .filter(({ ii }) => ii && /jpe?g/.test(ii.mime) && ii.width >= 800 && ii.width >= ii.height * 0.9)
      .sort((a, b) => (a.p.index ?? 0) - (b.p.index ?? 0));
    const best = pages[0];
    if (!best) return null;
    const meta = best.ii.extmetadata || {};
    const artist = stripHtml(meta.Artist?.value) || 'autore su Wikimedia Commons';
    const lic = stripHtml(meta.LicenseShortName?.value);
    return { url: best.ii.thumburl || best.ii.url, credit: `Foto: ${artist}${lic ? `, ${lic}` : ''}, Wikimedia Commons` };
  } catch { return null; }
}

export async function findPlacePhoto(sb, place) {
  return (await fromWebsite(sb, place.url))
    || (await fromWikipedia(place))
    || (await fromCommons(place.lat, place.lng, 150))
    || (await fromCommons(place.lat, place.lng, 600));
}

// Copertina di un viaggio: la voce Wikipedia della meta
export async function findTripCover(trip) {
  const names = [trip.destination?.split(',')[0], trip.name].filter(Boolean);
  for (const name of names) {
    try {
      const j = await getJson(`https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.trim())}`);
      const img = j?.originalimage?.source || j?.thumbnail?.source;
      if (img && j.type !== 'disambiguation') {
        // Le immagini originali possono essere enormi: chiedi una versione da 1600 px
        const sized = j.thumbnail?.source ? j.thumbnail.source.replace(/\/\d+px-/, '/1600px-') : img;
        return { url: sized, credit: `Foto: Wikipedia, voce "${j.title}"` };
      }
    } catch { /* prova il prossimo */ }
  }
  if (typeof trip.lat === 'number') return fromCommons(trip.lat, trip.lng, 2000);
  return null;
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
