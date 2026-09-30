import { linkMaps, numeroTel } from './csv';

export const Caricamento = ({ testo = 'Caricamento…' }: { testo?: string }) => (
  <p className="caricamento" role="status">{testo}</p>
);

export const Errore = ({ testo }: { testo: string }) => (
  <p className="errore" role="alert">{testo}</p>
);

// Etichetta colorata dello stato di una ricerca (verde completata, rosso errore, grigio in corso).
export function EtichettaStato({ stato }: { stato: string }) {
  const [classe, testo] =
    stato === 'completata' ? ['ok', 'Completata'] : stato === 'errore' ? ['ko', 'Errore'] : ['attesa', 'In corso'];
  return <span className={`stato ${classe}`}>{testo}</span>;
}

// Sito web: mostra solo il dominio, il link resta completo. Solo http/https.
export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export function Telefono({ numero }: { numero: string | null | undefined }) {
  if (!numero) return null;
  return <a href={`tel:${numeroTel(numero)}`}>{numero}</a>;
}

export function LinkMaps({ nome, indirizzo, placeId }: { nome: string | null; indirizzo: string | null; placeId: string }) {
  if (!indirizzo) return null;
  return (
    <a href={linkMaps(nome, indirizzo, placeId)} target="_blank" rel="noopener noreferrer">
      {indirizzo}
    </a>
  );
}

export function SitoWeb({ url }: { url: string | null | undefined }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={url}>
      {dominio(url)}
    </a>
  );
}
