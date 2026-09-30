import { useEffect, useState } from 'react';
import { api, impostaSessioneScaduta, type Utente } from './api';
import Dashboard from './Dashboard';
import DettaglioRicerca from './DettaglioRicerca';
import ElencoRicerche from './ElencoRicerche';
import PaginaCategorie from './PaginaCategorie';
import { dimenticaCategorie } from './elencoCategorie';
import { IconaCategorie, IconaDashboard, IconaElenco, IconaEsci, IconaNuova, IconaUtenti } from './Icone';
import Login from './Login';
import { Caricamento } from './Stati';
import NuovaRicerca from './NuovaRicerca';
import Utenti from './Utenti';

type Pagina = 'home' | 'elenco' | 'dashboard' | 'categorie' | 'utenti';

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
    dimenticaCategorie();
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
    <div className="app">
      <aside className="laterale">
        <div className="marchio">
          <img src="/logo-altuofianco.svg" alt="" width="32" height="36" />
          <strong>Ricerca geografica</strong>
        </div>
        <nav>
          <button type="button" title="Nuova ricerca" className={pagina === 'home' ? 'attiva' : ''} onClick={() => vai('home')}>
            <IconaNuova /><span>Nuova ricerca</span>
          </button>
          <button type="button" title="Elenco ricerche" className={pagina === 'elenco' ? 'attiva' : ''} onClick={() => vai('elenco')}>
            <IconaElenco /><span>Elenco ricerche</span>
          </button>
          <button type="button" title="Dashboard" className={pagina === 'dashboard' ? 'attiva' : ''} onClick={() => vai('dashboard')}>
            <IconaDashboard /><span>Dashboard</span>
          </button>
          {utente.role === 'admin' && (
            <button type="button" title="Categorie" className={pagina === 'categorie' ? 'attiva' : ''} onClick={() => vai('categorie')}>
              <IconaCategorie /><span>Categorie</span>
            </button>
          )}
          {utente.role === 'admin' && (
            <button type="button" title="Utenti" className={pagina === 'utenti' ? 'attiva' : ''} onClick={() => vai('utenti')}>
              <IconaUtenti /><span>Utenti</span>
            </button>
          )}
        </nav>
        <div className="utente">
          <div className="dati-utente">
            <strong>{utente.name}</strong>
            <span>{utente.role === 'admin' ? 'Amministratore' : 'Operatore'}</span>
          </div>
          <button type="button" title="Esci" onClick={esci}>
            <IconaEsci /><span>Esci</span>
          </button>
        </div>
      </aside>
      <main>
        {pagina === 'utenti' && utente.role === 'admin' ? (
          <Utenti io={utente} />
        ) : pagina === 'categorie' && utente.role === 'admin' ? (
          <PaginaCategorie />
        ) : pagina === 'dashboard' ? (
          <Dashboard />
        ) : pagina === 'elenco' ? (
          aperta === null ? (
            <ElencoRicerche onApri={setAperta} admin={utente.role === 'admin'} />
          ) : (
            <DettaglioRicerca id={aperta} onIndietro={() => setAperta(null)} />
          )
        ) : (
          <NuovaRicerca />
        )}
      </main>
    </div>
  );
}
