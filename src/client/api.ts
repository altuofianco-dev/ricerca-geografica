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
    throw new ErroreApi('Impossibile contattare il server', 0);
  }
  const dati = (await res.json().catch(() => ({}))) as { errore?: string };
  if (!res.ok) {
    if (res.status === 401 && percorso !== '/api/login') allaSessioneScaduta();
    throw new ErroreApi(dati.errore ?? 'Errore imprevisto', res.status);
  }
  return dati as T;
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
