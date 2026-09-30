// Ricerca di prova REALE su Google (costa: 10 chiamate Nearby Search, campi base).
// Uso: npm run prova:google -- --lat 45.4641 --lng 9.1919 --tipo pharmacy [--raggio 1]
// Legge GOOGLE_API_KEY da .dev.vars. Stampa solo un riepilogo (mai la chiave, mai dump completi).
import { readFileSync } from 'node:fs';
import { creaChiamaNearby, eseguiRicerca, validaParametri } from '../src/worker/ricerca.ts';

const arg = (nome, def) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : def;
};

const chiave = /^GOOGLE_API_KEY=(.+)$/m.exec(readFileSync('.dev.vars', 'utf8'))?.[1]?.trim();
if (!chiave) {
  console.error('GOOGLE_API_KEY non trovata in .dev.vars');
  process.exit(1);
}

const p = {
  lat: Number(arg('lat')),
  lng: Number(arg('lng')),
  raggioKm: Number(arg('raggio', '1')),
  categorie: [arg('tipo', '')].filter(Boolean),
  conContatti: false,
};
const errore = validaParametri(p);
if (errore) {
  console.error(`Parametri non validi: ${errore}`);
  process.exit(1);
}

const esito = await eseguiRicerca(p, creaChiamaNearby(chiave));
const c = esito.conteggi;
console.log(`Chiamate eseguite: ${esito.chiamate}`);
console.log(`Chiamate sature (20 risultati): ${esito.chiamateSature}`);
console.log(`Errori: ${esito.errori.length}${esito.errori.length ? `\n  - ${esito.errori.join('\n  - ')}` : ''}`);
console.log(`Risultati ricevuti (somma delle chiamate): ${c.ricevuti}`);
console.log(`Dopo filtro OPERATIONAL: ${c.operativi}`);
console.log(`Dopo filtro distanza (<= ${p.raggioKm} km): ${c.entroRaggio}`);
console.log(`Dopo deduplica: ${c.unici}`);
console.log('Primi 5 risultati:');
for (const l of esito.luoghi.slice(0, 5)) console.log(`  - ${l.nome} — ${l.indirizzo}`);
