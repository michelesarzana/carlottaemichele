// Icone a tratto, 24×24. Il colore arriva da currentColor.
const P = {
  fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M17 21V3c-2 1-3 4-3 7s1 4 3 4"/>',
  cup: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M7 3v2M10 3v2M13 3v2"/>',
  beer: '<path d="M6 9h10v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M6 9a2.5 2.5 0 0 1 2.5-4.5 3 3 0 0 1 5 0A2.5 2.5 0 0 1 16 9M9.5 13v5M12.5 13v5"/>',
  wheat: '<path d="M12 22V6M12 19c-2.2 0-4-1.6-4.5-4 2.2 0 4 1.6 4.5 4zM12 19c2.2 0 4-1.6 4.5-4-2.2 0-4 1.6-4.5 4zM12 14.5c-2.2 0-4-1.6-4.5-4 2.2 0 4 1.6 4.5 4zM12 14.5c2.2 0 4-1.6 4.5-4-2.2 0-4 1.6-4.5 4zM12 10c-2.2 0-4-1.6-4.5-4 2.2 0 4 1.6 4.5 4zM12 10c2.2 0 4-1.6 4.5-4-2.2 0-4 1.6-4.5 4zM12 6c-1-1-1.3-2.6-1-4 1.2.6 1.7 2.4 1 4z"/>',
  cards: '<rect x="4" y="6" width="11" height="15" rx="2"/><path d="M9 6V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M9.5 10.3l1 2 2.2.3-1.6 1.6.4 2.2-2-1-2 1 .4-2.2-1.6-1.6 2.2-.3z"/>',
  wine: '<path d="M8 3h8v5a4 4 0 0 1-8 0zM12 12v8M8 21h8"/>',
  bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  mountain: '<path d="M3 20l6-11 4 7 3-4 5 8z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  bed: '<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
  plane: '<path d="M10 14l-6 3v-2l6-5V5a2 2 0 0 1 4 0v5l6 5v2l-6-3v4l2 2v1l-4-1-4 1v-1l2-2z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  heart: '<path d="M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  locate: '<path d="M21 3L3 10l7 3 3 7z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 13v6h14v-6"/>',
  directions: '<path d="M3 12l9-9 9 9-9 9z"/><path d="M10 14v-2a1 1 0 0 1 1-1h4M13 9l2 2-2 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  sliders: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
};

export const CATEGORY_ICONS = ['fork', 'cup', 'beer', 'wine', 'wheat', 'cards', 'bag', 'mountain', 'star', 'bed', 'plane', 'heart', 'pin'];

// Un'emoji al posto dell'icona (categorie): solo caratteri emoji, niente HTML
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200d\ufe0f\u20e3\u{1F3FB}-\u{1F3FF}#*0-9])+$/u;
export function isEmoji(s) { return typeof s === 'string' && s.length <= 16 && EMOJI_RE.test(s) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s); }

// Emoji proposte per le categorie (si può scriverne qualsiasi altra)
export const CATEGORY_EMOJI = ['🍴', '🍝', '🍕', '🍣', '☕', '🍺', '🍷', '🍸', '🍰', '🍦', '🥐', '🌾', '🛍️', '📚', '🎨', '🏛️', '🏞️', '⛰️', '🏖️', '🌳', '🎟️', '🎭', '🎵', '⚽', '🏃', '🛏️', '✈️', '🚂', '🎴', '❤️', '⭐', '📍'];

export function icon(name, size = 20, stroke = 2) {
  if (!P[name] && isEmoji(name)) return `<span class="emo" style="font-size:${Math.round(size * 1.05)}px" aria-hidden="true">${name}</span>`;
  const body = P[name] || P.pin;
  return `<svg class="ic" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// Cucina → emoji del pin (per i posti dove mangiare e bere): si riconoscono anche piccole
const CUISINE_EMOJI = {
  italiana: '🍝', tradizionale: '🍝', pasta: '🍝', trattoria: '🍝', milanese: '🍝', sarda: '🍝', siciliana: '🍝', romana: '🍝',
  giapponese: '🍣', sushi: '🍣', ramen: '🍜', cinese: '🥟', coreana: '🍲', thai: '🍜', vietnamita: '🍜', asiatica: '🥢', fusion: '🥢',
  indiana: '🍛', etiope: '🍛', africana: '🍛',
  pesce: '🐟', mediterranea: '🫒',
  carne: '🥩', griglia: '🍖', argentina: '🥩', brasiliana: '🍖',
  hamburger: '🍔', americana: '🍔',
  messicana: '🌮', peruviana: '🌮',
  spagnola: '🥘', basca: '🥘', tapas: '🍢',
  mediorientale: '🧆', libanese: '🧆', turca: '🥙', greca: '🥙',
  francese: '🥐', forno: '🥐', colazione: '☕',
  vegetariana: '🥗', vegana: '🥗',
  cocktail: '🍸', brunch: '🍳', pub: '🍺', birra: '🍺', vini: '🍷'
};
export function cuisineEmoji(cuisines) {
  for (const c of cuisines || []) {
    const k = String(c).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (CUISINE_EMOJI[k]) return CUISINE_EMOJI[k];
  }
  return null;
}
