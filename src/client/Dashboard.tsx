import { useEffect, useState } from 'react';
import { api, formattaMedia, messaggioErrore } from './api';
import { Caricamento, Errore } from './Stati';

type Periodo = '30giorni' | 'anno' | 'tutto';

interface Dati {
  ricerche: number;
  risultati: number;
  media: number | null;
  perOperatore: { id: number; nome: string; attivo: number; ricerche: number; risultati: number }[];
}

const numero = (n: number) => new Intl.NumberFormat('it-IT').format(n);

export default function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>('30giorni');
  const [dati, setDati] = useState<Dati | null>(null);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    let annullata = false;
    setDati(null);
    setErrore('');
    api<Dati>(`/api/dashboard?periodo=${periodo}`)
      .then((r) => !annullata && setDati(r))
      .catch((e) => !annullata && setErrore(messaggioErrore(e)));
    return () => {
      annullata = true;
    };
  }, [periodo]);

  return (
    <>
      <h1>Dashboard</h1>
      <div className="scheda filtri">
        <label>
          Periodo
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            <option value="30giorni">Ultimi 30 giorni</option>
            <option value="anno">Anno corrente</option>
            <option value="tutto">Tutto</option>
          </select>
        </label>
      </div>

      {errore && <Errore testo={errore} />}
      {!dati && !errore && <Caricamento />}

      {dati && (
        <>
          <div className="riquadri">
            <div className="scheda">
              <h2>Ricerche effettuate</h2>
              <p className="cifra">{numero(dati.ricerche)}</p>
            </div>
            <div className="scheda">
              <h2>Risultati ottenuti</h2>
              <p className="cifra">{numero(dati.risultati)}</p>
            </div>
            <div className="scheda">
              <h2>Media risultati per ricerca</h2>
              <p className="cifra">{formattaMedia(dati.media)}</p>
            </div>
          </div>

          <div className="scorri">
            <table>
              <thead>
                <tr>
                  <th>Operatore</th>
                  <th>Ricerche</th>
                  <th>Risultati</th>
                </tr>
              </thead>
              <tbody>
                {dati.perOperatore.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.nome}
                      {o.attivo ? '' : ' (disattivato)'}
                    </td>
                    <td>{numero(o.ricerche)}</td>
                    <td>{numero(o.risultati)}</td>
                  </tr>
                ))}
                {dati.perOperatore.length === 0 && (
                  <tr>
                    <td colSpan={3}>Nessuna ricerca nel periodo</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
