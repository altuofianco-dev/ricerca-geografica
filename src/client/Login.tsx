import { useState } from 'react';
import { api, messaggioErrore, type Utente } from './api';

export default function Login({ onAccesso }: { onAccesso: (u: Utente) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      onAccesso(await api<Utente>('/api/login', { email, password }));
    } catch (err) {
      setErrore(messaggioErrore(err));
      setInvio(false);
    }
  }

  return (
    <main className="stretta">
      <h1>Ricerca geografica</h1>
      <form className="scheda" onSubmit={invia}>
        <h2>Accedi</h2>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {errore && <p className="errore" role="alert">{errore}</p>}
        <button type="submit" disabled={invio}>{invio ? 'Accesso in corso…' : 'Accedi'}</button>
      </form>
    </main>
  );
}
