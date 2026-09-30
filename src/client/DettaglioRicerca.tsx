import { useEffect, useState } from 'react';
import { api, formattaData, messaggioErrore, testoErroreRicerca } from './api';
import { Caricamento, Errore, EtichettaStato, LinkMaps, SitoWeb, Telefono } from './Stati';
import { csvRisultati, etichette, etichetteRisultato, formatoCoordinate, scaricaCsv, type LuogoCsv } from './csv';

interface LuogoSalvato extends LuogoCsv {
  recuperatoIl: string;
  recuperato: boolean;
}

interface Dettaglio {
  id: number;
  created_at: string;
  operatore: string;
  address_text: string;
  radius_km: number;
  categorie: string[];
  include_contacts: boolean;
  status: string;
  result_count: number | null;
  api_calls: number | null;
  saturated_calls: number | null;
  error_message: string | null;
  risultati: LuogoSalvato[];
}

const decimale = (n: number) => String(n).replace('.', ',');

export default function DettaglioRicerca({ id, onIndietro }: { id: number; onIndietro: () => void }) {
  const [d, setD] = useState<Dettaglio | null>(null);
  const [errore, setErrore] = useState('');
  // Un solo recupero alla volta per riga (e mai due insieme): ogni chiamata è a pagamento.
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [erroreRiga, setErroreRiga] = useState<{ placeId: string; testo: string } | null>(null);

  useEffect(() => {
    api<Dettaglio>(`/api/ricerche/${id}`).then(setD).catch((e) => setErrore(messaggioErrore(e)));
  }, [id]);

  async function recupera(placeId: string) {
    if (inCorso) return;
    setInCorso(placeId);
    setErroreRiga(null);
    try {
      const r = await api<LuogoSalvato>(`/api/ricerche/${id}/dettagli`, { placeId });
      setD((corrente) =>
        corrente ? { ...corrente, risultati: corrente.risultati.map((l) => (l.placeId === placeId ? r : l)) } : corrente,
      );
    } catch (e) {
      setErroreRiga({ placeId, testo: messaggioErrore(e) });
    } finally {
      setInCorso(null);
    }
  }

  return (
    <>
      <div className="azioni">
        <button type="button" onClick={onIndietro}>← Elenco ricerche</button>
      </div>
      {errore && <Errore testo={errore} />}
      {!d && !errore && <Caricamento />}
      {d && (
        <>
          <h1>Ricerca del {formattaData(d.created_at)}</h1>
          <dl className="scheda parametri">
            <dt>Operatore</dt><dd>{d.operatore}</dd>
            <dt>Indirizzo di partenza</dt><dd>{d.address_text}</dd>
            <dt>Raggio</dt><dd>{decimale(d.radius_km)} km</dd>
            <dt>Categorie</dt><dd>{etichette(d.categorie) || '—'}</dd>
            <dt>Telefono e sito web</dt><dd>{d.include_contacts ? 'Inclusi' : 'Non inclusi'}</dd>
            <dt>Stato</dt><dd><EtichettaStato stato={d.status} /></dd>
            <dt>Chiamate Google</dt><dd>{d.api_calls ?? 0} (sature: {d.saturated_calls ?? 0})</dd>
          </dl>
          {d.error_message && <p className="avviso">{testoErroreRicerca(d.error_message)}</p>}
          {(d.saturated_calls ?? 0) > 0 && (
            <p className="avviso">Alcune zone hanno raggiunto il limite di 20 risultati: l’elenco potrebbe essere incompleto</p>
          )}

          <h2>Risultati: {d.risultati.length}</h2>
          <div className="azioni">
            <button type="button" disabled={d.risultati.length === 0} onClick={() => scaricaCsv(`ricerca-${d.id}.csv`, csvRisultati(d.risultati))}>
              Scarica CSV
            </button>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.risultati.map((l) => (
                  <tr key={l.placeId}>
                    <td>{l.nome ?? ''}</td>
                    <td><LinkMaps nome={l.nome} indirizzo={l.indirizzo} placeId={l.placeId} /></td>
                    <td className="unariga">{formatoCoordinate(l.lat, l.lng)}</td>
                    <td>{etichetteRisultato(l.tipi)}</td>
                    <td className="unariga"><Telefono numero={l.telefono} /></td>
                    <td className="unariga"><SitoWeb url={l.sito} /></td>
                    <td className="placeid" title={l.placeId}>{l.placeId}</td>
                    <td>
                      <button type="button" className="piccolo" disabled={inCorso !== null} onClick={() => void recupera(l.placeId)}>
                        {inCorso === l.placeId ? 'Recupero…' : d.include_contacts || l.recuperato ? 'Aggiorna' : 'Recupera dettagli'}
                      </button>
                      {erroreRiga?.placeId === l.placeId && <p className="errore">{erroreRiga.testo}</p>}
                    </td>
                  </tr>
                ))}
                {d.risultati.length === 0 && (
                  <tr>
                    <td colSpan={8}>Nessun risultato salvato</td>
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
