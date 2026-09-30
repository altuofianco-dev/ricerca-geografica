# Specifica — Web app ricerca geografica (v1.2)

Versione corretta e completata della specifica originale. È la fonte di verità per Claude Code: ogni modifica ai requisiti va fatta qui.

## 1. Scopo e contesto

Dato un indirizzo, la web app recupera tramite Google Places API (New) — endpoint **Nearby Search** — l'elenco delle attività **operative** appartenenti alle categorie scelte dall'utente, entro un raggio impostato dall'utente.

Uso interno, 2-3 utenti. Sicurezza di base ma corretta (password con hash, chiave Google solo lato server).

## 2. Utenti e ruoli

- **admin**: tutto ciò che fa un operatore, più la gestione utenti (§4.1).
- **operatore**: effettua ricerche e consulta le proprie ricerche e la propria dashboard.

**Visibilità delle ricerche**: l'admin vede tutte le ricerche; l'operatore vede solo le proprie. Il controllo è fatto lato server su ogni endpoint (elenco, dettaglio, "Recupera dettagli", dashboard, elenco operatori), non solo nell'interfaccia. Il limite giornaliero `MAX_RICERCHE_GIORNO` resta unico per tutta l'app (contano le ricerche di tutti gli utenti).

## 3. Sezioni dell'app

1. Login
2. Dashboard
3. Nuova ricerca
4. Elenco ricerche (con dettaglio ricerca)
5. Gestione utenti (solo admin)

Interfaccia interamente in italiano. Date e ore nel fuso Europe/Rome, formato gg/mm/aaaa hh:mm. Numeri con virgola decimale.

## 4. Login e account

- Accesso con email + password.
- Hash password: **PBKDF2-SHA256 via Web Crypto**, 100.000 iterazioni (massimo supportato dai Workers), salt casuale di 16 byte per utente. Non usare bcrypt/argon2.
- Sessione: token casuale in cookie `HttpOnly`, `Secure`, `SameSite=Lax`, durata 7 giorni; sessioni salvate in D1 (salvare l'hash del token, non il token).
- Dopo 5 tentativi falliti l'account è bloccato per 15 minuti.
- **Nessun recupero password** e nessuna registrazione pubblica: le password sono impostate solo dall'admin. Gli utenti non cambiano la propria password.
- Primo admin creato con uno script/comando da riga di comando.
- Un utente disattivato non può accedere.
- Ogni endpoint `/api/*` richiede una sessione valida, tranne il login e `/api/health` (controllo tecnico pubblico: risponde solo `{"status":"ok"}` oppure `{"status":"errore"}`, senza dettagli).

### 4.1 Gestione utenti (solo admin)

Pagina riservata al ruolo admin (controllo lato server su ogni endpoint). Permette di:

- **Creare un utente**: nome, email, ruolo, password assegnata dall'admin.
- **Impostare una nuova password** per un utente esistente. Le sessioni aperte di quell'utente vengono chiuse.
- **Disattivare un utente**: impedisce accessi futuri e chiude subito le sue sessioni aperte. Le sue ricerche restano visibili nello storico e nella dashboard. Possibilità di riattivarlo.

Vincoli: l'admin non può disattivare sé stesso; deve sempre esistere almeno un admin attivo. Password minima: 10 caratteri.

## 5. Nuova ricerca

L'utente inserisce:

- **Indirizzo** con suggerimenti: il browser chiama un endpoint dell'app che fa da proxy verso Places Autocomplete (New), usando un session token. Alla selezione, l'app recupera le coordinate con Place Details (New) chiedendo **solo** il campo `location` (SKU Essentials). La chiave Google non arriva mai al browser.
- **Raggio** in km: da 0,5 a 50, passo 0,5.
- **Categorie**: selettore ad albero con ricerca testuale. Elenco = tipi della "Table A" di Google supportati da Nearby Search (New), con etichetta italiana, salvati in un file JSON nel repo (`src/data/place-types.it.json`). Massimo 50 categorie per ricerca (limite di `includedTypes`).
  - **Formato del JSON**: array di `{ "type": "...", "label": "...", "gruppo": "...", "generico": true, "parole": ["..."] }`. `type` e `label` sono obbligatori; `gruppo` è la macro-categoria (nome italiano, secondo i gruppi della Table A); `generico` (facoltativo) marca la categoria ampia di un gruppo (es. `restaurant`, `store`, `lodging`), mostrata con "(in generale)" e messa in cima al gruppo; `parole` (facoltativo) sono sinonimi italiani usati solo dalla ricerca (es. `plumber`: caldaia, idraulico, riscaldamento). L'ordine del file è quello mostrato: gruppi nell'ordine di comparsa, categorie nell'ordine dentro il gruppo. In "Cibo e bevande" sono in cima le categorie ampie `restaurant`, `cafe`, `bar`, `bakery`, `meal_takeaway`. Google non ha un tipo per gli installatori di impianti di riscaldamento: si usa `plumber`.
  - **Selettore**: in alto le categorie scelte come etichette rimovibili (×), il pulsante "Svuota selezione" e il contatore "N/50". Sotto la casella di ricerca e l'albero: macro-categorie inizialmente chiuse (freccia per aprirle), con caselle di spunta su categorie e macro. Macro spuntata = tutte le sue categorie; selezione parziale = casella indeterminata (trattino). Se spuntare una macro porterebbe oltre 50 (contando anche le categorie già scelte) la sua casella è disattivata e la spiegazione "Troppe categorie: Google ne accetta al massimo 50 per ricerca" compare solo come suggerimento al passaggio del mouse (nessun testo fisso sotto la macro).
  - **Ricerca nell'albero**: filtra mentre si scrive, apre solo le macro con corrispondenze, ignora maiuscole e accenti e cerca anche nei sinonimi. Ordine: prima le etichette che iniziano con il testo, poi quelle con una parola che inizia con il testo, poi le altre. Senza risultati: "Nessuna categoria trovata. Google usa categorie predefinite: prova con un termine più generico o sfoglia le macro-categorie."
  - Sotto il campo la nota: "Ogni zona restituisce al massimo 20 risultati in totale: con molte categorie l'elenco può risultare incompleto."
- **Casella "Includi telefono e sito web"** (default: attivata, scelta del committente; l'utente può toglierla), con nota: "Aumenta il costo delle chiamate Google".

Al lancio viene salvato un record di ricerca con: utente, data/ora, indirizzo (testo e place_id), lat/lng, raggio, categorie, flag contatti, stato `in_corso`.

### Limite di sicurezza

Numero massimo di ricerche al giorno per l'intera app configurabile (variabile `MAX_RICERCHE_GIORNO`, default 30). Oltre il limite l'app rifiuta nuove ricerche con un messaggio chiaro.

## 6. Esecuzione della ricerca

Nearby Search restituisce al massimo 20 risultati per chiamata e non ha paginazione, quindi il sistema esegue **10 chiamate**:

1. **Chiamata principale**: centro = indirizzo, raggio = R.
2. **Griglia 3×3 (9 chiamate)**: centri spostati di `dx, dy ∈ {−2R/3, 0, +2R/3}` (km, asse est e asse nord); raggio di ciascuna = `R·√2/3` (≈ 0,47·R), così i 9 cerchi coprono l'intero quadrato che contiene il cerchio di raggio R senza buchi.

Conversione km → gradi: `dLat = dy / 111,32`; `dLng = dx / (111,32 · cos(lat))`.

Parametri di ogni chiamata (`POST https://places.googleapis.com/v1/places:searchNearby`):

- `includedTypes`: categorie scelte
- `maxResultCount`: 20
- `locationRestriction.circle`: centro e raggio in metri (max 50.000)
- `languageCode`: `it`, `regionCode`: `IT`
- **Field mask base** (SKU Pro): `places.id,places.displayName,places.formattedAddress,places.types,places.primaryType,places.businessStatus,places.location`
- **Field mask con contatti** (SKU Enterprise): base + `places.nationalPhoneNumber,places.websiteUri`

Elaborazione:

- Tenere solo `businessStatus == "OPERATIONAL"`.
- Scartare i risultati a distanza > R dal centro originale (haversine): la griglia copre anche gli angoli del quadrato.
- **Deduplicare** per Place ID.
- Contare le chiamate "sature" (che hanno restituito 20 risultati): se > 0, mostrare l'avviso "Alcune zone hanno raggiunto il limite di 20 risultati: l'elenco potrebbe essere incompleto".
- Chiamate con al massimo 3 in parallelo. Se una chiamata fallisce, proseguire con le altre, registrare l'errore e mostrare un avviso.

Al termine si salvano sulla ricerca: numero risultati, numero chiamate eseguite, chiamate sature, eventuale errore, stato `completata` o `errore`.

### Visualizzazione risultati

Tabella con: denominazione, indirizzo, coordinate, categorie (etichette italiane quando disponibili), telefono, sito web (link), Place ID.

- **Indirizzo**: link a Google Maps `https://www.google.com/maps/search/?api=1&query=<nome e indirizzo codificati>&query_place_id=<place_id>`, in nuova scheda con `rel="noopener noreferrer"`.
- **Coordinate**: formato italiano, 5 decimali, `41,85421; 12,47851` (vuote se non salvate).
- **Telefono**: link `tel:` con numero senza spazi e prefisso `+39` se manca il prefisso internazionale (`00…` diventa `+…`); il testo mostrato resta quello di Google.
- **Categorie**: nei gruppi del selettore restano in cima le categorie "(in generale)", le altre sono in ordine alfabetico italiano (senza distinzione di accenti e maiuscole).

**Download CSV** generato nel browser: UTF-8 con BOM, separatore `;` (compatibile con Excel in italiano). Colonne: Denominazione, Indirizzo, Latitudine, Longitudine (virgola decimale), Categorie, Telefono, Sito web, Place ID, Link Google Maps.

## 7. Elenco ricerche

Colonne: data, operatore (solo admin), indirizzo di partenza, raggio, n. risultati. Filtri: data da … a …, operatore (solo admin). Ordinamento: più recenti prima. Paginazione da 25 righe.

Visibilità (§2): l'operatore vede solo le proprie ricerche; il parametro `operatore` dell'API viene ignorato per lui e `GET /api/operatori` è riservato all'admin (403 all'operatore). Se un operatore prova ad aprire una ricerca altrui (dettaglio o "Recupera dettagli"), anche forzando l'id, il server risponde 404 "Ricerca non trovata", come per una ricerca inesistente, senza chiamare Google.

### Dettaglio ricerca

Parametri della ricerca e l'elenco dei risultati salvati (vedi §9). Per ogni riga, pulsante **"Recupera dettagli"**: chiama Place Details (New) con i campi `displayName,formattedAddress,types,nationalPhoneNumber,websiteUri,location` (SKU Enterprise, invariato: `location` non lo cambia) e mostra i dati, coordinate incluse. Anche qui è disponibile il download CSV.

## 8. Dashboard

- N. ricerche effettuate
- N. risultati ottenuti (somma)
- N. medio di risultati per ricerca
- N. ricerche per operatore (solo admin)
- N. risultati per operatore (solo admin)

Per l'operatore i totali contano solo le sue ricerche e la tabella per operatore non è disponibile (il server non la restituisce); l'admin vede i totali complessivi e la tabella.

Filtro periodo opzionale: ultimi 30 giorni / anno corrente / tutto.

## 9. Dati salvati e termini Google

I termini di Google Maps Platform permettono di conservare i **Place ID** senza limiti di tempo; gli altri contenuti (nome, indirizzo, telefono, ecc.) hanno restrizioni. I termini per lo Spazio Economico Europeo vanno verificati dal committente.

Comportamento controllato dalla variabile `SALVA_DATI_ESTESI`:

- `false`: in `search_results` si salvano solo Place ID e data. I dati completi vengono mostrati ed esportati solo al momento della ricerca; nel dettaglio di una ricerca passata si usano i pulsanti "Recupera dettagli".
- `true` (**scelta del committente**): si salvano anche nome, indirizzo, coordinate (`lat`, `lng`), categorie, telefono e sito, con data di recupero. "Recupera dettagli" serve a completare o aggiornare i dati mancanti (es. telefono e sito se la ricerca era senza contatti) e salva i dati recuperati.

## 10. Modello dati (Cloudflare D1)

```
users(id, email UNIQUE, name, role ['admin'|'operatore'], pw_hash, pw_salt,
      failed_attempts, locked_until, active, created_at)
sessions(id, user_id, token_hash, expires_at, created_at)
searches(id, user_id, created_at, address_text, address_place_id, lat, lng,
         radius_km, types_json, include_contacts, status, result_count,
         api_calls, saturated_calls, error_message)
search_results(search_id, place_id, name, address, types_json, phone,
               website, lat, lng, fetched_at, PRIMARY KEY(search_id, place_id))
               -- lat, lng: REAL nullable (migrazione 0002), valorizzati solo con SALVA_DATI_ESTESI=true
```

Indici su `searches(created_at)`, `searches(user_id)`, `sessions(token_hash)`.

## 11. Stack tecnico

- **Cloudflare Workers** con static assets (non Pages) + **D1**.
- Backend: TypeScript + Hono.
- Frontend: React + Vite + TypeScript, CSS semplice (nessuna libreria UI pesante).
- Migrazioni D1 con `wrangler d1 migrations`.
- Test: Vitest per le funzioni pure (griglia, distanza, deduplica, hash password, CSV).
- Segreti: `GOOGLE_API_KEY` come secret di Wrangler; in locale in `.dev.vars` (mai nel repo).

## 12. Fuori ambito (v1)

Invio email, registrazione pubblica, mappe visuali dei risultati, app mobile, multi-lingua.
