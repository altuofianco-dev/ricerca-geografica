import { describe, expect, it } from 'vitest';
import { cellaCsv, generaCsv } from '../src/client/csv';

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

  it('neutralizza le formule', () => {
    expect(cellaCsv('=SOMMA(A1)')).toBe("'=SOMMA(A1)");
    expect(cellaCsv('+39 06 1234')).toBe("'+39 06 1234");
    expect(cellaCsv('@x')).toBe("'@x");
  });
});
