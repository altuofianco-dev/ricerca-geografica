import { useEffect, useState } from 'react';
import { api, formattaData, messaggioErrore } from './api';
import { Caricamento, Errore, EtichettaStato } from './Stati';

interface Riga {
  id: number;
  created_at: string;
  address_text: string;
  radius_km: number;
  result_count: number | null;
  status: string;
  operatore: string;
}

interface Operatore {
  id: number;
  name: string;
  active: number;
}

interface Pagina {
  righe: Riga[];
  totale: number;
  pagina: number;
  perPagina: number;
}

const decimale = (n: number) => String(n).replace('.', ',');

export default function ElencoRicerche({ onApri, admin }: { onApri: (id: number) => void; admin: boolean }) {
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [dal, setDal] = useState('');
  const [al, setAl] = useState('');
  const [operatore, setOperatore] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dati, setDati] = useState<Pagina | null>(null);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (admin) api<Operatore[]>('/api/operatori').then(setOperatori).catch(() => {});
  }, [admin]);

  useEffect(() => {
    let annullata = false;
    const q = new URLSearchParams({ pagina: String(pagina) });
    if (dal) q.set('dal', dal);
    if (al) q.set('al', al);
    if (admin && operatore) q.set('operatore', operatore);
    api<Pagina>(`/api/ricerche?${q}`)
      .then((r) => {
        if (annullata) return;
        setDati(r);
        setErrore('');
      })
      .catch((e) => !annullata && setErrore(messaggioErrore(e)));
    return () => {
      annullata = true;
    };
  }, [dal, al, operatore, pagina, admin]);

  const cambia = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    f(e.target.value);
    setPagina(1);
  };

  const pagineTotali = dati ? Math.max(1, Math.ceil(dati.totale / dati.perPagina)) : 1;

  return (
    <>
      <h1>Elenco ricerche</h1>
      <div className="scheda filtri">
        <label>
          Dal
          <input type="date" value={dal} max={al || undefined} onChange={cambia(setDal)} />
        </label>
        <label>
          Al
          <input type="date" value={al} min={dal || undefined} onChange={cambia(setAl)} />
        </label>
        {admin && (
          <label>
            Operatore
            <select value={operatore} onChange={cambia(setOperatore)}>
              <option value="">Tutti</option>
              {operatori.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.active ? '' : ' (disattivato)'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {errore && <Errore testo={errore} />}
      {!dati && !errore && <Caricamento />}

      {dati && (
        <section>
          <p>Ricerche trovate: {dati.totale}</p>
          <div className="scorri">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  {admin && <th>Operatore</th>}
                  <th>Indirizzo di partenza</th>
                  <th className="num">Raggio (km)</th>
                  <th className="num">Risultati</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dati.righe.map((r) => (
                  <tr key={r.id} className="cliccabile" onClick={() => onApri(r.id)}>
                    <td className="unariga">{formattaData(r.created_at)}</td>
                    {admin && <td>{r.operatore}</td>}
                    <td>{r.address_text}</td>
                    <td className="num">{decimale(r.radius_km)}</td>
                    <td className="num">
                      {r.status === 'completata' ? (r.result_count ?? 0) : <EtichettaStato stato={r.status} />}
                    </td>
                    <td>
                      <button type="button" onClick={(e) => { e.stopPropagation(); onApri(r.id); }}>Apri</button>
                    </td>
                  </tr>
                ))}
                {dati.righe.length === 0 && (
                  <tr>
                    <td colSpan={admin ? 6 : 5}>Nessuna ricerca trovata</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="azioni">
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Precedente</button>
            <span>Pagina {dati.pagina} di {pagineTotali}</span>
            <button type="button" disabled={pagina >= pagineTotali} onClick={() => setPagina(pagina + 1)}>Successiva</button>
          </div>
        </section>
      )}
    </>
  );
}
