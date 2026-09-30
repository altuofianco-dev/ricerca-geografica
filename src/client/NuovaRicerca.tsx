import { useEffect, useMemo, useRef, useState } from 'react';
import tipiIt from '../data/place-types.it.json';
import { api, messaggioErrore } from './api';
import { csvRisultati, etichette, scaricaCsv } from './csv';

const TIPI = tipiIt as { type: string; label: string }[];
const ETICHETTE = new Map(TIPI.map((t) => [t.type, t.label]));
const MAX_CATEGORIE = 50;

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
const senzaAccenti = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function NuovaRicerca() {
  const [testo, setTesto] = useState('');
  const [scelto, setScelto] = useState<{ placeId: string; testo: string; lat: number; lng: number } | null>(null);
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[]>([]);
  const [erroreIndirizzo, setErroreIndirizzo] = useState('');
  const sessione = useRef(nuovaSessione());
  const [raggio, setRaggio] = useState('1');
  const [categorie, setCategorie] = useState<string[]>([]);
  const [filtro, setFiltro] = useState('');
  const [contatti, setContatti] = useState(false);
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

  const tipiFiltrati = useMemo(() => {
    const f = senzaAccenti(filtro.trim());
    if (!f) return [];
    return TIPI.filter((t) => !categorie.includes(t.type) && senzaAccenti(t.label).includes(f)).slice(0, 12);
  }, [filtro, categorie]);

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
        <label>
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

        <label>
          Raggio (km, da 0,5 a 50, a passi di 0,5)
          <input
            type="number"
            min={0.5}
            max={50}
            step={0.5}
            value={raggio}
            onChange={(e) => setRaggio(e.target.value)}
            disabled={inCorso}
          />
        </label>
        {!raggioValido && <p className="errore">Il raggio deve essere tra 0,5 e 50 km, a passi di 0,5</p>}

        <label>
          Categorie ({categorie.length}/{MAX_CATEGORIE})
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Cerca una categoria, es. farmacia"
            disabled={inCorso}
          />
        </label>
        {tipiFiltrati.length > 0 && (
          <ul className="suggerimenti">
            {tipiFiltrati.map((t) => (
              <li key={t.type}>
                <button
                  type="button"
                  disabled={categorie.length >= MAX_CATEGORIE}
                  onClick={() => {
                    setCategorie([...categorie, t.type]);
                    setFiltro('');
                  }}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {categorie.length >= MAX_CATEGORIE && <p className="errore">Hai raggiunto il massimo di {MAX_CATEGORIE} categorie</p>}
        <div className="riga">
          {categorie.map((c) => (
            <button key={c} type="button" className="chip" disabled={inCorso} onClick={() => setCategorie(categorie.filter((x) => x !== c))}>
              {ETICHETTE.get(c) ?? c} ✕
            </button>
          ))}
        </div>

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
                    <td>{l.indirizzo}</td>
                    <td>{etichette(l.tipi)}</td>
                    <td>{l.telefono ?? ''}</td>
                    <td>
                      {l.sito && /^https?:\/\//i.test(l.sito) ? (
                        <a href={l.sito} target="_blank" rel="noopener noreferrer">{l.sito}</a>
                      ) : (
                        ''
                      )}
                    </td>
                    <td>{l.placeId}</td>
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
