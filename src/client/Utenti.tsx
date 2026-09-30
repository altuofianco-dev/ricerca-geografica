import { useCallback, useEffect, useState } from 'react';
import { api, formattaData, messaggioErrore, type Utente, type UtenteElenco } from './api';

const PASSWORD_MIN = 10;

export default function Utenti({ io }: { io: Utente }) {
  const [elenco, setElenco] = useState<UtenteElenco[]>([]);
  const [errore, setErrore] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [nuovaPasswordPer, setNuovaPasswordPer] = useState<number | null>(null);
  const [passwordNuova, setPasswordNuova] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'operatore', password: '' });

  const carica = useCallback(async () => {
    try {
      setElenco(await api<UtenteElenco[]>('/api/utenti'));
    } catch (e) {
      setErrore(messaggioErrore(e));
    }
  }, []);
  useEffect(() => {
    void carica();
  }, [carica]);

  async function azione(fn: () => Promise<unknown>, ok: string) {
    setErrore('');
    setMessaggio('');
    try {
      await fn();
      setMessaggio(ok);
      await carica();
      return true;
    } catch (e) {
      setErrore(messaggioErrore(e));
      return false;
    }
  }

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    if (await azione(() => api('/api/utenti', form), 'Utente creato')) {
      setForm({ name: '', email: '', role: 'operatore', password: '' });
    }
  }

  async function salvaPassword(e: React.FormEvent) {
    e.preventDefault();
    if (await azione(() => api(`/api/utenti/${nuovaPasswordPer}/password`, { password: passwordNuova }), 'Password aggiornata: le sessioni aperte dell’utente sono state chiuse')) {
      setNuovaPasswordPer(null);
      setPasswordNuova('');
    }
  }

  function cambiaStato(u: UtenteElenco) {
    const attiva = !u.active;
    const domanda = attiva
      ? `Riattivare ${u.name}?`
      : `Disattivare ${u.name}? Verrà disconnesso subito e non potrà più accedere. Le sue ricerche restano visibili.`;
    if (!window.confirm(domanda)) return;
    void azione(
      () => api(`/api/utenti/${u.id}/${attiva ? 'riattiva' : 'disattiva'}`, {}),
      attiva ? 'Utente riattivato' : 'Utente disattivato',
    );
  }

  return (
    <>
      <h2>Gestione utenti</h2>
      {messaggio && <p className="ok" role="status">{messaggio}</p>}
      {errore && <p className="errore" role="alert">{errore}</p>}

      <table>
        <thead>
          <tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Creato il</th><th>Azioni</th></tr>
        </thead>
        <tbody>
          {elenco.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'disattivo'}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role === 'admin' ? 'Amministratore' : 'Operatore'}</td>
              <td>{u.active ? 'Attivo' : 'Disattivato'}</td>
              <td>{formattaData(u.created_at)}</td>
              <td className="azioni">
                <button type="button" onClick={() => { setNuovaPasswordPer(u.id); setPasswordNuova(''); }}>Nuova password</button>
                {u.id !== io.id && (
                  <button type="button" onClick={() => cambiaStato(u)}>{u.active ? 'Disattiva' : 'Riattiva'}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {nuovaPasswordPer !== null && (
        <form className="scheda" onSubmit={salvaPassword}>
          <h3>Nuova password per {elenco.find((u) => u.id === nuovaPasswordPer)?.name}</h3>
          <label>
            Password (almeno {PASSWORD_MIN} caratteri)
            <input type="text" value={passwordNuova} onChange={(e) => setPasswordNuova(e.target.value)} minLength={PASSWORD_MIN} autoComplete="off" required />
          </label>
          <div className="riga">
            <button type="submit">Salva</button>
            <button type="button" onClick={() => setNuovaPasswordPer(null)}>Annulla</button>
          </div>
        </form>
      )}

      <form className="scheda" onSubmit={crea}>
        <h3>Nuovo utente</h3>
        <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>
          Ruolo
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="operatore">Operatore</option>
            <option value="admin">Amministratore</option>
          </select>
        </label>
        <label>
          Password (almeno {PASSWORD_MIN} caratteri)
          <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={PASSWORD_MIN} autoComplete="off" required />
        </label>
        <button type="submit">Crea utente</button>
      </form>
    </>
  );
}
