import { useEffect, useState } from 'react';
import { api, impostaSessioneScaduta, type Utente } from './api';
import Dashboard from './Dashboard';
import DettaglioRicerca from './DettaglioRicerca';
import ElencoRicerche from './ElencoRicerche';
import Login from './Login';
import { Caricamento } from './Stati';
import NuovaRicerca from './NuovaRicerca';
import Utenti from './Utenti';

type Pagina = 'home' | 'elenco' | 'dashboard' | 'utenti';

export default function App() {
  const [utente, setUtente] = useState<Utente | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [pagina, setPagina] = useState<Pagina>('home');
  const [aperta, setAperta] = useState<number | null>(null);

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
    setAperta(null);
  }

  function vai(p: Pagina) {
    setPagina(p);
    setAperta(null);
  }

  if (caricamento) return <main><Caricamento /></main>;
  if (!utente) return <Login onAccesso={setUtente} />;

  return (
    <>
      <header className="barra">
        <strong>Ricerca geografica</strong>
        <nav>
          <button type="button" className={pagina === 'home' ? 'attiva' : ''} onClick={() => vai('home')}>Nuova ricerca</button>
          <button type="button" className={pagina === 'elenco' ? 'attiva' : ''} onClick={() => vai('elenco')}>Elenco ricerche</button>
          <button type="button" className={pagina === 'dashboard' ? 'attiva' : ''} onClick={() => vai('dashboard')}>Dashboard</button>
          {utente.role === 'admin' && (
            <button type="button" className={pagina === 'utenti' ? 'attiva' : ''} onClick={() => vai('utenti')}>Utenti</button>
          )}
        </nav>
        <span className="spazio" />
        <span>{utente.name}</span>
        <button type="button" onClick={esci}>Esci</button>
      </header>
      <main>
        {pagina === 'utenti' && utente.role === 'admin' ? (
          <Utenti io={utente} />
        ) : pagina === 'dashboard' ? (
          <Dashboard />
        ) : pagina === 'elenco' ? (
          aperta === null ? (
            <ElencoRicerche onApri={setAperta} />
          ) : (
            <DettaglioRicerca id={aperta} onIndietro={() => setAperta(null)} />
          )
        ) : (
          <NuovaRicerca />
        )}
      </main>
    </>
  );
}
