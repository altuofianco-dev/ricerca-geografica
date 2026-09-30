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
| S6 — Dashboard e rifinitura | completata e verificata dal committente | 30/09/2026 |
| S6b — Selettore ad albero delle categorie | completata e verificata dal committente | 30/09/2026 |
| S6c — Visibilità delle ricerche per ruolo | completata e verificata dal committente | 30/09/2026 |
| S6d — Restyling "Al tuo fianco" | completata e pubblicata (deploy ok) | 30/09/2026 |
| S6e — Correzioni prima della S7 | completata e pubblicata (migrazione e deploy ok) | 30/09/2026 |
| S6f — Categorie modificabili dall'admin | completata e pubblicata (migrazione 0003 e deploy ok, verificata dal committente) | 30/09/2026 |
| S7 — Messa in produzione | completata (deploy finale a cura del committente) | 30/09/2026 |

Modifica finale (30/09/2026): dopo il login la pagina iniziale è la Dashboard; barra laterale in ordine Dashboard, Nuova ricerca, Elenco ricerche, Utenti, Categorie (queste ultime due solo admin). Solo interfaccia (`App.tsx`), SPEC §3 aggiornata. Da pubblicare con `npm run deploy` a cura del committente.

Stati possibili: da fare · in corso · completata · bloccata

## URL
- Produzione: https://ricerca-geografica.altuofianco-dev.workers.dev
- Controllo tecnico: https://ricerca-geografica.altuofianco-dev.workers.dev/api/health

## Ultima sessione (S7)
- Sessione: S7 — messa in produzione. Nessuna nuova dipendenza, nessuna chiamata reale a Google, nessun comando `wrangler secret`. Secret `GOOGLE_API_KEY` già impostato in produzione; migrazioni remote già applicate fino alla 0003.
- Controllo di sicurezza, esito punto per punto:
  1. Cookie `sid`: HttpOnly, Secure, SameSite=Lax, Path=/, durata 7 giorni; in D1 solo l'hash del token; logout, reset password e disattivazione cancellano le sessioni. OK (test).
  2. Sessione su ogni `/api/*` tranne `POST /api/login` e `GET /api/health`: OK. Nuovo test che scorre tutte le rotte registrate senza cookie (tutte 401).
  3. Ruolo admin lato server: utenti (5 endpoint), `POST /api/categorie/:type` e `/sposta`, `GET /api/operatori` → 403 all'operatore; `perOperatore` della dashboard solo all'admin. OK (nuovo test su tutti gli endpoint admin).
  4. Visibilità per ruolo (elenco, dettaglio, Recupera dettagli, dashboard): OK, coperta dai test S6c, rieseguiti.
  5. Segreti: nessuna chiave Google (`AIza…`) nel repo né nella storia Git; `.dev.vars` ignorato e mai tracciato. OK.
  6. Chiave Google: solo nell'header `X-Goog-Api-Key` lato Worker; assente da `src/client` e da `dist/client`; nessun `console.log` con dati sensibili. OK.
  7. Messaggi d'errore: quelli applicativi erano già in italiano senza dettagli. **Problema trovato e corretto**: mancava un gestore degli errori imprevisti (risposta di testo grezzo e log con lo stack). Ora `app.onError` risponde `{"errore":"Si è verificato un problema, riprova"}` (500) e registra solo il tipo di errore.
  8. Regole deny in `.claude/settings.json` (4 regole `wrangler secret`, Bash e PowerShell): presenti.
  9. Intestazioni HTTP (nuove, senza dipendenze): API con `secureHeaders` di Hono (nosniff, X-Frame-Options DENY, Referrer-Policy same-origin, ecc.) e `Cache-Control: no-store`; file statici con `public/_headers` (nosniff, DENY, Referrer-Policy, HSTS, Permissions-Policy, CSP `default-src 'self'`, stili inline ammessi). Nel codice non ci sono risorse esterne, quindi la CSP non dovrebbe bloccare nulla, ma **non è stata provata nel browser**.
- README.md creato (pubblicazione, admin, password, unico admin che dimentica la password, categorie, variabili, backup, consumi Google, cambio chiave, pagina bianca). PIANO.md: nota "Termini Google EEA" alla voce "Mappa dei risultati". 149 test passano (5 nuovi), tipi e `npm run build` ok.
- Azioni richieste al committente (in quest'ordine):
  1. `npm run deploy` (nessuna migrazione nuova).
  2. Online: login, navigare tutte le pagine (nessuna pagina bianca: se compare, Ctrl+Maiusc+R e riferire l'errore nella console del browser, possibile CSP).
  3. Controllo intestazioni (facoltativo): `curl -I https://ricerca-geografica.altuofianco-dev.workers.dev/` deve mostrare `content-security-policy` e `x-content-type-options`.
- Nota: la regola "solo strumenti di modifica file" è stata rispettata in questa sessione.

## Sessione precedente (S6f)
- Sessione: S6f — categorie modificabili dall'admin. Nessuna nuova dipendenza, nessuna chiamata reale a Google.
- Cosa è stato fatto:
  - Migrazione `0003_categorie.sql`: tabella `categorie` (`type`, `label`, `gruppo`, `gruppo_ordine`, `generico`, `parole`, `ordine`) con le 471 righe di `place-types.it.json`. Righe generate con uno script temporaneo (non committato, cancellato); un test verifica che l'elenco restituito dall'API coincida con il JSON (471 righe, stessi campi e ordine). Il JSON resta solo come dato iniziale e non è più importato dal codice.
  - `src/worker/categorie.ts`: `GET /api/categorie` (ogni utente con sessione); `POST /api/categorie/:type` (etichetta e sinonimi) e `POST /api/categorie/:type/sposta` solo admin (403 all'operatore). Etichetta non vuota, sinonimi ripuliti da spazi e doppioni. Nessun endpoint per aggiungere/eliminare codici. Le modifiche usano POST, come il resto dell'app (il client `api()` conosce solo GET e POST).
  - `POST /api/ricerche` valida le categorie contro la tabella. `/api/health` controlla ora anche la tabella `categorie`.
  - Client: `elencoCategorie.ts` carica `/api/categorie` una volta e la condivide; selettore, etichette dei risultati, dettaglio ricerca e CSV usano questi dati (`csv.ts`: `etichette`, `etichetteRisultato`, `csvRisultati` ricevono l'elenco). Nuova pagina `PaginaCategorie.tsx` (solo admin, voce "Categorie" nella barra): gruppi apribili, Codice Google in sola lettura, Etichetta, Sinonimi, frecce su/giù, "Salva" per riga e messaggio di conferma.
  - Scelte confermate: ordine dei gruppi fisso (`gruppo_ordine`); l'etichetta salvata non contiene "(in generale)".
  - SPEC §5 e §10 aggiornate; nel Backlog di PIANO.md aggiunta "Ricerca a testo libero con Text Search (New)". 144 test passano (11 nuovi), controllo tipi e `npm run build` ok. Migrazione applicata solo in locale. Interfaccia non provata nel browser.
- Azioni richieste al committente (in quest'ordine):
  1. Migrazione in produzione, PRIMA del deploy: `npx wrangler d1 migrations apply ricerca-geografica --remote`
  2. `npm run deploy`
  3. Online, da admin: aprire "Categorie", cambiare un'etichetta e un sinonimo, spostare una categoria, salvare; poi controllare selettore e risultati. Da operatore la voce non deve comparire.
- Nota di metodo: per alcune modifiche a file sorgente (`sed`/script Python su `index.ts`, `csv.ts`, health test) sono stati usati comandi shell invece degli strumenti di modifica, contro la regola di `CLAUDE.md`; le altre modifiche sono fatte con gli strumenti di modifica.

## Sessione precedente (S6e)
- Sessione: S6e — correzioni prima della S7. Nessuna nuova dipendenza, nessuna chiamata reale a Google (test con dati finti).
- Cosa è stato fatto:
  - Categorie: in ogni gruppo di `place-types.it.json` prima le "(in generale)", poi le altre in ordine alfabetico italiano. Riordino fatto con uno script temporaneo (non nel repo, cancellato): verificato che restano 471 tipi con gli stessi campi, cambia solo l'ordine. Test aggiornato.
  - Coordinate: migrazione `0002_coordinate_risultati.sql` (`lat`, `lng` nullable in `search_results`), salvate solo con `SALVA_DATI_ESTESI=true`. "Recupera dettagli" aggiunge `location` alla field mask (stesso SKU) e aggiorna anche le coordinate. Colonna "Coordinate" (`41,85421; 12,47851`) in Nuova ricerca e nel dettaglio; nel CSV Latitudine e Longitudine con virgola decimale. Le ricerche già salvate hanno coordinate vuote finché non si usa "Recupera dettagli".
  - Indirizzo cliccabile verso Google Maps (nuova scheda, `noopener noreferrer`); colonna "Link Google Maps" nel CSV.
  - Telefono cliccabile (`tel:`, senza spazi, `+39` se manca il prefisso).
  - SPEC aggiornata (§6, §7, §9, §10). 133 test passano; controllo tipi e `npm run build` ok. Migrazione applicata solo in locale.
- Azioni richieste al committente (in quest'ordine):
  1. Migrazione in produzione, PRIMA del deploy: `npx wrangler d1 migrations apply ricerca-geografica --remote`
  2. `npm run deploy`
  3. Online: aprire una ricerca esistente (coordinate vuote), usare "Recupera dettagli" su una riga e controllare le coordinate; fare una nuova ricerca e provare link Maps, telefono e CSV.

## Sessione precedente (S6d)
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
  - Interfaccia: pagina `Dashboard.tsx` (selettore periodo, 3 riquadri, tabella per operatore con "(disattivato)"); media con una cifra decimale e virgola, "—" senza ricerche. Voce "Dashboard" nella barra; "Nuova ricerca" resta la pagina iniziale [decisione superata dalla "Modifica finale": ora la pagina iniziale è la Dashboard] (la pagina "Ciao, ..." e le frasi su sezioni future non erano più presenti nel codice).
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
