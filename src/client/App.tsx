import { useEffect, useState } from 'react';

type Health = { status: string };

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
              ? 'tutto funziona'
              : 'problema con il database'}
      </p>
    </main>
  );
}
