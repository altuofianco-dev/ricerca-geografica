import { useEffect, useState } from 'react';

type Health = { status: string; db: string; tabelle?: number };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setErrore(true));
  }, []);

  return (
    <main>
      <h1>Ciao! Ricerca geografica</h1>
      <p>
        Stato del sistema:{' '}
        {errore
          ? 'impossibile contattare il server'
          : !health
            ? 'verifica in corso…'
            : health.status === 'ok'
              ? `tutto funziona (database collegato, ${health.tabelle} tabelle)`
              : 'problema con il database'}
      </p>
    </main>
  );
}
