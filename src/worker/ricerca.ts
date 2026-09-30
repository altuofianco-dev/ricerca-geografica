// Motore di ricerca (SPEC §6). Le funzioni di calcolo sono pure; la rete è iniettata
// (`ChiamaNearby`) così nei test non si chiama mai Google.

export const KM_PER_GRADO = 111.32;
export const RAGGIO_TERRA_KM = 6371;
export const MAX_CATEGORIE = 50;
export const MAX_PARALLELE = 3;
export const RISULTATI_PER_CHIAMATA = 20;
export const URL_NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';

export const CAMPI_BASE =
  'places.id,places.displayName,places.formattedAddress,places.types,places.primaryType,places.businessStatus,places.location';
export const CAMPI_CONTATTI = `${CAMPI_BASE},places.nationalPhoneNumber,places.websiteUri`;

export const campiRichiesti = (conContatti: boolean) => (conContatti ? CAMPI_CONTATTI : CAMPI_BASE);

export interface Punto {
  lat: number;
  lng: number;
}

export interface Cerchio extends Punto {
  raggioM: number;
}

/** Converte uno spostamento in km (est `dxKm`, nord `dyKm`) in gradi a una data latitudine. */
export function kmInGradi(lat: number, dxKm: number, dyKm: number) {
  return {
    dLat: dyKm / KM_PER_GRADO,
    dLng: dxKm / (KM_PER_GRADO * Math.cos((lat * Math.PI) / 180)),
  };
}

/** I 10 cerchi da interrogare: il primo è la chiamata principale, poi la griglia 3×3. */
export function cerchiRicerca(centro: Punto, raggioKm: number): Cerchio[] {
  const cerchi: Cerchio[] = [{ ...centro, raggioM: raggioKm * 1000 }];
  const passo = (2 * raggioKm) / 3;
  const raggioGrigliaM = ((raggioKm * Math.SQRT2) / 3) * 1000;
  for (const dy of [-passo, 0, passo]) {
    for (const dx of [-passo, 0, passo]) {
      const { dLat, dLng } = kmInGradi(centro.lat, dx, dy);
      cerchi.push({ lat: centro.lat + dLat, lng: centro.lng + dLng, raggioM: raggioGrigliaM });
    }
  }
  return cerchi;
}

/** Distanza in km tra due punti (haversine). */
export function distanzaKm(a: Punto, b: Punto): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RAGGIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Luogo {
  placeId: string;
  nome: string;
  indirizzo: string;
  tipi: string[];
  tipoPrimario: string | null;
  lat: number;
  lng: number;
  telefono: string | null;
  sito: string | null;
}

/** Luogo come restituito da Google (solo i campi richiesti nella field mask). */
export interface LuogoGoogle {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

export interface ConteggiElaborazione {
  ricevuti: number;
  operativi: number;
  entroRaggio: number;
  unici: number;
}

/** Filtro OPERATIONAL → filtro distanza (> R scartati) → deduplica per Place ID (vale il primo incontrato). */
export function elaboraRisultati(
  perChiamata: LuogoGoogle[][],
  centro: Punto,
  raggioKm: number,
): { luoghi: Luogo[]; conteggi: ConteggiElaborazione } {
  const conteggi: ConteggiElaborazione = { ricevuti: 0, operativi: 0, entroRaggio: 0, unici: 0 };
  const visti = new Map<string, Luogo>();
  for (const lista of perChiamata) {
    for (const p of lista) {
      conteggi.ricevuti++;
      if (p.businessStatus !== 'OPERATIONAL') continue;
      conteggi.operativi++;
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (!p.id || typeof lat !== 'number' || typeof lng !== 'number') continue;
      if (distanzaKm(centro, { lat, lng }) > raggioKm) continue;
      conteggi.entroRaggio++;
      if (visti.has(p.id)) continue;
      visti.set(p.id, {
        placeId: p.id,
        nome: p.displayName?.text ?? '',
        indirizzo: p.formattedAddress ?? '',
        tipi: p.types ?? [],
        tipoPrimario: p.primaryType ?? null,
        lat,
        lng,
        telefono: p.nationalPhoneNumber ?? null,
        sito: p.websiteUri ?? null,
      });
    }
  }
  conteggi.unici = visti.size;
  return { luoghi: [...visti.values()], conteggi };
}

export const eSatura = (n: number) => n >= RISULTATI_PER_CHIAMATA;

/** Esegue `compiti` con al massimo `max` in corso contemporaneamente; i risultati mantengono l'ordine. */
export async function eseguiConLimite<T>(compiti: (() => Promise<T>)[], max = MAX_PARALLELE): Promise<T[]> {
  const out: T[] = new Array(compiti.length);
  let prossimo = 0;
  const lavoratore = async () => {
    while (prossimo < compiti.length) {
      const i = prossimo++;
      out[i] = await compiti[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(max, compiti.length) }, lavoratore));
  return out;
}

export interface ParametriRicerca {
  lat: number;
  lng: number;
  raggioKm: number;
  categorie: string[];
  conContatti: boolean;
}

/** Restituisce un messaggio di errore in italiano, o null se i parametri sono validi. */
export function validaParametri(p: ParametriRicerca, tipiAmmessi?: Set<string>): string | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)
    return 'Coordinate non valide';
  if (!Number.isFinite(p.raggioKm) || p.raggioKm < 0.5 || p.raggioKm > 50 || !Number.isInteger(p.raggioKm * 2))
    return 'Il raggio deve essere tra 0,5 e 50 km, a passi di 0,5';
  if (p.categorie.length < 1) return 'Scegli almeno una categoria';
  if (p.categorie.length > MAX_CATEGORIE) return `Puoi scegliere al massimo ${MAX_CATEGORIE} categorie`;
  if (tipiAmmessi && p.categorie.some((c) => !tipiAmmessi.has(c))) return 'Categoria non riconosciuta';
  return null;
}

export type ChiamaNearby = (corpo: Record<string, unknown>, campi: string) => Promise<LuogoGoogle[]>;

export function corpoNearby(cerchio: Cerchio, categorie: string[]) {
  return {
    includedTypes: categorie,
    maxResultCount: RISULTATI_PER_CHIAMATA,
    locationRestriction: {
      circle: { center: { latitude: cerchio.lat, longitude: cerchio.lng }, radius: cerchio.raggioM },
    },
    languageCode: 'it',
    regionCode: 'IT',
  };
}

export interface EsitoRicerca {
  luoghi: Luogo[];
  conteggi: ConteggiElaborazione;
  chiamate: number;
  chiamateSature: number;
  errori: string[];
}

export async function eseguiRicerca(p: ParametriRicerca, chiama: ChiamaNearby): Promise<EsitoRicerca> {
  const cerchi = cerchiRicerca({ lat: p.lat, lng: p.lng }, p.raggioKm);
  const campi = campiRichiesti(p.conContatti);
  const errori: string[] = [];
  let sature = 0;

  const esiti = await eseguiConLimite(
    cerchi.map((c, i) => async () => {
      try {
        const lista = await chiama(corpoNearby(c, p.categorie), campi);
        if (eSatura(lista.length)) sature++;
        return lista;
      } catch (e) {
        errori.push(`Chiamata ${i + 1}: ${e instanceof Error ? e.message : 'errore sconosciuto'}`);
        return [] as LuogoGoogle[];
      }
    }),
  );

  const { luoghi, conteggi } = elaboraRisultati(esiti, { lat: p.lat, lng: p.lng }, p.raggioKm);
  return { luoghi, conteggi, chiamate: cerchi.length, chiamateSature: sature, errori };
}

/**
 * Chiamata reale a Nearby Search. La chiave viaggia solo nell'header X-Goog-Api-Key
 * (mai nell'URL); i messaggi d'errore contengono solo stato HTTP e testo di Google.
 */
export function creaChiamaNearby(apiKey: string, fetchFn: typeof fetch = fetch): ChiamaNearby {
  return async (corpo, campi) => {
    const res = await fetchFn(URL_NEARBY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': campi },
      body: JSON.stringify(corpo),
    });
    if (!res.ok) throw new Error(`Google ha risposto con errore ${res.status}`);
    const dati = (await res.json()) as { places?: LuogoGoogle[] };
    return dati.places ?? [];
  };
}
