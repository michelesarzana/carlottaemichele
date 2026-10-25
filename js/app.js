import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY, MAP_STYLE, DEFAULT_VIEW, PEOPLE, VOTE_LABELS } from './config.js';
import { icon, CATEGORY_ICONS } from './icons.js';
import { Sheet } from './sheet.js';
import { findTripCover, uploadPhoto, pickFile, placeCandidates, tripCandidates } from './photos.js';
import { prettyHours } from './enrich.js';

const FOOD = new Set(['ristoranti', 'bar', 'vino']);

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
  editor: false,
  me: null,
  email: null,
  filter: { status: 'all', cats: new Set(), q: '' },
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
function price(n) { return n ? '€'.repeat(n) : ''; }
function slugify(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cat-' + Date.now().toString(36);
}
function initial(name) { return name ? name[0].toUpperCase() + '.' : ''; }
function isApple() { return /iPhone|iPad|Macintosh/.test(navigator.userAgent); }
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

function filtered() {
  const q = norm(S.filter.q);
  return S.places.filter((p) =>
    (S.filter.status === 'all' || (S.filter.status === 'done') === p.done) &&
    (!S.filter.cats.size || S.filter.cats.has(p.category_id)) &&
    (!q || norm(`${p.name} ${p.area || ''} ${p.notes || ''} ${cat(p.category_id).name}`).includes(q))
  );
}

// ─────────────────────────────────────────────
// Mappa
// ─────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: MAP_STYLE,
  center: DEFAULT_VIEW.center,
  zoom: DEFAULT_VIEW.zoom,
  attributionControl: { compact: true },
  dragRotate: false,
  pitchWithRotate: false
});
map.touchZoomRotate.disableRotation();

map.on('style.load', () => {
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
map.on('moveend', () => {
  if (S.view.name !== 'list') return;
  clearTimeout(moveTimer);
  moveTimer = setTimeout(renderSheet, 120);
});

const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;
function mapPadding() {
  if (isDesktop()) return { top: 60, bottom: 60, left: 430, right: 60 };
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
  const selected = S.view.name === 'place' ? S.view.id : null;
  const list = filtered();
  const ids = new Set(list.map((p) => p.id));
  const toShow = selected && !ids.has(selected) ? [...list, S.placeById.get(selected)].filter(Boolean) : list;
  for (const p of toShow) {
    const c = cat(p.category_id);
    const el = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'pin' + (p.done ? ' done' : '') + (p.id === selected ? ' selected' : '');
    btn.style.setProperty('--c', safeColor(c.color));
    btn.innerHTML = icon(c.icon, 16, 2.2);
    btn.setAttribute('aria-label', `${p.name}${p.done ? ', fatto' : ', da fare'}`);
    btn.addEventListener('click', (e) => { e.stopPropagation(); go(`#/posto/${p.id}`); });
    el.append(btn);
    const m = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
    if (p.id === selected) el.style.zIndex = '3';
    markers.push(m);
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
    <button class="chip" data-status="done" aria-pressed="${st === 'done'}">Fatti ${done}</button>
    <span class="chip-sep" aria-hidden="true"></span>`;
  for (const c of S.categories) {
    const on = S.filter.cats.has(c.id);
    h += `<button class="chip" data-cat="${esc(c.id)}" aria-pressed="${on}"><span class="dot" style="background:${safeColor(c.color)}"></span>${esc(c.name)}</button>`;
  }
  $('chips').innerHTML = h;
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
  if (b.dataset.cat) {
    const id = b.dataset.cat;
    S.filter.cats.has(id) ? S.filter.cats.delete(id) : S.filter.cats.add(id);
  }
  renderChips();
  renderMarkers();
  if (S.view.name !== 'list') go('#/');
  else renderSheet();
});

let searchTimer = 0;
$('search').addEventListener('input', (e) => {
  S.filter.q = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderMarkers();
    if (S.view.name !== 'list') go('#/');
    else renderSheet();
    const pts = filtered().map((p) => [p.lng, p.lat]);
    if (S.filter.q && pts.length) fitTo(pts);
  }, 180);
});

$('profile').addEventListener('click', () => (S.email ? openProfile() : openLogin()));

let youMarker = null;
$('locate').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Posizione non disponibile su questo dispositivo');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = [pos.coords.longitude, pos.coords.latitude];
      if (!youMarker) {
        const el = document.createElement('div');
        el.style.cssText = 'width:16px;height:16px;border-radius:8px;background:#0A84FF;border:3px solid #fff;box-shadow:0 0 0 6px rgba(10,132,255,.2)';
        el.setAttribute('aria-hidden', 'true');
        youMarker = new maplibregl.Marker({ element: el });
      }
      youMarker.setLngLat(ll).addTo(map);
      map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 13), padding: mapPadding() });
    },
    () => toast('Non riesco a leggere la posizione'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ─────────────────────────────────────────────
// Sheet: contenuti
// ─────────────────────────────────────────────
const sheet = new Sheet($('sheet'), {
  grab: $('sheet-grab'),
  scroll: $('sheet-body'),
  onChange: (_detent, visible) => { S.sheetVisible = visible; }
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
  else out = viewList();
  head.innerHTML = out.head;
  body.innerHTML = out.body;
  sheet._apply && sheet.enabled && sheet._apply();
}

function placeRow(p) {
  const c = cat(p.category_id);
  const sub = [c.name, p.area, price(p.price)].filter(Boolean).map(esc).join(' · ');
  const end = p.done
    ? (p.score != null ? `<span class="score-pill">${fmtScore(p.score)}</span>` : '')
    : (p.proposed_by ? `<span class="row-end">da ${esc(initial(p.proposed_by))}</span>` : '');
  const ph = safeUrl(p.photo_url);
  return `
    <button class="row" data-act="open-place" data-id="${esc(p.id)}">
      <span class="tile${ph ? ' has-photo' : ''}" style="--c:${safeColor(c.color)}">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy" decoding="async">` : icon(c.icon, 20, 2.1)}${p.done ? `<span class="tick">${icon('check', 9, 4)}</span>` : ''}</span>
      <span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${sub}</span></span>
      ${end}
    </button>`;
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
        <div class="eyebrow">${inArea ? "In quest'area" : (S.filter.q || S.filter.cats.size || st !== 'all' ? 'Con questi filtri' : 'Tutti i nostri posti')}</div>
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

function dots(n) {
  if (n == null) return '<span class="dots-none">non votato</span>';
  return `<span class="dots" aria-label="${n} su 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
}

function directionsUrl(p) {
  return isApple()
    ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
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
  const meta = [c.name, p.area, price(p.price)].filter(Boolean).map(esc).join(' · ');
  const head = `
    <div class="head-row" style="align-items:flex-start">
      <div style="min-width:0">
        <h1 class="title title-xl">${esc(p.name)}</h1>
        <div class="meta" style="margin-top:4px">${meta}</div>
      </div>
      <button class="icon-btn quiet" data-act="close" aria-label="Chiudi">${icon('x', 14, 3)}</button>
    </div>`;

  const acts = [`<a class="action primary" href="${directionsUrl(p)}" target="_blank" rel="noopener">${icon('directions', 20)}Indicazioni</a>`];
  if (S.editor) acts.push(`<button class="action" data-act="new-visit" data-id="${esc(p.id)}">${icon('check', 20)}${p.done ? 'Nuova visita' : 'Fatto!'}</button>`);
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

  const places = tripPlaces(t);
  const tab = t.use_days ? (S.view.tab || 'giorni') : 'posti';
  if (t.use_days) {
    body += `<div class="segmented" style="margin:16px 0 4px">
      <button data-act="trip-tab" data-tab="giorni" aria-pressed="${tab === 'giorni'}">Giorni</button>
      <button data-act="trip-tab" data-tab="posti" aria-pressed="${tab === 'posti'}">Posti</button>
    </div>`;
  }
  if (!places.length) {
    body += `<div class="empty">Nessun posto ancora.${S.editor ? '<br>Aggiungine uno qui sotto.' : ''}</div>`;
  } else if (tab === 'giorni') {
    const byDay = new Map();
    for (const p of places) {
      const k = p.day || 0;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(p);
    }
    const keys = [...byDay.keys()].sort((a, b) => (a || 999) - (b || 999));
    for (const k of keys) {
      body += `<div class="section-label">${k ? `Giorno ${k}` : 'Senza giorno'}</div><div class="rows">${byDay.get(k).sort((a, b) => a.name.localeCompare(b.name)).map(placeRow).join('')}</div>`;
    }
  } else {
    body += `<div class="rows" style="margin-top:8px">${places.sort((a, b) => a.name.localeCompare(b.name)).map(placeRow).join('')}</div>`;
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
        url: it.url || '', category_id: it.category || g.category || '', guide_id: g.id
      });
      break;
    }
  }
});

async function sharePlace(p) {
  if (!p) return;
  const url = `${location.origin}${location.pathname}#/posto/${p.id}`;
  try {
    if (navigator.share) await navigator.share({ title: p.name, url });
    else { await navigator.clipboard.writeText(url); toast('Link copiato'); }
  } catch { /* annullato */ }
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
        <button class="btn btn-quiet btn-block" id="logout">Esci</button>`;
      body.querySelector('#logout').addEventListener('click', async () => {
        await sb.auth.signOut();
        api.close();
      });
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

// Nuovo posto / modifica
function openPlaceForm(place = null, preset = {}) {
  const f = {
    name: '', category_id: '', lat: null, lng: null, area: '', address: '', price: null,
    url: '', source_url: '', notes: '', proposed_by: S.me || '', guide_id: null,
    trip_id: null, day: null, photo_url: null, photo_credit: null, photo_source: null,
    phone: '', email: '', instagram: '', menu_url: '', opening_hours: null,
    ...(place ? {
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

  openModal({
    title: place ? 'Modifica posto' : 'Nuovo posto',
    rightLabel: 'Salva',
    async onSave(api) {
      const payload = {
        name: f.name.trim(), category_id: f.category_id, lat: f.lat, lng: f.lng,
        area: f.area || null, address: f.address || null, price: f.price || null,
        url: safeUrl(f.url) || null, source_url: f.source_url || null, notes: f.notes.trim() || null,
        proposed_by: f.proposed_by || null, guide_id: f.guide_id || null,
        trip_id: f.trip_id || null, day: f.trip_id && f.day ? Number(f.day) : null,
        photo_url: f.photo_url || null, photo_credit: f.photo_credit || null, photo_source: f.photo_source || null,
        phone: f.phone.trim() || null, email: f.email.trim() || null,
        instagram: f.instagram.trim() ? (safeUrl(f.instagram.trim()) || `https://www.instagram.com/${f.instagram.trim().replace(/^@/, '')}/`) : null,
        menu_url: safeUrl(f.menu_url.trim()) || null, opening_hours: f.opening_hours || null
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
        <div>
          <span class="field-label">Nome</span>
          <div class="group"><div class="group-line"><input class="left" id="pf-name" placeholder="Nome del posto" value="${esc(f.name)}" aria-label="Nome"></div></div>
        </div>
        <div>
          <span class="field-label">Categoria</span>
          <div class="cat-picker" id="pf-cats"></div>
          <div id="pf-newcat"></div>
        </div>
        <div>
          <span class="field-label">Dettagli</span>
          <div class="group">
            <div class="group-line"><span>Prezzo</span><div class="segmented" id="pf-price"></div></div>
            <div class="group-line"><span>Proposto da</span><div class="segmented" id="pf-by"></div></div>
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
      const validate = () => {
        api.setSaveEnabled(!!(f.name.trim() && f.category_id && f.lat != null && f.lng != null));
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

      const renderCats = () => {
        q('#pf-cats').innerHTML = S.categories.map((c) =>
          `<button class="cat-opt" data-cat="${esc(c.id)}" style="--c:${safeColor(c.color)}" aria-pressed="${f.category_id === c.id}"><span class="dot"></span>${esc(c.name)}</button>`
        ).join('') + '<button class="cat-opt add" data-cat="__new">+ Nuova</button>';
      };
      q('#pf-cats').addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        if (b.dataset.cat === '__new') { newCat = { name: '', color: PALETTE[8], icon: 'pin' }; renderNewCat(); return; }
        f.category_id = b.dataset.cat; renderCats(); validate();
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
          f.category_id = row.id;
          newCat = null;
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
      seg(q('#pf-price'), [1, 2, 3, 4].map((n) => ({ v: n, l: '€'.repeat(n) })), () => f.price, (v) => { f.price = v; });
      seg(q('#pf-by'), PEOPLE.map((p) => ({ v: p, l: p })), () => f.proposed_by, (v) => { f.proposed_by = v || ''; });

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
      q('#pf-search').addEventListener('click', () => doSearch(q('#pf-q').value));
      q('#pf-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(e.target.value); } });

      const readLink = async () => {
        const raw = q('#pf-link').value.trim();
        if (!raw) return;
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
          try { Object.assign(f, await nominatimReverse(r.lat, r.lng)); renderLocated(); } catch { /* ok */ }
          toast('Trovato dal link');
        } else if (r.address) {
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
      q('#pf-url').addEventListener('input', (e) => { f.url = e.target.value; });
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
      ${list.map((c, i) => `<button class="chooser-item" data-i="${i}" role="option" aria-label="Foto ${i + 1}"><img src="${esc(safeUrl(c.thumb) || '')}" alt="" loading="lazy" decoding="async"></button>`).join('')}
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
            <span class="vote-who"><b>${who}</b><span>${f[key] ? VOTE_LABELS[f[key] - 1] : 'Tocca per votare'}</span></span>
            <span class="vote-dots">${[1, 2, 3, 4].map((n) =>
              `<button class="vote-dot ${f[key] && n <= f[key] ? 'on' : ''}" data-k="${key}" data-n="${n}" aria-label="${who}: ${n} su 4" aria-pressed="${f[key] === n}"><i></i></button>`
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
          f[b.dataset.k] = f[b.dataset.k] === n ? null : n;
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
            <span class="vote-who"><b>${who}</b><span>${f[key] ? VOTE_LABELS[f[key] - 1] : 'Tocca per votare'}</span></span>
            <span class="vote-dots">${[1, 2, 3, 4].map((n) =>
              `<button class="vote-dot ${f[key] && n <= f[key] ? 'on' : ''}" data-k="${key}" data-n="${n}" aria-label="${who}: ${n} su 4, ${VOTE_LABELS[n - 1]}" aria-pressed="${f[key] === n}"><i></i></button>`
            ).join('')}</span>
          </div>`;
        q('#vf-votes').innerHTML = row('vote_c', 'Carlotta', 'av-c') + row('vote_m', 'Michele', 'av-m');
      };
      q('#vf-votes').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        const n = Number(b.dataset.n);
        f[b.dataset.k] = f[b.dataset.k] === n ? null : n;
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
  else S.view = { name: 'list' };

  const key = JSON.stringify(S.view);
  const changed = key !== S.lastViewKey;
  S.lastViewKey = key;

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
