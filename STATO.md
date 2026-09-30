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
| S5 — Elenco ricerche e dettaglio | completata e verificata dal committente | 30/09/2026 |
| S6 — Dashboard e rifinitura | completata (in attesa di verifica del committente) | 30/09/2026 |
| S6b — Selettore ad albero delle categorie | completata (in attesa di verifica del committente) | 30/09/2026 |
| S6c — Visibilità delle ricerche per ruolo | completata e verificata dal committente | 30/09/2026 |
| S6d — Restyling "Al tuo fianco" | completata (in attesa di verifica del committente) | 30/09/2026 |
| S7 — Messa in produzione | da fare | |

Stati possibili: da fare · in corso · completata · bloccata

## URL
- Produzione: https://ricerca-geografica.altuofianco-dev.workers.dev
- Controllo tecnico: https://ricerca-geografica.altuofianco-dev.workers.dev/api/health

## Ultima sessione (S6d)
- Sessione: S6d — Restyling con l'identità "Al tuo fianco" (correzione prima della S7). Solo interfaccia: nessuna modifica al backend, nessuna nuova dipendenza.
- Cosa è stato fatto:
  - Logo copiato così com'è (metadati inclusi) in `public/logo-altuofianco.svg`; usato come favicon (`index.html`), nella barra laterale e nel Login.
  - `style.css` riscritto con variabili CSS centralizzate (palette #0A4D57, #0F6B71, #067DA0, #7C949A; grigi-azzurri chiari per sfondo e righe alternate; verde/rosso solo per gli stati).
  - Barra laterale fissa (logo, nome, voci con icone SVG in `Icone.tsx`, in fondo nome, ruolo ed "Esci"); sotto i 900 px restano solo le icone. Contenuto a tutta larghezza, sezioni in riquadri bianchi.
  - Tabelle: righe alternate, hover, righe compatte, intestazione fissa in cima alla finestra (la pagina scorre normalmente, niente riquadro con scroll interno). Lo scroll orizzontale interno c'è solo sotto i 720 px (lì l'intestazione non resta fissa: limite del browser). Place ID piccolo e grigio; sito abbreviato al dominio (link completo, `SitoWeb` in `Stati.tsx`).
  - Dettaglio ricerca: "Recupera dettagli" piccolo, "Aggiorna" se telefono e sito ci sono già; stato come etichetta colorata (`EtichettaStato`, usata anche nell'elenco per errore/in corso).
  - Utenti: titolo pagina ora h1 come le altre pagine.
- Controlli: tipi, 127 test e `npm run build` ok. Aspetto non verificato nel browser (pannello anteprima non visibile in questa sessione).
- Rifiniture S6d (secondo giro):
  - Tabelle: celle centrate in verticale; colonne numeriche a destra (Elenco: raggio e risultati; Dashboard); telefono, sito e data su una riga; Place ID su una riga, tagliato con "…" (max 11 rem) e valore completo nel tooltip (il CSV resta completo).
  - Categorie dei risultati: `etichetteRisultato` (`csv.ts`) toglie i tipi generici (`generico` in `place-types.it.json`, es. "Servizio", "Negozio") se ce ne sono di specifici; vale a video e nel CSV. Se ci sono solo generici restano.
  - Elenco ricerche: tutta la riga è cliccabile (il pulsante "Apri" resta).
  - "Recupera dettagli"/"Aggiorna": "Aggiorna" se la ricerca includeva i contatti o la riga è già stata recuperata; altrimenti "Recupera dettagli". Pulsanti di larghezza uniforme (min 8,5 rem). Backend: `GET /api/ricerche/:id` e `POST .../dettagli` restituiscono `recuperato` (schema D1 invariato). Come si calcola: i risultati salvati insieme hanno lo stesso `fetched_at`; un recupero lo sposta in avanti, quindi `recuperato` = `fetched_at` successivo a quello più frequente della ricerca. Limite: se TUTTE le righe di una ricerca vengono recuperate (o è una ricerca con una sola riga già recuperata) il riferimento si perde e dopo il ricaricamento della pagina torna "Recupera dettagli" (prima del ricaricamento il pulsante è già corretto).
  - Nuova ricerca: Indirizzo (largo) e Raggio (stretto) sulla stessa riga; sotto i 720 px uno sotto l'altro. L'indicazione "da 0,5 a 50, a passi di 0,5" è ora nel tooltip del campo (l'errore di validazione resta visibile).
  - Dashboard: tabella per operatore in un riquadro bianco "Per operatore", numeri a destra.
  - Nessuna scroll orizzontale prevista a finestra normale (barra laterale fissa, contenuto con margine a sinistra; le colonne senza a capo sono poche e strette), ma non provato nel browser.
  - Test: 129 (2 nuovi: `recuperato`, categorie generiche).
- Azioni richieste al committente: `npm run dev` e guardare login, menu (anche a finestra stretta), tabelle con intestazione fissa, dettaglio ricerca, selettore categorie; poi `npm run deploy`.

## Sessione precedente (S6c)
- Sessione: S6c — Visibilità delle ricerche per ruolo (correzione prima della S7)
- Regola: l'admin vede tutte le ricerche, l'operatore solo le proprie (controllo lato server). SPEC §2, §7, §8 aggiornate.
- Cosa è stato fatto:
  - `storico.ts`: `GET /api/operatori` solo admin (403 all'operatore); `GET /api/ricerche` filtra sempre per l'id dell'operatore e ignora il parametro `operatore`; `GET /api/ricerche/:id` e `POST /api/ricerche/:id/dettagli` rispondono 404 "Ricerca non trovata" se la ricerca non è dell'operatore (uguale a una inesistente; per i dettagli il controllo precede ogni altra verifica e nessuna chiamata a Google).
  - `dashboard.ts`: per l'operatore i totali contano solo le sue ricerche e `perOperatore` non viene restituito (solo admin).
  - `MAX_RICERCHE_GIORNO` invariato: conteggio unico per tutta l'app.
  - Interfaccia: l'operatore non vede filtro né colonna "Operatore" nell'elenco, né la tabella per operatore in Dashboard.
  - Test: 127 in tutto (12 nuovi; Google sempre finto). Nei test esistenti l'utente di prova ora è admin, per mantenere la visibilità globale. Controllo tipi e `npm run build` ok. Interfaccia non provata nel browser (serve un login locale).
- Azioni richieste al committente: `npm run deploy`; poi provare online con un operatore (vede solo le sue ricerche, niente filtro/colonna operatore, Dashboard solo con i suoi totali) e con l'admin (vede tutto).
- Nota: nel dettaglio di una ricerca il campo "Operatore" resta visibile (per l'operatore è sempre se stesso).

## Sessione precedente (S6b)
- Sessione: S6b — Selettore ad albero delle categorie (correzione prima della S7)
- Cosa è stato fatto:
  - `src/data/place-types.it.json`: ogni tipo ha `gruppo` (18 macro-categorie in italiano, secondo la Table A); `generico: true` sulla categoria ampia di 8 gruppi (restaurant, store, lodging, service, educational_institution, government_office, transportation_service, sports_activity_location), mostrata con "(in generale)" solo nel selettore (le etichette usate da CSV e risultati restano quelle normali; `service` ora si chiama "Servizio"); "Cibo e bevande" ha in cima restaurant, cafe, bar, bakery, meal_takeaway; `parole` con sinonimi italiani (idraulico/caldaia/riscaldamento → plumber, meccanico/officina → car_repair, ecc.). Il file è ora formattato con un tipo per riga.
  - Verifica Google: nella Table A non esiste un tipo per gli installatori di impianti di riscaldamento; si usa `plumber` tramite i sinonimi.
  - `src/client/categorie.ts` (funzioni pure: normalizzazione, ricerca con ordine, stato macro, limite 50) e `SelettoreCategorie.tsx` (etichette ×, "Svuota selezione", contatore N/50, albero con caselle e stato indeterminato, casella macro disattivata con spiegazione se supera 50, ricerca che apre solo le macro con corrispondenze, nota sui 20 risultati per zona). Sostituisce il vecchio campo in `NuovaRicerca.tsx`, senza nuove dipendenze.
  - SPEC §5 aggiornata (formato JSON e comportamento). 115 test Vitest (14 nuovi), controllo tipi e `npm run build` ok. Interfaccia non provata nel browser (serve un login locale).
  - Correzioni successive: tolta la riga rossa sotto le macro oltre 50 (la spiegazione resta come tooltip sulla casella disattivata); "Includi telefono e sito web" è ora attivata di default (scelta del committente; SPEC §5 e tabella "Decisioni già prese" di PIANO.md aggiornate). Attenzione: con i contatti attivi ogni ricerca costa di più (SKU Enterprise).
- Azioni richieste al committente: `npm run deploy`; poi provare online il selettore (aprire una macro, spuntarla, cercare "caldaia", "farmacia", "citta", raggiungere 50 categorie).
- Nota: la macro "Cibo e bevande" (oltre 150 tipi) ha sempre la casella disattivata (supera 50): si scelgono le singole categorie o "Ristorante (in generale)".
- Nota di metodo: in S6 alcune modifiche a `STATO.md` erano state fatte con uno script da shell, contro la regola di `CLAUDE.md`; da S6b in poi i file si modificano solo con gli strumenti di modifica.

## Sessione precedente (S6)
- Sessione: S6 — Dashboard e rifinitura
- Cosa è stato fatto:
  - Backend `src/worker/dashboard.ts`: `GET /api/dashboard?periodo=30giorni|anno|tutto` (con sessione). Conta tutte le ricerche, anche in errore, come l'elenco; operatori disattivati inclusi; totali ricavati dalle stesse righe per operatore. Periodi sui giorni di Europe/Rome: "30 giorni" = oggi + 29 giorni precedenti, "anno" = dal 1° gennaio.
  - Interfaccia: pagina `Dashboard.tsx` (selettore periodo, 3 riquadri, tabella per operatore con "(disattivato)"); media con una cifra decimale e virgola, "—" senza ricerche. Voce "Dashboard" nella barra; "Nuova ricerca" resta la pagina iniziale (la pagina "Ciao, ..." e le frasi su sezioni future non erano più presenti nel codice).
  - Errori in italiano: `messaggioErrore` in `api.ts` traduce errori di rete ("Failed to fetch") e risposte senza messaggio; usato in tutte le pagine. Componenti condivisi `Caricamento`/`Errore` (`Stati.tsx`).
  - 99 test Vitest (13 nuovi, Google sempre finto): passano; controllo tipi e `npm run build` ok. Interfaccia non provata nel browser (serve un login locale).
- Azioni richieste al committente:
  1. `npm run deploy`.
  2. Online: confrontare i numeri della Dashboard con l'Elenco ricerche (stesso periodo: il "Ricerche trovate" dell'elenco deve coincidere), controllare le voci del menu e provare a spegnere la rete per vedere il messaggio d'errore.
- Messaggi salvati con le ricerche (`error_message`): il Worker salva solo testi in italiano, es. "3 chiamate su 10 non riuscite: problema di connessione con Google" oppure "... Google ha risposto con errore HTTP 500" (`riassuntoErrori` e `ErroreGoogle` in `ricerca.ts`); mai il testo tecnico grezzo. Anche l'elenco `errori` mostrato in "Nuova ricerca" è ora ripulito. Per le ricerche già salvate, il dettaglio (`testoErroreRicerca` in `api.ts`) mostra il messaggio solo se è tra quelli previsti, altrimenti "Si è verificato un problema durante la ricerca. I risultati potrebbero essere incompleti." Test: 101 in tutto, passano.

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
