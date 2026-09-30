import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  alternaMacro,
  alternaTipo,
  cerca,
  cercaPerGruppo,
  etichettaTipo,
  macroSuperaLimite,
  normalizza,
  raggruppa,
  statoMacro,
  type Tipo,
} from '../src/client/categorie';

const tipi = JSON.parse(readFileSync('src/data/place-types.it.json', 'utf8')) as Tipo[];
const gruppi = raggruppa(tipi);
const gruppo = (nome: string) => gruppi.find((g) => g.nome === nome)!;

const t = (type: string, label: string, gruppo = 'G', extra: Partial<Tipo> = {}): Tipo => ({ type, label, gruppo, ...extra });

describe('elenco tipi con gruppi (place-types.it.json)', () => {
  it('ogni tipo ha un gruppo e i gruppi sono quelli attesi', () => {
    for (const x of tipi) expect(x.gruppo?.trim().length).toBeGreaterThan(0);
    expect(gruppi.map((g) => g.nome)).toEqual([
      'Auto e mezzi', 'Attività e aziende', 'Cultura', 'Istruzione', 'Intrattenimento e svago', 'Strutture pubbliche',
      'Finanza', 'Cibo e bevande', 'Enti pubblici', 'Salute e benessere', 'Abitazioni', 'Alloggi', 'Natura',
      'Luoghi di culto', 'Servizi', 'Negozi', 'Sport', 'Trasporti',
    ]);
    expect(tipi).toHaveLength(471);
  });

  it('la categoria generica è in cima al suo gruppo', () => {
    const attesi: Record<string, string> = {
      'Cibo e bevande': 'restaurant', Negozi: 'store', Alloggi: 'lodging', Servizi: 'service',
      Istruzione: 'educational_institution', 'Enti pubblici': 'government_office',
      Trasporti: 'transportation_service', Sport: 'sports_activity_location',
    };
    for (const [g, tipo] of Object.entries(attesi)) {
      expect(gruppo(g).tipi[0].type).toBe(tipo);
      expect(gruppo(g).tipi[0].generico).toBe(true);
    }
    expect(gruppo('Cibo e bevande').tipi.slice(0, 5).map((x) => x.type)).toEqual(['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway']);
    expect(tipi.filter((x) => x.generico)).toHaveLength(8);
  });

  it('il generico ha etichetta "(in generale)" solo nel selettore', () => {
    expect(etichettaTipo(tipi.find((x) => x.type === 'restaurant')!)).toBe('Ristorante (in generale)');
    expect(etichettaTipo(tipi.find((x) => x.type === 'pharmacy')!)).toBe('Farmacia');
  });

  it('le parole chiave sono testo italiano non vuoto e per il riscaldamento si arriva a plumber', () => {
    for (const x of tipi) for (const p of x.parole ?? []) expect(p.trim().length).toBeGreaterThan(0);
    for (const q of ['caldaia', 'caldaie', 'idraulico', 'termoidraulico', 'riscaldamento'])
      expect(cerca(tipi, q).map((x) => x.type)).toContain('plumber');
    expect(cerca(tipi, 'meccanico').map((x) => x.type)).toContain('car_repair');
    expect(cerca(tipi, 'impianti elettrici').map((x) => x.type)).toContain('electrician');
  });
});

describe('ricerca', () => {
  it('ignora maiuscole e accenti', () => {
    expect(normalizza('  Università, Città!  ')).toBe('universita citta');
    expect(cerca(tipi, 'UNIVERSITA').map((x) => x.type)).toContain('university');
    expect(cerca(tipi, 'caffe').map((x) => x.type)).toContain('coffee_shop');
  });

  it('ordina: prima inizia con il testo, poi parola che inizia, poi contiene', () => {
    const elenco = [
      t('a', 'Centro di caffè'), // contiene "caff" dentro parola? no: parola che inizia
      t('b', 'Decaffeinato'), // contiene
      t('c', 'Caffetteria'), // inizia
      t('d', 'Bar (caffè)'), // parola che inizia
    ];
    expect(cerca(elenco, 'caff').map((x) => x.type)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('a parità di punteggio conserva l’ordine dell’elenco e cerca nei sinonimi', () => {
    const elenco = [t('x', 'Zeta'), t('y', 'Alfa', 'G', { parole: ['caldaia'] }), t('z', 'Caldaie e stufe')];
    expect(cerca(elenco, 'calda').map((x) => x.type)).toEqual(['y', 'z']);
    expect(cerca(elenco, '')).toEqual([]);
    expect(cerca(elenco, 'nessuna corrispondenza')).toEqual([]);
  });

  it('per gruppo: tiene solo le macro con corrispondenze, le migliori per prime', () => {
    const g = raggruppa([t('a', 'Ottica caffè', 'Uno'), t('b', 'Caffetteria', 'Due'), t('c', 'Altro', 'Tre')]);
    const r = cercaPerGruppo(g, 'caff');
    expect(r.map((x) => x.nome)).toEqual(['Due', 'Uno']);
    expect(r[0].tipi.map((x) => x.type)).toEqual(['b']);
  });
});

describe('macro-categorie e limite 50', () => {
  const g = raggruppa([t('a', 'A'), t('b', 'B'), t('c', 'C')])[0];

  it('stato: nessuna, parziale, tutte', () => {
    expect(statoMacro(g, [])).toBe('nessuna');
    expect(statoMacro(g, ['x', 'b'])).toBe('parziale');
    expect(statoMacro(g, ['c', 'a', 'b'])).toBe('tutte');
  });

  it('spuntare la macro aggiunge le mancanti; spuntarla di nuovo le toglie tutte', () => {
    const uno = alternaMacro(g, ['x', 'b']);
    expect(uno).toEqual(['x', 'b', 'a', 'c']);
    expect(statoMacro(g, uno)).toBe('tutte');
    expect(alternaMacro(g, uno)).toEqual(['x']);
  });

  it('non supera il limite, contando anche le categorie già scelte', () => {
    const altre = Array.from({ length: 48 }, (_, i) => `z${i}`);
    expect(macroSuperaLimite(g, altre)).toBe(true); // 48 + 3 = 51
    expect(alternaMacro(g, altre)).toEqual(altre);
    expect(macroSuperaLimite(g, altre.slice(1))).toBe(false); // 47 + 3 = 50
    expect(macroSuperaLimite(g, [...altre.slice(2), 'a'])).toBe(false); // 47 già scelte + 2 nuove = 49
    expect(macroSuperaLimite(g, [...altre, 'a'])).toBe(true); // 49 + 2 = 51
  });

  it('una macro completa si può sempre togliere, anche a 50', () => {
    const scelte = [...Array.from({ length: 47 }, (_, i) => `z${i}`), 'a', 'b', 'c'];
    expect(macroSuperaLimite(g, scelte)).toBe(false);
    expect(alternaMacro(g, scelte)).toHaveLength(47);
  });

  it('la macro "Cibo e bevande" (oltre 150 tipi) supera sempre il limite da sola', () => {
    expect(gruppo('Cibo e bevande').tipi.length).toBeGreaterThan(50);
    expect(macroSuperaLimite(gruppo('Cibo e bevande'), [])).toBe(true);
    expect(macroSuperaLimite(gruppo('Alloggi'), [])).toBe(false);
  });

  it('categoria singola: aggiunge, toglie, rispetta il massimo', () => {
    expect(alternaTipo('a', [])).toEqual(['a']);
    expect(alternaTipo('a', ['a', 'b'])).toEqual(['b']);
    const piene = Array.from({ length: 50 }, (_, i) => `z${i}`);
    expect(alternaTipo('nuova', piene)).toEqual(piene);
    expect(alternaTipo('z0', piene)).toHaveLength(49);
  });
});
