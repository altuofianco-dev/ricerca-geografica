import { describe, expect, it } from 'vitest';
import { cellaCsv, csvRisultati, etichette, generaCsv } from '../src/client/csv';

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
      { placeId: 'P1', nome: 'Farmacia Rossi', indirizzo: 'Via Roma 1', tipi: ['pharmacy', 'tipo_ignoto'], telefono: '06 123456', sito: null },
      { placeId: 'P2', nome: null, indirizzo: null, tipi: [], telefono: null, sito: null },
    ]);
    const righe = csv.slice(1).split('\r\n');
    expect(righe[0]).toBe('Denominazione;Indirizzo;Categorie;Telefono;Sito web;Place ID');
    expect(righe[1]).toBe(`Farmacia Rossi;Via Roma 1;${etichette(['pharmacy'])};06 123456;;P1`);
    expect(righe[2]).toBe(';;;;;P2');
  });

  it('neutralizza le formule', () => {
    expect(cellaCsv('=SOMMA(A1)')).toBe("'=SOMMA(A1)");
    expect(cellaCsv('+39 06 1234')).toBe("'+39 06 1234");
    expect(cellaCsv('@x')).toBe("'@x");
  });
});
