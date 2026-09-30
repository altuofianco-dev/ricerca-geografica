// Funzioni pure del selettore di categorie (SPEC §5): nessuna dipendenza da React.

export interface Tipo {
  type: string;
  label: string;
  gruppo: string;
  generico?: boolean;
  parole?: string[];
}

export interface Gruppo {
  nome: string;
  tipi: Tipo[];
}

export const MAX_CATEGORIE = 50;
export const TESTO_LIMITE = 'Troppe categorie: Google ne accetta al massimo 50 per ricerca';
export const TESTO_GENERICO =
  'Di solito comprende anche le categorie più specifiche, ma non sempre: per sicurezza puoi aggiungere quelle che ti interessano.';
export const TESTO_NESSUNA =
  'Nessuna categoria trovata. Google usa categorie predefinite: prova con un termine più generico o sfoglia le macro-categorie.';

/** Minuscolo, senza accenti, solo lettere/cifre separate da un singolo spazio. */
export function normalizza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Etichetta mostrata nel selettore: i tipi generici finiscono con "(in generale)". */
export const etichettaTipo = (t: Tipo) => (t.generico ? `${t.label} (in generale)` : t.label);

/** Macro-categorie nell'ordine in cui compaiono nell'elenco; dentro ogni macro l'ordine dell'elenco. */
export function raggruppa(tipi: Tipo[]): Gruppo[] {
  const mappa = new Map<string, Tipo[]>();
  for (const t of tipi) mappa.set(t.gruppo, [...(mappa.get(t.gruppo) ?? []), t]);
  return [...mappa].map(([nome, elenco]) => ({ nome, tipi: elenco }));
}

/**
 * Punteggio di una corrispondenza (più basso = migliore):
 * 0 = inizia con il testo, 1 = una parola inizia con il testo, 2 = contiene il testo, null = nessuna.
 * Si valuta l'etichetta e i sinonimi ("parole"); l'etichetta usata è quella mostrata (con "in generale").
 */
export function punteggio(t: Tipo, testo: string): number | null {
  const q = normalizza(testo);
  if (!q) return null;
  let migliore: number | null = null;
  for (const candidato of [etichettaTipo(t), ...(t.parole ?? [])]) {
    const c = normalizza(candidato);
    const p = c.startsWith(q) ? 0 : ` ${c}`.includes(` ${q}`) ? 1 : c.includes(q) ? 2 : null;
    if (p !== null && (migliore === null || p < migliore)) migliore = p;
  }
  return migliore;
}

/** Tipi che corrispondono al testo, ordinati: prima "inizia con", poi "parola che inizia", poi il resto. */
export function cerca(tipi: Tipo[], testo: string): Tipo[] {
  return tipi
    .map((t, i) => ({ t, i, p: punteggio(t, testo) }))
    .filter((x): x is { t: Tipo; i: number; p: number } => x.p !== null)
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.t);
}

/** Come `cerca`, ma organizzato per macro: le macro con la corrispondenza migliore vengono per prime. */
export function cercaPerGruppo(gruppi: Gruppo[], testo: string): Gruppo[] {
  return gruppi
    .map((g, i) => {
      const trovati = cerca(g.tipi, testo);
      return { g: { nome: g.nome, tipi: trovati }, i, p: trovati.length ? (punteggio(trovati[0], testo) as number) : null };
    })
    .filter((x) => x.g.tipi.length > 0)
    .sort((a, b) => (a.p as number) - (b.p as number) || a.i - b.i)
    .map((x) => x.g);
}

export type StatoMacro = 'nessuna' | 'parziale' | 'tutte';

export function statoMacro(gruppo: Gruppo, scelte: string[]): StatoMacro {
  const insieme = new Set(scelte);
  const n = gruppo.tipi.filter((t) => insieme.has(t.type)).length;
  return n === 0 ? 'nessuna' : n === gruppo.tipi.length ? 'tutte' : 'parziale';
}

/** Quante categorie si aggiungerebbero spuntando la macro. */
export function nuoveConMacro(gruppo: Gruppo, scelte: string[]): number {
  const insieme = new Set(scelte);
  return gruppo.tipi.filter((t) => !insieme.has(t.type)).length;
}

/** True se spuntare l'intera macro porterebbe oltre il massimo (contando anche le categorie già scelte). */
export function macroSuperaLimite(gruppo: Gruppo, scelte: string[], max = MAX_CATEGORIE): boolean {
  return statoMacro(gruppo, scelte) !== 'tutte' && scelte.length + nuoveConMacro(gruppo, scelte) > max;
}

/** Clic sulla casella della macro: se è completa la svuota, altrimenti aggiunge tutte le sue categorie. */
export function alternaMacro(gruppo: Gruppo, scelte: string[], max = MAX_CATEGORIE): string[] {
  const tipiMacro = new Set(gruppo.tipi.map((t) => t.type));
  if (statoMacro(gruppo, scelte) === 'tutte') return scelte.filter((x) => !tipiMacro.has(x));
  if (macroSuperaLimite(gruppo, scelte, max)) return scelte;
  const presenti = new Set(scelte);
  return [...scelte, ...gruppo.tipi.map((t) => t.type).filter((x) => !presenti.has(x))];
}

/** Clic sulla casella di una singola categoria; non supera mai il massimo. */
export function alternaTipo(tipo: string, scelte: string[], max = MAX_CATEGORIE): string[] {
  if (scelte.includes(tipo)) return scelte.filter((x) => x !== tipo);
  return scelte.length >= max ? scelte : [...scelte, tipo];
}
