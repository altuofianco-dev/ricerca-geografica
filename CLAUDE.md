# Istruzioni per Claude Code

## Contesto
Web app interna di ricerca attività tramite Google Places API (New).
Requisiti: `SPEC.md` (fonte di verità). Piano: `PIANO.md`. Avanzamento: `STATO.md`.
Il committente non scrive codice: spiega in italiano semplice cosa gli chiedi di fare.

## Modo di lavorare
- Esegui SOLO la sessione indicata nel prompt. Non anticipare sessioni future.
- Prima di scrivere codice proponi un piano breve e attendi approvazione.
- Se un requisito è ambiguo o in conflitto con la SPEC, chiedi invece di inventare.
- Commit piccoli e frequenti, messaggi in italiano (`feat:`, `fix:`, `test:`, `docs:`).
- A fine sessione (o se stai per esaurire l'utilizzo): aggiorna `STATO.md`, fai commit e push.

## Risparmio di utilizzo
- Non rileggere file già letti se non sono cambiati; leggi solo i file necessari.
- Niente refactoring o migliorie non richieste.
- Output dei comandi: usa filtri (`| tail`, `| head`) per log lunghi.
- Dopo 3 tentativi falliti sullo stesso errore: fermati, scrivi il problema in `STATO.md` e avvisa.

## Stack e comandi
- Cloudflare Workers (static assets) + D1, Hono, React + Vite, TypeScript.
- `npm run dev` — sviluppo locale · `npm test` — Vitest · `npm run deploy` — pubblicazione.
- Migrazioni: `wrangler d1 migrations create|apply` (locale con `--local`, remoto con `--remote`).

## Regole vincolanti
- **Segreti**: la chiave Google sta solo in `.dev.vars` (locale) e come secret Wrangler (remoto). Mai nel codice, nei log, nei commit o nelle risposte. `.dev.vars` deve essere in `.gitignore`.
- **Costi Google**: ogni ricerca reale costa. Chiedi conferma prima di ogni chiamata reale a Google; nei test usa dati finti (mock).
- **Password**: PBKDF2-SHA256 Web Crypto, 100.000 iterazioni. Niente bcrypt/argon2.
- Ogni endpoint `/api/*` (tranne login e `/api/health`) richiede sessione valida; `/api/health` è pubblico ma risponde solo ok/errore, senza dettagli; gli endpoint admin controllano il ruolo lato server.
- Testi dell'interfaccia in italiano; date in Europe/Rome.
- Dipendenze: il minimo indispensabile. Chiedi prima di aggiungerne di nuove.
