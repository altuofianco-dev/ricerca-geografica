import { describe, expect, it } from 'vitest';
import { cellaCsv, csvRisultati, decimaleIt, etichette, etichetteRisultato, formatoCoordinate, generaCsv, linkMaps, numeroTel } from '../src/client/csv';

// Elenco come lo restituisce GET /api/categorie (dati finti).
const ELENCO = [
  { type: 'pharmacy', label: 'Farmacia' },
  { type: 'service', label: 'Servizio', generico: true },
];

describe('CSV', () => {
  it('inizia con BOM, usa ; e righe CRLF, accenti intatti', () => {
    const csv = generaCsv(['Nome', 'Indirizzo'], [['Caffè Città', 'Via Roma 1']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Nome;Indirizzo\r\nCaffè Città;Via Roma 1\r\n');
  });

  it('racchiude tra virgolette celle con ; virgolette o a capo', () => {
    expect(cellaCsv('a;b')).toBe('"a;b"');
    expect(cellaCsv('dice "ciao"')).toBe('"dice ""ciao"""');
    expect(cellaCsv('riga1\nriga2')).toBe('"riga1\nriga2"');
  });

  it('gestisce null e vuoti', () => {
    expect(cellaCsv(null)).toBe('');
    expect(cellaCsv(undefined)).toBe('');
  });

  it('csvRisultati usa le etichette italiane e gestisce i dati mancanti', () => {
    const csv = csvRisultati([
      { placeId: 'P1', nome: 'Farmacia Rossi', indirizzo: 'Via Roma 1', tipi: ['pharmacy', 'tipo_ignoto'], telefono: '06 123456', sito: null, lat: 41.85421, lng: 12.47851 },
      { placeId: 'P2', nome: null, indirizzo: null, tipi: [], telefono: null, sito: null },
    ], ELENCO);
    const righe = csv.slice(1).split('\r\n');
    expect(righe[0]).toBe('Denominazione;Indirizzo;Latitudine;Longitudine;Categorie;Telefono;Sito web;Place ID;Link Google Maps');
    expect(righe[1]).toBe(
      `Farmacia Rossi;Via Roma 1;41,85421;12,47851;Farmacia;06 123456;;P1;${linkMaps('Farmacia Rossi', 'Via Roma 1', 'P1')}`,
    );
    expect(righe[2]).toBe(`;;;;;;;P2;${linkMaps(null, null, 'P2')}`);
  });

  it('coordinate: 5 decimali con virgola, vuote se mancano', () => {
    expect(decimaleIt(41.854213)).toBe('41,85421');
    expect(decimaleIt(12.4)).toBe('12,40000');
    expect(decimaleIt(null)).toBe('');
    expect(formatoCoordinate(41.85421, 12.47851)).toBe('41,85421; 12,47851');
    expect(formatoCoordinate(41.85421, null)).toBe('');
    expect(formatoCoordinate(undefined, undefined)).toBe('');
  });

  it('link Google Maps: nome e indirizzo codificati, Place ID', () => {
    expect(linkMaps('Caffè & Co', 'Via Roma 1, Roma', 'ChIJ abc')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Caff%C3%A8%20%26%20Co%2C%20Via%20Roma%201%2C%20Roma&query_place_id=ChIJ%20abc',
    );
  });

  it('telefono: senza spazi, +39 se manca il prefisso internazionale', () => {
    expect(numeroTel('06 1234 5678')).toBe('+390612345678');
    expect(numeroTel('333 123-4567')).toBe('+393331234567');
    expect(numeroTel('+39 06 1234')).toBe('+39061234');
    expect(numeroTel('+44 20 7946 0958')).toBe('+442079460958');
    expect(numeroTel('0039 06 1234')).toBe('+39061234');
    expect(numeroTel('(06) 1234')).toBe('+39061234');
  });

  it('nasconde le categorie generiche quando ce ne sono di più specifiche (anche nel CSV)', () => {
    expect(etichetteRisultato(['service', 'pharmacy'], ELENCO)).toBe('Farmacia');
    expect(etichetteRisultato(['service'], ELENCO)).toBe('Servizio');
    const csv = csvRisultati([{ placeId: 'P1', nome: 'A', indirizzo: null, tipi: ['service', 'pharmacy'], telefono: null, sito: null }], ELENCO);
    expect(csv).not.toContain('Servizio');
  });

  it('le etichette seguono i dati ricevuti dall’API (modificati dall’admin)', () => {
    const modificato = [{ type: 'pharmacy', label: 'Parafarmacia' }];
    expect(etichette(['pharmacy', 'sconosciuto'], modificato)).toBe('Parafarmacia');
  });

  it('neutralizza le formule', () => {
    expect(cellaCsv('=SOMMA(A1)')).toBe("'=SOMMA(A1)");
    expect(cellaCsv('+39 06 1234')).toBe("'+39 06 1234");
    expect(cellaCsv('@x')).toBe("'@x");
  });
});
