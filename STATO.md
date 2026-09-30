# Stato del progetto

Aggiornato da Claude Code alla fine di ogni sessione. Da incollare nel Project dopo ogni sessione.

## Riepilogo

| Sessione | Stato | Data |
|---|---|---|
| Fase 0 — Preparazione | completata | 30/09/2026 10:39 |
| S1 — Scheletro e pubblicazione | completata | 30/09/2026 |
| S2 — Autenticazione e utenti | da fare | |
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
- Sessione: S1 — Scheletro e pubblicazione
- Cosa è stato fatto:
  - Progetto Cloudflare Workers (static assets, modalità SPA) + Hono + React/Vite + TypeScript, con `@cloudflare/vite-plugin` (un solo `npm run dev` per frontend e Worker).
  - Database D1 `ricerca-geografica` (id `22dae8d7-4325-4a7b-bdbe-ce622f6f1893`, regione WEUR), binding `DB`.
  - Migrazione `0001_schema_iniziale.sql` (tabelle e indici SPEC §10) applicata in locale e in remoto.
  - Pagina "Ciao! Ricerca geografica" che mostra lo stato di `/api/health`.
  - `/api/health` verifica su D1 la presenza delle 4 tabelle e risponde `{"status":"ok","db":"ok","tabelle":4}`.
  - Variabili `MAX_RICERCHE_GIORNO=30` e `SALVA_DATI_ESTESI=true` in `wrangler.jsonc`.
  - 2 test Vitest su `/api/health` (con database finto): passano.
  - Deploy riuscito; verificato online (200 ok).
- Cosa resta da fare: sessione S2.
- Problemi aperti / domande per l'orchestratore:
  - Subito dopo il primo deploy il sottodominio workers.dev ha risposto per circa un minuto "Error code: 1042" (propagazione): poi risolto da solo.
  - `/api/health` è pubblico (non richiede login): è solo un controllo tecnico e non espone dati. In S2 confermare se lasciarlo pubblico.
- Azioni richieste al committente: verificare i criteri di accettazione S1 (`npm run dev` in locale, URL di produzione, `/api/health`).

## Decisioni prese durante lo sviluppo
(scostamenti dalla SPEC, con motivo)
- Schema D1: aggiunti vincoli ovvi non indicati nella SPEC (chiavi esterne, CHECK su `role` e `status`, default `active=1`, `failed_attempts=0`, `status='in_corso'`, date in formato ISO UTC). Le date vengono convertite in Europe/Rome solo in visualizzazione.
