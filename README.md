# Ricerca geografica — istruzioni di manutenzione

Web app interna per cercare attività (farmacie, ristoranti, ecc.) intorno a un indirizzo, con i dati di Google Places.

- Indirizzo online: https://ricerca-geografica.altuofianco-dev.workers.dev
- Controllo tecnico (deve rispondere `{"status":"ok"}`): https://ricerca-geografica.altuofianco-dev.workers.dev/api/health

I comandi vanno scritti nel terminale, dentro la cartella del progetto.

## 1. Pubblicare una nuova versione

L'ordine conta: **prima** le migrazioni del database, **poi** la pubblicazione.

1. Aggiorna il database online (se non ci sono migrazioni nuove non fa nulla):

```bash
npx wrangler d1 migrations apply ricerca-geografica --remote
```

2. Pubblica l'app:

```bash
npm run deploy
```

3. Apri l'indirizzo online e controlla che il login funzioni.

## 2. Creare un amministratore

Il comando chiede nome, email e password (la password non si vede mentre la scrivi; minimo 10 caratteri).

```bash
npm run admin:crea:remote
```

Funziona solo se online non c'è ancora nessun amministratore. Gli altri utenti (admin o operatori) si creano dall'app, nella pagina **Utenti**.

## 3. Reimpostare la password di un utente

1. Entra come amministratore e apri **Utenti**.
2. Scegli l'utente, imposta una nuova password e comunicagliela.

L'utente viene scollegato da tutti i dispositivi. Un account bloccato per troppi tentativi (15 minuti) si sblocca anche subito con questa procedura.

## 4. L'unico amministratore ha dimenticato la password

Dall'app non è possibile, quindi si crea un secondo amministratore dal terminale, con **un'email diversa** da quella dimenticata:

```bash
npm run admin:crea:remote -- --forza
```

Poi entra con il nuovo amministratore, apri **Utenti** e reimposta la password del vecchio (oppure disattivalo).

## 5. Gestire le categorie

Entra come amministratore e apri **Categorie**. Puoi cambiare l'etichetta italiana, i sinonimi (le parole che l'utente può scrivere per trovare la categoria, es. "caldaia" per idraulico) e l'ordine con le frecce su/giù. Ricorda di premere **Salva** su ogni riga. I codici Google non si aggiungono né si tolgono.

## 6. Cambiare il limite giornaliero o il salvataggio dei dati estesi

Apri il file `wrangler.jsonc` e modifica la sezione `vars`:

- `MAX_RICERCHE_GIORNO`: numero massimo di ricerche al giorno per tutta l'app (oggi 30). Ogni ricerca costa, quindi tienilo basso.
- `SALVA_DATI_ESTESI`: `"true"` salva anche telefono, sito e coordinate dei risultati; `"false"` non li salva.

Poi pubblica di nuovo (punto 1, basta `npm run deploy`).

## 7. Backup del database

Crea un file con tutto il contenuto del database online (utenti, ricerche, categorie):

```bash
npx wrangler d1 export ricerca-geografica --remote --output=backup.sql
```

Conserva il file in un posto sicuro (contiene anche gli indirizzi email degli utenti) e **non caricarlo su Git**. Consiglio: un backup prima di ogni pubblicazione importante.

## 8. Controllare i consumi di Google

1. Apri Google Cloud Console e scegli il progetto dell'app.
2. **API e servizi → Places API (New) → Metriche** mostra quante chiamate sono state fatte.
3. **Fatturazione → Report** mostra la spesa.
4. Consiglio: in **Fatturazione → Budget e avvisi** imposta un budget mensile con avviso via email.

Con "Includi telefono e sito web" attivo ogni ricerca costa di più.

## 9. Cambiare la chiave Google

Il comando lo lancia solo il committente (chiede di incollare la chiave, che non compare mai nel progetto):

```bash
npx wrangler secret put GOOGLE_API_KEY
```

Per provare l'app sul proprio computer (`npm run dev`) la chiave sta nel file `.dev.vars`, che non finisce mai su Git.

## 10. Pagina bianca dopo una pubblicazione

Il browser sta usando una copia vecchia dei file. Ricarica la pagina senza cache con **Ctrl + Maiusc + R** (su Mac **Cmd + Maiusc + R**). Se non basta, svuota la cache del sito dalle impostazioni del browser e riprova.
