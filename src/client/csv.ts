// CSV per Excel in italiano: UTF-8 con BOM, separatore ";", righe CRLF.

const BOM = '﻿';

/** Racchiude la cella tra virgolette se serve; neutralizza le formule (= + - @) anteponendo un apice. */
export function cellaCsv(valore: string | null | undefined): string {
  let v = valore ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function generaCsv(intestazioni: string[], righe: (string | null | undefined)[][]): string {
  const linee = [intestazioni, ...righe].map((r) => r.map(cellaCsv).join(';'));
  return BOM + linee.join('\r\n') + '\r\n';
}

export function scaricaCsv(nomeFile: string, contenuto: string) {
  const url = URL.createObjectURL(new Blob([contenuto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
