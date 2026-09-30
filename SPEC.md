# Specifica — Web app ricerca geografica (v1.2)

Versione corretta e completata della specifica originale. È la fonte di verità per Claude Code: ogni modifica ai requisiti va fatta qui.

## 1. Scopo e contesto

Dato un indirizzo, la web app recupera tramite Google Places API (New) — endpoint **Nearby Search** — l'elenco delle attività **operative** appartenenti alle categorie scelte dall'utente, entro un raggio impostato dall'utente.

Uso interno, 2-3 utenti. Sicurezza di base ma corretta (password con hash, chiave Google solo lato server).

## 2. Utenti e ruoli

- **admin**: tutto ciò che fa un operatore, più la gestione utenti (§4.1).
- **operatore**: effettua ricerche e consulta ricerche e dashboard.

Tutti gli utenti vedono tutte le ricerche.

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
- **Categorie**: multiselect con ricerca testuale. Elenco = tipi della "Table A" di Google supportati da Nearby Search (New), con etichetta italiana, salvati in un file JSON nel repo (`src/data/place-types.it.json`, formato `{ "type": "...", "label": "..." }`). Massimo 50 categorie per ricerca (limite di `includedTypes`).
- **Casella "Includi telefono e sito web"** (default: disattivata), con nota: "Aumenta il costo delle chiamate Google".

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

Tabella con: denominazione, indirizzo, categorie (etichette italiane quando disponibili), telefono, sito web (link), Place ID.

**Download CSV** generato nel browser: UTF-8 con BOM, separatore `;` (compatibile con Excel in italiano).

## 7. Elenco ricerche

Colonne: data, operatore, indirizzo di partenza, raggio, n. risultati. Filtri: data da … a …, operatore. Ordinamento: più recenti prima. Paginazione da 25 righe.

### Dettaglio ricerca

Parametri della ricerca e l'elenco dei risultati salvati (vedi §9). Per ogni riga, pulsante **"Recupera dettagli"**: chiama Place Details (New) con i campi `displayName,formattedAddress,types,nationalPhoneNumber,websiteUri` (SKU Enterprise) e mostra i dati. Anche qui è disponibile il download CSV.

## 8. Dashboard

- N. ricerche effettuate
- N. risultati ottenuti (somma)
- N. medio di risultati per ricerca
- N. ricerche per operatore
- N. risultati per operatore

Filtro periodo opzionale: ultimi 30 giorni / anno corrente / tutto.

## 9. Dati salvati e termini Google

I termini di Google Maps Platform permettono di conservare i **Place ID** senza limiti di tempo; gli altri contenuti (nome, indirizzo, telefono, ecc.) hanno restrizioni. I termini per lo Spazio Economico Europeo vanno verificati dal committente.

Comportamento controllato dalla variabile `SALVA_DATI_ESTESI`:

- `false` (**default**): in `search_results` si salvano solo Place ID e data. I dati completi vengono mostrati ed esportati solo al momento della ricerca; nel dettaglio di una ricerca passata si usano i pulsanti "Recupera dettagli".
- `true`: si salvano anche nome, indirizzo, categorie, telefono e sito, con data di recupero.

## 10. Modello dati (Cloudflare D1)

```
users(id, email UNIQUE, name, role ['admin'|'operatore'], pw_hash, pw_salt,
      failed_attempts, locked_until, active, created_at)
sessions(id, user_id, token_hash, expires_at, created_at)
searches(id, user_id, created_at, address_text, address_place_id, lat, lng,
         radius_km, types_json, include_contacts, status, result_count,
         api_calls, saturated_calls, error_message)
search_results(search_id, place_id, name, address, types_json, phone,
               website, fetched_at, PRIMARY KEY(search_id, place_id))
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
