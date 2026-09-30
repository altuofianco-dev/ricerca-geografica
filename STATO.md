# Stato del progetto

Aggiornato da Claude Code alla fine di ogni sessione. Da incollare nel Project dopo ogni sessione.

## Riepilogo

| Sessione | Stato | Data |
|---|---|---|
| Fase 0 — Preparazione | completata | 30/09/2026 10:39 |
| S1 — Scheletro e pubblicazione | completata | 30/09/2026 |
| S2 — Autenticazione e utenti | completata e verificata dal committente | 30/09/2026 |
| S3 — Motore di ricerca Google | completata | 30/09/2026 |
| S4 — Nuova ricerca e risultati | da fare | |
| S5 — Elenco ricerche e dettaglio | da fare | |
| S6 — Dashboard e rifinitura | da fare | |
| S7 — Messa in produzione | da fare | |

Stati possibili: da fare · in corso · completata · bloccata

## URL
- Produzione: https://ricerca-geografica.altuofianco-dev.workers.dev
- Controllo tecnico: https://ricerca-geografica.altuofianco-dev.workers.dev/api/health

## Ultima sessione
- Sessione: S3 — Motore di ricerca Google (solo backend)
- Cosa è stato fatto:
  - Modulo `src/worker/ricerca.ts` (SPEC §6): conversione km/gradi, 10 cerchi (principale + griglia 3×3), haversine, field mask base/contatti, filtro OPERATIONAL, filtro distanza, deduplica per Place ID, conteggio chiamate sature, al massimo 3 chiamate in parallelo, errori parziali registrati, validazione parametri (raggio 0,5–50 a passi di 0,5; 1–50 categorie).
  - Chiave Google solo nell'header `X-Goog-Api-Key`, mai nell'URL; i messaggi d'errore contengono solo lo stato HTTP.
  - Endpoint proxy (con sessione): `GET /api/luoghi/suggerimenti?testo=&sessione=` (Autocomplete) e `GET /api/luoghi/coordinate?placeId=&sessione=` (Place Details, solo campo `location`).
  - `src/data/place-types.it.json`: 471 tipi Table A con etichette italiane (escluse le 6 aree geografiche). Etichette di cafe, coffee_shop e bar decise dal committente.
  - Script `npm run prova:google -- --lat .. --lng .. --tipo .. [--raggio ..]` per una prova reale con riepilogo sintetico.
  - 58 test Vitest (32 nuovi, tutti con dati finti): passano.
- Prova reale (eseguita dal committente): Roma (41,85421; 12,4783), pharmacy, 1 km → 10 chiamate, 0 sature, 0 errori; 46 ricevuti, 45 OPERATIONAL, 34 entro 1 km, 13 dopo deduplica. Risultati corretti: criterio di accettazione soddisfatto.
- Cosa resta da fare: sessione S4 (nuova ricerca e risultati). Il salvataggio su D1, il limite `MAX_RICERCHE_GIORNO` e l'uso del modulo sono previsti in S4.
- Azioni richieste al committente:
  1. IMPORTANTE: reimpostare il secret remoto della chiave Google con `npx wrangler secret put GOOGLE_API_KEY` (incollando la chiave). Per un errore di Claude Code il secret è stato sovrascritto con un valore non valido (vedi Problemi aperti).
  2. Poi pubblicare con `npm run deploy` (non eseguito da me).
- Problemi aperti: a fine S3 un comando `wrangler secret put GOOGLE_API_KEY` è stato eseguito per errore da Claude Code (testo del comando interpretato dalla shell) e ha caricato sul Worker remoto un valore non valido al posto della chiave. La chiave locale in `.dev.vars` non è stata toccata. Finché non viene reimpostata, in produzione le chiamate Google falliranno; `/api/health` non ne risente.
- Altri problemi: nel database locale ci sono utenti di prova (prova@example.com, op@example.com): si possono ignorare.

## Decisioni prese durante lo sviluppo
(scostamenti dalla SPEC, con motivo)
- Schema D1: aggiunti vincoli ovvi non indicati nella SPEC (chiavi esterne, CHECK su `role` e `status`, default `active=1`, `failed_attempts=0`, `status='in_corso'`, date in formato ISO UTC). Le date vengono convertite in Europe/Rome solo in visualizzazione.
- Vitest usa `vitest.config.ts` separato (il plugin Cloudflare di `vite.config.ts` non è compatibile con Vitest). `tsconfig.json` controlla solo `src`, perché i test usano `node:sqlite` (evita di aggiungere `@types/node`).
- Gli errori di login sono generici (non rivelano se l'email esiste); l'account bloccato risponde 429 anche con password giusta fino a fine blocco.
- S3: il modulo di ricerca non scrive su D1 (lo farà S4). Il filtro distanza scarta anche i luoghi senza coordinate. Nella deduplica vale il primo risultato incontrato (la chiamata principale ha la precedenza). Il conteggio chiamate include quelle fallite.
