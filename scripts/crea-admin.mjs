// Crea il primo amministratore.
//   npm run admin:crea:local   (database locale)
//   npm run admin:crea:remote  (database di produzione)
// Chiede nome, email e password da terminale (la password non viene mostrata né salvata in chiaro).
// Per uso automatico si possono impostare ADMIN_NOME, ADMIN_EMAIL e ADMIN_PASSWORD.
// Con --forza si crea un admin anche se ne esiste già uno.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword, PASSWORD_MIN } from '../src/worker/password.ts';

const DB = 'ricerca-geografica';
const args = process.argv.slice(2);
const remoto = args.includes('--remote');
if (!remoto && !args.includes('--local')) {
  console.error('Indica --local oppure --remote (usa npm run admin:crea:local / admin:crea:remote).');
  process.exit(1);
}
const forza = args.includes('--forza');

let nascondi = false;
const uscita = new Writable({
  write(chunk, _enc, cb) {
    if (!nascondi) process.stdout.write(chunk);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output: uscita, terminal: process.stdin.isTTY });
const chiedi = (domanda) => new Promise((ok) => rl.question(domanda, ok));

function chiediPassword(domanda) {
  return new Promise((ok) => {
    process.stdout.write(domanda);
    nascondi = true;
    rl.question('', (risposta) => {
      nascondi = false;
      process.stdout.write('\n');
      ok(risposta);
    });
  });
}

const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;

function eseguiFile(contenuto, json = false) {
  const dir = mkdtempSync(join(tmpdir(), 'crea-admin-'));
  const file = join(dir, 'query.sql');
  writeFileSync(file, contenuto);
  try {
    const argomenti = ['wrangler', 'd1', 'execute', DB, remoto ? '--remote' : '--local', '--file', file];
    if (json) argomenti.push('--json');
    return spawnSync('npx', argomenti, { encoding: 'utf8', shell: process.platform === 'win32' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`Creazione primo amministratore sul database ${remoto ? 'REMOTO (produzione)' : 'locale'}.`);
  const nome = (process.env.ADMIN_NOME ?? (await chiedi('Nome: '))).trim();
  const email = (process.env.ADMIN_EMAIL ?? (await chiedi('Email: '))).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? (await chiediPassword('Password (min. 10 caratteri): '));
  rl.close();

  if (!nome) throw new Error('Il nome è obbligatorio.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email non valida.');
  if ([...password].length < PASSWORD_MIN) throw new Error(`La password deve avere almeno ${PASSWORD_MIN} caratteri.`);

  const { hash, salt } = await hashPassword(password);
  const condizione = forza ? '' : " WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')";
  const insert =
    `INSERT INTO users (email, name, role, pw_hash, pw_salt) SELECT ${sql(email)}, ${sql(nome)}, 'admin', ${sql(hash)}, ${sql(salt)}` +
    `${condizione};`;
  const r = eseguiFile(insert);
  if (r.status !== 0) {
    const testo = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (/UNIQUE/i.test(testo)) throw new Error('Esiste già un utente con questa email.');
    throw new Error(`Errore da wrangler:\n${testo.split('\n').slice(-12).join('\n')}`);
  }

  const verifica = eseguiFile(
    `SELECT COUNT(*) AS n FROM users WHERE email = ${sql(email)} AND role = 'admin';`,
    true,
  );
  const match = /"n":\s*(\d+)/.exec(verifica.stdout ?? '');
  if (!match || match[1] === '0') {
    throw new Error('Nessun utente creato: esiste già un amministratore (usa --forza per crearne un altro).');
  }
  console.log(`Amministratore creato: ${email}. Ora puoi accedere all'app.`);
}

main().catch((e) => {
  console.error(`\nErrore: ${e.message}`);
  process.exit(1);
});
