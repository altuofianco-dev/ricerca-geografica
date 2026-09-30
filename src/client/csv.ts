// CSV per Excel in italiano: UTF-8 con BOM, separatore ";", righe CRLF.

import tipiIt from '../data/place-types.it.json';

const BOM = '﻿';
const TIPI = tipiIt as { type: string; label: string; generico?: boolean }[];
const ETICHETTE = new Map(TIPI.map((t) => [t.type, t.label]));
const GENERICI = new Set(TIPI.filter((t) => t.generico).map((t) => t.type));

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
}

/** Etichette italiane dei tipi Google (quelle sconosciute vengono omesse). */
export const etichette = (tipi: string[]) => tipi.map((t) => ETICHETTE.get(t)).filter(Boolean).join(', ');

/** Come `etichette`, ma senza i tipi generici (es. "Servizio") quando ce ne sono di più specifici. */
export function etichetteRisultato(tipi: string[]): string {
  const noti = tipi.filter((t) => ETICHETTE.has(t));
  const specifici = noti.filter((t) => !GENERICI.has(t));
  return etichette(specifici.length > 0 ? specifici : noti);
}

/** CSV dei risultati: usato da "Nuova ricerca" e dal dettaglio di una ricerca. */
export const csvRisultati = (luoghi: LuogoCsv[]) =>
  generaCsv(
    ['Denominazione', 'Indirizzo', 'Categorie', 'Telefono', 'Sito web', 'Place ID'],
    luoghi.map((l) => [l.nome, l.indirizzo, etichetteRisultato(l.tipi), l.telefono, l.sito, l.placeId]),
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
