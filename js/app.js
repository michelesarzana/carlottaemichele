import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY, MAP_STYLE, DEFAULT_VIEW, PEOPLE, VOTE_LABELS } from './config.js?v=20261106122338';
import { icon, CATEGORY_ICONS } from './icons.js?v=20261106122338';
import { Sheet } from './sheet.js?v=20261106122338';
import { findTripCover, uploadPhoto, pickFile, placeCandidates, tripCandidates } from './photos.js?v=20261106122338';
import { prettyHours } from './enrich.js?v=20261106122338';

const FOOD = new Set(['ristoranti', 'bar', 'bere', 'vino']);
const CUISINES = ['Italiana', 'Tradizionale', 'Pizza', 'Pesce', 'Carne', 'Giapponese', 'Sushi', 'Ramen', 'Cinese', 'Coreana',
  'Thai', 'Indiana', 'Fusion', 'Spagnola', 'Tapas', 'Francese', 'Mediorientale', 'Messicana', 'Peruviana', 'Hamburger',
  'Vegetariana', 'Brunch', 'Gelato', 'Dolci', 'Cocktail'];

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' }
});

// ─────────────────────────────────────────────
// Stato
// ─────────────────────────────────────────────
const S = {
  categories: [],
  catById: new Map(),
  places: [],
  placeById: new Map(),
  guides: [],
  trips: [],
  tripById: new Map(),
  tripDates: new Map(),
  dates: new Map(),
  autoPhotosDone: false,
  tripFilter: { star: false, prices: new Set() },
  editor: false,
  me: null,
  email: null,
  filter: emptyFilter(),
  sort: 'rel',
  here: null,
  pinEls: new Map(),
  view: { name: 'list' },
  lastViewKey: '',
  firstFit: false,
  sheetVisible: 0
};

const $ = (id) => document.getElementById(id);
const PALETTE = ['#D9480F', '#8A5A2B', '#5E3A87', '#2F6FDB', '#2B7A4B', '#C2367A', '#4B4FB8', '#0F7F7F', '#B08900', '#5F6B7A'];

// ─────────────────────────────────────────────
// Utilità
// ─────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}
function safeColor(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#5F6B7A'; }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function fmtScore(n) { return n == null ? '' : n.toLocaleString('it-IT', { maximumFractionDigits: 1 }); }
function fmtDate(d) {
  if (!d) return 'Senza data';
  return new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}
function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Guida Michelin: piccoli segni accanto al nome
function michelin(p, size = 12) {
  const out = [];
  if (p.michelin_stars) out.push(`<span class="mich mich-red" title="${p.michelin_stars} ${p.michelin_stars === 1 ? 'stella' : 'stelle'} Michelin">${icon('star', size, 2.6).repeat(p.michelin_stars)}</span>`);
  if (p.michelin_green) out.push(`<span class="mich mich-green" title="Stella verde Michelin">${icon('star', size, 2.6)}</span>`);
  if (p.michelin_bib) out.push('<span class="mich mich-bib" title="Bib Gourmand">Bib</span>');
  return out.join('');
}
function michelinText(p) {
  return [p.michelin_stars ? `${p.michelin_stars} ${p.michelin_stars === 1 ? 'stella' : 'stelle'} Michelin` : '',
    p.michelin_green ? 'Stella verde Michelin' : '', p.michelin_bib ? 'Bib Gourmand' : ''].filter(Boolean);
}
function price(n) { return n === 0 ? 'Gratis' : n ? '€'.repeat(n) : ''; }
function slugify(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cat-' + Date.now().toString(36);
}
function initial(name) { return name ? name[0].toUpperCase() + '.' : ''; }
function isApple() { return /iPhone|iPad|Macintosh/.test(navigator.userAgent); }
function placeCats(p) { return [p.category_id, ...(p.extra_categories || [])].filter(Boolean); }
function cat(id) { return S.catById.get(id) || { id, name: 'Altro', color: '#5F6B7A', icon: 'pin' }; }
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function fail(err, what = 'Qualcosa è andato storto') {
  console.error(err);
  toast(what + (err?.message ? ': ' + err.message : ''));
}

// ─────────────────────────────────────────────
// Dati
// ─────────────────────────────────────────────
async function refreshAuth() {
  const { data: { session } } = await sb.auth.getSession();
  S.email = session?.user?.email || null;
  S.editor = false;
  S.me = null;
  if (session) {
    const [ed, name] = await Promise.all([sb.rpc('is_editor'), sb.rpc('my_editor_name')]);
    S.editor = !!ed.data;
    S.me = name.data || null;
  }
}

async function load() {
  const [c, p, v, g, t] = await Promise.all([
    sb.from('categories').select('*').order('sort'),
    sb.from('places').select('*'),
    sb.from('visits').select('id, seq, place_id, vote_c, vote_m, review, review_by').order('seq', { ascending: false }),
    sb.from('guides').select('*').order('created_at', { ascending: false }),
    sb.from('trips').select('*').order('created_at', { ascending: false })
  ]);
  const err = c.error || p.error || v.error || g.error;
  if (err) {
    fail(err, 'Non riesco a leggere i dati');
    return;
  }
  S.categories = c.data;
  S.catById = new Map(c.data.map((x) => [x.id, x]));
  S.guides = g.data;
  S.trips = t.error ? [] : t.data;
  S.tripById = new Map(S.trips.map((x) => [x.id, x]));

  S.dates = new Map();
  S.tripDates = new Map();
  if (S.editor) {
    const [d, td] = await Promise.all([sb.from('visit_dates').select('*'), sb.from('trip_dates').select('*')]);
    if (!d.error) for (const r of d.data) S.dates.set(r.visit_id, r.visited_on);
    if (!td.error) for (const r of td.data) S.tripDates.set(r.trip_id, r);
  }

  const byPlace = new Map();
  for (const visit of v.data) {
    if (!byPlace.has(visit.place_id)) byPlace.set(visit.place_id, []);
    byPlace.get(visit.place_id).push(visit);
  }
  S.places = p.data.map((pl) => {
    const visits = byPlace.get(pl.id) || [];
    const last = visits[0] || null;
    const votes = last ? [last.vote_c, last.vote_m].filter((x) => x != null) : [];
    return {
      ...pl,
      visits,
      last,
      done: visits.length > 0,
      score: votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null
    };
  });
  S.placeById = new Map(S.places.map((x) => [x.id, x]));
}

// ─────────────────────────────────────────────
// Filtri
// ─────────────────────────────────────────────
function emptyFilter() {
  return { status: 'all', cats: new Set(), q: '', cuisines: new Set(), prices: new Set(), mich: new Set(), top: false, trip: '', near: false };
}
function cloneFilter(F) {
  return { ...F, cats: new Set(F.cats), cuisines: new Set(F.cuisines), prices: new Set(F.prices), mich: new Set(F.mich) };
}
const NEAR_M = 3000;
function filtered(F = S.filter) {
  const q = norm(F.q);
  return S.places.filter((p) =>
    (F.status === 'all' || (F.status === 'done') === p.done) &&
    (!F.cats.size || placeCats(p).some((c) => F.cats.has(c))) &&
    (!F.cuisines.size || (p.cuisines || []).some((c) => F.cuisines.has(c))) &&
    (!F.prices.size || F.prices.has(p.price == null ? 'x' : String(p.price))) &&
    (!F.mich.size || (F.mich.has('stars') && p.michelin_stars > 0) || (F.mich.has('green') && p.michelin_green) || (F.mich.has('bib') && p.michelin_bib)) &&
    (!F.top || (p.score != null && p.score >= 3.5)) &&
    (!F.trip || p.trip_id === F.trip) &&
    (!F.near || !S.here || metersBetween(S.here, p) <= NEAR_M) &&
    (!q || norm(`${p.name} ${p.area || ''} ${p.address || ''} ${p.notes || ''} ${(p.cuisines || []).join(' ')} ${placeCats(p).map((c) => cat(c).name).join(' ')}`).includes(q))
  );
}
function activeCount(F = S.filter) {
  return F.cats.size + F.cuisines.size + F.prices.size + F.mich.size + (F.top ? 1 : 0) + (F.trip ? 1 : 0) + (F.near ? 1 : 0);
}
const PRICE_LABEL = { 0: 'Gratis', 1: '€', 2: '€€', 3: '€€€', 4: '€€€€', x: 'Senza prezzo' };
const MICH_LABEL = { stars: 'Stellati Michelin', green: 'Stella verde', bib: 'Bib Gourmand' };
function filterTokens(F = S.filter) {
  const out = [];
  for (const id of F.cats) out.push({ key: `cat:${id}`, label: cat(id).name });
  for (const c of F.cuisines) out.push({ key: `cu:${c}`, label: c });
  for (const k of F.prices) out.push({ key: `p:${k}`, label: PRICE_LABEL[k] || k });
  for (const k of F.mich) out.push({ key: `m:${k}`, label: MICH_LABEL[k] || k });
  if (F.top) out.push({ key: 'top', label: 'Da tornarci' });
  if (F.trip) out.push({ key: 'trip', label: S.tripById.get(F.trip)?.name || 'Viaggio' });
  if (F.near) out.push({ key: 'near', label: 'Vicino a me' });
  return out;
}
function toggleToken(F, key, on) {
  const [k, ...rest] = key.split(':');
  const v = rest.join(':');
  const set = k === 'cat' ? F.cats : k === 'cu' ? F.cuisines : k === 'p' ? F.prices : k === 'm' ? F.mich : null;
  if (set) { const want = on ?? !set.has(v); want ? set.add(v) : set.delete(v); return; }
  if (k === 'top') F.top = on ?? !F.top;
  else if (k === 'near') F.near = on ?? !F.near;
  else if (k === 'trip') F.trip = on === false ? '' : (v || '');
}
function filterHash(F = S.filter) {
  const u = new URLSearchParams();
  if (F.q.trim()) u.set('q', F.q.trim());
  if (F.status !== 'all') u.set('stato', F.status === 'done' ? 'fatti' : 'dafare');
  if (F.cats.size) u.set('cat', [...F.cats].join(','));
  if (F.cuisines.size) u.set('cucina', [...F.cuisines].join(','));
  if (F.prices.size) u.set('prezzo', [...F.prices].join(','));
  if (F.mich.size) u.set('michelin', [...F.mich].join(','));
  if (F.top) u.set('voto', 'tornarci');
  if (F.trip) u.set('viaggio', F.trip);
  if (F.near) u.set('vicino', '1');
  const qs = u.toString();
  return `#/cerca${qs ? '?' + qs : ''}`;
}
function filterFromQuery(qs) {
  const u = new URLSearchParams(qs || '');
  const F = emptyFilter();
  const list = (k) => (u.get(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
  F.q = u.get('q') || '';
  F.status = u.get('stato') === 'fatti' ? 'done' : u.get('stato') === 'dafare' ? 'todo' : 'all';
  F.cats = new Set(list('cat'));
  F.cuisines = new Set(list('cucina'));
  F.prices = new Set(list('prezzo'));
  F.mich = new Set(list('michelin').filter((k) => MICH_LABEL[k]));
  F.top = u.get('voto') === 'tornarci';
  F.trip = u.get('viaggio') || '';
  F.near = u.get('vicino') === '1';
  return F;
}
function allCuisines() {
  const n = new Map();
  for (const p of S.places) for (const c of p.cuisines || []) n.set(c, (n.get(c) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}
function locateMe() {
  return new Promise((resolve) => {
    if (live.on && S.here) return resolve(S.here);
    if (!navigator.geolocation) { toast('Posizione non disponibile su questo dispositivo'); return resolve(null); }
    navigator.geolocation.getCurrentPosition(
      (pos) => { S.here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; resolve(S.here); },
      () => { toast('Non riesco a leggere la posizione'); resolve(null); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
function fmtDist(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km`; }

// ─────────────────────────────────────────────
// Mappa
// ─────────────────────────────────────────────
// Livelli della mappa
function rasterStyle(layers) {
  const sources = {};
  const out = [];
  layers.forEach((l, i) => {
    sources['r' + i] = { type: 'raster', tiles: l.tiles, tileSize: 256, maxzoom: l.maxzoom, attribution: l.attribution };
    out.push({ id: 'r' + i, type: 'raster', source: 'r' + i });
  });
  return { version: 8, sources, layers: out };
}
const LAYERS = {
  mappa: { label: 'Mappa', hint: 'Chiara, essenziale', swatch: '#F1F0EB', style: MAP_STYLE, tint: true },
  dettagliata: { label: 'Dettagliata', hint: 'Strade, negozi, edifici', swatch: '#E8E2D2', style: 'https://tiles.openfreemap.org/styles/liberty' },
  satellite: {
    label: 'Satellite', hint: 'Foto aeree con nomi', swatch: '#4C5B3F',
    style: rasterStyle([
      { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], maxzoom: 19, attribution: 'Foto aeree © Esri, Maxar, Earthstar Geographics' },
      { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], maxzoom: 19, attribution: 'Nomi © Esri' }
    ])
  },
  sentieri: {
    label: 'Sentieri', hint: 'Topografica, curve di livello', swatch: '#D9E3C8',
    style: rasterStyle([
      { tiles: ['a', 'b', 'c'].map((x) => `https://${x}.tile.opentopomap.org/{z}/{x}/{y}.png`), maxzoom: 17, attribution: 'Mappa © OpenTopoMap (CC-BY-SA), dati © OpenStreetMap' }
    ])
  }
};
S.layer = 'mappa';
try { const l = localStorage.getItem('cem-layer'); if (LAYERS[l]) S.layer = l; } catch { /* niente */ }

// App sulla schermata Home: riparte da dove eravate (pagina e mappa)
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let savedView = null;
try { savedView = JSON.parse(localStorage.getItem('cem-view') || 'null'); } catch { /* niente */ }
const resumeView = STANDALONE && savedView && (!location.hash || location.hash === '#/') && Date.now() - (savedView.t || 0) < 7 * 864e5;
if (resumeView && savedView.hash && savedView.hash !== '#/') history.replaceState(null, '', savedView.hash);
if (location.search.includes('app=1')) history.replaceState(null, '', location.pathname + location.hash);

const map = new maplibregl.Map({
  container: 'map',
  style: LAYERS[S.layer].style,
  center: resumeView && savedView.center ? savedView.center : DEFAULT_VIEW.center,
  zoom: resumeView && savedView.zoom != null ? savedView.zoom : DEFAULT_VIEW.zoom,
  attributionControl: { compact: true },
  dragRotate: false,
  pitchWithRotate: false
});
map.touchZoomRotate.disableRotation();

map.on('style.load', () => {
  // Le aree dei viaggi vanno ridisegnate a ogni cambio di livello
  setTimeout(() => renderAreas(), 0);
  if (!LAYERS[S.layer].tint) return;
  // Tinta la mappa sui colori del design
  for (const layer of map.getStyle().layers) {
    try {
      const id = layer.id;
      if (layer.type === 'background') map.setPaintProperty(id, 'background-color', '#F1F0EB');
      else if (layer.type === 'fill' && /water/.test(id)) map.setPaintProperty(id, 'fill-color', '#B9D6EC');
      else if (layer.type === 'fill' && /(park|wood|grass|forest|scrub|wetland|landcover)/.test(id)) map.setPaintProperty(id, 'fill-color', '#DDEBD3');
      else if (layer.type === 'line' && /(waterway|river)/.test(id)) map.setPaintProperty(id, 'line-color', '#B9D6EC');
    } catch { /* livello senza quella proprietà */ }
  }
});

let moveTimer = 0;
function saveView() {
  try {
    const c = map.getCenter();
    localStorage.setItem('cem-view', JSON.stringify({ hash: location.hash || '#/', center: [c.lng, c.lat], zoom: map.getZoom(), t: Date.now() }));
  } catch { /* niente */ }
}
window.addEventListener('hashchange', saveView);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveView(); });
if (resumeView) S.firstFit = true;

map.on('moveend', () => {
  saveView();
  if (S.view.name !== 'list') return;
  clearTimeout(moveTimer);
  moveTimer = setTimeout(renderSheet, 120);
});

const isDesktop = () => window.matchMedia('(min-width: 900px), (min-width: 600px) and (min-aspect-ratio: 3/4)').matches;
// Altezza della barra in alto: il pannello parte subito sotto
new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', $('topbar').offsetHeight + 'px')).observe($('topbar'));

function mapPadding() {
  if (isDesktop()) return { top: 60, bottom: 60, left: ($('topbar').offsetWidth || 400) + 50, right: 70 };
  return { top: 150, bottom: Math.min(S.sheetVisible, window.innerHeight * 0.6) + 30, left: 40, right: 40 };
}

let markers = [];
function clearMarkers() { for (const m of markers) m.remove(); markers = []; }

function renderMarkers() {
  clearMarkers();
  if (S.view.name === 'guide') {
    const g = currentGuide();
    if (!g) return;
    (g.items || []).forEach((it, i) => {
      if (typeof it.lat !== 'number' || typeof it.lng !== 'number') return;
      const el = document.createElement('div');
      const btn = document.createElement('button');
      btn.className = 'pin-num' + (it.verified ? '' : ' unverified');
      btn.textContent = String(i + 1);
      btn.setAttribute('aria-label', `${i + 1}. ${it.name}`);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector(`[data-guide-item="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      el.append(btn);
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([it.lng, it.lat]).addTo(map));
    });
    return;
  }
  S.pinEls = new Map();
  const selected = S.view.name === 'place' ? S.view.id : null;
  const inTrip = S.view.name === 'trip' ? S.view.id : null;
  const tf = S.tripFilter;
  const list = inTrip && (tf.star || tf.prices.size) ? S.places.filter((p) => p.trip_id === inTrip && tripFilterMatch(p)) : filtered();
  const ids = new Set(list.map((p) => p.id));
  const toShow = selected && !ids.has(selected) ? [...list, S.placeById.get(selected)].filter(Boolean) : list;
  for (const p of toShow) {
    const c = cat(p.category_id);
    const el = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'pin' + (p.done ? ' done' : '') + (p.id === selected ? ' selected' : '');
    btn.style.setProperty('--c', safeColor(c.color));
    btn.innerHTML = icon(c.icon, 16, 2.2) + (p.starred ? `<span class="pin-star">${icon('star', 10, 3)}</span>` : '');
    btn.setAttribute('aria-label', `${p.name}${p.starred ? ', da non perdere' : ''}${p.done ? ', fatto' : ', da fare'}`);
    if (p.starred) el.style.zIndex = '2';
    btn.addEventListener('click', (e) => { e.stopPropagation(); go(`#/posto/${p.id}`); });
    el.append(btn);
    const m = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
    if (p.id === selected) el.style.zIndex = '3';
    markers.push(m);
    S.pinEls.set(p.id, btn);
  }
}

function fitTo(points, maxZoom = 14) {
  if (!points.length) return;
  if (points.length === 1) {
    map.flyTo({ center: points[0], zoom: Math.max(map.getZoom(), 13), padding: mapPadding(), duration: 700 });
    return;
  }
  const b = new maplibregl.LngLatBounds(points[0], points[0]);
  for (const pt of points) b.extend(pt);
  map.fitBounds(b, { padding: mapPadding(), maxZoom, duration: 700 });
}

// ─────────────────────────────────────────────
// Viaggi sulla mappa: un'area morbida attorno ai posti
// ─────────────────────────────────────────────
const TRIP_STATUS = { sogno: 'Sogno', programma: 'In programma', fatto: 'Fatto' };

function tripPlaces(trip) { return S.places.filter((p) => p.trip_id === trip.id); }

function circlePts(lng, lat, r, n = 14) {
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat];
  });
}

function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function tripArea(trip) {
  const pts = tripPlaces(trip).map((p) => [p.lng, p.lat]);
  let ring;
  if (pts.length) {
    // estensione in metri, per un margine proporzionato
    const lats = pts.map((p) => p[1]);
    const lngs = pts.map((p) => p[0]);
    const lat0 = (Math.max(...lats) + Math.min(...lats)) / 2;
    const ext = Math.max((Math.max(...lats) - Math.min(...lats)) * 111320, (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos((lat0 * Math.PI) / 180));
    const pad = Math.max(450, ext * 0.14);
    ring = hull(pts.flatMap(([x, y]) => circlePts(x, y, pad)));
  } else if (typeof trip.lat === 'number') {
    ring = circlePts(trip.lng, trip.lat, 4000, 40);
  } else return null;
  ring.push(ring[0]);
  return ring;
}

let tripLabels = [];
function renderAreas() {
  if (!map.isStyleLoaded()) return;
  const sel = S.view.name === 'trip' ? S.view.id : null;
  const features = [];
  for (const m of tripLabels) m.remove();
  tripLabels = [];
  if (S.view.name !== 'guide') {
    for (const t of S.trips) {
      const ring = tripArea(t);
      if (!ring) continue;
      features.push({ type: 'Feature', properties: { id: t.id, sel: t.id === sel }, geometry: { type: 'Polygon', coordinates: [ring] } });
      const top = ring.reduce((a, b) => (b[1] > a[1] ? b : a));
      const n = tripPlaces(t).length;
      const el = document.createElement('div');
      const btn = document.createElement('button');
      btn.className = 'trip-label' + (t.id === sel ? ' sel' : '');
      btn.innerHTML = `<span class="trip-label-ic">${icon('plane', 12, 2.4)}</span>${esc(t.name)}${n ? ` · ${n} ${n === 1 ? 'posto' : 'posti'}` : ''}`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); go(`#/viaggio/${t.id}`); });
      el.append(btn);
      tripLabels.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -4] }).setLngLat(top).addTo(map));
    }
  }
  const data = { type: 'FeatureCollection', features };
  const src = map.getSource('trips');
  if (src) { src.setData(data); return; }
  map.addSource('trips', { type: 'geojson', data });
  map.addLayer({ id: 'trip-fill', type: 'fill', source: 'trips', paint: { 'fill-color': '#8E2C48', 'fill-opacity': ['case', ['get', 'sel'], 0.15, 0.07] } });
  map.addLayer({ id: 'trip-line', type: 'line', source: 'trips', paint: { 'line-color': '#8E2C48', 'line-width': ['case', ['get', 'sel'], 2.5, 1.6], 'line-opacity': 0.75, 'line-dasharray': [2, 2] } });
}

// ─────────────────────────────────────────────
// Barra in alto
// ─────────────────────────────────────────────
function renderTopbar() {
  $('search-ic').innerHTML = icon('search', 18, 2.2);
  $('locate').innerHTML = icon('locate', 19, 2.2);
  $('layers').innerHTML = icon('layers', 20, 2);
  const prof = $('profile');
  if (S.editor && S.me) {
    const cls = S.me === 'Carlotta' ? 'av-c' : 'av-m';
    prof.innerHTML = `<span class="avatars"><span class="av ${cls}">${esc(S.me[0])}</span></span>`;
    prof.setAttribute('aria-label', `Profilo di ${S.me}`);
  } else {
    prof.innerHTML = '<span class="avatars"><span class="av av-c">C</span><span class="av av-m">M</span></span>';
    prof.setAttribute('aria-label', S.email ? 'Profilo' : 'Accedi');
  }
}

function renderChips() {
  const todo = S.places.filter((p) => !p.done).length;
  const done = S.places.length - todo;
  const st = S.filter.status;
  const tripsOn = S.view.name === 'trips' || S.view.name === 'trip';
  const guidesOn = S.view.name === 'guides' || S.view.name === 'guide';
  let h = `
    <button class="chip" data-trips="1" aria-pressed="${tripsOn}">${icon('plane', 14, 2.2)}Viaggi${S.trips.length ? ' ' + S.trips.length : ''}</button>
    ${S.guides.length ? `<button class="chip" data-guides="1" aria-pressed="${S.view.name === 'guides' || S.view.name === 'guide'}">${icon('sparkle', 14, 2)}Guide ${S.guides.length}</button>` : ''}
    <button class="chip" data-status="all" aria-pressed="${st === 'all' && !tripsOn && !guidesOn}">Tutto</button>
    <button class="chip" data-status="todo" aria-pressed="${st === 'todo'}">Da fare ${todo}</button>
    <button class="chip" data-status="done" aria-pressed="${st === 'done'}">Fatti ${done}</button>`;
  $('chips').innerHTML = h;
  renderSearchBar();
}

// Barra di ricerca: filtri attivi come etichette e bottone del pannello
function renderSearchBar() {
  const toks = filterTokens();
  $('search-tokens').innerHTML = toks.map((t) => `<span class="token">${esc(t.label)}<button type="button" data-untoken="${esc(t.key)}" aria-label="Togli ${esc(t.label)}">${icon('x', 10, 3)}</button></span>`).join('');
  $('search-tokens').hidden = !toks.length;
  const n = activeCount();
  const b = $('filter-btn');
  b.innerHTML = icon('sliders', 16, 2.4) + (n ? `<span>${n}</span>` : '');
  b.classList.toggle('on', n > 0);
  b.setAttribute('aria-label', n ? `Filtri, ${n} attivi` : 'Filtri');
  $('search').placeholder = toks.length ? 'Cerca…' : 'Cerca tra i nostri posti';
  if ($('search').value !== S.filter.q && document.activeElement !== $('search')) $('search').value = S.filter.q;
}

// Dopo ogni cambio di filtri: aggiorna tutto, e sulla pagina dei risultati anche l'indirizzo
function filtersChanged({ toResults = false } = {}) {
  renderChips();
  renderMarkers();
  if (toResults || S.view.name === 'search') {
    const h = filterHash();
    if (location.hash === h) { renderSheet(); fitResults(); }
    else go(h);
    return;
  }
  if (S.view.name !== 'list') go('#/');
  else renderSheet();
}
function fitResults() {
  const pts = filtered().map((p) => [p.lng, p.lat]);
  if (pts.length) fitTo(pts, 14);
}

$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.trips) {
    go(S.view.name === 'trips' ? '#/' : '#/viaggi');
    return;
  }
  if (b.dataset.guides) {
    go(S.view.name === 'guides' ? '#/' : '#/guide');
    return;
  }
  if (b.dataset.status) S.filter.status = b.dataset.status;
  filtersChanged();
});

let searchTimer = 0;
$('search').addEventListener('input', (e) => {
  S.filter.q = e.target.value;
  renderSuggest();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderMarkers();
    if (S.view.name === 'search') { const h = filterHash(); history.replaceState(null, '', h); S.view = { name: 'search', qs: h.split('?')[1] || '' }; S.lastViewKey = JSON.stringify(S.view); renderSheet(); }
    else if (S.view.name !== 'list') go('#/');
    else renderSheet();
    const pts = filtered().map((p) => [p.lng, p.lat]);
    if (S.filter.q && pts.length) fitTo(pts);
  }, 180);
});
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('search').blur(); hideSuggest(); filtersChanged({ toResults: true }); }
  else if (e.key === 'Escape') { $('search').blur(); hideSuggest(); }
});
$('search').addEventListener('focus', renderSuggest);
$('search').addEventListener('blur', () => setTimeout(hideSuggest, 150));
$('search-tokens').addEventListener('click', (e) => {
  const b = e.target.closest('[data-untoken]');
  if (!b) return;
  e.preventDefault();
  toggleToken(S.filter, b.dataset.untoken, false);
  filtersChanged();
});
$('filter-btn').addEventListener('click', (e) => { e.preventDefault(); openFilters(); });

// Suggerimenti mentre scrivi
function hl(text, q) {
  const t = String(text);
  const i = norm(t).indexOf(norm(q));
  if (i < 0 || !q) return esc(t);
  return esc(t.slice(0, i)) + '<b>' + esc(t.slice(i, i + q.length)) + '</b>' + esc(t.slice(i + q.length));
}
function hideSuggest() { $('suggest').hidden = true; }
function renderSuggest() {
  const box = $('suggest');
  const qs = S.filter.q.trim();
  const q = norm(qs);
  if (q.length < 2 || document.activeElement !== $('search')) { box.hidden = true; return; }
  const has = (s) => norm(s).includes(q);
  const starts = (word, min = 2) => q.length >= min && norm(word).startsWith(q);
  const base = cloneFilter(S.filter); base.q = '';
  const count = (key) => { const F = cloneFilter(base); toggleToken(F, key, true); return filtered(F).length; };
  const sug = [];
  for (const c of S.categories) if (has(c.name) && !S.filter.cats.has(c.id)) sug.push({ key: `cat:${c.id}`, pre: 'Categoria', label: c.name, color: c.color, ic: c.icon });
  for (const c of allCuisines()) if (has(c) && !S.filter.cuisines.has(c)) sug.push({ key: `cu:${c}`, pre: 'Cucina', label: c, color: '#D9480F', ic: 'fork' });
  for (const t of S.trips) if (has(t.name) && S.filter.trip !== t.id) sug.push({ key: `trip:${t.id}`, pre: 'Viaggio', label: t.name, color: '#0F7F7F', ic: 'plane' });
  if (starts('gratis') && !S.filter.prices.has('0')) sug.push({ key: 'p:0', pre: 'Prezzo', label: 'Gratis', color: '#2B7A4B', ic: 'tag' });
  if ((starts('michelin') || starts('stellato', 4) || starts('stellati', 4)) && !S.filter.mich.has('stars')) sug.push({ key: 'm:stars', pre: 'Michelin', label: 'Stellati', color: '#C8102E', ic: 'star' });
  if ((starts('verde', 3) || starts('stella verde', 4) || starts('michelin', 3)) && !S.filter.mich.has('green')) sug.push({ key: 'm:green', pre: 'Michelin', label: 'Stella verde', color: '#2E8B3D', ic: 'star' });
  if ((starts('bib') || starts('michelin', 3)) && !S.filter.mich.has('bib')) sug.push({ key: 'm:bib', pre: 'Michelin', label: 'Bib Gourmand', color: '#C8102E', ic: 'star' });
  if ((starts('tornarci', 3) || starts('preferiti', 3)) && !S.filter.top) sug.push({ key: 'top', pre: 'Voto', label: 'Da tornarci', color: '#8E2C48', ic: 'heart' });
  if (starts('vicino', 3) && !S.filter.near) sug.push({ key: 'near', pre: 'Dove', label: 'Vicino a me', color: '#0A84FF', ic: 'locate' });
  const filt = sug.slice(0, 5).map((x) => ({ ...x, n: count(x.key) }));
  const places = filtered().slice(0, 5);
  let h = '';
  if (filt.length) {
    h += '<div class="sg-label">Filtri</div><div class="sg-group">' + filt.map((x) => `
      <button type="button" class="sg-row" data-sg-key="${esc(x.key)}">
        <span class="sg-ic" style="--c:${safeColor(x.color)}">${icon(x.ic, 17, 2)}</span>
        <span class="sg-main"><span>${esc(x.pre)}: ${hl(x.label, qs)}</span><span class="sg-sub">${x.n} ${x.n === 1 ? 'posto' : 'posti'}</span></span>
        <span class="sg-add">Aggiungi</span>
      </button>`).join('') + '</div>';
  }
  if (places.length) {
    h += '<div class="sg-label">Posti</div><div class="sg-group">' + places.map((p) => {
      const c = cat(p.category_id);
      const ph = safeUrl(p.photo_url);
      const sub = [c.name, (p.cuisines || []).join(', '), p.area, price(p.price)].filter(Boolean);
      return `<button type="button" class="sg-row" data-sg-place="${esc(p.id)}">
        <span class="tile sm${ph ? ' has-photo' : ''}" style="--c:${safeColor(c.color)}">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : icon(c.icon, 16, 2.1)}</span>
        <span class="sg-main"><span class="sg-name">${hl(p.name, qs)}${michelin(p, 10)}</span><span class="sg-sub">${sub.map((x) => hl(x, qs)).join(' · ')}</span></span>
      </button>`;
    }).join('') + '</div>';
  }
  h += `<button type="button" class="sg-all" data-sg-all="1">${icon('search', 16, 2.4)}Vedi tutti i risultati per "${esc(qs)}"</button>`;
  box.innerHTML = h;
  box.hidden = false;
}
$('suggest').addEventListener('pointerdown', (e) => e.preventDefault());
$('suggest').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.sgKey) {
    toggleToken(S.filter, b.dataset.sgKey, true);
    if (b.dataset.sgKey === 'near' && !S.here) locateMe().then(() => filtersChanged());
    S.filter.q = '';
    $('search').value = '';
    hideSuggest();
    filtersChanged();
    $('search').focus();
  } else if (b.dataset.sgPlace) {
    hideSuggest(); $('search').blur();
    go(`#/posto/${b.dataset.sgPlace}`);
  } else if (b.dataset.sgAll) {
    hideSuggest(); $('search').blur();
    filtersChanged({ toResults: true });
  }
});

$('profile').addEventListener('click', () => (S.email ? openProfile() : openLogin()));

function setLayer(key) {
  if (!LAYERS[key] || key === S.layer) return;
  S.layer = key;
  try { localStorage.setItem('cem-layer', key); } catch { /* niente */ }
  map.setStyle(LAYERS[key].style, { diff: false });
}

$('layers').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = $('layers-pop');
  if (!pop.hidden) { pop.hidden = true; return; }
  pop.innerHTML = Object.entries(LAYERS).map(([k, l]) => `
    <button class="layer-opt" data-layer="${k}" aria-pressed="${S.layer === k}">
      <span class="layer-swatch" style="background:${l.swatch}"></span>
      <span class="layer-text"><b>${esc(l.label)}</b><span>${esc(l.hint)}</span></span>
      ${S.layer === k ? icon('check', 16, 2.6) : ''}
    </button>`).join('');
  pop.hidden = false;
});
$('layers-pop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-layer]');
  if (!b) return;
  setLayer(b.dataset.layer);
  $('layers-pop').hidden = true;
});
document.addEventListener('click', (e) => {
  const pop = $('layers-pop');
  if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
});

// ─────────────────────────────────────────────
// Posizione in tempo reale
// Primo tocco: segue la tua posizione. Se sposti la mappa smette di seguirti
// ma il pallino continua ad aggiornarsi; ritocca per tornare a seguirti,
// tocca di nuovo mentre ti segue per spegnerla.
// ─────────────────────────────────────────────
const live = { watch: null, follow: false, on: false, marker: null, el: null, acc: 0, heading: null, lastRender: null };
function liveEl() {
  if (live.el) return live.el;
  const el = document.createElement('div');
  el.className = 'you';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="you-acc"></span><span class="you-cone"></span><span class="you-dot"></span>';
  live.el = el;
  return el;
}
function liveAccuracy() {
  if (!live.el || !S.here) return;
  const mpp = (40075016.686 * Math.cos((S.here.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
  const d = Math.min(600, Math.max(0, (live.acc / mpp) * 2));
  live.el.querySelector('.you-acc').style.setProperty('--d', `${d}px`);
}
function liveButton() {
  const b = $('locate');
  b.classList.toggle('live', live.on);
  b.classList.toggle('follow', live.on && live.follow);
  b.setAttribute('aria-pressed', String(live.on));
  b.setAttribute('aria-label', !live.on ? 'Mostra la mia posizione' : live.follow ? 'Smetti di mostrare la mia posizione' : 'Segui la mia posizione');
}
function onPosition(pos, first) {
  const ll = [pos.coords.longitude, pos.coords.latitude];
  const prev = S.here;
  S.here = { lat: ll[1], lng: ll[0] };
  live.acc = pos.coords.accuracy || 0;
  if (pos.coords.heading != null && !Number.isNaN(pos.coords.heading) && pos.coords.speed > 1) setHeading(pos.coords.heading);
  if (!live.marker) live.marker = new maplibregl.Marker({ element: liveEl() });
  live.marker.setLngLat(ll).addTo(map);
  liveAccuracy();
  if (first) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 15), padding: mapPadding() });
  else if (live.follow) map.easeTo({ center: ll, duration: 600, padding: mapPadding() });
  // Distanze e "Vicino a me": si aggiornano quando ti sposti di almeno 40 m
  if (!live.lastRender || metersBetween(live.lastRender, S.here) > 40) {
    live.lastRender = S.here;
    if (prev && (S.view.name === 'search' || S.filter.near)) { renderMarkers(); renderSheet(); }
  }
}
function setHeading(deg) {
  live.heading = deg;
  if (live.el) { live.el.classList.add('has-heading'); live.el.style.setProperty('--h', `${deg}deg`); }
}
function onOrientation(e) {
  const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
  if (h != null) setHeading(h);
}
async function liveStart({ quiet = false } = {}) {
  if (!navigator.geolocation) { if (!quiet) toast('Posizione non disponibile su questo dispositivo'); return; }
  // Bussola (iPhone chiede il permesso al tocco)
  try {
    if (!quiet && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') window.addEventListener('deviceorientation', onOrientation); }).catch(() => {});
    } else {
      window.addEventListener('deviceorientationabsolute', onOrientation);
      window.addEventListener('deviceorientation', onOrientation);
    }
  } catch { /* niente */ }
  live.on = true;
  live.follow = !quiet;
  liveButton();
  let first = !quiet;
  if (live.watch != null) navigator.geolocation.clearWatch(live.watch);
  live.watch = navigator.geolocation.watchPosition(
    (pos) => { onPosition(pos, first); first = false; },
    (err) => {
      if (err.code === 1) { liveStop(); if (!quiet) toast('Serve il permesso per la posizione'); }
      else if (!quiet && first) toast('Non riesco a leggere la posizione');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
  try { localStorage.setItem('cem-live', '1'); } catch { /* niente */ }
}
function liveStop() {
  if (live.watch != null) navigator.geolocation.clearWatch(live.watch);
  live.watch = null; live.on = false; live.follow = false;
  live.marker?.remove();
  window.removeEventListener('deviceorientation', onOrientation);
  window.removeEventListener('deviceorientationabsolute', onOrientation);
  liveButton();
  try { localStorage.removeItem('cem-live'); } catch { /* niente */ }
}
$('locate').addEventListener('click', () => {
  if (!live.on) return liveStart();
  if (!live.follow) {
    live.follow = true; liveButton();
    if (S.here) map.flyTo({ center: [S.here.lng, S.here.lat], zoom: Math.max(map.getZoom(), 15), padding: mapPadding() });
    return;
  }
  liveStop();
});
// Se sposti la mappa a mano smette di seguirti
map.on('dragstart', () => { if (live.follow) { live.follow = false; liveButton(); } });
map.on('zoom', liveAccuracy);
// Batteria: in background si ferma, al ritorno riparte
document.addEventListener('visibilitychange', () => {
  if (!live.on) return;
  if (document.visibilityState === 'hidden') { if (live.watch != null) navigator.geolocation.clearWatch(live.watch); live.watch = null; }
  else if (live.watch == null) {
    live.watch = navigator.geolocation.watchPosition((pos) => onPosition(pos, false), () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
});
// Se l'avevate accesa e il permesso c'è già, riparte da sola (senza spostare la mappa)
try {
  if (localStorage.getItem('cem-live') === '1' && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((r) => { if (r.state === 'granted') liveStart({ quiet: true }); }).catch(() => {});
  }
} catch { /* niente */ }

// ─────────────────────────────────────────────
// Sheet: contenuti
// ─────────────────────────────────────────────
const sheet = new Sheet($('sheet'), {
  grab: $('sheet-grab'),
  scroll: $('sheet-body'),
  onChange: (detent, visible) => { S.sheetVisible = visible; $('app').classList.toggle('sheet-full', detent === 'large'); }
});

function currentGuide() {
  return S.view.name === 'guide' ? S.guides.find((g) => g.slug === S.view.slug) : null;
}

function renderSheet() {
  const head = $('sheet-head');
  const body = $('sheet-body');
  let out;
  if (S.view.name === 'place') out = viewPlace();
  else if (S.view.name === 'guide') out = viewGuide();
  else if (S.view.name === 'trips') out = viewTrips();
  else if (S.view.name === 'guides') out = viewGuides();
  else if (S.view.name === 'trip') out = viewTrip();
  else if (S.view.name === 'search') out = viewResults();
  else out = viewList();
  head.innerHTML = out.head;
  body.innerHTML = out.body;
  sheet._apply && sheet.enabled && sheet._apply();
}

function placeRow(p) {
  const c = cat(p.category_id);
  const sub = [c.name, (p.cuisines || []).join(', '), p.area, price(p.price)].filter(Boolean).map(esc).join(' · ');
  const end = p.done
    ? (p.score != null ? `<span class="score-pill">${fmtScore(p.score)}</span>` : '')
    : (p.proposed_by ? `<span class="row-end">da ${esc(initial(p.proposed_by))}</span>` : '');
  const ph = safeUrl(p.photo_url);
  return `
    <button class="row" data-act="open-place" data-id="${esc(p.id)}">
      <span class="tile${ph ? ' has-photo' : ''}" style="--c:${safeColor(c.color)}">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy" decoding="async">` : icon(c.icon, 20, 2.1)}</span>
      <span class="row-main"><span class="row-title">${p.starred ? `<span class="star-mark" aria-label="Da non perdere">${icon('star', 13, 2.4)}</span>` : ''}${esc(p.name)}${michelin(p, 11)}</span><span class="row-sub">${sub}${p.price_range ? ` · ${esc(p.price_range)}` : ''}</span></span>
      ${end}
    </button>`;
}

// Riga nel viaggio: la stella si tocca direttamente (solo per voi)
function tripRow(p) {
  if (!S.editor) return placeRow(p);
  return `<div class="row-wrap${p.starred ? ' starred' : ''}">${placeRow(p)}
    <button class="star-btn" data-act="toggle-star" data-id="${esc(p.id)}" aria-pressed="${!!p.starred}" aria-label="${p.starred ? 'Togli da' : 'Segna come'} da non perdere">${icon('star', 18, 2.2)}</button>
  </div>`;
}

function tripFilterMatch(p) {
  const F = S.tripFilter;
  if (F.star && !p.starred) return false;
  if (F.prices.size && !F.prices.has(p.price == null ? 'x' : String(p.price))) return false;
  return true;
}

// Pagina dei risultati
const SORTS = [['rel', 'Pertinenza'], ['near', 'Vicini'], ['score', 'Voto'], ['price', 'Prezzo']];
function sortResults(list) {
  const q = norm(S.filter.q);
  const ref = S.here || (() => { try { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; } catch { return null; } })();
  const d = (p) => (ref ? metersBetween(ref, p) : 0);
  const by = {
    rel: (a, b) => {
      const r = (p) => (q && norm(p.name).startsWith(q) ? 0 : q && norm(p.name).includes(q) ? 1 : 2);
      return r(a) - r(b) || (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || d(a) - d(b);
    },
    near: (a, b) => d(a) - d(b),
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || d(a) - d(b),
    price: (a, b) => (a.price ?? 9) - (b.price ?? 9) || d(a) - d(b)
  };
  return [...list].sort(by[S.sort] || by.rel);
}
function resultCard(p) {
  const c = cat(p.category_id);
  const ph = safeUrl(p.photo_url);
  const line1 = [(p.cuisines || []).join(', ') || c.name, p.area].filter(Boolean).map(esc).join(' · ');
  const line2 = [price(p.price), p.price_range, ...michelinText(p)].filter(Boolean).map(esc).join(' · ');
  const dist = S.here ? fmtDist(metersBetween(S.here, p)) : '';
  const end = p.done && p.score != null ? `<span class="score-pill">${fmtScore(p.score)}</span>` : '';
  return `
    <button class="rcard" data-act="open-place" data-id="${esc(p.id)}">
      <span class="rcard-ph${ph ? ' has-photo' : ''}" style="--c:${safeColor(c.color)}">
        ${ph ? `<img src="${esc(ph)}" alt="" loading="lazy" decoding="async">` : icon(c.icon, 30, 1.6)}
        <span class="rcard-pills">
          ${dist ? `<span class="pill">${esc(dist)}</span>` : '<span></span>'}
          ${p.starred ? `<span class="pill pill-star">${icon('star', 11, 2.6)}Da non perdere</span>` : ''}
        </span>
      </span>
      <span class="rcard-main">
        <span class="row-title">${p.starred ? `<span class="star-mark">${icon('star', 13, 2.4)}</span>` : ''}${esc(p.name)}${michelin(p, 11)}</span>
        <span class="row-sub">${line1}</span>
        ${line2 ? `<span class="row-sub">${line2}</span>` : ''}
        ${dist ? `<span class="row-sub rcard-dist">${icon('locate', 11, 2.4)}${esc(dist)}</span>` : ''}
      </span>
      ${end}
    </button>`;
}
function viewResults() {
  const list = sortResults(filtered());
  const n = list.length;
  const any = activeCount() || S.filter.q.trim() || S.filter.status !== 'all';
  const head = `
    <div class="head-row">
      <div>
        <div class="eyebrow">${any ? (S.filter.q.trim() ? `Risultati per "${esc(S.filter.q.trim())}"` : 'Con questi filtri') : 'Tutti i nostri posti'}</div>
        <h1 class="title">${n} ${n === 1 ? 'posto' : 'posti'}</h1>
      </div>
      <div class="head-actions">
        <button class="icon-btn quiet" data-act="share-search" aria-label="Condividi la ricerca">${icon('share', 15, 2.4)}</button>
        <button class="icon-btn quiet" data-act="close-search" aria-label="Chiudi la ricerca">${icon('x', 14, 3)}</button>
      </div>
    </div>
    <div class="segmented sort-seg" role="group" aria-label="Ordina">${SORTS.map(([k, l]) => `<button data-act="sort" data-sort="${k}" aria-pressed="${S.sort === k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (!n) body += '<div class="empty"><b>Niente con questi filtri</b>Prova a togliere qualche filtro.</div>';
  else body += `<div class="rcards">${list.slice(0, 120).map(resultCard).join('')}</div>`;
  if (S.editor) {
    body += `<button class="btn btn-quiet btn-block" style="margin-top:16px" data-act="search-google">${icon('plus', 16, 2.6)}Non c'è? Cerca su Google e aggiungi</button>`;
  }
  return { head, body };
}

function viewList() {
  const list = filtered();
  let shown = list;
  let inArea = false;
  try {
    const b = map.getBounds();
    const inb = list.filter((p) => b.contains([p.lng, p.lat]));
    if (inb.length && inb.length < list.length) { shown = inb; inArea = true; }
    const c = map.getCenter();
    shown = [...shown].sort((a, z) => ((a.lat - c.lat) ** 2 + (a.lng - c.lng) ** 2) - ((z.lat - c.lat) ** 2 + (z.lng - c.lng) ** 2));
  } catch { /* mappa non pronta */ }

  const n = shown.length;
  const st = S.filter.status;
  const noun = st === 'todo' ? (n === 1 ? 'posto da fare' : 'posti da fare')
    : st === 'done' ? (n === 1 ? 'posto fatto' : 'posti fatti')
    : (n === 1 ? 'posto' : 'posti');

  const head = `
    <div class="head-row">
      <div>
        <div class="eyebrow">${inArea ? "In quest'area" : (S.filter.q || activeCount() || st !== 'all' ? 'Con questi filtri' : 'Tutti i nostri posti')}</div>
        <h1 class="title">${n} ${noun}</h1>
      </div>
      ${S.editor ? `<button class="icon-btn" data-act="add-place" aria-label="Aggiungi un posto">${icon('plus', 18, 2.6)}</button>` : ''}
    </div>`;

  let body = '';
  if (S.editor) {
    body += `
      <button class="ask" data-act="ask">
        ${icon('sparkle', 20, 1.8)}
        <span class="ask-text"><b>Chiedi una guida</b><span>"tutte le osterie della Valpolicella"</span></span>
        ${icon('next', 16, 2.4)}
      </button>`;
  }
  if (!S.places.length) {
    body += `<div class="empty"><b>Ancora nessun posto</b>${S.editor ? 'Tocca + per aggiungere il primo.' : 'Torna presto.'}</div>`;
  } else if (!n) {
    body += '<div class="empty"><b>Niente qui</b>Prova a cambiare filtri o a spostare la mappa.</div>';
  } else {
    body += `<div class="rows">${shown.slice(0, 80).map(placeRow).join('')}</div>`;
  }

  const guides = S.guides;
  if (guides.length) {
    body += `<div class="section-label">Guide</div><div class="guides">`;
    for (const g of guides) {
      const count = (g.items || []).length;
      body += `
        <button class="guide-card" data-act="open-guide" data-slug="${esc(g.slug)}">
          ${g.published ? '' : '<span class="badge draft">Bozza</span>'}
          <b>${esc(g.title)}</b>
          <span>${count} ${count === 1 ? 'posto' : 'posti'}</span>
        </button>`;
    }
    body += '</div>';
  }

  body += `
    <p class="foot">
      I posti che ci segniamo e quelli che abbiamo provato. Testi in italiano: le traduzioni automatiche del browser non sono curate da noi.
      ${S.email ? '' : '<br><button data-act="login">Accedi</button>'}
    </p>`;
  return { head, body };
}

function dotClass(v, i) { return v == null ? '' : i <= v ? 'on' : i - 0.5 === Number(v) ? 'half' : ''; }
function dots(n) {
  if (n == null) return '<span class="dots-none">non votato</span>';
  return `<span class="dots" aria-label="${fmtScore(Number(n))} su 4">${[1, 2, 3, 4].map((i) => `<i class="${dotClass(Number(n), i)}"></i>`).join('')}</span>`;
}
// Voto con i mezzi punti: tocca un pallino per il voto pieno, ritocca per il mezzo, una terza volta per toglierlo
function nextVote(cur, n) {
  if (cur === n) return n > 1 ? n - 0.5 : null;
  if (cur === n - 0.5) return null;
  return n;
}
function voteLabel(v) {
  if (v == null) return 'Tocca per votare';
  if (Number.isInteger(v)) return VOTE_LABELS[v - 1];
  return `${fmtScore(v)}: tra ${VOTE_LABELS[Math.floor(v) - 1].toLowerCase()} e ${VOTE_LABELS[Math.ceil(v) - 1].toLowerCase()}`;
}

// Indicazioni sempre in Google Maps (su iPhone apre l'app, se c'è)
function directionsUrl(p) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

function viewPlace() {
  const p = S.placeById.get(S.view.id);
  if (!p) {
    return {
      head: `<div class="head-row"><h1 class="title">Posto non trovato</h1><button class="icon-btn quiet" data-act="close" aria-label="Chiudi">${icon('x', 14, 3)}</button></div>`,
      body: '<div class="empty">Forse è stato eliminato.</div>'
    };
  }
  const c = cat(p.category_id);
  const meta = [c.name, (p.cuisines || []).join(', '), p.area, price(p.price), p.price_range].filter(Boolean).map(esc).join(' · ');
  const head = `
    <div class="head-row" style="align-items:flex-start">
      <div style="min-width:0">
        <h1 class="title title-xl">${esc(p.name)}</h1>
        <div class="meta" style="margin-top:4px">${meta}</div>
        ${michelinText(p).length ? `<div class="mich-line">${michelin(p, 13)}<span>${michelinText(p).map(esc).join(' · ')}</span></div>` : ''}
        ${(p.extra_categories || []).length ? `<div class="cat-tags">${p.extra_categories.map((id) => { const x = cat(id); return `<span class="cat-tag" style="--c:${safeColor(x.color)}"><span class="dot"></span>${esc(x.name)}</span>`; }).join('')}</div>` : ''}
      </div>
      <button class="icon-btn quiet" data-act="close" aria-label="Chiudi">${icon('x', 14, 3)}</button>
    </div>`;

  const acts = [`<a class="action primary" href="${directionsUrl(p)}" target="_blank" rel="noopener">${icon('directions', 20)}Indicazioni</a>`];
  if (S.editor) acts.push(`<button class="action" data-act="new-visit" data-id="${esc(p.id)}">${icon('check', 20)}${p.done ? 'Nuova visita' : 'Fatto!'}</button>`);
  if (S.editor && p.trip_id) acts.push(`<button class="action${p.starred ? ' on' : ''}" data-act="toggle-star" data-id="${esc(p.id)}" aria-pressed="${!!p.starred}">${icon('star', 20)}${p.starred ? 'Da non perdere' : 'Stella'}</button>`);
  const site = safeUrl(p.url);
  if (site) acts.push(`<a class="action" href="${esc(site)}" target="_blank" rel="noopener">${icon('globe', 20)}Sito</a>`);
  acts.push(`<button class="action" data-act="share" data-id="${esc(p.id)}">${icon('share', 20)}Condividi</button>`);

  let body = '';
  const photo = safeUrl(p.photo_url);
  if (photo || S.editor) {
    body += `<figure class="photo">${photo
      ? `<img src="${esc(photo)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`
      : `<span class="photo-empty" style="--c:${safeColor(c.color)}">${icon(c.icon, 34, 1.6)}</span>`}`;
    if (S.editor) {
      body += `<span class="photo-tools">
        <button class="photo-btn" data-act="photo-upload" data-id="${esc(p.id)}" aria-label="Carica una foto vostra">${icon('camera', 16, 2.2)}</button>
        <button class="photo-btn" data-act="photo-auto" data-id="${esc(p.id)}" aria-label="Scegli un'altra foto">${icon('image', 16, 2.2)}</button>
      </span>`;
    }
    body += '</figure>';
    if (p.photo_credit) body += `<p class="credit">${esc(p.photo_credit)}</p>`;
  }
  body += `<div class="actions" style="grid-template-columns:repeat(${acts.length},minmax(0,1fr))">${acts.join('')}</div>`;

  const trip = p.trip_id ? S.tripById.get(p.trip_id) : null;
  if (trip) {
    body += `
      <button class="row trip-row" data-act="open-trip" data-id="${esc(trip.id)}">
        <span class="tile" style="--c:var(--accent)">${icon('plane', 20, 2.1)}</span>
        <span class="row-main"><span class="row-sub">Parte del viaggio</span><span class="row-title">${esc(trip.name)}${p.day && trip.use_days ? ` · Giorno ${p.day}` : ''}</span></span>
        ${icon('next', 16, 2.4)}
      </button>`;
  }

  if (p.done && p.last) {
    body += `
      <div class="card votes">
        <div class="votes-score"><b>${p.score != null ? fmtScore(p.score) : '–'}</b><span>su 4</span></div>
        <div class="votes-people">
          <div class="person"><span class="av av-c">C</span><span class="person-name">Carlotta</span>${dots(p.last.vote_c)}</div>
          <div class="person"><span class="av av-m">M</span><span class="person-name">Michele</span>${dots(p.last.vote_m)}</div>
        </div>
      </div>`;
  }

  const reviews = p.visits.filter((v) => v.review && v.review.trim());
  if (reviews.length) {
    body += `<div class="section-label">${reviews.length === 1 ? 'Recensione' : 'Recensioni'}</div>`;
    reviews.forEach((v, i) => {
      const when = S.editor ? fmtDate(S.dates.get(v.id)) : (i === 0 && v === p.last ? 'ultima visita' : '');
      const by = [v.review_by, when].filter(Boolean).map(esc).join(', ');
      body += `<div class="review-block"><p class="review">${esc(v.review)}</p>${by ? `<div class="review-by">${by}</div>` : ''}</div>`;
    });
  }

  if (p.done) {
    body += `<div class="section-label"><span class="grow">Visite · ${p.visits.length}</span>${S.editor ? `<span class="note">${icon('lock', 12, 2.4)}Date visibili solo a voi</span>` : ''}</div>`;
    if (S.editor) {
      body += '<div class="card list-card">';
      for (const v of p.visits) {
        const votes = [v.vote_c, v.vote_m].filter((x) => x != null);
        const sc = votes.length ? fmtScore(votes.reduce((a, b) => a + b, 0) / votes.length) : '–';
        body += `
          <div class="list-line">
            <span class="grow">${esc(fmtDate(S.dates.get(v.id)))}</span>
            <span class="dim">${sc}</span>
            <button class="mini-btn" data-act="delete-visit" data-id="${esc(v.id)}" aria-label="Elimina visita">${icon('trash', 16)}</button>
          </div>`;
      }
      body += '</div>';
    }
  }

  const links = [];
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const menu = safeUrl(p.menu_url);
  if (menu) links.push({ label: 'Menù', sub: host(menu), href: menu, ic: 'fork' });
  if (site) links.push({ label: 'Sito', sub: host(site), href: site, ic: 'globe' });
  if (p.phone) links.push({ label: 'Telefono', sub: p.phone, href: `tel:${String(p.phone).replace(/[^\d+]/g, '')}`, ic: 'phone' });
  if (p.email && /^\S+@\S+$/.test(p.email)) links.push({ label: 'Email', sub: p.email, href: `mailto:${p.email}`, ic: 'mail' });
  const insta = safeUrl(p.instagram);
  if (insta) links.push({ label: 'Instagram', sub: '@' + insta.replace(/\/$/, '').split('/').pop(), href: insta, ic: 'camera' });
  const src = safeUrl(p.source_url);
  if (src && src !== site) links.push({ label: 'Link salvato', sub: host(src), href: src, ic: 'link' });
  links.push({ label: 'Google Maps', sub: 'Apri il posto', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}%20${p.lat},${p.lng}`, ic: 'pin' });
  if (isApple()) links.push({ label: 'Mappe di Apple', sub: 'Apri il posto', href: `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`, ic: 'pin' });
  body += '<div class="section-label">Link</div><div class="card list-card">';
  for (const l of links) {
    const ext = /^https?:/.test(l.href) ? ' target="_blank" rel="noopener"' : '';
    body += `<a class="list-line link-line" href="${esc(l.href)}"${ext}>
      <span class="link-ic">${icon(l.ic, 16, 2.2)}</span>
      <span class="grow"><b>${esc(l.label)}</b><span class="dim"> · ${esc(l.sub)}</span></span>
      ${icon('next', 14, 2.4)}
    </a>`;
  }
  body += '</div>';

  const hours = prettyHours(p.opening_hours);
  if (hours.length) {
    body += `<div class="section-label"><span class="grow">Orari</span><span class="note">da OpenStreetMap, da verificare</span></div>
      <div class="card list-card">${hours.map((h) => `<div class="list-line">${esc(h)}</div>`).join('')}</div>`;
  }

  if (p.notes || p.proposed_by) {
    body += '<div class="section-label">Note</div><div class="card notes">';
    if (p.notes) body += esc(p.notes);
    if (p.proposed_by) body += `${p.notes ? '<br><br>' : ''}<span class="meta">Proposto da ${esc(p.proposed_by)}</span>`;
    body += '</div>';
  }

  if (S.editor) {
    body += `
      <div class="editor-tools">
        <button class="btn btn-quiet" data-act="edit-place" data-id="${esc(p.id)}">${icon('edit', 16)}Modifica</button>
        <button class="btn btn-danger" data-act="delete-place" data-id="${esc(p.id)}">${icon('trash', 16)}Elimina</button>
      </div>`;
  }
  return { head, body };
}

function guideHas(item) {
  const n = norm(item.name);
  return S.places.find((p) => norm(p.name) === n);
}

function viewGuide() {
  const g = currentGuide();
  if (!g) {
    return {
      head: `<div class="head-row"><h1 class="title">Guida non trovata</h1><button class="icon-btn quiet" data-act="close" aria-label="Chiudi">${icon('x', 14, 3)}</button></div>`,
      body: '<div class="empty">Forse non è ancora pubblicata.</div>'
    };
  }
  const items = g.items || [];
  const ok = items.filter((i) => i.verified).length;
  const head = `
    <div class="head-row" style="align-items:flex-start">
      <div style="min-width:0; display:flex; flex-direction:column; gap:8px">
        <span class="badge ${g.published ? '' : 'draft'}">${icon('sparkle', 13, 2)}Guida AI${g.published ? '' : ' · Bozza, visibile solo a voi'}</span>
        <h1 class="title title-xl">${esc(g.title)}</h1>
      </div>
      ${g.published ? `<button class="icon-btn quiet" data-act="share-guide" aria-label="Condividi la guida">${icon('share', 15, 2.4)}</button>` : ''}
      <button class="icon-btn quiet" data-act="close" aria-label="Chiudi">${icon('x', 14, 3)}</button>
    </div>`;

  let body = '';
  if (g.intro) body += `<p class="login-note" style="margin-bottom:8px">${esc(g.intro)}</p>`;
  body += `<p class="meta" style="margin:0 4px 8px">${items.length} ${items.length === 1 ? 'posto trovato' : 'posti trovati'}. ${ok} verificati, ${items.length - ok} da controllare.</p>`;
  if (S.editor) {
    body += `<div class="editor-tools" style="margin:8px 0 4px">
      <button class="btn ${g.published ? 'btn-quiet' : 'btn-accent'}" data-act="toggle-guide">${g.published ? 'Ritira' : 'Pubblica'}</button>
      <button class="btn btn-danger" data-act="delete-guide">${icon('trash', 16)}Elimina</button>
    </div>`;
  }
  body += '<div class="card" style="padding:0 14px; margin-top:12px">';
  items.forEach((it, i) => {
    const have = guideHas(it);
    let status;
    if (have) status = `<span class="status have">Già nei nostri posti${have.done ? ' · fatto' : ''}</span>`;
    else if (it.verified) status = `<span class="status ok">${icon('check', 12, 3)}Verificato</span>`;
    else status = `<span class="status warn">${icon('alert', 12, 2.6)}${esc(it.note || 'Da verificare')}</span>`;
    let btn = '';
    if (have) btn = `<button class="guide-add in" data-act="open-place" data-id="${esc(have.id)}" aria-label="Apri ${esc(it.name)}">${icon('check', 14, 3)}</button>`;
    else if (S.editor) btn = `<button class="guide-add" data-act="guide-add" data-index="${i}" aria-label="Aggiungi ${esc(it.name)} ai nostri posti">${icon('plus', 14, 3)}</button>`;
    body += `
      <div class="guide-item" data-guide-item="${i}">
        <span class="guide-num ${it.verified ? '' : 'unverified'}">${i + 1}</span>
        <div class="guide-main">
          <b>${esc(it.name)}</b>
          <span class="why">${[it.area, it.why].filter(Boolean).map(esc).join(' · ')}</span>
          ${status}
        </div>
        ${btn}
      </div>`;
  });
  body += '</div>';
  const when = new Date(g.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  body += `<p class="disclaimer">Guida generata con l'AI il ${esc(when)}${g.prompt ? ` dalla richiesta "${esc(g.prompt)}"` : ''}. Non è curata da noi: controllate orari e aperture prima di andare.</p>`;
  return { head, body };
}

// Guide
function viewGuides() {
  const n = S.guides.length;
  const head = `
    <div class="head-row">
      <div>
        <div class="eyebrow">Ricerche fatte con Claude</div>
        <h1 class="title">${n} ${n === 1 ? 'guida' : 'guide'}</h1>
      </div>
      ${S.editor ? `<button class="icon-btn" data-act="ask" aria-label="Chiedi una guida">${icon('plus', 18, 2.6)}</button>` : ''}
    </div>`;
  let body = '<div class="rows">';
  for (const g of S.guides) {
    const items = g.items || [];
    const ok = items.filter((i) => i.verified).length;
    body += `
      <button class="row" data-act="open-guide" data-slug="${esc(g.slug)}">
        <span class="tile" style="--c:var(--accent)">${icon('sparkle', 20, 1.8)}</span>
        <span class="row-main"><span class="row-title">${esc(g.title)}</span><span class="row-sub">${items.length} posti · ${ok} verificati</span></span>
        ${g.published ? '' : '<span class="badge draft">Bozza</span>'}
      </button>`;
  }
  body += '</div>';
  if (S.editor && S.guides.some((g) => !g.published)) {
    body += '<p class="foot">Le bozze le vedete solo voi due. Aprite una guida e premete Pubblica per renderla visibile a tutti.</p>';
  }
  return { head, body };
}

// Viaggi
function tripMeta(t) {
  const n = tripPlaces(t).length;
  const days = t.use_days ? new Set(tripPlaces(t).map((p) => p.day).filter(Boolean)).size : 0;
  return [t.destination ? t.destination.split(',').slice(-1)[0].trim() : '', n ? `${n} ${n === 1 ? 'posto' : 'posti'}` : 'nessun posto', days ? `${days} ${days === 1 ? 'giorno' : 'giorni'}` : '']
    .filter(Boolean).join(' · ');
}
function tripScore(t) {
  const v = [t.vote_c, t.vote_m].filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function fmtRange(d) {
  if (!d || (!d.start_on && !d.end_on)) return '';
  const f = (x) => new Date(x + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  if (d.start_on && d.end_on && d.start_on !== d.end_on) return `${f(d.start_on)} – ${f(d.end_on)}`;
  return f(d.start_on || d.end_on);
}
function cover(url, cls = '') {
  const u = safeUrl(url);
  return u ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" decoding="async">` : `<span class="${cls} cover-empty">${icon('plane', 28, 1.6)}</span>`;
}

function viewTrips() {
  const n = S.trips.length;
  const head = `
    <div class="head-row">
      <div>
        <div class="eyebrow">I nostri viaggi</div>
        <h1 class="title">${n} ${n === 1 ? 'viaggio' : 'viaggi'}</h1>
      </div>
      ${S.editor ? `<button class="icon-btn" data-act="add-trip" aria-label="Nuovo viaggio">${icon('plus', 18, 2.6)}</button>` : ''}
    </div>`;
  if (!n) {
    return { head, body: `<div class="empty"><b>Ancora nessun viaggio</b>${S.editor ? 'Tocca + per crearne uno: sogno, in programma o già fatto.' : ''}</div>` };
  }
  const order = { programma: 0, sogno: 1, fatto: 2 };
  const list = [...S.trips].sort((a, b) => order[a.status] - order[b.status]);
  let body = '<div class="trip-grid">';
  for (const t of list) {
    const sc = tripScore(t);
    const badge = t.status === 'fatto' ? `Fatto${sc != null ? ' · ' + fmtScore(sc) : ''}` : TRIP_STATUS[t.status];
    body += `
      <button class="trip-card" data-act="open-trip" data-id="${esc(t.id)}">
        <span class="trip-cover">${cover(t.cover_url)}<span class="trip-badge ${t.status}">${esc(badge)}</span></span>
        <span class="trip-info"><b>${esc(t.name)}</b><span>${esc(tripMeta(t))}</span></span>
      </button>`;
  }
  body += '</div>';
  return { head, body };
}

function viewTrip() {
  const t = S.tripById.get(S.view.id);
  if (!t) {
    return {
      head: `<div class="head-row"><h1 class="title">Viaggio non trovato</h1><button class="icon-btn quiet" data-act="close-trip" aria-label="Chiudi">${icon('x', 14, 3)}</button></div>`,
      body: '<div class="empty">Forse è stato eliminato.</div>'
    };
  }
  const head = `
    <div class="trip-hero">
      ${cover(t.cover_url, 'trip-hero-img')}
      <span class="trip-hero-shade"></span>
      <button class="icon-btn quiet trip-hero-share" data-act="share-trip" data-id="${esc(t.id)}" aria-label="Condividi il viaggio">${icon('share', 15, 2.4)}</button>
      <button class="icon-btn quiet trip-hero-close" data-act="close-trip" aria-label="Chiudi">${icon('x', 14, 3)}</button>
      <span class="trip-hero-text">
        <span class="trip-hero-meta">${esc(TRIP_STATUS[t.status])} · ${esc(tripMeta(t))}</span>
        <span class="trip-hero-title">${esc(t.name)}</span>
      </span>
    </div>`;

  let body = '';
  if (t.cover_credit) body += `<p class="credit">${esc(t.cover_credit)}</p>`;
  if (S.editor) {
    const range = fmtRange(S.tripDates.get(t.id));
    if (range) body += `<p class="meta" style="margin:8px 4px 0;display:flex;gap:4px;align-items:center">${icon('lock', 12, 2.4)}${esc(range)}</p>`;
  }
  if (t.status === 'fatto' && (t.vote_c || t.vote_m || t.review)) {
    const sc = tripScore(t);
    body += `
      <div class="card votes" style="margin-top:12px">
        <div class="votes-score"><b>${sc != null ? fmtScore(sc) : '–'}</b><span>su 4</span></div>
        <div class="votes-people">
          <div class="person"><span class="av av-c">C</span><span class="person-name">Carlotta</span>${dots(t.vote_c)}</div>
          <div class="person"><span class="av av-m">M</span><span class="person-name">Michele</span>${dots(t.vote_m)}</div>
        </div>
      </div>`;
    if (t.review) body += `<p class="review" style="margin:14px 4px 0">${esc(t.review)}</p>`;
  }

  const all = tripPlaces(t);
  const places = all.filter(tripFilterMatch);
  const tab = t.use_days ? (S.view.tab || 'giorni') : 'posti';
  if (all.length) {
    const F = S.tripFilter;
    const nStar = all.filter((p) => p.starred).length;
    const levels = [['0', 'Gratis'], ['1', '€'], ['2', '€€'], ['3', '€€€'], ['4', '€€€€'], ['x', 'Senza prezzo']]
      .filter(([k]) => all.some((p) => (p.price == null ? 'x' : String(p.price)) === k));
    body += `<div class="trip-filters" role="toolbar" aria-label="Filtri del viaggio">
      <button class="chip chip-star" data-act="trip-star" aria-pressed="${F.star}">${icon('star', 14, 2.4)}Da non perdere ${nStar}</button>
      ${levels.length > 1 ? levels.map(([k, l]) => `<button class="chip" data-act="trip-price" data-price="${k}" aria-pressed="${F.prices.has(k)}">${l}</button>`).join('') : ''}
    </div>`;
  }
  const byStar = (a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.name.localeCompare(b.name);
  if (t.use_days) {
    body += `<div class="segmented" style="margin:16px 0 4px">
      <button data-act="trip-tab" data-tab="giorni" aria-pressed="${tab === 'giorni'}">Giorni</button>
      <button data-act="trip-tab" data-tab="posti" aria-pressed="${tab === 'posti'}">Posti</button>
    </div>`;
  }
  if (!all.length) {
    body += `<div class="empty">Nessun posto ancora.${S.editor ? '<br>Aggiungine uno qui sotto.' : ''}</div>`;
  } else if (!places.length) {
    body += '<div class="empty">Nessun posto con questi filtri.</div>';
  } else if (tab === 'giorni') {
    const byDay = new Map();
    for (const p of places) {
      const k = p.day || 0;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(p);
    }
    const keys = [...byDay.keys()].sort((a, b) => (a || 999) - (b || 999));
    for (const k of keys) {
      body += `<div class="section-label">${k ? `Giorno ${k}` : 'Senza giorno'}</div><div class="rows">${byDay.get(k).sort(byStar).map(tripRow).join('')}</div>`;
    }
  } else {
    body += `<div class="rows" style="margin-top:8px">${places.sort(byStar).map(tripRow).join('')}</div>`;
  }

  if (S.editor) {
    body += `
      <button class="btn btn-quiet btn-block" style="margin-top:16px" data-act="add-place-trip" data-id="${esc(t.id)}">${icon('plus', 16, 2.6)}Aggiungi un posto al viaggio</button>
      <div class="editor-tools">
        <button class="btn btn-quiet" data-act="edit-trip" data-id="${esc(t.id)}">${icon('edit', 16)}Modifica</button>
        <button class="btn btn-danger" data-act="delete-trip" data-id="${esc(t.id)}">${icon('trash', 16)}Elimina</button>
      </div>`;
  }
  return { head, body };
}

// Sul computer: passando sopra una riga si illumina il suo pin
$('sheet-body').addEventListener('mouseover', (e) => {
  const r = e.target.closest('[data-act="open-place"]');
  for (const el of S.pinEls.values()) el.classList.remove('hl');
  if (r) S.pinEls.get(r.dataset.id)?.classList.add('hl');
});
$('sheet-body').addEventListener('mouseleave', () => { for (const el of S.pinEls.values()) el.classList.remove('hl'); });

// Azioni nel pannello
$('sheet').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const id = t.dataset.id;
  switch (act) {
    case 'open-place': go(`#/posto/${id}`); break;
    case 'open-guide': go(`#/guida/${t.dataset.slug}`); break;
    case 'close': go('#/'); break;
    case 'open-trip': go(`#/viaggio/${id}`); break;
    case 'close-trip': go('#/viaggi'); break;
    case 'sort': {
      S.sort = t.dataset.sort;
      if (S.sort === 'near' && !S.here) await locateMe();
      renderSheet();
      break;
    }
    case 'share-search': shareLink('Carlotta e Michele', filterHash(), 'Una ricerca tra i posti di Carlotta e Michele'); break;
    case 'close-search': {
      S.filter = emptyFilter(); $('search').value = ''; renderChips(); renderMarkers(); go('#/');
      break;
    }
    case 'search-google': {
      const q = S.filter.q.trim();
      openPlaceForm();
      const inp = document.getElementById('pf-q');
      if (inp && q) { inp.value = q; document.getElementById('pf-search')?.click(); }
      break;
    }
    case 'trip-star': S.tripFilter.star = !S.tripFilter.star; renderSheet(); renderMarkers(); break;
    case 'trip-price': {
      const k = t.dataset.price;
      S.tripFilter.prices.has(k) ? S.tripFilter.prices.delete(k) : S.tripFilter.prices.add(k);
      renderSheet(); renderMarkers();
      break;
    }
    case 'toggle-star': {
      e.stopPropagation();
      const p = S.placeById.get(id);
      if (!p) return;
      const v = !p.starred;
      p.starred = v; renderSheet(); renderMarkers();
      const { error } = await sb.from('places').update({ starred: v }).eq('id', id);
      if (error) { p.starred = !v; renderSheet(); renderMarkers(); return fail(error, 'Non riesco a salvare'); }
      if (navigator.vibrate) navigator.vibrate(8);
      break;
    }
    case 'share-trip': {
      const tr = S.tripById.get(id);
      if (tr) shareLink(tr.name, `#/viaggio/${tr.id}`, `${tr.name}: i posti di Carlotta e Michele`);
      break;
    }
    case 'share-guide': {
      const g = currentGuide();
      if (g) shareLink(g.title, `#/guida/${g.slug}`);
      break;
    }
    case 'trip-tab': S.view.tab = t.dataset.tab; renderSheet(); break;
    case 'add-trip': openTripForm(); break;
    case 'edit-trip': openTripForm(S.tripById.get(id)); break;
    case 'add-place-trip': openPlaceForm(null, { trip_id: id }); break;
    case 'delete-trip': {
      const tr = S.tripById.get(id);
      if (!tr || !confirm(`Eliminare il viaggio "${tr.name}"? I posti restano sulla mappa.`)) return;
      const { error } = await sb.from('trips').delete().eq('id', id);
      if (error) return fail(error, 'Non riesco a eliminare');
      toast('Viaggio eliminato');
      await reload();
      go('#/viaggi');
      break;
    }
    case 'photo-upload': {
      const p = S.placeById.get(id);
      const file = await pickFile();
      if (!file || !p) return;
      toast('Carico la foto…');
      try {
        const url = await uploadPhoto(sb, file, 'places');
        const { error } = await sb.from('places').update({ photo_url: url, photo_credit: null, photo_source: 'own' }).eq('id', id);
        if (error) throw error;
        toast('Foto aggiornata');
        await reload();
      } catch (err) { fail(err, 'Non riesco a caricare la foto'); }
      break;
    }
    case 'photo-auto': {
      const p = S.placeById.get(id);
      if (p) openPhotoChooser(p);
      break;
    }
    case 'add-place': openPlaceForm(); break;
    case 'edit-place': openPlaceForm(S.placeById.get(id)); break;
    case 'new-visit': openVisitForm(S.placeById.get(id)); break;
    case 'ask': openAsk(); break;
    case 'login': openLogin(); break;
    case 'share': sharePlace(S.placeById.get(id)); break;
    case 'delete-place': {
      const p = S.placeById.get(id);
      if (!p || !confirm(`Eliminare "${p.name}" e le sue visite?`)) return;
      const { error } = await sb.from('places').delete().eq('id', id);
      if (error) return fail(error, 'Non riesco a eliminare');
      toast('Posto eliminato');
      await reload();
      go('#/');
      break;
    }
    case 'delete-visit': {
      if (!confirm('Eliminare questa visita?')) return;
      const { error } = await sb.from('visits').delete().eq('id', id);
      if (error) return fail(error, 'Non riesco a eliminare');
      toast('Visita eliminata');
      await reload();
      break;
    }
    case 'toggle-guide': {
      const g = currentGuide();
      const { error } = await sb.from('guides').update({ published: !g.published }).eq('id', g.id);
      if (error) return fail(error);
      toast(g.published ? 'Guida ritirata' : 'Guida pubblicata');
      await reload();
      break;
    }
    case 'delete-guide': {
      const g = currentGuide();
      if (!confirm(`Eliminare la guida "${g.title}"?`)) return;
      const { error } = await sb.from('guides').delete().eq('id', g.id);
      if (error) return fail(error);
      toast('Guida eliminata');
      await reload();
      go('#/');
      break;
    }
    case 'guide-add': {
      const g = currentGuide();
      const it = g.items[Number(t.dataset.index)];
      openPlaceForm(null, {
        name: it.name, lat: it.lat, lng: it.lng, area: it.area || '', notes: it.why || '',
        url: it.url || '', category_id: it.category || g.category || '', guide_id: g.id, trip_id: g.trip_id || null
      });
      break;
    }
  }
});

async function shareLink(title, path, text) {
  const url = `${location.origin}${location.pathname}${path}`;
  try {
    if (navigator.share) await navigator.share({ title, text, url });
    else { await navigator.clipboard.writeText(url); toast('Link copiato'); }
  } catch { /* annullato */ }
}
async function sharePlace(p) {
  if (!p) return;
  shareLink(p.name, `#/posto/${p.id}`);
}

// ─────────────────────────────────────────────
// Finestre
// ─────────────────────────────────────────────
function openModal({ title, rightLabel, onSave, mount }) {
  const root = $('modal-root');
  root.innerHTML = '';
  root.hidden = false;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title);
  modal.innerHTML = `
    <div class="modal-bar">
      <button class="link-btn left" data-close>Annulla</button>
      <h2>${esc(title)}</h2>
      ${rightLabel ? `<button class="link-btn strong right" data-save>${esc(rightLabel)}</button>` : '<span></span>'}
    </div>
    <div class="modal-body"></div>`;
  root.append(scrim, modal);
  const bodyEl = modal.querySelector('.modal-body');
  const saveBtn = modal.querySelector('[data-save]');
  let busy = false;
  const api = {
    close() {
      scrim.classList.remove('in');
      modal.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { if (root.contains(modal)) root.innerHTML = ''; }, 320);
    },
    setSaveEnabled(on) { if (saveBtn) saveBtn.disabled = !on || busy; },
    hide() { root.hidden = true; },
    show() { root.hidden = false; },
    body: bodyEl
  };
  const onKey = (e) => { if (e.key === 'Escape') api.close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', api.close);
  modal.querySelector('[data-close]').addEventListener('click', api.close);
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      saveBtn.disabled = true;
      try { await onSave(api); } finally { busy = false; saveBtn.disabled = false; }
    });
  }
  mount(bodyEl, api);
  requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('in'); modal.classList.add('in'); }));
  return api;
}

// Login
function openLogin() {
  openModal({
    title: 'Accedi',
    mount(body, api) {
      body.innerHTML = `
        <p class="login-note">Solo Carlotta e Michele possono aggiungere posti e visite. Tutti gli altri possono guardare.</p>
        <div>
          <label class="field-label" for="login-email">La tua email</label>
          <div class="inline-input"><input id="login-email" type="email" autocomplete="email" placeholder="nome@esempio.it"></div>
          <div class="field-hint">Ti mandiamo un link: aprilo da questo dispositivo e sei dentro.</div>
        </div>
        <button class="btn btn-accent btn-block" id="login-go">Mandami il link</button>`;
      const input = body.querySelector('#login-email');
      const btn = body.querySelector('#login-go');
      setTimeout(() => input.focus(), 350);
      const send = async () => {
        const email = input.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Controlla l’email');
        btn.disabled = true;
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: location.origin + location.pathname }
        });
        btn.disabled = false;
        if (error) return fail(error, 'Non riesco a mandare il link');
        body.innerHTML = `<p class="login-note"><b>Controlla la posta.</b><br>Ti abbiamo mandato un link a ${esc(email)}. Aprilo da questo dispositivo.</p>`;
      };
      btn.addEventListener('click', send);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    }
  });
}

function openProfile() {
  openModal({
    title: S.me || 'Profilo',
    mount(body, api) {
      body.innerHTML = `
        <p class="login-note">${S.editor ? `Sei dentro come <b>${esc(S.me)}</b>. Puoi aggiungere posti, visite e guide.` : `Sei dentro come ${esc(S.email)}, ma questo account non può modificare.`}</p>
        ${S.editor ? `<button class="btn btn-quiet btn-block" id="manage-cats">${icon('edit', 16)}Categorie</button>` : ''}
        <button class="btn btn-quiet btn-block" id="logout">Esci</button>`;
      body.querySelector('#manage-cats')?.addEventListener('click', () => openCategories());
      body.querySelector('#logout').addEventListener('click', async () => {
        await sb.auth.signOut();
        api.close();
      });
    }
  });
}

// Gestione categorie: nome, colore, icona; elimina quelle non usate
function openCategories() {
  let open = null;
  let draft = null;
  openModal({
    title: 'Categorie',
    mount(body) {
      const used = (id) => S.places.filter((p) => placeCats(p).includes(id)).length;
      const editor = () => `
        <div class="group cat-edit">
          <div class="group-line"><input class="left" id="ce-name" value="${esc(draft.name)}" placeholder="Nome categoria" aria-label="Nome categoria"></div>
          <div class="swatches" id="ce-colors">${PALETTE.map((c) => `<button class="swatch" data-c="${c}" style="--c:${c}" aria-label="Colore ${c}" aria-pressed="${draft.color.toLowerCase() === c.toLowerCase()}"></button>`).join('')}</div>
          <div class="icon-opts" id="ce-icons">${CATEGORY_ICONS.map((n) => `<button class="icon-opt" data-i="${n}" aria-label="Icona ${n}" aria-pressed="${draft.icon === n}">${icon(n, 18)}</button>`).join('')}</div>
          <div class="group-line" style="gap:8px">
            ${draft.id ? (used(draft.id)
              ? `<span class="meta" style="flex:1">Usata da ${used(draft.id)} ${used(draft.id) === 1 ? 'posto' : 'posti'}</span>`
              : `<button class="btn btn-danger" id="ce-del" style="height:36px">${icon('trash', 15)}Elimina</button><span style="flex:1"></span>`) : '<span style="flex:1"></span>'}
            <button class="btn btn-quiet" id="ce-cancel" style="height:36px">Annulla</button>
            <button class="btn btn-accent" id="ce-save" style="height:36px">Salva</button>
          </div>
        </div>`;
      const render = () => {
        body.innerHTML = `
          <p class="login-note">Il nome è l'etichetta che vedete nei filtri e nelle schede. Colore e icona valgono per i pin della categoria principale.</p>
          <div class="group" style="padding:0">${S.categories.map((c) => `
            <button class="cat-row" data-id="${esc(c.id)}">
              <span class="tile" style="--c:${safeColor(c.color)};width:36px;height:36px;border-radius:10px">${icon(c.icon, 18, 2.1)}</span>
              <span class="grow"><b>${esc(c.name)}</b><span class="meta">${used(c.id)} ${used(c.id) === 1 ? 'posto' : 'posti'}</span></span>
              ${icon('edit', 16)}
            </button>
            ${open === c.id ? editor() : ''}`).join('')}
          </div>
          ${open === '__new' ? editor() : `<button class="btn btn-quiet btn-block" id="ce-new">${icon('plus', 16, 2.6)}Nuova categoria</button>`}`;
        bind();
      };
      const bind = () => {
        body.querySelectorAll('.cat-row').forEach((b) => b.addEventListener('click', () => {
          const c = S.catById.get(b.dataset.id);
          open = open === c.id ? null : c.id;
          draft = { ...c };
          render();
        }));
        body.querySelector('#ce-new')?.addEventListener('click', () => {
          open = '__new';
          draft = { id: null, name: '', color: PALETTE[8], icon: 'pin' };
          render();
          body.querySelector('#ce-name')?.focus();
        });
        if (!draft || !open) return;
        body.querySelector('#ce-name').addEventListener('input', (e) => { draft.name = e.target.value; });
        body.querySelector('#ce-colors').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { draft.color = b.dataset.c; render(); } });
        body.querySelector('#ce-icons').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { draft.icon = b.dataset.i; render(); } });
        body.querySelector('#ce-cancel').addEventListener('click', () => { open = null; draft = null; render(); });
        body.querySelector('#ce-del')?.addEventListener('click', async () => {
          if (!confirm(`Eliminare la categoria "${draft.name}"?`)) return;
          const { error } = await sb.from('categories').delete().eq('id', draft.id);
          if (error) return fail(error, 'Non riesco a eliminare');
          S.categories = S.categories.filter((x) => x.id !== draft.id);
          S.catById.delete(draft.id);
          S.filter.cats.delete(draft.id);
          open = null; draft = null;
          toast('Categoria eliminata');
          afterChange();
        });
        body.querySelector('#ce-save').addEventListener('click', async () => {
          const name = draft.name.trim();
          if (!name) return toast('Dai un nome alla categoria');
          if (draft.id) {
            const patch = { name, color: draft.color, icon: draft.icon };
            const { error } = await sb.from('categories').update(patch).eq('id', draft.id);
            if (error) return fail(error, 'Non riesco a salvare');
            Object.assign(S.catById.get(draft.id), patch);
          } else {
            const row = { id: slugify(name), name, color: draft.color, icon: draft.icon, sort: 100 + S.categories.length * 10 };
            const { error } = await sb.from('categories').insert(row);
            if (error) return fail(error, 'Non riesco a creare la categoria');
            S.categories.push(row);
            S.catById.set(row.id, row);
          }
          open = null; draft = null;
          toast('Categoria salvata');
          afterChange();
        });
      };
      const afterChange = () => { render(); renderChips(); renderMarkers(); renderSheet(); };
      render();
    }
  });
}

// Chiedi una guida
function openAsk() {
  openModal({
    title: 'Chiedi una guida',
    mount(body) {
      body.innerHTML = `
        <div>
          <label class="field-label" for="ask-q">Cosa cerchiamo?</label>
          <div class="group"><textarea id="ask-q" placeholder="Tutte le osterie della Valpolicella"></textarea></div>
          <div class="field-hint">La ricerca la fa Claude: si apre una chat con la richiesta già scritta. Quando la guida è pronta compare qui come bozza, e decidete voi se pubblicarla.</div>
        </div>
        <button class="btn btn-accent btn-block" id="ask-go">${icon('sparkle', 18, 1.8)}Apri Claude</button>`;
      const q = body.querySelector('#ask-q');
      setTimeout(() => q.focus(), 350);
      body.querySelector('#ask-go').addEventListener('click', () => {
        const text = q.value.trim();
        if (!text) return toast('Scrivi cosa cercare');
        const prompt = `Nuova guida per carlottaemichele (repo GitHub michelesarzana/carlottaemichele, database Supabase del sito).\n\nRichiesta: "${text}"\n\nCerca i posti, verifica che esistano e siano aperti, prendi le coordinate da OpenStreetMap e salva la guida come bozza nella tabella guides.`;
        window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt), '_blank', 'noopener');
      });
    }
  });
}

// Geocoding (OpenStreetMap Nominatim)
function areaOf(a = {}) {
  return a.village || a.town || a.city || a.hamlet || a.suburb || a.municipality || a.county || '';
}
async function nominatimSearch(q, nearby = true) {
  let vb = '';
  if (nearby) {
    try {
      const b = map.getBounds();
      vb = `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
    } catch { /* niente */ }
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=it&q=${encodeURIComponent(q)}${vb}`);
  if (!r.ok) throw new Error('ricerca non disponibile');
  return (await r.json()).map((x) => ({
    name: x.name || x.display_name.split(',')[0],
    lat: +x.lat,
    lng: +x.lon,
    area: areaOf(x.address),
    address: x.display_name
  }));
}
async function nominatimReverse(lat, lng) {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=it&lat=${lat}&lon=${lng}`);
  if (!r.ok) return {};
  const x = await r.json();
  return { area: areaOf(x.address), address: x.display_name };
}

function parseLink(u) {
  const out = {};
  const m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    || u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    || u.match(/[?&](?:q|ll|query|sll|daddr|coordinate)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if (m) { out.lat = +m[1]; out.lng = +m[2]; }
  const n = u.match(/\/place\/([^/@?]+)/);
  if (n) out.name = decodeURIComponent(n[1].replace(/\+/g, ' '));
  else {
    try {
      const url = new URL(u);
      const q = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('name');
      if (q && !/^-?\d/.test(q)) {
        const parts = q.split(',').map((s) => s.trim()).filter(Boolean);
        out.name = parts[0];
        if (parts.length > 1) out.address = parts.slice(1).join(', ');
      }
    } catch { /* non un URL */ }
  }
  out.isMap = /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|openstreetmap\.org)/i.test(u);
  out.isShort = /(maps\.app\.goo\.gl|goo\.gl\/)/i.test(u);
  return out;
}

// Scelta punto sulla mappa
function pickOnMap(start) {
  return new Promise((resolve) => {
    const picker = $('picker');
    picker.hidden = false;
    if (start) map.jumpTo({ center: start, zoom: Math.max(map.getZoom(), 15) });
    const done = (val) => {
      picker.hidden = true;
      $('picker-ok').onclick = null;
      $('picker-cancel').onclick = null;
      resolve(val);
    };
    $('picker-ok').onclick = () => { const c = map.getCenter(); done({ lat: c.lat, lng: c.lng }); };
    $('picker-cancel').onclick = () => done(null);
  });
}

// Pannello dei filtri
function openFilters() {
  hideSuggest();
  $('search').blur();
  const F = cloneFilter(S.filter);
  let draw = () => {};
  openModal({
    title: 'Filtri',
    rightLabel: 'Azzera',
    async onSave() {
      const q = F.q;
      Object.assign(F, emptyFilter(), { q });
      draw();
    },
    mount(body, api) {
      const chip = (key, label, on, dot) => `<button type="button" class="fchip" data-fk="${esc(key)}" aria-pressed="${on}">${dot ? `<span class="dot" style="background:${safeColor(dot)}"></span>` : ''}${label}</button>`;
      const segBtn = (key, label, on) => `<button type="button" data-fk="${esc(key)}" aria-pressed="${on}">${label}</button>`;
      draw = () => {
        const n = filtered(F).length;
        const cuis = allCuisines();
        body.innerHTML = `
          <div class="fgroup"><span class="field-label">Stato</span>
            <div class="segmented">${segBtn('st:all', 'Tutti', F.status === 'all')}${segBtn('st:todo', 'Da fare', F.status === 'todo')}${segBtn('st:done', 'Fatti', F.status === 'done')}</div></div>
          <div class="fgroup"><span class="field-label">Categoria</span>
            <div class="fchips">${S.categories.map((c) => chip(`cat:${c.id}`, esc(c.name), F.cats.has(c.id), c.color)).join('')}</div></div>
          ${cuis.length ? `<div class="fgroup"><span class="field-label">Cucina</span>
            <div class="fchips">${cuis.map((c) => chip(`cu:${c}`, esc(c), F.cuisines.has(c))).join('')}</div></div>` : ''}
          <div class="fgroup"><span class="field-label">Prezzo</span>
            <div class="segmented">${['0', '1', '2', '3', '4'].map((k) => segBtn(`p:${k}`, PRICE_LABEL[k], F.prices.has(k))).join('')}</div></div>
          <div class="fgroup"><span class="field-label">Michelin e voto</span>
            <div class="fchips">
              ${chip('m:stars', `<span class="mich mich-red">${icon('star', 12, 2.6)}</span>Stellati`, F.mich.has('stars'))}
              ${chip('m:green', `<span class="mich mich-green">${icon('star', 12, 2.6)}</span>Stella verde`, F.mich.has('green'))}
              ${chip('m:bib', 'Bib Gourmand', F.mich.has('bib'))}
              ${chip('top', 'Da tornarci', F.top)}
            </div></div>
          <div class="group">
            <div class="group-line"><span>Viaggio</span><select id="ff-trip" aria-label="Viaggio">
              <option value="">Tutti</option>
              ${S.trips.map((t) => `<option value="${esc(t.id)}" ${F.trip === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select></div>
            <div class="group-line"><span>Vicino a me <span class="field-note">entro 3 km</span></span>
              <button type="button" class="fswitch" data-fk="near" role="switch" aria-checked="${F.near}" aria-label="Vicino a me"><i></i></button></div>
          </div>
          <div class="fshow"><button type="button" class="btn btn-accent btn-block" data-fshow="1">${n ? `Mostra ${n} ${n === 1 ? 'posto' : 'posti'}` : 'Nessun posto'}</button></div>`;
      };
      body.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-fk], [data-fshow]');
        if (!b) return;
        if (b.dataset.fshow) {
          S.filter = F;
          api.close();
          filtersChanged({ toResults: true });
          return;
        }
        const k = b.dataset.fk;
        if (k.startsWith('st:')) F.status = k.slice(3);
        else if (k.startsWith('p:')) toggleToken(F, k);
        else toggleToken(F, k);
        if (k === 'near' && F.near && !S.here) { draw(); await locateMe(); if (!S.here) F.near = false; }
        draw();
      });
      body.addEventListener('change', (e) => {
        if (e.target.id === 'ff-trip') { F.trip = e.target.value; draw(); }
      });
      draw();
    }
  });
}

// Doppioni: stesso nome, stesso punto o stesso sito
function metersBetween(a, b) {
  const R = 6371000, k = Math.PI / 180;
  const dLat = (b.lat - a.lat) * k, dLng = (b.lng - a.lng) * k;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const DUP_STOP = new Set(['di', 'del', 'della', 'dei', 'da', 'la', 'il', 'lo', 'le', 'e', 'al', 'alla', 'the', 'de', 'el', 'los', 'las', 'bar', 'ristorante', 'trattoria', 'osteria', 'pizzeria', 'cantina', 'hotel', 'caffe', 'cafe']);
function nameWords(s) { return norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !DUP_STOP.has(w)); }
function sameName(a, b) {
  const na = norm(a).replace(/[^a-z0-9]/g, ''), nb = norm(b).replace(/[^a-z0-9]/g, '');
  if (na && na === nb) return true;
  const wa = nameWords(a), wb = new Set(nameWords(b));
  if (!wa.length || !wb.size) return false;
  const hit = wa.filter((w) => wb.has(w)).length;
  return hit / Math.min(wa.length, wb.size) >= 0.6;
}
function siteKey(u) {
  try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch { return ''; }
}
function findDuplicates(f, selfId) {
  const site = f.url ? siteKey(safeUrl(f.url) || '') : '';
  const here = f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : null;
  return S.places.filter((p) => {
    if (p.id === selfId) return false;
    const d = here && p.lat != null ? metersBetween(here, p) : Infinity;
    if (f.name.trim() && sameName(f.name, p.name) && (d < 2000 || !here)) return true;
    if (d < 25) return true;
    if (site && p.url && siteKey(p.url) === site && !/google\.|instagram\.|facebook\./.test(site)) return true;
    return false;
  }).slice(0, 3);
}

// Nuovo posto / modifica
function openPlaceForm(place = null, preset = {}) {
  const f = {
    name: '', category_id: '', lat: null, lng: null, area: '', address: '', price: null,
    url: '', source_url: '', notes: '', proposed_by: S.me || '', guide_id: null,
    trip_id: null, day: null, photo_url: null, photo_credit: null, photo_source: null,
    phone: '', email: '', instagram: '', menu_url: '', opening_hours: null, extra_categories: [],
    michelin_stars: 0, michelin_green: false, michelin_bib: false, cuisines: [],
    ...(place ? {
      extra_categories: [...(place.extra_categories || [])],
      cuisines: [...(place.cuisines || [])],
      michelin_stars: place.michelin_stars || 0, michelin_green: !!place.michelin_green, michelin_bib: !!place.michelin_bib,
      phone: place.phone || '', email: place.email || '', instagram: place.instagram || '',
      menu_url: place.menu_url || '', opening_hours: place.opening_hours || null,
      name: place.name, category_id: place.category_id, lat: place.lat, lng: place.lng, area: place.area || '',
      address: place.address || '', price: place.price, url: place.url || '', source_url: place.source_url || '',
      notes: place.notes || '', proposed_by: place.proposed_by || '', guide_id: place.guide_id,
      trip_id: place.trip_id || null, day: place.day || null,
      photo_url: place.photo_url || null, photo_credit: place.photo_credit || null, photo_source: place.photo_source || null
    } : {}),
    ...preset
  };
  let newCat = null;
  let dupOk = false;

  openModal({
    title: place ? 'Modifica posto' : 'Nuovo posto',
    rightLabel: 'Salva',
    async onSave(api) {
      if (!dupOk && findDuplicates(f, place?.id).length) {
        dupOk = true;
        const box = document.getElementById('pf-dup');
        box?.classList.add('shake');
        box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => box?.classList.remove('shake'), 500);
        toast('Sembra già salvato. Tocca di nuovo Salva per aggiungerlo comunque');
        return;
      }
      const payload = {
        name: f.name.trim(), category_id: f.category_id, lat: f.lat, lng: f.lng,
        extra_categories: f.extra_categories.filter((c) => c && c !== f.category_id).slice(0, 2),
        area: f.area || null, address: f.address || null, price: f.price ?? null,
        url: safeUrl(f.url) || null, source_url: f.source_url || null, notes: f.notes.trim() || null,
        proposed_by: f.proposed_by || null, guide_id: f.guide_id || null,
        trip_id: f.trip_id || null, day: f.trip_id && f.day ? Number(f.day) : null,
        photo_url: f.photo_url || null, photo_credit: f.photo_credit || null, photo_source: f.photo_source || null,
        phone: f.phone.trim() || null, email: f.email.trim() || null,
        instagram: f.instagram.trim() ? (safeUrl(f.instagram.trim()) || `https://www.instagram.com/${f.instagram.trim().replace(/^@/, '')}/`) : null,
        menu_url: safeUrl(f.menu_url.trim()) || null, opening_hours: f.opening_hours || null,
        cuisines: f.cuisines.slice(0, 3),
        michelin_stars: f.michelin_stars || 0, michelin_green: !!f.michelin_green, michelin_bib: !!f.michelin_bib
      };
      const q = place ? sb.from('places').update(payload).eq('id', place.id).select().single()
        : sb.from('places').insert(payload).select().single();
      const { data, error } = await q;
      if (error) return fail(error, 'Non riesco a salvare');
      api.close();
      toast(place ? 'Modifiche salvate' : 'Aggiunto alla mappa');
      await reload();
      go(`#/posto/${data.id}`);
      if (!data.enriched_at || !data.photo_url) watchDetails(data.id);
    },
    mount(body, api) {
      body.innerHTML = `
        <div>
          <label class="field-label" for="pf-link">Da un link</label>
          <div class="inline-input">
            <input id="pf-link" type="text" inputmode="url" autocapitalize="off" autocorrect="off" placeholder="Google Maps, Apple Maps, sito…" value="${esc(f.source_url)}">
            <button class="btn btn-quiet" id="pf-read">Leggi</button>
          </div>
          <div class="field-hint" id="pf-link-status" aria-live="polite"></div>
        </div>
        <div>
          <label class="field-label" for="pf-q">Oppure cerca</label>
          <div class="inline-input">
            <input id="pf-q" type="search" placeholder="Nome e paese, es. Osteria del Borgo Negrar">
            <button class="btn btn-quiet" id="pf-search">Cerca</button>
          </div>
          <div id="pf-results"></div>
        </div>
        <div id="pf-located"></div>
        <div id="pf-dup" aria-live="polite"></div>
        <div>
          <span class="field-label">Nome</span>
          <div class="group"><div class="group-line"><input class="left" id="pf-name" placeholder="Nome del posto" value="${esc(f.name)}" aria-label="Nome"></div></div>
        </div>
        <div>
          <span class="field-label">Categorie</span>
          <div class="cat-picker" id="pf-cats"></div>
          <div id="pf-main"></div>
          <div id="pf-newcat"></div>
        </div>
        <div id="pf-cuisine-wrap">
          <span class="field-label">Cucina <span class="field-note">fino a 3</span></span>
          <div class="cat-picker" id="pf-cuisine"></div>
          <div class="inline-input" style="margin-top:8px">
            <input id="pf-cuisine-new" type="text" placeholder="Altra cucina, es. Sarda" autocapitalize="sentences">
            <button type="button" class="btn btn-quiet" id="pf-cuisine-add">Aggiungi</button>
          </div>
        </div>
        <div>
          <span class="field-label">Dettagli</span>
          <div class="group">
            <div class="group-line"><span>Prezzo</span><div class="segmented" id="pf-price"></div></div>
            <div class="group-line"><span>Proposto da</span><div class="segmented" id="pf-by"></div></div>
            <div class="group-line"><span>Michelin</span><div class="segmented" id="pf-mich"></div></div>
            <div class="group-line"><span>Sito</span><input id="pf-url" type="url" placeholder="https://" value="${esc(f.url)}"></div>
            <div class="group-line"><span>Menù</span><input id="pf-menu" type="url" placeholder="https://" value="${esc(f.menu_url)}"></div>
            <div class="group-line"><span>Telefono</span><input id="pf-phone" type="tel" placeholder="–" value="${esc(f.phone)}"></div>
            <div class="group-line"><span>Email</span><input id="pf-email" type="email" placeholder="–" value="${esc(f.email)}"></div>
            <div class="group-line"><span>Instagram</span><input id="pf-insta" type="text" autocapitalize="off" placeholder="@nome" value="${esc(f.instagram)}"></div>
            <div class="group-line"><span>Viaggio</span><select id="pf-trip" aria-label="Viaggio">
              <option value="">Nessuno</option>
              ${S.trips.map((t) => `<option value="${esc(t.id)}" ${f.trip_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select></div>
            <div class="group-line" id="pf-day-line"><span>Giorno</span><input id="pf-day" type="number" min="1" max="60" inputmode="numeric" placeholder="–" value="${f.day || ''}" style="max-width:80px"></div>
          </div>
        </div>
        <div>
          <span class="field-label">Foto</span>
          <div id="pf-photo"></div>
          <div class="field-hint">Se non ne scegliete una, la cerco io dopo il salvataggio: sito del posto, Wikipedia o foto libere scattate lì vicino.</div>
        </div>
        <div>
          <label class="field-label" for="pf-notes">Note</label>
          <div class="group"><textarea id="pf-notes" placeholder="Chi ce l'ha consigliato, cosa ordinare…">${esc(f.notes)}</textarea></div>
        </div>`;

      const q = (s) => body.querySelector(s);
      const renderCuisine = () => {
        const isFood = [f.category_id, ...f.extra_categories].some((c) => FOOD.has(c));
        q('#pf-cuisine-wrap').hidden = !isFood && !f.cuisines.length;
        const list = [...new Set([...CUISINES, ...S.places.flatMap((p) => p.cuisines || []), ...f.cuisines])];
        q('#pf-cuisine').innerHTML = list.map((c) => `<button type="button" class="cat-opt" data-cu="${esc(c)}" aria-pressed="${f.cuisines.includes(c)}">${esc(c)}</button>`).join('');
      };
      const validate = () => {
        renderCuisine();
        api.setSaveEnabled(!!(f.name.trim() && f.category_id && f.lat != null && f.lng != null));
        const dups = findDuplicates(f, place?.id);
        const key = dups.map((d) => d.id).join();
        if (key !== q('#pf-dup').dataset.key) {
          q('#pf-dup').dataset.key = key;
          dupOk = false;
          q('#pf-dup').innerHTML = dups.length ? `<div class="dup-box">
            <div class="dup-title">${icon('alert', 16, 2.4)}${dups.length > 1 ? 'Forse li avete già salvati' : 'Forse l\'avete già salvato'}</div>
            ${dups.map((d) => `<button type="button" class="dup-item" data-dup="${esc(d.id)}"><span>${esc(d.name)}</span><span class="dup-sub">${esc([cat(d.category_id).name, d.area, d.trip_id ? S.tripById.get(d.trip_id)?.name : ''].filter(Boolean).join(' · '))}</span></button>`).join('')}
          </div>` : '';
        }
        const b = q('#pf-ph-auto');
        if (b) b.disabled = f.lat == null;
      };

      const renderLocated = () => {
        const el = q('#pf-located');
        if (f.lat != null) {
          el.innerHTML = `
            <div class="located">
              ${icon('pin', 22, 2)}
              <span class="grow"><b>${esc(f.area || 'Posizione scelta')}</b><span>${esc(f.address ? f.address.split(',').slice(0, 3).join(',') : `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}`)}</span></span>
              <button class="btn btn-quiet" id="pf-pick" style="height:36px">Sposta</button>
            </div>`;
        } else {
          el.innerHTML = `
            <div class="located missing">
              ${icon('crosshair', 22, 2)}
              <span class="grow"><b>Manca la posizione</b><span>Usa un link, cerca, o scegli sulla mappa</span></span>
              <button class="btn btn-quiet" id="pf-pick" style="height:36px">Mappa</button>
            </div>`;
        }
        q('#pf-pick').addEventListener('click', async () => {
          api.hide();
          const r = await pickOnMap(f.lat != null ? [f.lng, f.lat] : null);
          api.show();
          if (!r) return;
          f.lat = r.lat; f.lng = r.lng; f.address = '';
          renderLocated(); validate();
          try { Object.assign(f, await nominatimReverse(r.lat, r.lng)); renderLocated(); } catch { /* ok */ }
        });
      };

      // Categorie: la prima scelta è la principale, poi al massimo due secondarie
      const selected = () => [f.category_id, ...f.extra_categories].filter(Boolean);
      const renderCats = () => {
        q('#pf-cats').innerHTML = S.categories.map((c) => {
          const main = f.category_id === c.id;
          const extra = f.extra_categories.includes(c.id);
          return `<button class="cat-opt${extra ? ' extra' : ''}" data-cat="${esc(c.id)}" style="--c:${safeColor(c.color)}" aria-pressed="${main || extra}"><span class="dot"></span>${esc(c.name)}</button>`;
        }).join('') + '<button class="cat-opt add" data-cat="__new">+ Nuova</button>';
        const sel = selected();
        const el = q('#pf-main');
        if (sel.length < 2) {
          el.innerHTML = sel.length ? '<div class="field-hint">Toccane altre per aggiungere fino a due categorie secondarie.</div>' : '';
          return;
        }
        el.innerHTML = `
          <div class="group" style="margin-top:10px"><div class="group-line"><span>Principale</span>
            <div class="segmented" id="pf-main-seg">${sel.map((id) => `<button data-main="${esc(id)}" aria-pressed="${f.category_id === id}">${esc(cat(id).name)}</button>`).join('')}</div>
          </div></div>
          <div class="field-hint">La principale decide colore e icona del pin. Le altre servono a ritrovarlo nei filtri.</div>`;
      };
      const toggleCat = (id) => {
        if (f.category_id === id) {
          f.category_id = f.extra_categories.shift() || '';
        } else if (f.extra_categories.includes(id)) {
          f.extra_categories = f.extra_categories.filter((x) => x !== id);
        } else if (!f.category_id) {
          f.category_id = id;
        } else if (f.extra_categories.length < 2) {
          f.extra_categories.push(id);
        } else {
          toast('Al massimo tre categorie: una principale e due secondarie');
          return;
        }
        renderCats(); validate();
      };
      q('#pf-cats').addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        if (b.dataset.cat === '__new') { newCat = { name: '', color: PALETTE[8], icon: 'pin' }; renderNewCat(); return; }
        toggleCat(b.dataset.cat);
      });
      q('#pf-main').addEventListener('click', (e) => {
        const b = e.target.closest('[data-main]');
        if (!b || b.dataset.main === f.category_id) return;
        const id = b.dataset.main;
        f.extra_categories = [f.category_id, ...f.extra_categories.filter((x) => x !== id)].filter(Boolean);
        f.category_id = id;
        renderCats();
      });

      const renderNewCat = () => {
        const el = q('#pf-newcat');
        if (!newCat) { el.innerHTML = ''; return; }
        el.innerHTML = `
          <div class="group" style="margin-top:10px">
            <div class="group-line"><input class="left" id="nc-name" placeholder="Nome categoria" value="${esc(newCat.name)}" aria-label="Nome categoria"></div>
            <div class="swatches" id="nc-colors">${PALETTE.map((c) => `<button class="swatch" data-c="${c}" style="--c:${c}" aria-label="Colore ${c}" aria-pressed="${newCat.color === c}"></button>`).join('')}</div>
            <div class="icon-opts" id="nc-icons">${CATEGORY_ICONS.map((n) => `<button class="icon-opt" data-i="${n}" aria-label="Icona ${n}" aria-pressed="${newCat.icon === n}">${icon(n, 18)}</button>`).join('')}</div>
            <div class="group-line" style="justify-content:flex-end; gap:8px">
              <button class="btn btn-quiet" id="nc-cancel" style="height:36px">Annulla</button>
              <button class="btn btn-accent" id="nc-save" style="height:36px">Crea</button>
            </div>
          </div>`;
        q('#nc-name').addEventListener('input', (e) => { newCat.name = e.target.value; });
        q('#nc-colors').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { newCat.color = b.dataset.c; renderNewCat(); } });
        q('#nc-icons').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { newCat.icon = b.dataset.i; renderNewCat(); } });
        q('#nc-cancel').addEventListener('click', () => { newCat = null; renderNewCat(); });
        q('#nc-save').addEventListener('click', async () => {
          const name = newCat.name.trim();
          if (!name) return toast('Dai un nome alla categoria');
          const row = { id: slugify(name), name, color: newCat.color, icon: newCat.icon, sort: 100 + S.categories.length * 10 };
          const { error } = await sb.from('categories').insert(row);
          if (error) return fail(error, 'Non riesco a creare la categoria');
          S.categories.push(row);
          S.catById.set(row.id, row);
          newCat = null;
          if (selected().length < 3) toggleCat(row.id);
          renderNewCat(); renderCats(); renderChips(); validate();
        });
      };

      const seg = (el, opts, get, set) => {
        const draw = () => {
          el.innerHTML = opts.map((o) => `<button data-v="${esc(o.v)}" aria-pressed="${get() === o.v}">${esc(o.l)}</button>`).join('');
        };
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          const v = opts.find((o) => String(o.v) === b.dataset.v).v;
          set(get() === v ? null : v);
          draw();
        });
        draw();
      };
      seg(q('#pf-price'), [0, 1, 2, 3, 4].map((n) => ({ v: n, l: n ? '€'.repeat(n) : 'Gratis' })), () => f.price, (v) => { f.price = v; });
      seg(q('#pf-by'), PEOPLE.map((p) => ({ v: p, l: p })), () => f.proposed_by, (v) => { f.proposed_by = v || ''; });
      // Michelin: una scelta tra stelle e Bib, più la stella verde che si somma
      {
        const el = q('#pf-mich');
        const opts = [['s1', '★'], ['s2', '★★'], ['s3', '★★★'], ['bib', 'Bib'], ['green', 'Verde']];
        const on = (k) => k === 'green' ? f.michelin_green : k === 'bib' ? f.michelin_bib : f.michelin_stars === Number(k[1]);
        const draw = () => { el.innerHTML = opts.map(([k, l]) => `<button type="button" data-m="${k}" class="${k === 'green' ? 'm-green' : k[0] === 's' ? 'm-red' : ''}" aria-pressed="${on(k)}">${l}</button>`).join(''); };
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-m]');
          if (!b) return;
          const k = b.dataset.m;
          if (k === 'green') f.michelin_green = !f.michelin_green;
          else if (k === 'bib') { f.michelin_bib = !f.michelin_bib; if (f.michelin_bib) f.michelin_stars = 0; }
          else { const n = Number(k[1]); f.michelin_stars = f.michelin_stars === n ? 0 : n; if (f.michelin_stars) f.michelin_bib = false; }
          draw();
        });
        draw();
      }

      const renderResults = (list) => {
        const el = q('#pf-results');
        if (!list) { el.innerHTML = ''; return; }
        if (!list.length) { el.innerHTML = '<div class="field-hint">Nessun risultato. Prova con nome e paese, o scegli sulla mappa.</div>'; return; }
        el.innerHTML = `<div class="results">${list.map((r, i) =>
          `<button class="result" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.address.split(',').slice(1, 4).join(','))}</span></button>`
        ).join('')}</div>`;
        el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
          const r = list[Number(b.dataset.i)];
          f.lat = r.lat; f.lng = r.lng; f.area = r.area; f.address = r.address;
          if (!f.name.trim()) { f.name = r.name; q('#pf-name').value = r.name; }
          renderResults(null); renderLocated(); validate();
        }));
      };

      const doSearch = async (text) => {
        if (!text.trim()) return;
        q('#pf-results').innerHTML = '<div class="field-hint">Cerco…</div>';
        try { renderResults(await nominatimSearch(text)); } catch (e) { renderResults(null); fail(e, 'Ricerca non riuscita'); }
      };
      const linkInSearch = () => {
        const v = q('#pf-q').value.trim();
        if (!/https?:\/\/\S+/.test(v)) return false;
        q('#pf-link').value = v;
        q('#pf-q').value = '';
        readLink();
        return true;
      };
      q('#pf-q').addEventListener('paste', () => setTimeout(linkInSearch, 50));
      q('#pf-search').addEventListener('click', () => { if (!linkInSearch()) doSearch(q('#pf-q').value); });
      q('#pf-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!linkInSearch()) doSearch(e.target.value); } });

      const readLink = async () => {
        const raw = q('#pf-link').value.trim();
        if (!raw) return;
        const status = (t) => { const el = q('#pf-link-status'); if (el) el.textContent = t; };
        status('Leggo il link…');
        // Da app e condivisioni arriva spesso "Nome · Indirizzo https://maps.app.goo.gl/…"
        const m = raw.match(/https?:\/\/\S+/);
        const u = m ? m[0].replace(/[),.;]+$/, '') : raw;
        const textName = m ? raw.slice(0, m.index).split(/\n|·|,|–| - /)[0].trim() : '';
        if (m && u !== raw) q('#pf-link').value = u;
        f.source_url = u;
        let r = parseLink(u);
        if (!r.name && textName && textName.length < 80) r.name = textName;
        if (r.isShort && r.lat == null) {
          q('#pf-read').disabled = true;
          q('#pf-read').textContent = 'Apro…';
          status('Apro il link di Google Maps…');
          try {
            const { data, error } = await sb.functions.invoke('resolve-link', { body: { url: u } });
            if (error) throw error;
            console.info('resolve-link', data);
            if (data?.url) {
              const full = parseLink(data.url);
              r = { ...r, ...Object.fromEntries(Object.entries(full).filter(([, v]) => v != null && v !== '')), isMap: true, isShort: true };
            }
            if (typeof data?.lat === 'number') { r.lat = data.lat; r.lng = data.lng; }
            if (data?.name) r.name = data.name;
            if (data?.address) r.address = data.address;
          } catch (e) {
            console.warn('resolve-link', e);
            let detail = e?.message || '';
            try { detail = (await e?.context?.json?.())?.error || detail; } catch { /* niente */ }
            toast('Non riesco ad aprire il link corto' + (detail ? `: ${detail}` : ''));
            status('Non riesco ad aprire il link' + (detail ? `: ${detail}` : '') + '. Cerca il nome qui sotto.');
          } finally {
            q('#pf-read').disabled = false;
            q('#pf-read').textContent = 'Leggi';
          }
        }
        if (r.name && !f.name.trim()) { f.name = r.name; q('#pf-name').value = r.name; }
        if (!r.isMap && !f.url && safeUrl(u)) { f.url = u; q('#pf-url').value = u; }
        if (r.lat != null) {
          f.lat = r.lat; f.lng = r.lng;
          renderLocated(); validate();
          status(`Trovato: ${r.name || 'posizione dal link'}`);
          try { Object.assign(f, await nominatimReverse(r.lat, r.lng)); renderLocated(); } catch { /* ok */ }
          toast('Trovato dal link');
        } else if (r.address) {
          status('Cerco l’indirizzo del link…');
          // Prima l'indirizzo, che OpenStreetMap trova bene; il nome resta quello di Google
          q('#pf-q').value = r.address;
          q('#pf-results').innerHTML = '<div class="field-hint">Cerco l’indirizzo…</div>';
          try {
            const list = await nominatimSearch(r.address, false);
            if (list.length) {
              const a = list[0];
              f.lat = a.lat; f.lng = a.lng; f.area = a.area; f.address = a.address;
              renderResults(null); renderLocated(); validate();
              toast('Trovato dal link');
            } else {
              q('#pf-q').value = `${r.name || ''} ${r.address}`.trim();
              doSearch(q('#pf-q').value);
            }
          } catch { doSearch(r.address); }
        } else if (r.name) {
          q('#pf-q').value = r.name;
          doSearch(r.name);
        } else if (r.isShort) {
          status('Il link non contiene la posizione: cerca il nome qui sotto.');
          toast('Link corto: cerca il nome qui sotto');
          q('#pf-q').focus();
        } else {
          toast('Nel link non c’è la posizione: cerca il nome');
          q('#pf-q').focus();
        }
        validate();
      };
      q('#pf-read').addEventListener('click', readLink);
      q('#pf-link').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); readLink(); } });
      q('#pf-link').addEventListener('paste', () => setTimeout(readLink, 50));

      const dayLine = () => {
        const tr = S.tripById.get(f.trip_id);
        q('#pf-day-line').hidden = !(tr && tr.use_days);
      };
      q('#pf-trip').addEventListener('change', (e) => { f.trip_id = e.target.value || null; dayLine(); });
      q('#pf-day').addEventListener('input', (e) => { f.day = e.target.value ? Number(e.target.value) : null; });
      dayLine();

      const renderPhoto = (busy = '') => {
        const el = q('#pf-photo');
        const u = safeUrl(f.photo_url);
        el.innerHTML = `
          <div class="photo-pick">
            ${u ? `<img src="${esc(u)}" alt="">` : `<span class="photo-pick-empty">${icon('image', 26, 1.6)}</span>`}
            <div class="photo-pick-actions">
              <button class="btn btn-quiet" id="pf-ph-up">${icon('camera', 16, 2.2)}Carica</button>
              <button class="btn btn-quiet" id="pf-ph-auto" ${f.lat == null ? 'disabled' : ''}>${icon('image', 16, 2.2)}Scegli</button>
              ${u ? `<button class="btn btn-quiet" id="pf-ph-rm" aria-label="Togli la foto">${icon('trash', 16)}</button>` : ''}
            </div>
            ${busy ? `<span class="field-hint">${esc(busy)}</span>` : f.photo_credit ? `<span class="field-hint">${esc(f.photo_credit)}</span>` : ''}
            <div id="pf-chooser"></div>
          </div>`;
        q('#pf-ph-up').addEventListener('click', async () => {
          const file = await pickFile();
          if (!file) return;
          renderPhoto('Carico…');
          try {
            f.photo_url = await uploadPhoto(sb, file, 'places');
            f.photo_credit = null; f.photo_source = 'own';
          } catch (e) { fail(e, 'Non riesco a caricare la foto'); }
          renderPhoto();
        });
        q('#pf-ph-auto').addEventListener('click', () => {
          showChooser(q('#pf-chooser'), () => placeCandidates(sb, { name: f.name, lat: f.lat, lng: f.lng, url: safeUrl(f.url) }), (c) => {
            f.photo_url = c.url; f.photo_credit = c.credit; f.photo_source = 'auto';
            const img = q('.photo-pick img');
            if (img) img.src = c.url;
            else renderPhoto();
            const hint = q('.photo-pick > .field-hint');
            if (hint) hint.textContent = c.credit;
          });
        });
        q('#pf-ph-rm')?.addEventListener('click', () => { f.photo_url = null; f.photo_credit = null; f.photo_source = null; renderPhoto(); });
      };
      renderPhoto();

      q('#pf-name').addEventListener('input', (e) => { f.name = e.target.value; validate(); });
      q('#pf-url').addEventListener('input', (e) => { f.url = e.target.value; validate(); });
      q('#pf-cuisine').addEventListener('click', (e) => {
        const b = e.target.closest('[data-cu]');
        if (!b) return;
        const c = b.dataset.cu;
        if (f.cuisines.includes(c)) f.cuisines = f.cuisines.filter((x) => x !== c);
        else if (f.cuisines.length < 3) f.cuisines.push(c);
        else return toast('Al massimo 3 cucine');
        renderCuisine();
      });
      const addCuisine = () => {
        const v = q('#pf-cuisine-new').value.trim().replace(/^./, (x) => x.toUpperCase());
        if (!v) return;
        if (!f.cuisines.includes(v)) {
          if (f.cuisines.length >= 3) return toast('Al massimo 3 cucine');
          f.cuisines.push(v);
        }
        q('#pf-cuisine-new').value = '';
        renderCuisine();
      };
      q('#pf-cuisine-add').addEventListener('click', addCuisine);
      q('#pf-cuisine-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCuisine(); } });
      q('#pf-dup').addEventListener('click', (e) => {
        const b = e.target.closest('[data-dup]');
        if (!b) return;
        api.close();
        go(`#/posto/${b.dataset.dup}`);
      });
      q('#pf-menu').addEventListener('input', (e) => { f.menu_url = e.target.value; });
      q('#pf-phone').addEventListener('input', (e) => { f.phone = e.target.value; });
      q('#pf-email').addEventListener('input', (e) => { f.email = e.target.value; });
      q('#pf-insta').addEventListener('input', (e) => { f.instagram = e.target.value; });
      q('#pf-notes').addEventListener('input', (e) => { f.notes = e.target.value; });

      renderLocated();
      renderCats();
      validate();
    }
  });
}

// Griglia di foto tra cui scegliere
async function showChooser(el, load, onPick) {
  el.innerHTML = '<div class="chooser-state">Cerco le foto…</div>';
  let list = [];
  try { list = await load(); } catch (e) { console.warn(e); }
  if (!list.length) {
    el.innerHTML = '<div class="chooser-state">Nessuna foto trovata. Caricane una tua.</div>';
    return;
  }
  el.innerHTML = `
    <div class="chooser" role="listbox" aria-label="Scegli una foto">
      ${list.map((c, i) => `<button class="chooser-item" data-i="${i}" data-full="${esc(safeUrl(c.url) || '')}" role="option" aria-label="Foto ${i + 1}"><img src="${esc(safeUrl(c.thumb) || '')}" alt="" loading="lazy" decoding="async" onerror="if(!this.dataset.retry&&this.parentNode.dataset.full){this.dataset.retry=1;this.src=this.parentNode.dataset.full}else{this.parentNode.remove()}"></button>`).join('')}
    </div>
    <div class="field-hint">Tocca una foto per sceglierla.</div>`;
  el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('.chooser-item').forEach((x) => x.removeAttribute('aria-selected'));
    b.setAttribute('aria-selected', 'true');
    onPick(list[Number(b.dataset.i)]);
  }));
}

function openPhotoChooser(place) {
  openModal({
    title: 'Scegli la foto',
    mount(body, api) {
      body.innerHTML = `<div id="pc-grid"></div><button class="btn btn-quiet btn-block" id="pc-up">${icon('camera', 16, 2.2)}Carica una foto vostra</button>`;
      const save = async (patch) => {
        const { error } = await sb.from('places').update(patch).eq('id', place.id);
        if (error) return fail(error, 'Non riesco a salvare la foto');
        api.close();
        toast('Foto aggiornata');
        await reload();
      };
      showChooser(body.querySelector('#pc-grid'), () => placeCandidates(sb, place),
        (c) => save({ photo_url: c.url, photo_credit: c.credit, photo_source: 'auto' }));
      body.querySelector('#pc-up').addEventListener('click', async () => {
        const file = await pickFile();
        if (!file) return;
        toast('Carico la foto…');
        try { save({ photo_url: await uploadPhoto(sb, file, 'places'), photo_credit: null, photo_source: 'own' }); }
        catch (e) { fail(e, 'Non riesco a caricare la foto'); }
      });
    }
  });
}

// Dettagli e foto dei posti li compila il server (funzione enrich-places), chiamato
// dal database appena il posto è salvato. Qui aspettiamo che finisca e ridisegniamo.
function watchDetails(id) {
  let tries = 0;
  const check = async () => {
    tries++;
    const { data } = await sb.from('places').select('enriched_at,photo_url,photo_source').eq('id', id).maybeSingle();
    if (data?.enriched_at && (data.photo_url || data.photo_source)) return reload();
    if (tries < 10) setTimeout(check, 5000);
  };
  setTimeout(check, 4000);
}

// Copertine dei viaggi senza foto: una volta per sessione
async function tripCoversBackfill() {
  if (!S.editor || S.autoPhotosDone) return;
  S.autoPhotosDone = true;
  let changed = false;
  for (const t of S.trips.filter((x) => !x.cover_url)) {
    const found = await findTripCover(t);
    if (found) {
      const { error } = await sb.from('trips').update({ cover_url: found.url, cover_credit: found.credit }).eq('id', t.id);
      if (!error) changed = true;
    }
  }
  if (changed) await reload();
}

// Nuovo viaggio / modifica
function openTripForm(trip = null) {
  const dates = trip ? S.tripDates.get(trip.id) || {} : {};
  const f = {
    name: trip?.name || '', destination: trip?.destination || '', lat: trip?.lat ?? null, lng: trip?.lng ?? null,
    status: trip?.status || 'sogno', use_days: trip?.use_days ?? false,
    cover_url: trip?.cover_url || null, cover_credit: trip?.cover_credit || null,
    vote_c: trip?.vote_c ?? null, vote_m: trip?.vote_m ?? null, review: trip?.review || '',
    start_on: dates.start_on || '', end_on: dates.end_on || ''
  };
  openModal({
    title: trip ? 'Modifica viaggio' : 'Nuovo viaggio',
    rightLabel: 'Salva',
    async onSave(api) {
      const payload = {
        name: f.name.trim(), destination: f.destination || null, lat: f.lat, lng: f.lng, status: f.status,
        use_days: f.use_days, cover_url: f.cover_url, cover_credit: f.cover_credit,
        vote_c: f.status === 'fatto' ? f.vote_c : null, vote_m: f.status === 'fatto' ? f.vote_m : null,
        review: f.status === 'fatto' ? (f.review.trim() || null) : null
      };
      const q = trip ? sb.from('trips').update(payload).eq('id', trip.id).select().single()
        : sb.from('trips').insert(payload).select().single();
      const { data, error } = await q;
      if (error) return fail(error, 'Non riesco a salvare');
      if (f.start_on || f.end_on || trip) {
        const d = await sb.from('trip_dates').upsert({ trip_id: data.id, start_on: f.start_on || null, end_on: f.end_on || null });
        if (d.error) fail(d.error, 'Viaggio salvato, ma senza date');
      }
      api.close();
      toast(trip ? 'Modifiche salvate' : 'Viaggio creato');
      await reload();
      go(`#/viaggio/${data.id}`);
    },
    mount(body, api) {
      body.innerHTML = `
        <div id="tf-cover"></div>
        <div>
          <span class="field-label">Viaggio</span>
          <div class="group">
            <div class="group-line"><input class="left" id="tf-name" placeholder="Nome, es. Lisbona" value="${esc(f.name)}" aria-label="Nome del viaggio"></div>
          </div>
        </div>
        <div>
          <label class="field-label" for="tf-q">Meta</label>
          <div class="inline-input">
            <input id="tf-q" type="search" placeholder="Città o regione" value="${esc(f.destination)}">
            <button class="btn btn-quiet" id="tf-search">Cerca</button>
          </div>
          <div id="tf-results"></div>
          <div class="field-hint" id="tf-dest">${f.lat != null ? `${icon('check', 12, 3)} ${esc(f.destination)}` : 'Serve per l’area sulla mappa finché non ci sono posti.'}</div>
        </div>
        <div>
          <span class="field-label">Stato</span>
          <div class="segmented" id="tf-status"></div>
        </div>
        <div class="group">
          <div class="group-line"><span>Dal</span><span class="meta" style="display:inline-flex;gap:4px;align-items:center">${icon('lock', 12, 2.4)}solo voi</span><input id="tf-start" type="date" value="${esc(f.start_on)}" style="max-width:none"></div>
          <div class="group-line"><span>Al</span><input id="tf-end" type="date" value="${esc(f.end_on)}" style="max-width:none"></div>
          <label class="group-line"><span>Organizza per giorni</span><input type="checkbox" class="switch" id="tf-days" ${f.use_days ? 'checked' : ''}></label>
        </div>
        <div id="tf-done"></div>`;
      const q = (s) => body.querySelector(s);
      const validate = () => api.setSaveEnabled(!!f.name.trim());

      const renderCover = (busy = '') => {
        const u = safeUrl(f.cover_url);
        q('#tf-cover').innerHTML = `
          <div class="photo-pick cover-pick">
            ${u ? `<img src="${esc(u)}" alt="">` : `<span class="photo-pick-empty">${icon('image', 30, 1.6)}<span>Copertina</span></span>`}
            <div class="photo-pick-actions">
              <button class="btn btn-quiet" id="tf-up">${icon('camera', 16, 2.2)}Carica</button>
              <button class="btn btn-quiet" id="tf-auto">${icon('image', 16, 2.2)}Scegli</button>
            </div>
            ${busy ? `<span class="field-hint">${esc(busy)}</span>` : f.cover_credit ? `<span class="field-hint">${esc(f.cover_credit)}</span>` : ''}
            <div id="tf-chooser"></div>
          </div>`;
        q('#tf-up').addEventListener('click', async () => {
          const file = await pickFile();
          if (!file) return;
          renderCover('Carico…');
          try { f.cover_url = await uploadPhoto(sb, file, 'trips'); f.cover_credit = null; }
          catch (e) { fail(e, 'Non riesco a caricare la foto'); }
          renderCover();
        });
        q('#tf-auto').addEventListener('click', () => suggestCover());
      };
      const suggestCover = () => {
        if (!f.destination && !f.name) return toast('Scrivi prima il nome o la meta');
        showChooser(q('#tf-chooser'), () => tripCandidates({ name: f.name, destination: f.destination, lat: f.lat, lng: f.lng }), (c) => {
          f.cover_url = c.url; f.cover_credit = c.credit;
          const img = q('.cover-pick img');
          if (img) img.src = c.url;
          else {
            const ph = q('.cover-pick .photo-pick-empty');
            if (ph) ph.outerHTML = `<img src="${esc(c.url)}" alt="">`;
          }
          const hint = q('.cover-pick > .field-hint');
          if (hint) hint.textContent = c.credit;
          else q('.cover-pick .photo-pick-actions').insertAdjacentHTML('afterend', `<span class="field-hint">${esc(c.credit)}</span>`);
        });
      };

      const statusEl = q('#tf-status');
      const drawStatus = () => {
        statusEl.innerHTML = Object.entries(TRIP_STATUS).map(([k, l]) => `<button data-v="${k}" aria-pressed="${f.status === k}">${l}</button>`).join('');
      };
      statusEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        f.status = b.dataset.v;
        drawStatus(); renderDone();
      });

      const renderDone = () => {
        const el = q('#tf-done');
        if (f.status !== 'fatto') { el.innerHTML = ''; return; }
        const row = (key, who, cls) => `
          <div class="vote-row">
            <span class="av ${cls}" style="width:28px;height:28px">${who[0]}</span>
            <span class="vote-who"><b>${who}</b><span>${voteLabel(f[key])}</span></span>
            <span class="vote-dots">${[1, 2, 3, 4].map((n) =>
              `<button class="vote-dot ${dotClass(f[key], n)}" data-k="${key}" data-n="${n}" aria-label="${who}: ${n} su 4, ritocca per ${n - 0.5}" aria-pressed="${f[key] === n || f[key] === n - 0.5}"><i></i></button>`
            ).join('')}</span>
          </div>`;
        el.innerHTML = `
          <span class="field-label">Com'è andata</span>
          <div class="group" id="tf-votes">${row('vote_c', 'Carlotta', 'av-c')}${row('vote_m', 'Michele', 'av-m')}</div>
          <div class="group" style="margin-top:12px"><textarea id="tf-review" placeholder="Recensione del viaggio, facoltativa e pubblica">${esc(f.review)}</textarea></div>`;
        q('#tf-votes').addEventListener('click', (e) => {
          const b = e.target.closest('[data-k]');
          if (!b) return;
          const n = Number(b.dataset.n);
          f[b.dataset.k] = nextVote(f[b.dataset.k], n);
          renderDone();
        });
        q('#tf-review').addEventListener('input', (e) => { f.review = e.target.value; });
      };

      const renderResults = (list) => {
        const el = q('#tf-results');
        if (!list) { el.innerHTML = ''; return; }
        if (!list.length) { el.innerHTML = '<div class="field-hint">Nessun risultato.</div>'; return; }
        el.innerHTML = `<div class="results">${list.map((r, i) =>
          `<button class="result" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.address.split(',').slice(1, 4).join(','))}</span></button>`
        ).join('')}</div>`;
        el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
          const r = list[Number(b.dataset.i)];
          f.lat = r.lat; f.lng = r.lng;
          f.destination = [r.name, r.address.split(',').slice(-1)[0].trim()].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
          q('#tf-q').value = f.destination;
          if (!f.name.trim()) { f.name = r.name; q('#tf-name').value = r.name; validate(); }
          q('#tf-dest').innerHTML = `${icon('check', 12, 3)} ${esc(f.destination)}`;
          renderResults(null);
          suggestCover();
        }));
      };
      const doSearch = async () => {
        const text = q('#tf-q').value.trim();
        if (!text) return;
        q('#tf-results').innerHTML = '<div class="field-hint">Cerco…</div>';
        try { renderResults(await nominatimSearch(text, false)); } catch (e) { renderResults(null); fail(e, 'Ricerca non riuscita'); }
      };
      q('#tf-search').addEventListener('click', doSearch);
      q('#tf-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

      q('#tf-name').addEventListener('input', (e) => { f.name = e.target.value; validate(); });
      q('#tf-start').addEventListener('input', (e) => { f.start_on = e.target.value; });
      q('#tf-end').addEventListener('input', (e) => { f.end_on = e.target.value; });
      q('#tf-days').addEventListener('change', (e) => { f.use_days = e.target.checked; });

      renderCover();
      drawStatus();
      renderDone();
      validate();
    }
  });
}

// Nuova visita
function openVisitForm(place) {
  if (!place) return;
  const f = { date: today(), vote_c: null, vote_m: null, review: '', review_by: S.me || 'Insieme' };
  openModal({
    title: 'Nuova visita',
    rightLabel: 'Salva',
    async onSave(api) {
      const { data, error } = await sb.from('visits').insert({
        place_id: place.id, vote_c: f.vote_c, vote_m: f.vote_m,
        review: f.review.trim() || null, review_by: f.review.trim() ? f.review_by : null
      }).select('id').single();
      if (error) return fail(error, 'Non riesco a salvare');
      if (f.date) {
        const d = await sb.from('visit_dates').insert({ visit_id: data.id, visited_on: f.date });
        if (d.error) fail(d.error, 'Visita salvata, ma senza data');
      }
      api.close();
      toast('Visita salvata');
      await reload();
    },
    mount(body, api) {
      body.innerHTML = `
        <div style="padding:0 4px">
          <h3 class="title" style="font-size:1.625rem">Com'è andata?</h3>
          <div class="meta">${esc(place.name)}</div>
        </div>
        <div class="group">
          <div class="group-line">
            <span>Data</span>
            <span class="note meta" style="display:inline-flex;gap:4px;align-items:center">${icon('lock', 12, 2.4)}solo voi</span>
            <input id="vf-date" type="date" value="${f.date}" max="${today()}" style="max-width:none">
          </div>
        </div>
        <div class="group" id="vf-votes"></div>
        <div>
          <div class="group">
            <textarea id="vf-review" placeholder="Recensione facoltativa: cosa vi è piaciuto, cosa ordinare, cosa evitare…"></textarea>
            <div class="group-line"><span>Scritta da</span><div class="segmented" id="vf-by"></div></div>
          </div>
          <div class="field-hint">La recensione è pubblica, la data no.</div>
        </div>`;
      const q = (s) => body.querySelector(s);
      const validate = () => api.setSaveEnabled(f.vote_c != null || f.vote_m != null);

      const renderVotes = () => {
        const row = (key, who, cls) => `
          <div class="vote-row">
            <span class="av ${cls}" style="width:28px;height:28px">${who[0]}</span>
            <span class="vote-who"><b>${who}</b><span>${voteLabel(f[key])}</span></span>
            <span class="vote-dots">${[1, 2, 3, 4].map((n) =>
              `<button class="vote-dot ${dotClass(f[key], n)}" data-k="${key}" data-n="${n}" aria-label="${who}: ${n} su 4, ${VOTE_LABELS[n - 1]}" aria-pressed="${f[key] === n || f[key] === n - 0.5}"><i></i></button>`
            ).join('')}</span>
          </div>`;
        q('#vf-votes').innerHTML = row('vote_c', 'Carlotta', 'av-c') + row('vote_m', 'Michele', 'av-m');
      };
      q('#vf-votes').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        const n = Number(b.dataset.n);
        f[b.dataset.k] = nextVote(f[b.dataset.k], n);
        if (navigator.vibrate) navigator.vibrate(8);
        renderVotes(); validate();
      });

      const by = q('#vf-by');
      const opts = [...PEOPLE, 'Insieme'];
      const drawBy = () => { by.innerHTML = opts.map((o) => `<button data-v="${o}" aria-pressed="${f.review_by === o}">${o}</button>`).join(''); };
      by.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { f.review_by = b.dataset.v; drawBy(); } });
      drawBy();

      q('#vf-date').addEventListener('input', (e) => { f.date = e.target.value; });
      q('#vf-review').addEventListener('input', (e) => { f.review = e.target.value; });
      renderVotes();
      validate();
    }
  });
}

// ─────────────────────────────────────────────
// Navigazione
// ─────────────────────────────────────────────
function route() {
  const h = location.hash;
  let m;
  if ((m = h.match(/^#\/posto\/([\w-]+)/))) S.view = { name: 'place', id: m[1] };
  else if ((m = h.match(/^#\/guida\/([\w-]+)/))) S.view = { name: 'guide', slug: m[1] };
  else if ((m = h.match(/^#\/viaggio\/([\w-]+)/))) S.view = { name: 'trip', id: m[1] };
  else if (/^#\/viaggi/.test(h)) S.view = { name: 'trips' };
  else if (/^#\/guide$/.test(h)) S.view = { name: 'guides' };
  else if ((m = h.match(/^#\/cerca(?:\?(.*))?$/))) {
    S.view = { name: 'search', qs: m[1] || '' };
    if (filterHash() !== h) S.filter = filterFromQuery(m[1]);
    if (S.filter.near && !S.here) locateMe().then(() => { renderMarkers(); renderSheet(); });
  }
  else S.view = { name: 'list' };

  const key = JSON.stringify(S.view);
  const changed = key !== S.lastViewKey;
  S.lastViewKey = key;
  if (changed && S.view.name !== 'place') S.tripFilter = { star: false, prices: new Set() };

  renderChips();
  renderMarkers();
  renderAreas();
  renderSheet();
  if (!changed) return;
  $('sheet-body').scrollTop = 0;

  if (S.view.name === 'place') {
    const p = S.placeById.get(S.view.id);
    if (sheet.enabled && sheet.detent === 'small') sheet.snap('medium');
    if (p) {
      S.sheetVisible = sheet.visibleHeight();
      map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 13), padding: mapPadding(), duration: 650 });
    }
  } else if (S.view.name === 'search') {
    if (sheet.enabled && sheet.detent === 'small') sheet.snap('medium');
    S.sheetVisible = sheet.visibleHeight();
    fitResults();
  } else if (S.view.name === 'trip' || S.view.name === 'trips') {
    if (sheet.enabled && sheet.detent === 'small') sheet.snap('medium');
    S.sheetVisible = sheet.visibleHeight();
    const list = S.view.name === 'trip' ? [S.tripById.get(S.view.id)].filter(Boolean) : S.trips;
    const pts = list.flatMap((t) => tripArea(t) || []);
    fitTo(pts, 13);
  } else if (S.view.name === 'guide') {
    if (sheet.enabled) sheet.snap('medium');
    S.sheetVisible = sheet.visibleHeight();
    const g = currentGuide();
    const pts = (g?.items || []).filter((i) => typeof i.lat === 'number').map((i) => [i.lng, i.lat]);
    fitTo(pts);
  }
}
window.addEventListener('hashchange', route);

async function reload() {
  await load();
  renderTopbar();
  renderChips();
  renderMarkers();
  renderAreas();
  renderSheet();
}

let authTimer = 0;
sb.auth.onAuthStateChange((event) => {
  if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
  clearTimeout(authTimer);
  authTimer = setTimeout(async () => {
    await refreshAuth();
    await reload();
    if (event === 'SIGNED_IN' && S.me) toast(`Ciao ${S.me}`);
    tripCoversBackfill();
    if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname);
  }, 0);
});

// ─────────────────────────────────────────────
// Avvio
// ─────────────────────────────────────────────
(async function boot() {
  renderTopbar();
  renderSheet();
  try {
    await refreshAuth();
  } catch (e) { console.error(e); }
  if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname);
  await load();
  renderTopbar();
  renderChips();
  const start = () => {
    route();
    if (S.view.name === 'list' && !S.firstFit && S.places.length) {
      S.firstFit = true;
      S.sheetVisible = sheet.visibleHeight();
      fitTo(S.places.map((p) => [p.lng, p.lat]), 13);
    }
    tripCoversBackfill();
  };
  if (map.loaded()) start(); else map.once('load', start);
})();

// Funziona anche senza rete (e si aggiorna da sola)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* niente */ });
}
