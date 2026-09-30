import { useEffect, useRef, useState } from 'react';
import { api, messaggioErrore } from './api';
import { csvRisultati, etichetteRisultato, formatoCoordinate, scaricaCsv } from './csv';
import SelettoreCategorie from './SelettoreCategorie';
import { LinkMaps, SitoWeb, Telefono } from './Stati';

interface Suggerimento {
  placeId: string;
  testo: string;
}

interface Luogo {
  placeId: string;
  nome: string;
  indirizzo: string;
  tipi: string[];
  telefono: string | null;
  sito: string | null;
  lat: number;
  lng: number;
}

interface Esito {
  id: number;
  risultati: Luogo[];
  chiamate: number;
  chiamateSature: number;
  errori: string[];
  contatti: boolean;
}

const nuovaSessione = () => crypto.randomUUID();

export default function NuovaRicerca() {
  const [testo, setTesto] = useState('');
  const [scelto, setScelto] = useState<{ placeId: string; testo: string; lat: number; lng: number } | null>(null);
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[]>([]);
  const [erroreIndirizzo, setErroreIndirizzo] = useState('');
  const sessione = useRef(nuovaSessione());
  const [raggio, setRaggio] = useState('1');
  const [categorie, setCategorie] = useState<string[]>([]);
  const [contatti, setContatti] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState<Esito | null>(null);

  // Suggerimenti dell'indirizzo: attesa di 300 ms dopo l'ultimo tasto, minimo 3 caratteri.
  useEffect(() => {
    const t = testo.trim();
    if (scelto || t.length < 3) {
      setSuggerimenti([]);
      return;
    }
    let annullata = false;
    const timer = setTimeout(() => {
      api<{ suggerimenti: Suggerimento[] }>(
        `/api/luoghi/suggerimenti?testo=${encodeURIComponent(t)}&sessione=${sessione.current}`,
      )
        .then((r) => {
          if (annullata) return;
          setSuggerimenti(r.suggerimenti);
          setErroreIndirizzo('');
        })
        .catch((e) => !annullata && setErroreIndirizzo(messaggioErrore(e)));
    }, 300);
    return () => {
      annullata = true;
      clearTimeout(timer);
    };
  }, [testo, scelto]);

  async function scegliIndirizzo(s: Suggerimento) {
    setSuggerimenti([]);
    setTesto(s.testo);
    setErroreIndirizzo('');
    try {
      const c = await api<{ lat: number; lng: number }>(
        `/api/luoghi/coordinate?placeId=${encodeURIComponent(s.placeId)}&sessione=${sessione.current}`,
      );
      setScelto({ placeId: s.placeId, testo: s.testo, ...c });
    } catch (e) {
      setErroreIndirizzo(messaggioErrore(e));
    } finally {
      sessione.current = nuovaSessione(); // il token vale per una sola sessione di digitazione
    }
  }

  const raggioNum = Number(raggio.replace(',', '.'));
  const raggioValido = raggioNum >= 0.5 && raggioNum <= 50 && Number.isInteger(raggioNum * 2);
  const pronto = !!scelto && raggioValido && categorie.length >= 1 && !inCorso;

  async function cerca(e: React.FormEvent) {
    e.preventDefault();
    if (!pronto || !scelto) return;
    setInCorso(true);
    setErrore('');
    setEsito(null);
    try {
      const r = await api<Omit<Esito, 'contatti'>>('/api/ricerche', {
        indirizzo: scelto.testo,
        placeId: scelto.placeId,
        lat: scelto.lat,
        lng: scelto.lng,
        raggioKm: raggioNum,
        categorie,
        conContatti: contatti,
      });
      setEsito({ ...r, contatti });
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  function scarica(x: Esito) {
    scaricaCsv(`ricerca-${x.id}.csv`, csvRisultati(x.risultati));
  }

  return (
    <>
      <h1>Nuova ricerca</h1>
      <form className="scheda" onSubmit={cerca}>
        <div className="indirizzo-raggio">
          <label className="campo-indirizzo">
            Indirizzo
            <input
              value={testo}
              onChange={(e) => {
                setTesto(e.target.value);
                setScelto(null);
              }}
              placeholder="Scrivi almeno 3 caratteri"
              autoComplete="off"
              disabled={inCorso}
            />
          </label>
          <label className="campo-raggio">
            Raggio (km)
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={raggio}
              onChange={(e) => setRaggio(e.target.value)}
              disabled={inCorso}
              title="Da 0,5 a 50 km, a passi di 0,5"
            />
          </label>
        </div>
        {suggerimenti.length > 0 && (
          <ul className="suggerimenti">
            {suggerimenti.map((s) => (
              <li key={s.placeId}>
                <button type="button" onClick={() => void scegliIndirizzo(s)}>{s.testo}</button>
              </li>
            ))}
          </ul>
        )}
        {erroreIndirizzo && <p className="errore">{erroreIndirizzo}</p>}
        {scelto && <p className="ok">Indirizzo selezionato ({scelto.lat.toFixed(5).replace('.', ',')}; {scelto.lng.toFixed(5).replace('.', ',')})</p>}

        {!raggioValido && <p className="errore">Il raggio deve essere tra 0,5 e 50 km, a passi di 0,5</p>}

        <SelettoreCategorie scelte={categorie} onChange={setCategorie} disabled={inCorso} />

        <label className="casella">
          <input type="checkbox" checked={contatti} onChange={(e) => setContatti(e.target.checked)} disabled={inCorso} />
          Includi telefono e sito web
        </label>
        <small>Aumenta il costo delle chiamate Google</small>

        <div className="azioni">
          <button type="submit" disabled={!pronto}>{inCorso ? 'Ricerca in corso…' : 'Avvia ricerca'}</button>
        </div>
      </form>

      {errore && <p className="errore">{errore}</p>}

      {esito && (
        <section>
          <h2>Risultati: {esito.risultati.length}</h2>
          {esito.chiamateSature > 0 && (
            <p className="avviso">Alcune zone hanno raggiunto il limite di 20 risultati: l’elenco potrebbe essere incompleto</p>
          )}
          {esito.errori.length > 0 && (
            <p className="avviso">
              {esito.errori.length} chiamate a Google su {esito.chiamate} non sono riuscite: l’elenco potrebbe essere incompleto.
              ({esito.errori.join('; ')})
            </p>
          )}
          <div className="azioni">
            <button type="button" onClick={() => scarica(esito)} disabled={esito.risultati.length === 0}>Scarica CSV</button>
          </div>
          <div className="scorri">
            <table>
              <thead>
                <tr>
                  <th>Denominazione</th>
                  <th>Indirizzo</th>
                  <th>Coordinate</th>
                  <th>Categorie</th>
                  <th>Telefono</th>
                  <th>Sito web</th>
                  <th>Place ID</th>
                </tr>
              </thead>
              <tbody>
                {esito.risultati.map((l) => (
                  <tr key={l.placeId}>
                    <td>{l.nome}</td>
                    <td><LinkMaps nome={l.nome} indirizzo={l.indirizzo} placeId={l.placeId} /></td>
                    <td className="unariga">{formatoCoordinate(l.lat, l.lng)}</td>
                    <td>{etichetteRisultato(l.tipi)}</td>
                    <td className="unariga"><Telefono numero={l.telefono} /></td>
                    <td className="unariga"><SitoWeb url={l.sito} /></td>
                    <td className="placeid" title={l.placeId}>{l.placeId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
