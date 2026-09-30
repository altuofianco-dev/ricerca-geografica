import { useState } from 'react';
import { api, messaggioErrore } from './api';
import { dividiSinonimi, raggruppa, type Tipo } from './categorie';
import { useCategorie } from './elencoCategorie';
import { Caricamento, Errore } from './Stati';

// Pagina "Categorie" (solo admin, SPEC §5): si modificano etichetta, sinonimi e ordine nel gruppo.
// Il codice Google è di sola lettura; non si aggiungono né si eliminano categorie.

function Riga(p: {
  tipo: Tipo;
  primo: boolean;
  ultimo: boolean;
  occupato: boolean;
  onSalva: (t: Tipo, label: string, parole: string[]) => Promise<void>;
  onSposta: (t: Tipo, direzione: 'su' | 'giu') => Promise<void>;
}) {
  const { tipo } = p;
  const [label, setLabel] = useState(tipo.label);
  const [sinonimi, setSinonimi] = useState((tipo.parole ?? []).join(', '));
  const modificata = label !== tipo.label || sinonimi !== (tipo.parole ?? []).join(', ');

  return (
    <tr>
      <td>
        <code>{tipo.type}</code>
      </td>
      <td>
        <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label={`Etichetta di ${tipo.type}`} maxLength={100} />
      </td>
      <td>
        <input value={sinonimi} onChange={(e) => setSinonimi(e.target.value)} aria-label={`Sinonimi di ${tipo.type}`} placeholder="separati da virgola" />
      </td>
      <td className="unariga">
        <button type="button" className="piccolo" disabled={p.occupato || p.primo} title="Sposta su" aria-label={`Sposta su ${tipo.label}`} onClick={() => void p.onSposta(tipo, 'su')}>
          ▲
        </button>{' '}
        <button type="button" className="piccolo" disabled={p.occupato || p.ultimo} title="Sposta giù" aria-label={`Sposta giù ${tipo.label}`} onClick={() => void p.onSposta(tipo, 'giu')}>
          ▼
        </button>
      </td>
      <td>
        <button type="button" className="piccolo" disabled={p.occupato || !modificata || !label.trim()} onClick={() => void p.onSalva(tipo, label, dividiSinonimi(sinonimi))}>
          Salva
        </button>
      </td>
    </tr>
  );
}

export default function PaginaCategorie() {
  const { tipi, errore, ricarica } = useCategorie();
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [occupato, setOccupato] = useState(false);
  const [conferma, setConferma] = useState('');
  const [erroreAzione, setErroreAzione] = useState('');

  async function esegui(fn: () => Promise<unknown>, ok: string) {
    setOccupato(true);
    setConferma('');
    setErroreAzione('');
    try {
      await fn();
      await ricarica();
      setConferma(ok);
    } catch (e) {
      setErroreAzione(messaggioErrore(e));
    } finally {
      setOccupato(false);
    }
  }

  const salva = (t: Tipo, label: string, parole: string[]) =>
    esegui(() => api(`/api/categorie/${encodeURIComponent(t.type)}`, { label, parole }), `Categoria salvata: ${label.trim()}`);
  const sposta = (t: Tipo, direzione: 'su' | 'giu') =>
    esegui(() => api(`/api/categorie/${encodeURIComponent(t.type)}/sposta`, { direzione }), `Ordine aggiornato: ${t.label}`);

  const alterna = (nome: string) => {
    const n = new Set(aperte);
    if (n.has(nome)) n.delete(nome);
    else n.add(nome);
    setAperte(n);
  };

  return (
    <>
      <h1>Categorie</h1>
      <p>
        Qui puoi cambiare etichetta, sinonimi (usati dalla ricerca nel selettore) e ordine delle categorie. I codici Google non si possono
        aggiungere né eliminare.
      </p>
      {errore && <Errore testo={errore} />}
      {!tipi && !errore && <Caricamento />}
      {erroreAzione && <Errore testo={erroreAzione} />}
      {conferma && (
        <p className="ok" role="status">
          {conferma}
        </p>
      )}
      {tipi && (
        <ul className="albero albero-alto">
          {raggruppa(tipi).map((g) => {
            const aperta = aperte.has(g.nome);
            return (
              <li key={g.nome}>
                <div className="macro">
                  <button type="button" className="freccia" aria-expanded={aperta} aria-label={`${aperta ? 'Chiudi' : 'Apri'} ${g.nome}`} onClick={() => alterna(g.nome)}>
                    {aperta ? '▼' : '▶'}
                  </button>
                  <span>
                    {g.nome} <small>({g.tipi.length})</small>
                  </span>
                </div>
                {aperta && (
                  <table className="tabella-categorie">
                    <thead>
                      <tr>
                        <th>Codice Google</th>
                        <th>Etichetta</th>
                        <th>Sinonimi</th>
                        <th>Ordine</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {g.tipi.map((t, i) => (
                        <Riga key={`${t.type}|${t.label}|${(t.parole ?? []).join(',')}`} tipo={t} primo={i === 0} ultimo={i === g.tipi.length - 1} occupato={occupato} onSalva={salva} onSposta={sposta} />
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
