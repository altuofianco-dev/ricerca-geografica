import { useEffect, useState } from 'react';
import { api, impostaSessioneScaduta, type Utente } from './api';
import Login from './Login';
import Utenti from './Utenti';

type Pagina = 'home' | 'utenti';

export default function App() {
  const [utente, setUtente] = useState<Utente | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [pagina, setPagina] = useState<Pagina>('home');

  useEffect(() => {
    impostaSessioneScaduta(() => setUtente(null));
    api<Utente>('/api/me')
      .then(setUtente)
      .catch(() => setUtente(null))
      .finally(() => setCaricamento(false));
  }, []);

  async function esci() {
    await api('/api/logout', {}).catch(() => {});
    setUtente(null);
    setPagina('home');
  }

  if (caricamento) return <main><p>Caricamento…</p></main>;
  if (!utente) return <Login onAccesso={setUtente} />;

  return (
    <>
      <header className="barra">
        <strong>Ricerca geografica</strong>
        <nav>
          <button type="button" className={pagina === 'home' ? 'attiva' : ''} onClick={() => setPagina('home')}>Home</button>
          {utente.role === 'admin' && (
            <button type="button" className={pagina === 'utenti' ? 'attiva' : ''} onClick={() => setPagina('utenti')}>Utenti</button>
          )}
        </nav>
        <span className="spazio" />
        <span>{utente.name}</span>
        <button type="button" onClick={esci}>Esci</button>
      </header>
      <main>
        {pagina === 'utenti' && utente.role === 'admin' ? (
          <Utenti io={utente} />
        ) : (
          <>
            <h1>Ciao, {utente.name}!</h1>
            <p>Le sezioni Dashboard e Ricerche arriveranno nelle prossime sessioni.</p>
          </>
        )}
      </main>
    </>
  );
}
