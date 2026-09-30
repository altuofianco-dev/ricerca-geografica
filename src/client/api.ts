export interface Utente {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operatore';
}

export interface UtenteElenco extends Utente {
  active: number;
  created_at: string;
}

export class ErroreApi extends Error {
  constructor(
    message: string,
    public stato: number,
  ) {
    super(message);
  }
}

let allaSessioneScaduta: () => void = () => {};
export const impostaSessioneScaduta = (f: () => void) => (allaSessioneScaduta = f);

export async function api<T = unknown>(percorso: string, corpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(percorso, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroreApi(MSG_RETE, 0);
  }
  const dati = (await res.json().catch(() => ({}))) as { errore?: string };
  if (!res.ok) {
    if (res.status === 401 && percorso !== '/api/login') allaSessioneScaduta();
    throw new ErroreApi(dati.errore ?? messaggioPerStato(res.status), res.status);
  }
  return dati as T;
}

const MSG_RETE = 'Impossibile contattare il server. Controlla la connessione a internet e riprova.';
const MSG_GENERICO = 'Si è verificato un errore imprevisto. Riprova tra poco.';

function messaggioPerStato(stato: number): string {
  if (stato === 401) return 'Sessione scaduta: accedi di nuovo.';
  if (stato === 403) return 'Non hai il permesso di eseguire questa operazione.';
  if (stato === 404) return 'Elemento non trovato.';
  if (stato === 429) return 'Troppe richieste ravvicinate. Attendi un momento e riprova.';
  return MSG_GENERICO;
}

/** Testo per l'utente: solo messaggi già in italiano (ErroreApi); qualunque altro errore tecnico diventa generico. */
export function messaggioErrore(e: unknown): string {
  if (e instanceof ErroreApi) return e.message;
  if (e instanceof TypeError) return MSG_RETE; // es. "Failed to fetch"
  return MSG_GENERICO;
}

/** Media risultati: una cifra decimale con la virgola; "—" se non ci sono ricerche. */
export function formattaMedia(media: number | null): string {
  if (media === null) return '—';
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(media);
}

/** Data e ora in Europe/Rome, formato gg/mm/aaaa hh:mm. */
export function formattaData(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '');
}
