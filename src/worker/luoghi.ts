import { Hono } from 'hono';
import type { AppEnv } from './auth';

// Proxy verso Places Autocomplete e Place Details (SPEC §5).
// La chiave Google resta sul server ed è passata solo nell'header X-Goog-Api-Key.

const URL_AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';
const URL_DETTAGLI = 'https://places.googleapis.com/v1/places/';

const RE_SESSIONE = /^[A-Za-z0-9-]{8,64}$/;
const RE_PLACE_ID = /^[A-Za-z0-9_-]{5,300}$/;

export const luoghi = new Hono<AppEnv>();

luoghi.get('/api/luoghi/suggerimenti', async (c) => {
  const testo = (c.req.query('testo') ?? '').trim();
  const sessione = c.req.query('sessione') ?? '';
  if (testo.length < 3 || testo.length > 200) return c.json({ errore: 'Scrivi almeno 3 caratteri' }, 400);
  if (!RE_SESSIONE.test(sessione)) return c.json({ errore: 'Richiesta non valida' }, 400);
  if (!c.env.GOOGLE_API_KEY) return c.json({ errore: 'Servizio Google non configurato' }, 500);

  try {
    const res = await fetch(URL_AUTOCOMPLETE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': c.env.GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
      },
      body: JSON.stringify({ input: testo, sessionToken: sessione, languageCode: 'it', regionCode: 'IT' }),
    });
    if (!res.ok) return c.json({ errore: 'Suggerimenti non disponibili, riprova' }, 502);
    const dati = (await res.json()) as {
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
    };
    const suggerimenti = (dati.suggestions ?? []).flatMap((s) => {
      const p = s.placePrediction;
      return p?.placeId && p.text?.text ? [{ placeId: p.placeId, testo: p.text.text }] : [];
    });
    return c.json({ suggerimenti });
  } catch {
    return c.json({ errore: 'Suggerimenti non disponibili, riprova' }, 502);
  }
});

luoghi.get('/api/luoghi/coordinate', async (c) => {
  const placeId = c.req.query('placeId') ?? '';
  const sessione = c.req.query('sessione') ?? '';
  if (!RE_PLACE_ID.test(placeId) || !RE_SESSIONE.test(sessione)) return c.json({ errore: 'Richiesta non valida' }, 400);
  if (!c.env.GOOGLE_API_KEY) return c.json({ errore: 'Servizio Google non configurato' }, 500);

  try {
    const res = await fetch(`${URL_DETTAGLI}${placeId}?sessionToken=${sessione}`, {
      headers: { 'X-Goog-Api-Key': c.env.GOOGLE_API_KEY, 'X-Goog-FieldMask': 'location' },
    });
    if (!res.ok) return c.json({ errore: 'Indirizzo non trovato' }, 502);
    const dati = (await res.json()) as { location?: { latitude?: number; longitude?: number } };
    const { latitude, longitude } = dati.location ?? {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return c.json({ errore: 'Indirizzo non trovato' }, 502);
    return c.json({ lat: latitude, lng: longitude });
  } catch {
    return c.json({ errore: 'Indirizzo non trovato' }, 502);
  }
});
