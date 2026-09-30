# Stato del progetto

Aggiornato da Claude Code alla fine di ogni sessione. Da incollare nel Project dopo ogni sessione.

## Riepilogo

| Sessione | Stato | Data |
|---|---|---|
| Fase 0 — Preparazione | completata | 30/09/2026 10:39 |
| S1 — Scheletro e pubblicazione | completata | 30/09/2026 |
| S2 — Autenticazione e utenti | completata e verificata dal committente | 30/09/2026 |
| S3 — Motore di ricerca Google | completata | 30/09/2026 |
| S4 — Nuova ricerca e risultati | completata e verificata dal committente | 30/09/2026 |
| S5 — Elenco ricerche e dettaglio | completata (in attesa di prova reale di "Recupera dettagli") | 30/09/2026 |
| S6 — Dashboard e rifinitura | da fare | |
| S7 — Messa in produzione | da fare | |

Stati possibili: da fare · in corso · completata · bloccata

## URL
- Produzione: https://ricerca-geografica.altuofianco-dev.workers.dev
- Controllo tecnico: https://ricerca-geografica.altuofianco-dev.workers.dev/api/health

## Ultima sessione
- Sessione: S5 — Elenco ricerche e dettaglio
- Cosa è stato fatto:
  - Backend `src/worker/storico.ts`: `GET /api/ricerche` (filtri `dal`/`al` come giorni di Europe/Rome, `operatore`, `pagina`; 25 righe, più recenti prima), `GET /api/operatori` (tutti gli utenti, anche disattivati, solo id/nome/attivo, per il filtro), `GET /api/ricerche/:id` (parametri + risultati salvati), `POST /api/ricerche/:id/dettagli` (Place Details con `displayName,formattedAddress,types,nationalPhoneNumber,websiteUri`; il Place ID deve appartenere alla ricerca; salva solo se `SALVA_DATI_ESTESI="true"`, altrimenti mostra soltanto). Tutti con sessione.
  - Interfaccia: voce "Elenco ricerche" nella barra; `ElencoRicerche.tsx` (filtri data e operatore con "(disattivato)", paginazione), `DettaglioRicerca.tsx` (parametri, risultati, "Recupera dettagli" per riga, CSV). Il pulsante "Recupera dettagli" si disabilita durante la richiesta (un solo recupero alla volta) per evitare doppie chiamate a pagamento.
  - CSV: la funzione di S4 è stata resa condivisa (`csvRisultati` e `etichette` in `src/client/csv.ts`), usata sia da "Nuova ricerca" sia dal dettaglio: nessun codice duplicato.
  - `inizioGiornoRomaDa(AAAA-MM-GG)` in `ricerche.ts` (riusa la logica di `inizioGiornoRoma`).
  - 86 test Vitest (13 nuovi, Google sempre finto): passano; `npm run build` e controllo tipi ok. Nessuna chiamata reale a Google, interfaccia non provata nel browser.
- Azioni richieste al committente:
  1. `npm run deploy`.
  2. Provare online dal dettaglio di una ricerca "Recupera dettagli" su un risultato (costa: SKU Enterprise): devono comparire telefono e sito. Controllare anche i filtri per data e operatore e il CSV dal dettaglio.
- Scelte (confermate): con `SALVA_DATI_ESTESI="false"` "Recupera dettagli" mostra i dati senza salvarli; il filtro "al" include l'intero giorno indicato. Nel dettaglio, se i dati estesi non sono salvati, nome e indirizzo restano vuoti finché non si usa "Recupera dettagli".

## Sessione precedente
- Sessione: S4 — Nuova ricerca e risultati (verificata dal committente)
- Cosa è stato fatto: `POST /api/ricerche` con limite giornaliero e salvataggio su D1; pagina "Nuova ricerca" con suggerimenti, categorie, avvisi e CSV; regole in `CLAUDE.md` e blocco di `wrangler secret` in `.claude/settings.json`; 73 test.
- Configurazione (non sono secret): in `wrangler.jsonc`, sezione `vars`: `MAX_RICERCHE_GIORNO="30"` e `SALVA_DATI_ESTESI="true"`. Valgono in locale e in produzione. Per cambiarle: modificare il file e rifare `npm run deploy`. La chiave Google resta l'unico secret (`.dev.vars` in locale, secret Wrangler in produzione).
- Scelte: il limite giornaliero conta tutte le ricerche del giorno di Roma (anche quelle in errore, perché costano); se tutte le 10 chiamate falliscono la ricerca va in `errore`, se solo alcune fallisce resta `completata` con avviso.

## Sessione S3 — Motore di ricerca Google (solo backend)
- Cosa è stato fatto:
  - Modulo `src/worker/ricerca.ts` (SPEC §6): conversione km/gradi, 10 cerchi (principale + griglia 3×3), haversine, field mask base/contatti, filtro OPERATIONAL, filtro distanza, deduplica per Place ID, conteggio chiamate sature, al massimo 3 chiamate in parallelo, errori parziali registrati, validazione parametri (raggio 0,5–50 a passi di 0,5; 1–50 categorie).
  - Chiave Google solo nell'header `X-Goog-Api-Key`, mai nell'URL; i messaggi d'errore contengono solo lo stato HTTP.
  - Endpoint proxy (con sessione): `GET /api/luoghi/suggerimenti?testo=&sessione=` (Autocomplete) e `GET /api/luoghi/coordinate?placeId=&sessione=` (Place Details, solo campo `location`).
  - `src/data/place-types.it.json`: 471 tipi Table A con etichette italiane (escluse le 6 aree geografiche). Etichette di cafe, coffee_shop e bar decise dal committente.
  - Script `npm run prova:google -- --lat .. --lng .. --tipo .. [--raggio ..]` per una prova reale con riepilogo sintetico.
  - 58 test Vitest (32 nuovi, tutti con dati finti): passano.
- Prova reale (eseguita dal committente): Roma (41,85421; 12,4783), pharmacy, 1 km → 10 chiamate, 0 sature, 0 errori; 46 ricevuti, 45 OPERATIONAL, 34 entro 1 km, 13 dopo deduplica. Risultati corretti: criterio di accettazione soddisfatto.
- Cosa resta da fare: sessione S4 (nuova ricerca e risultati). Il salvataggio su D1, il limite `MAX_RICERCHE_GIORNO` e l'uso del modulo sono previsti in S4.
- Problemi risolti: a fine S3 un comando `wrangler secret put GOOGLE_API_KEY` era stato eseguito per errore da Claude Code (testo del comando interpretato dalla shell) e aveva creato sul Worker remoto un secret errato, chiamato `GOOGLE_API_KEY\` (con barra rovesciata). Il committente ha reimpostato `GOOGLE_API_KEY`, eliminato il secret errato `GOOGLE_API_KEY\` e verificato che le ricerche online funzionano. Chiuso.
- Altri problemi: nel database locale ci sono utenti di prova (prova@example.com, op@example.com): si possono ignorare.

## Decisioni prese durante lo sviluppo
(scostamenti dalla SPEC, con motivo)
- Schema D1: aggiunti vincoli ovvi non indicati nella SPEC (chiavi esterne, CHECK su `role` e `status`, default `active=1`, `failed_attempts=0`, `status='in_corso'`, date in formato ISO UTC). Le date vengono convertite in Europe/Rome solo in visualizzazione.
- Vitest usa `vitest.config.ts` separato (il plugin Cloudflare di `vite.config.ts` non è compatibile con Vitest). `tsconfig.json` controlla solo `src`, perché i test usano `node:sqlite` (evita di aggiungere `@types/node`).
- Gli errori di login sono generici (non rivelano se l'email esiste); l'account bloccato risponde 429 anche con password giusta fino a fine blocco.
- S3: il modulo di ricerca non scrive su D1 (lo farà S4). Il filtro distanza scarta anche i luoghi senza coordinate. Nella deduplica vale il primo risultato incontrato (la chiamata principale ha la precedenza). Il conteggio chiamate include quelle fallite.
