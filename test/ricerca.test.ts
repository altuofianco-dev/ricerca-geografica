import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAMPI_BASE,
  CAMPI_CONTATTI,
  campiRichiesti,
  cerchiRicerca,
  creaChiamaNearby,
  distanzaKm,
  elaboraRisultati,
  eseguiConLimite,
  eseguiRicerca,
  kmInGradi,
  validaParametri,
  type LuogoGoogle,
} from '../src/worker/ricerca';

const ROMA = { lat: 41.9, lng: 12.5 };

const luogo = (id: string, lat = ROMA.lat, lng = ROMA.lng, stato = 'OPERATIONAL'): LuogoGoogle => ({
  id,
  displayName: { text: `Nome ${id}` },
  formattedAddress: `Via ${id}`,
  businessStatus: stato,
  location: { latitude: lat, longitude: lng },
});

describe('conversione km → gradi', () => {
  it('latitudine: 111,32 km = 1 grado', () => {
    expect(kmInGradi(0, 0, 111.32).dLat).toBeCloseTo(1, 10);
  });
  it('longitudine: a 60° di latitudine un grado vale la metà', () => {
    expect(kmInGradi(60, 111.32, 0).dLng).toBeCloseTo(2, 6);
    expect(kmInGradi(0, 111.32, 0).dLng).toBeCloseTo(1, 10);
  });
});

describe('griglia', () => {
  const R = 3;
  const cerchi = cerchiRicerca(ROMA, R);

  it('produce 10 cerchi: principale + 9', () => {
    expect(cerchi).toHaveLength(10);
    expect(cerchi[0]).toEqual({ ...ROMA, raggioM: 3000 });
  });
  it('raggio della griglia = R·√2/3 (in metri)', () => {
    for (const c of cerchi.slice(1)) expect(c.raggioM).toBeCloseTo(((R * Math.SQRT2) / 3) * 1000, 6);
  });
  it('i 9 centri sono spostati di {−2R/3, 0, +2R/3} km in ogni asse', () => {
    const passo = (2 * R) / 3;
    const attesi: { dx: number; dy: number }[] = [];
    for (const dy of [-passo, 0, passo]) for (const dx of [-passo, 0, passo]) attesi.push({ dx, dy });
    cerchi.slice(1).forEach((c, i) => {
      const { dLat, dLng } = kmInGradi(ROMA.lat, attesi[i].dx, attesi[i].dy);
      expect(c.lat).toBeCloseTo(ROMA.lat + dLat, 10);
      expect(c.lng).toBeCloseTo(ROMA.lng + dLng, 10);
    });
    // il centro della griglia coincide con il centro originale
    expect(cerchi[5].lat).toBeCloseTo(ROMA.lat, 10);
    expect(cerchi[5].lng).toBeCloseTo(ROMA.lng, 10);
  });
  it('gli spostamenti reali (haversine) corrispondono ai km attesi', () => {
    expect(distanzaKm(ROMA, { lat: cerchi[8].lat, lng: ROMA.lng })).toBeCloseTo(2, 1); // 2R/3 a nord
    expect(distanzaKm(ROMA, { lat: ROMA.lat, lng: cerchi[6].lng })).toBeCloseTo(2, 1); // 2R/3 a est
  });
});

describe('distanza', () => {
  it('zero tra punti uguali', () => expect(distanzaKm(ROMA, ROMA)).toBe(0));
  it('Roma–Milano ≈ 477 km', () => {
    expect(distanzaKm(ROMA, { lat: 45.4642, lng: 9.19 })).toBeGreaterThan(470);
    expect(distanzaKm(ROMA, { lat: 45.4642, lng: 9.19 })).toBeLessThan(485);
  });
  it('un grado di latitudine ≈ 111,2 km', () => {
    expect(distanzaKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });
});

describe('elaborazione risultati', () => {
  it('tiene solo OPERATIONAL', () => {
    const { luoghi, conteggi } = elaboraRisultati(
      [[luogo('a'), luogo('b', ROMA.lat, ROMA.lng, 'CLOSED_TEMPORARILY'), luogo('c', ROMA.lat, ROMA.lng, 'CLOSED_PERMANENTLY')]],
      ROMA,
      1,
    );
    expect(luoghi.map((l) => l.placeId)).toEqual(['a']);
    expect(conteggi).toEqual({ ricevuti: 3, operativi: 1, entroRaggio: 1, unici: 1 });
  });
  it('scarta i luoghi oltre il raggio', () => {
    const vicino = luogo('vicino', ROMA.lat + 0.005, ROMA.lng); // ~0,55 km
    const lontano = luogo('lontano', ROMA.lat + 0.02, ROMA.lng); // ~2,2 km
    const { luoghi } = elaboraRisultati([[vicino, lontano]], ROMA, 1);
    expect(luoghi.map((l) => l.placeId)).toEqual(['vicino']);
  });
  it('scarta i luoghi senza posizione o senza id', () => {
    const senzaPos: LuogoGoogle = { id: 'x', businessStatus: 'OPERATIONAL' };
    const senzaId: LuogoGoogle = { ...luogo('y'), id: undefined };
    expect(elaboraRisultati([[senzaPos, senzaId]], ROMA, 1).luoghi).toHaveLength(0);
  });
  it('deduplica per Place ID tra chiamate diverse', () => {
    const { luoghi, conteggi } = elaboraRisultati([[luogo('a'), luogo('b')], [luogo('b'), luogo('c')], [luogo('a')]], ROMA, 1);
    expect(luoghi.map((l) => l.placeId)).toEqual(['a', 'b', 'c']);
    expect(conteggi.entroRaggio).toBe(5);
    expect(conteggi.unici).toBe(3);
  });
  it('mappa i campi, con telefono e sito opzionali', () => {
    const p: LuogoGoogle = {
      ...luogo('a'),
      types: ['pharmacy'],
      primaryType: 'pharmacy',
      nationalPhoneNumber: '06 1234',
      websiteUri: 'https://esempio.it',
    };
    const [l] = elaboraRisultati([[p, luogo('b')]], ROMA, 1).luoghi;
    expect(l).toMatchObject({ nome: 'Nome a', tipi: ['pharmacy'], tipoPrimario: 'pharmacy', telefono: '06 1234', sito: 'https://esempio.it' });
    expect(elaboraRisultati([[luogo('b')]], ROMA, 1).luoghi[0]).toMatchObject({ telefono: null, sito: null, tipoPrimario: null });
  });
});

describe('field mask', () => {
  it('base = SKU Pro, con contatti aggiunge telefono e sito', () => {
    expect(campiRichiesti(false)).toBe(CAMPI_BASE);
    expect(campiRichiesti(true)).toBe(CAMPI_CONTATTI);
    expect(CAMPI_BASE).toBe(
      'places.id,places.displayName,places.formattedAddress,places.types,places.primaryType,places.businessStatus,places.location',
    );
    expect(CAMPI_CONTATTI).toBe(`${CAMPI_BASE},places.nationalPhoneNumber,places.websiteUri`);
  });
});

describe('parallelismo', () => {
  it('mai più di 3 compiti contemporanei e ordine dei risultati mantenuto', async () => {
    let inCorso = 0;
    let massimo = 0;
    const compiti = Array.from({ length: 10 }, (_, i) => async () => {
      inCorso++;
      massimo = Math.max(massimo, inCorso);
      await new Promise((r) => setTimeout(r, 5));
      inCorso--;
      return i;
    });
    const out = await eseguiConLimite(compiti, 3);
    expect(massimo).toBe(3);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('eseguiRicerca', () => {
  const params = { ...ROMA, raggioKm: 2, categorie: ['pharmacy'], conContatti: false };

  it('fa 10 chiamate con i parametri di SPEC §6', async () => {
    const viste: { corpo: Record<string, any>; campi: string }[] = [];
    const esito = await eseguiRicerca(params, async (corpo, campi) => {
      viste.push({ corpo, campi });
      return [luogo('a')];
    });
    expect(esito.chiamate).toBe(10);
    expect(viste).toHaveLength(10);
    expect(viste[0].corpo).toMatchObject({
      includedTypes: ['pharmacy'],
      maxResultCount: 20,
      languageCode: 'it',
      regionCode: 'IT',
      locationRestriction: { circle: { radius: 2000 } },
    });
    expect(viste.every((v) => v.campi === CAMPI_BASE)).toBe(true);
    expect(esito.luoghi).toHaveLength(1); // deduplicato
    expect(esito.chiamateSature).toBe(0);
    expect(esito.errori).toEqual([]);
  });

  it('conta le chiamate sature (20 risultati)', async () => {
    let n = 0;
    const esito = await eseguiRicerca(params, async () => {
      n++;
      return n <= 2 ? Array.from({ length: 20 }, (_, i) => luogo(`p${n}-${i}`)) : [luogo('z')];
    });
    expect(esito.chiamateSature).toBe(2);
  });

  it('se una chiamata fallisce prosegue con le altre e registra l\'errore', async () => {
    let n = 0;
    const esito = await eseguiRicerca(params, async () => {
      n++;
      if (n === 4) throw new Error('Google ha risposto con errore 500');
      return [luogo(`p${n}`)];
    });
    expect(esito.chiamate).toBe(10);
    expect(esito.luoghi).toHaveLength(9);
    expect(esito.errori).toHaveLength(1);
    expect(esito.errori[0]).toContain('500');
  });
});

describe('validazione parametri', () => {
  const ok = { ...ROMA, raggioKm: 1, categorie: ['pharmacy'], conContatti: false };
  it('accetta parametri validi', () => expect(validaParametri(ok)).toBeNull());
  it('raggio fuori intervallo o fuori passo', () => {
    for (const r of [0, 0.4, 0.7, 50.5, 51, NaN]) expect(validaParametri({ ...ok, raggioKm: r })).not.toBeNull();
    for (const r of [0.5, 1, 25.5, 50]) expect(validaParametri({ ...ok, raggioKm: r })).toBeNull();
  });
  it('categorie: almeno 1, al massimo 50', () => {
    expect(validaParametri({ ...ok, categorie: [] })).not.toBeNull();
    expect(validaParametri({ ...ok, categorie: Array.from({ length: 51 }, (_, i) => `t${i}`) })).not.toBeNull();
    expect(validaParametri({ ...ok, categorie: Array.from({ length: 50 }, (_, i) => `t${i}`) })).toBeNull();
  });
  it('rifiuta categorie non in elenco e coordinate assurde', () => {
    expect(validaParametri({ ...ok, categorie: ['inventato'] }, new Set(['pharmacy']))).not.toBeNull();
    expect(validaParametri({ ...ok, lat: 91 })).not.toBeNull();
  });
});

describe('chiamata reale (con fetch finto)', () => {
  it('passa la chiave solo nell\'header, mai nell\'URL, e nei messaggi d\'errore non c\'è la chiave', async () => {
    const chiave = 'CHIAVE-SEGRETA-TEST';
    let url = '';
    let init: RequestInit = {};
    const ok = creaChiamaNearby(chiave, (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return new Response(JSON.stringify({ places: [luogo('a')] }), { status: 200 });
    }) as unknown as typeof fetch);
    const r = await ok({ includedTypes: ['pharmacy'] }, CAMPI_BASE);
    expect(r).toHaveLength(1);
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(url).not.toContain(chiave);
    const h = init.headers as Record<string, string>;
    expect(h['X-Goog-Api-Key']).toBe(chiave);
    expect(h['X-Goog-FieldMask']).toBe(CAMPI_BASE);

    const ko = creaChiamaNearby(chiave, (async () => new Response('{"error":{"message":"x"}}', { status: 403 })) as unknown as typeof fetch);
    const errore = await ko({}, CAMPI_BASE).catch((e: Error) => e.message);
    expect(errore).toContain('403');
    expect(errore).not.toContain(chiave);
  });

  it('risposta senza "places" = lista vuota', async () => {
    const f = creaChiamaNearby('k', (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch);
    expect(await f({}, CAMPI_BASE)).toEqual([]);
  });
});

describe('elenco tipi (place-types.it.json)', () => {
  const tipi = JSON.parse(readFileSync('src/data/place-types.it.json', 'utf8')) as { type: string; label: string }[];
  it('formato corretto, senza duplicati né etichette vuote', () => {
    expect(tipi.length).toBeGreaterThan(100);
    expect(new Set(tipi.map((t) => t.type)).size).toBe(tipi.length);
    for (const t of tipi) {
      expect(t.type).toMatch(/^[a-z_0-9]+$/);
      expect(t.label.trim().length).toBeGreaterThan(0);
    }
  });
  it('contiene i tipi di esempio', () => {
    const m = new Map(tipi.map((t) => [t.type, t.label]));
    expect(m.get('pharmacy')).toBe('Farmacia');
    expect(m.get('pizza_restaurant')).toBe('Pizzeria');
  });
});
