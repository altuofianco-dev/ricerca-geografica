import { useEffect, useSyncExternalStore } from 'react';
import { api, messaggioErrore } from './api';
import type { Tipo } from './categorie';

// Elenco delle categorie da GET /api/categorie, caricato una volta e condiviso da selettore,
// etichette dei risultati, CSV e pagina "Categorie".

interface Stato {
  tipi: Tipo[] | null;
  errore: string;
}

let stato: Stato = { tipi: null, errore: '' };
let inCaricamento: Promise<void> | null = null;
const ascoltatori = new Set<() => void>();

function imposta(nuovo: Stato) {
  stato = nuovo;
  ascoltatori.forEach((f) => f());
}

/** Scarica l'elenco (una sola richiesta alla volta). */
export function ricaricaCategorie(): Promise<void> {
  inCaricamento ??= api<Tipo[]>('/api/categorie')
    .then((tipi) => imposta({ tipi, errore: '' }))
    .catch((e) => imposta({ tipi: stato.tipi, errore: messaggioErrore(e) }))
    .finally(() => {
      inCaricamento = null;
    });
  return inCaricamento;
}

/** Dopo il logout si dimentica l'elenco: il prossimo accesso lo scarica di nuovo. */
export function dimenticaCategorie() {
  imposta({ tipi: null, errore: '' });
}

const iscriviti = (f: () => void) => {
  ascoltatori.add(f);
  return () => {
    ascoltatori.delete(f);
  };
};

/** `tipi` è null finché non è arrivato l'elenco; `errore` è il messaggio dell'ultimo caricamento fallito. */
export function useCategorie() {
  const s = useSyncExternalStore(iscriviti, () => stato);
  useEffect(() => {
    if (s.tipi === null && !s.errore) void ricaricaCategorie();
  }, [s.tipi, s.errore]);
  return { tipi: s.tipi, errore: s.errore, ricarica: ricaricaCategorie };
}
