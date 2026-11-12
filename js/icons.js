// Icone a tratto, 24×24. Il colore arriva da currentColor.
const P = {
  fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M17 21V3c-2 1-3 4-3 7s1 4 3 4"/>',
  cup: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M7 3v2M10 3v2M13 3v2"/>',
  beer: '<path d="M6 9h10v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M6 9a2.5 2.5 0 0 1 2.5-4.5 3 3 0 0 1 5 0A2.5 2.5 0 0 1 16 9M9.5 13v5M12.5 13v5"/>',
  wheat: '<path d="M12 22V6M12 19c-2.2 0-4-1.6-4.5-4 2.2 0 4 1.6 4.5 4zM12 19c2.2 0 4-1.6 4.5-4-2.2 0-4 1.6-4.5 4zM12 14.5c-2.2 0-4-1.6-4.5-4 2.2 0 4 1.6 4.5 4zM12 14.5c2.2 0 4-1.6 4.5-4-2.2 0-4 1.6-4.5 4zM12 10c-2.2 0-4-1.6-4.5-4 2.2 0 4 1.6 4.5 4zM12 10c2.2 0 4-1.6 4.5-4-2.2 0-4 1.6-4.5 4zM12 6c-1-1-1.3-2.6-1-4 1.2.6 1.7 2.4 1 4z"/>',
  cards: '<rect x="4" y="6" width="11" height="15" rx="2"/><path d="M9 6V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M9.5 10.3l1 2 2.2.3-1.6 1.6.4 2.2-2-1-2 1 .4-2.2-1.6-1.6 2.2-.3z"/>',
  pasta: '<path d="M4 13h16a8 6 0 0 1-16 0z"/><path d="M13 3v3.5M15 3v3.5M17 3v3.5M13 6.5a2 2 0 0 0 4 0M15 8.5V11"/><path d="M6.5 13c.8-1.6 2.2-1.6 3 0s2.2 1.6 3 0"/>',
  pizza: '<path d="M3.5 7c5.5-3.5 11.5-3.5 17 0L12 21z"/><path d="M5.6 9.5c4.2-2.3 8.6-2.3 12.8 0"/><circle cx="10" cy="12" r="1.1"/><circle cx="14" cy="13.5" r="1.1"/><circle cx="12" cy="16.5" r="1"/>',
  sushi: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="10.6" cy="11.2" r=".7"/><circle cx="13.4" cy="11.6" r=".7"/><circle cx="12" cy="13.6" r=".7"/>',
  ramen: '<path d="M3 11h18a9 7 0 0 1-18 0z"/><path d="M14 3l-3 8M19.5 4.5L14 11"/><path d="M9 21h6"/>',
  fish: '<path d="M2.5 12c3-5 10.5-6.5 15.5 0-5 6.5-12.5 5-15.5 0z"/><path d="M18 12l3.5-3.5v7z"/><circle cx="7.5" cy="11" r=".8"/>',
  steak: '<path d="M6 7.5c3-3.5 9.5-4 12.5-.5s1.5 9-3.5 11.5S5 19 4.5 14.5c-.3-2.6.3-5 1.5-7z"/><circle cx="14" cy="10.5" r="2"/><path d="M7 15c2 1 5 1 7-.5"/>',
  burger: '<path d="M4 10.5a8 5.5 0 0 1 16 0z"/><path d="M3.5 13.5h17"/><path d="M5 16.5h14v.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17z"/>',
  taco: '<path d="M3 18a9 9 0 0 1 18 0z"/><path d="M5.2 12.2c1-1.4 2-1.4 3-.3 1-1.6 2.3-1.6 3.3-.6 1-1.6 2.3-1.6 3.3-.4 1-1.2 2-1 3 .4"/>',
  paella: '<ellipse cx="12" cy="13" rx="8.5" ry="4.5"/><path d="M1.5 13h2M20.5 13h2"/><circle cx="8" cy="13.5" r=".9"/><circle cx="12" cy="11.2" r=".9"/><circle cx="12.5" cy="15" r=".9"/><circle cx="16" cy="12.8" r=".9"/>',
  skewer: '<path d="M4 20L20 4"/><rect x="6.5" y="11.5" width="5" height="5" rx="1.2" transform="rotate(45 9 14)"/><rect x="12.5" y="5.5" width="5" height="5" rx="1.2" transform="rotate(45 15 8)"/>',
  croissant: '<path d="M3 16c.5-5 4-9 9-9s8.5 4 9 9c-1.8-1.2-3.4-1.2-4.6 0-.8-2.4-2.6-3.6-4.4-3.6S8.4 13.6 7.6 16C6.4 14.8 4.8 14.8 3 16z"/><path d="M10 7.5l1 5M14 7.5l-1 5"/>',
  leaf: '<path d="M5 19c0-9 6-14.5 15-14.5 0 9-5.5 15-15 14.5z"/><path d="M5 19l8.5-8.5"/>',
  gelato: '<path d="M8 12l4 9.5 4-9.5"/><path d="M6.5 12a5.5 5.5 0 0 1 11 0z"/>',
  cake: '<path d="M6 12h12l-1.5 8h-9z"/><path d="M4.5 12a7.5 5 0 0 1 15 0"/><circle cx="12" cy="5" r="1.2"/><path d="M10 12l.5 8M14 12l-.5 8"/>',
  cocktail: '<path d="M4 4h16l-8 9z"/><path d="M12 13v7M8 20h8"/><path d="M17 2l-3 5"/>',
  curry: '<path d="M3 12h18a9 7 0 0 1-18 0z"/><path d="M8.5 3.5c-1 1.5 1 2.5 0 4.5M12 3c-1 1.5 1 2.5 0 4.5M15.5 3.5c-1 1.5 1 2.5 0 4.5"/>',
  egg: '<path d="M12 3.5c3.5 0 4.5 3 7 4.5s2 7-1.5 8.5-4.5 4-8.5 3S3 15 3.5 11 8.5 3.5 12 3.5z"/><circle cx="11.5" cy="12" r="3"/>',
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

export function icon(name, size = 20, stroke = 2) {
  const body = P[name] || P.pin;
  return `<svg class="ic" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// Cucina → icona del pin (per i posti dove mangiare e bere)
const CUISINE_ICON = {
  italiana: 'pasta', tradizionale: 'pasta', pasta: 'pasta', trattoria: 'pasta', milanese: 'pasta', sarda: 'pasta', siciliana: 'pasta',
  pizza: 'pizza', pizzeria: 'pizza',
  giapponese: 'sushi', sushi: 'sushi',
  ramen: 'ramen', cinese: 'ramen', coreana: 'ramen', thai: 'ramen', vietnamita: 'ramen', asiatica: 'ramen', fusion: 'ramen',
  indiana: 'curry', etiope: 'curry', africana: 'curry',
  pesce: 'fish', mediterranea: 'fish',
  carne: 'steak', griglia: 'steak', argentina: 'steak', brasiliana: 'steak',
  hamburger: 'burger', americana: 'burger',
  messicana: 'taco', peruviana: 'taco',
  spagnola: 'paella', basca: 'paella', tapas: 'skewer',
  mediorientale: 'skewer', turca: 'skewer', libanese: 'skewer', greca: 'skewer',
  francese: 'croissant', forno: 'croissant', colazione: 'croissant',
  vegetariana: 'leaf', vegana: 'leaf',
  gelato: 'gelato', dolci: 'cake', pasticceria: 'cake',
  cocktail: 'cocktail', brunch: 'egg', pub: 'beer', birra: 'beer', vini: 'wine'
};
export function cuisineIcon(cuisines) {
  for (const c of cuisines || []) {
    const k = String(c).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (CUISINE_ICON[k]) return CUISINE_ICON[k];
  }
  return null;
}
