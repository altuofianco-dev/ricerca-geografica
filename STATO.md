# Stato del progetto

Aggiornato da Claude Code alla fine di ogni sessione. Da incollare nel Project dopo ogni sessione.

## Riepilogo

| Sessione | Stato | Data |
|---|---|---|
| Fase 0 — Preparazione | completata | 30/09/2026 10:39 |
| S1 — Scheletro e pubblicazione | completata | 30/09/2026 |
| S2 — Autenticazione e utenti | completata (da verificare dal committente) | 30/09/2026 |
| S3 — Motore di ricerca Google | da fare | |
| S4 — Nuova ricerca e risultati | da fare | |
| S5 — Elenco ricerche e dettaglio | da fare | |
| S6 — Dashboard e rifinitura | da fare | |
| S7 — Messa in produzione | da fare | |

Stati possibili: da fare · in corso · completata · bloccata

## URL
- Produzione: https://ricerca-geografica.altuofianco-dev.workers.dev
- Controllo tecnico: https://ricerca-geografica.altuofianco-dev.workers.dev/api/health

## Ultima sessione
- Sessione: S2 — Autenticazione e utenti
- Cosa è stato fatto:
  - Login email+password, logout, `/api/me`; sessioni in D1 (solo hash del token), cookie HttpOnly/Secure/SameSite=Lax, 7 giorni.
  - Password PBKDF2-SHA256, 100.000 iterazioni, salt 16 byte (`src/worker/password.ts`).
  - Blocco account: 5 tentativi falliti → bloccato 15 minuti; messaggio generico per email inesistente.
  - Ogni `/api/*` richiede sessione (eccetto login e `/api/health`); endpoint admin controllati lato server.
  - Gestione utenti (§4.1): crea utente, nuova password (chiude le sessioni), disattiva/riattiva (chiude le sessioni), vincoli (no auto-disattivazione, almeno un admin attivo, password min 10).
  - Pagina Login, barra con nome/Esci, pagina Utenti (solo admin).
  - Script primo admin: `npm run admin:crea:local` e `npm run admin:crea:remote` (chiedono nome, email, password da terminale).
  - `/api/health` pubblico ma risponde solo `{"status":"ok"}`/`{"status":"errore"}`; aggiornati CLAUDE.md e SPEC §4.
  - 26 test Vitest (hash/verifica password, login, blocco, sessioni, utenti) con SQLite in memoria: passano. Verificato in locale nel browser.
- Cosa resta da fare: sessione S3.
- Azioni richieste al committente:
  1. Creare il tuo admin in produzione: `npm run admin:crea:remote` (poi `npm run deploy` per pubblicare S2; non eseguiti da me).
  2. Verificare i criteri di accettazione S2 (login/logout, blocco dopo 5 errori).
- Problemi aperti: nel database locale ci sono utenti di prova (prova@example.com, op@example.com) creati per i test: si possono ignorare o cancellare con `.wrangler/state`.

## Decisioni prese durante lo sviluppo
(scostamenti dalla SPEC, con motivo)
- Schema D1: aggiunti vincoli ovvi non indicati nella SPEC (chiavi esterne, CHECK su `role` e `status`, default `active=1`, `failed_attempts=0`, `status='in_corso'`, date in formato ISO UTC). Le date vengono convertite in Europe/Rome solo in visualizzazione.
- Vitest usa `vitest.config.ts` separato (il plugin Cloudflare di `vite.config.ts` non è compatibile con Vitest). `tsconfig.json` controlla solo `src`, perché i test usano `node:sqlite` (evita di aggiungere `@types/node`).
- Gli errori di login sono generici (non rivelano se l'email esiste); l'account bloccato risponde 429 anche con password giusta fino a fine blocco.
