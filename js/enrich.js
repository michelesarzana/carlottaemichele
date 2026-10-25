// Dettagli automatici dei posti: li compila il server (supabase/functions/enrich-places).
// Qui resta solo la lettura degli orari.

// Orari OSM in italiano, versione leggibile
const DAYS = { Mo: 'lun', Tu: 'mar', We: 'mer', Th: 'gio', Fr: 'ven', Sa: 'sab', Su: 'dom', PH: 'festivi' };
export function prettyHours(s) {
  if (!s) return '';
  return String(s)
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
    .replace(/\boff\b/gi, 'chiuso')
    .replace(/24\/7/, 'sempre aperto')
    .split(';').map((x) => x.trim()).filter(Boolean);
}
