// CSV per Excel in italiano: UTF-8 con BOM, separatore ";", righe CRLF.

const BOM = '﻿';

/** Categoria come arriva da GET /api/categorie (bastano questi campi). */
export interface TipoEtichetta {
  type: string;
  label: string;
  generico?: boolean;
}

const cache = new WeakMap<TipoEtichetta[], { etichette: Map<string, string>; generici: Set<string> }>();
function indice(elenco: TipoEtichetta[]) {
  let i = cache.get(elenco);
  if (!i) {
    i = { etichette: new Map(elenco.map((t) => [t.type, t.label])), generici: new Set(elenco.filter((t) => t.generico).map((t) => t.type)) };
    cache.set(elenco, i);
  }
  return i;
}

/** Racchiude la cella tra virgolette se serve; neutralizza le formule (= + - @) anteponendo un apice. */
export function cellaCsv(valore: string | null | undefined): string {
  let v = valore ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function generaCsv(intestazioni: string[], righe: (string | null | undefined)[][]): string {
  const linee = [intestazioni, ...righe].map((r) => r.map(cellaCsv).join(';'));
  return BOM + linee.join('\r\n') + '\r\n';
}

export interface LuogoCsv {
  placeId: string;
  nome: string | null;
  indirizzo: string | null;
  tipi: string[];
  telefono: string | null;
  sito: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Numero con 5 decimali e virgola decimale (formato italiano); vuoto se manca. */
export const decimaleIt = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(5).replace('.', ',') : '';

/** "41,85421; 12,47851"; vuoto se manca una delle due. */
export const formatoCoordinate = (lat: number | null | undefined, lng: number | null | undefined) =>
  decimaleIt(lat) && decimaleIt(lng) ? `${decimaleIt(lat)}; ${decimaleIt(lng)}` : '';

/** Link di ricerca Google Maps su nome e indirizzo, agganciato al Place ID. */
export const linkMaps = (nome: string | null, indirizzo: string | null, placeId: string) =>
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent([nome, indirizzo].filter(Boolean).join(', ')) +
  '&query_place_id=' +
  encodeURIComponent(placeId);

/** Numero per il link tel: senza spazi, con +39 se manca il prefisso internazionale ("00…" diventa "+…"). */
export function numeroTel(telefono: string): string {
  let n = telefono.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  return n.startsWith('+') ? n : `+39${n}`;
}

/** Etichette italiane dei tipi Google (quelle sconosciute vengono omesse). */
export const etichette = (tipi: string[], elenco: TipoEtichetta[]) => {
  const { etichette: e } = indice(elenco);
  return tipi.map((t) => e.get(t)).filter(Boolean).join(', ');
};

/** Come `etichette`, ma senza i tipi generici (es. "Servizio") quando ce ne sono di più specifici. */
export function etichetteRisultato(tipi: string[], elenco: TipoEtichetta[]): string {
  const { etichette: e, generici } = indice(elenco);
  const noti = tipi.filter((t) => e.has(t));
  const specifici = noti.filter((t) => !generici.has(t));
  return etichette(specifici.length > 0 ? specifici : noti, elenco);
}

/** CSV dei risultati: usato da "Nuova ricerca" e dal dettaglio di una ricerca. */
export const csvRisultati = (luoghi: LuogoCsv[], elenco: TipoEtichetta[]) =>
  generaCsv(
    ['Denominazione', 'Indirizzo', 'Latitudine', 'Longitudine', 'Categorie', 'Telefono', 'Sito web', 'Place ID', 'Link Google Maps'],
    luoghi.map((l) => [
      l.nome,
      l.indirizzo,
      decimaleIt(l.lat),
      decimaleIt(l.lng),
      etichetteRisultato(l.tipi, elenco),
      l.telefono,
      l.sito,
      l.placeId,
      linkMaps(l.nome, l.indirizzo, l.placeId),
    ]),
  );

export function scaricaCsv(nomeFile: string, contenuto: string) {
  const url = URL.createObjectURL(new Blob([contenuto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
