# Piano di lavoro

Legenda: **[TU]** = attività manuale tua · **[CC]** = sessione di Claude Code · **[ORCH]** = passaggio con Claude nel Project (orchestratore).

## Come lavoriamo

Ogni sessione di Claude Code è pensata per stare dentro **una finestra di utilizzo da 5 ore** del piano Pro. Ritmo realistico: 1-2 sessioni al giorno, circa 5-7 giorni in totale.

Ciclo di ogni sessione:

1. **[ORCH]** Apri il Project e scrivi "Preparo la sessione Sx". Claude verifica lo stato e ti conferma (o adatta) il prompt.
2. **[CC]** In Claude Code: `/clear`, poi incolla il prompt della sessione. Claude Code propone un piano (plan mode): leggilo e approvalo.
3. **[CC]** Claude Code implementa, testa, aggiorna `STATO.md`, fa commit e push.
4. **[TU]** Esegui le verifiche indicate nei "Criteri di accettazione".
5. **[ORCH]** Torna nel Project e incolla il contenuto aggiornato di `STATO.md` (più eventuali errori o dubbi). Claude valuta e prepara la sessione successiva.

Se Claude Code raggiunge il limite a metà sessione: aspetta il reset, poi scrivi "Riprendi la sessione Sx leggendo STATO.md". Il lavoro è già salvato nei commit.

Regole per risparmiare utilizzo:

- Una sessione = un obiettivo. Sempre `/clear` all'inizio.
- Non chiedere "migliorie" fuori piano durante una sessione: annotale e portale qui.
- Se un errore non si risolve in 2-3 tentativi, fermati e porta l'errore nel Project.

## Decisioni già prese (modificabili in SPEC.md)

| Tema | Scelta |
|---|---|
| Hosting e database | Cloudflare Workers + D1, piano gratuito |
| Telefono e sito | Opzionali per ricerca (casella), default attivati (scelta del committente; l'utente può toglierli) |
| Griglia | 3×3 vera, raggio R·√2/3, filtro finale entro R |
| Password | Impostate solo dall'admin; nessun recupero né cambio da parte dell'utente |
| Dati salvati | Dati completi (`SALVA_DATI_ESTESI=true`); la verifica dei termini Google resta a carico del committente |
| Limite di sicurezza | 30 ricerche al giorno per tutta l'app |

---

## Fase 0 — Preparazione [TU] (≈ 1-2 ore, nessuna sessione CC)

**T0.1 — Project su claude.ai**
- Crea il Project "Web app ricerca geografica".
- Carica nella conoscenza del Project: `SPEC.md`, `PIANO.md`, `STATO.md`.
- Incolla le istruzioni del Project (fornite in chat).

**T0.2 — Google Cloud**
- Crea un progetto Google Cloud e attiva la fatturazione.
- Abilita **Places API (New)**.
- Crea una chiave API e limitala alla sola Places API (New).
- In "Quote", imposta un limite giornaliero per Nearby Search (es. 500 richieste/giorno) e Place Details (es. 300/giorno).
- In "Fatturazione → Budget e avvisi", crea un budget di 10 € con avvisi al 50%, 90%, 100%.
- Conserva la chiave in un posto sicuro: **non** incollarla nelle chat.

**T0.3 — Cloudflare**
- Crea un account gratuito su cloudflare.com (non serve un dominio).

**T0.4 — Computer e Git**
- Installa Node.js LTS (nodejs.org) e Git.
- Installa l'app desktop di Claude e accedi con il tuo account Pro.
- Crea su GitHub un repository **privato** `ricerca-geografica` e clonalo in locale.
- Copia nella radice del repo: `SPEC.md`, `PIANO.md`, `STATO.md`, `CLAUDE.md`. Commit e push.

**T0.5 — Termini Google (può andare in parallelo)**
- Leggi i termini specifici di Google Maps Platform (versione SEE) sulla conservazione dei contenuti per confermare che `SALVA_DATI_ESTESI=true` sia compatibile (in caso contrario si torna a `false` senza modificare il codice).

✅ Fatto quando: repo su GitHub con i 4 file, chiave Google con quote e budget, account Cloudflare pronto.

---

## S1 — Scheletro e pubblicazione [CC]

**Obiettivo**: progetto Worker + React funzionante in locale e online, database creato.

**Prompt**
```
Leggi CLAUDE.md, SPEC.md e STATO.md. Esegui la sessione S1 di PIANO.md.
Crea lo scheletro del progetto (Workers con static assets, Hono, React+Vite,
TypeScript), il database D1 con le migrazioni dello schema in SPEC §10,
una pagina "Hello" e un endpoint /api/health che legge da D1.
Poi pubblica su Cloudflare. Proponi prima il piano.
```

**Cosa farai tu durante la sessione**
- Approvare i comandi; eseguire il login a Cloudflare nel browser quando `wrangler login` lo chiede.

**Criteri di accettazione**
- `npm run dev` apre la pagina in locale.
- L'URL `*.workers.dev` mostra la pagina e `/api/health` risponde `ok`.
- Le tabelle esistono sia in D1 locale che remoto.

---

## S2 — Autenticazione e utenti [CC]

**Obiettivo**: login sicuro, sessioni, gestione utenti admin.

**Prompt**
```
Leggi CLAUDE.md, SPEC.md e STATO.md. Esegui la sessione S2 di PIANO.md:
tutto il §4 della SPEC, inclusa la Gestione utenti (§4.1).
Includi uno script npm per creare il primo admin (locale e remoto)
e test Vitest per hash e verifica password. Proponi prima il piano.
```

**Criteri di accettazione**
- Crei il tuo admin con lo script; login e logout funzionano.
- Password errata 5 volte → account bloccato 15 minuti.
- L'admin crea un operatore con una password; l'operatore accede.
- L'admin imposta una nuova password: l'operatore viene disconnesso e accede con quella nuova.
- L'admin disattiva l'operatore: viene disconnesso subito e non può più accedere; riattivandolo può di nuovo.
- L'admin non può disattivare sé stesso; un operatore non vede né usa la Gestione utenti.
- Le pagine protette senza login rimandano al login.

---

## S3 — Motore di ricerca Google (solo backend) [CC]

**Obiettivo**: tutta la logica Google e di calcolo, testata, senza interfaccia.

**Prima della sessione [TU]**
- Crea il file `.dev.vars` con `GOOGLE_API_KEY=...` (Claude Code ti dirà dove). È escluso da Git.

**Prompt**
```
Leggi CLAUDE.md, SPEC.md e STATO.md. Esegui la sessione S3 di PIANO.md:
implementa il §6 della SPEC come modulo backend (griglia, conversione km/gradi,
field mask, filtro OPERATIONAL, filtro distanza, deduplica, chiamate sature,
parallelismo max 3), gli endpoint proxy per autocomplete e coordinate (§5),
e il file src/data/place-types.it.json con i tipi Table A tradotti.
Test Vitest per le funzioni pure. Per il test reale su Google fai UNA sola
ricerca di prova con raggio 1 km e una categoria, e chiedimi conferma prima.
Proponi prima il piano.
```

**Criteri di accettazione**
- I test Vitest passano (griglia: 9 centri corretti; deduplica; distanza).
- La ricerca di prova restituisce risultati reali e il conteggio chiamate = 10.
- Nessuna chiave nel codice o nei commit (`git log -p | grep AIza` non trova nulla).

---

## S4 — Pagina Nuova ricerca e risultati [CC]

**Obiettivo**: la funzione principale utilizzabile end-to-end.

**Prompt**
```
Leggi CLAUDE.md, SPEC.md e STATO.md. Esegui la sessione S4 di PIANO.md:
pagina Nuova ricerca (§5, incluso limite MAX_RICERCHE_GIORNO),
salvataggio della ricerca e dei risultati secondo SALVA_DATI_ESTESI (§9),
tabella risultati, avvisi (chiamate sature, errori) e download CSV (§6).
Proponi prima il piano.
```

**Criteri di accettazione**
- L'autocomplete propone indirizzi mentre scrivi.
- Una ricerca reale mostra risultati e il CSV si apre correttamente in Excel (accenti e colonne ok).
- La ricerca compare in D1 con numero risultati corretto.

---

## S5 — Elenco ricerche e dettaglio [CC]

**Prompt**
```
Leggi CLAUDE.md, SPEC.md e STATO.md. Esegui la sessione S5 di PIANO.md:
§7 della SPEC (elenco con filtri e paginazione, dettaglio ricerca,
pulsante Recupera dettagli, CSV). Proponi prima il piano.
```

**Criteri di accettazione**
- Filtri per data e operatore funzionanti.
- "Recupera dettagli" mostra telefono e sito di un risultato.

---

## S6 — Dashboard e rifinitura [CC]

**Prompt**
```
Leggi CLAUDE.md, SPEC.md e STATO.md. Esegui la sessione S6 di PIANO.md:
dashboard (§8), menu di navigazione coerente, messaggi di errore chiari
in italiano, stati di caricamento. Proponi prima il piano.
```

**Criteri di accettazione**
- I numeri della dashboard coincidono con l'elenco ricerche.
- Nessuna pagina mostra errori tecnici in inglese all'utente.

---

## S7 — Messa in produzione [CC] + [TU]

**Prompt**
```
Leggi CLAUDE.md, SPEC.md e STATO.md. Esegui la sessione S7 di PIANO.md:
controllo finale sicurezza (cookie, controllo ruoli su ogni endpoint admin,
nessun segreto nel repo), impostazione del secret GOOGLE_API_KEY su Cloudflare,
migrazioni remote, deploy finale e breve README con le istruzioni di
manutenzione (deploy, creazione admin, reset password). Proponi prima il piano.
```

**[TU] dopo la sessione**
- Crea gli account dei colleghi e comunica le password di persona.
- Fai una ricerca reale con un collega.
- Controlla dopo qualche giorno i consumi nella console Google.

✅ Progetto concluso.

---

## Backlog (idee per dopo, non ora)

- Invio email per recupero password (es. Resend).
- Mappa dei risultati.
- Deploy automatico da GitHub.
- Ricerca a testo libero con Text Search (New), con suggerimenti di Google.
