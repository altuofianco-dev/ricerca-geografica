import { useEffect, useMemo, useRef, useState } from 'react';
import tipiIt from '../data/place-types.it.json';
import {
  MAX_CATEGORIE,
  TESTO_GENERICO,
  TESTO_LIMITE,
  TESTO_NESSUNA,
  alternaMacro,
  alternaTipo,
  cercaPerGruppo,
  etichettaTipo,
  macroSuperaLimite,
  raggruppa,
  statoMacro,
  type Gruppo,
  type Tipo,
} from './categorie';

const TIPI = tipiIt as Tipo[];
const GRUPPI = raggruppa(TIPI);
const ETICHETTE = new Map(TIPI.map((t) => [t.type, t.label]));

/** Casella con stato indeterminato (trattino) per le macro parzialmente selezionate. */
function CasellaMacro(p: { stato: 'nessuna' | 'parziale' | 'tutte'; disabled: boolean; onChange: () => void; titolo?: string }) {
  const rif = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (rif.current) rif.current.indeterminate = p.stato === 'parziale';
  }, [p.stato]);
  return (
    <input ref={rif} type="checkbox" checked={p.stato === 'tutte'} disabled={p.disabled} onChange={p.onChange} title={p.titolo} />
  );
}

export default function SelettoreCategorie(p: {
  scelte: string[];
  onChange: (scelte: string[]) => void;
  disabled?: boolean;
}) {
  const { scelte, onChange, disabled = false } = p;
  const [filtro, setFiltro] = useState('');
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const inFiltro = filtro.trim() !== '';
  const insieme = useMemo(() => new Set(scelte), [scelte]);

  const visibili: Gruppo[] = useMemo(() => (inFiltro ? cercaPerGruppo(GRUPPI, filtro) : GRUPPI), [filtro, inFiltro]);
  // Con il filtro si aprono solo le macro con corrispondenze (tutte quelle visibili); senza, quelle aperte a mano.
  const eAperta = (nome: string) => inFiltro || aperte.has(nome);
  const alterna = (nome: string) => {
    const n = new Set(aperte);
    if (n.has(nome)) n.delete(nome);
    else n.add(nome);
    setAperte(n);
  };
  const alMassimo = scelte.length >= MAX_CATEGORIE;

  return (
    <div className="categorie">
      <div className="categorie-intestazione">
        <strong>Categorie</strong>
        <span className={alMassimo ? 'errore' : ''}>
          {scelte.length}/{MAX_CATEGORIE}
        </span>
        <span className="spazio" />
        <button type="button" disabled={disabled || scelte.length === 0} onClick={() => onChange([])}>
          Svuota selezione
        </button>
      </div>

      <div className="riga">
        {scelte.length === 0 && <small>Nessuna categoria scelta</small>}
        {scelte.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            disabled={disabled}
            aria-label={`Rimuovi ${ETICHETTE.get(c) ?? c}`}
            onClick={() => onChange(scelte.filter((x) => x !== c))}
          >
            {ETICHETTE.get(c) ?? c} ×
          </button>
        ))}
      </div>

      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Cerca una categoria, es. farmacia"
        aria-label="Cerca una categoria"
        disabled={disabled}
      />

      {inFiltro && visibili.length === 0 && <p className="avviso">{TESTO_NESSUNA}</p>}

      <ul className="albero">
        {visibili.map((g) => {
          const completo = GRUPPI.find((x) => x.nome === g.nome) as Gruppo;
          const stato = statoMacro(completo, scelte);
          const troppe = macroSuperaLimite(completo, scelte);
          const aperta = eAperta(g.nome);
          return (
            <li key={g.nome}>
              <div className="macro">
                <button
                  type="button"
                  className="freccia"
                  aria-expanded={aperta}
                  aria-label={`${aperta ? 'Chiudi' : 'Apri'} ${g.nome}`}
                  disabled={inFiltro}
                  onClick={() => alterna(g.nome)}
                >
                  {aperta ? '▼' : '▶'}
                </button>
                <label className="casella">
                  <CasellaMacro
                    stato={stato}
                    disabled={disabled || troppe}
                    onChange={() => onChange(alternaMacro(completo, scelte))}
                    titolo={troppe ? TESTO_LIMITE : undefined}
                  />
                  {g.nome} <small>({completo.tipi.length})</small>
                </label>
              </div>
              {troppe && <small className="errore">{TESTO_LIMITE}</small>}
              {aperta && (
                <ul className="tipi">
                  {g.tipi.map((t) => (
                    <li key={t.type}>
                      <label className="casella">
                        <input
                          type="checkbox"
                          checked={insieme.has(t.type)}
                          disabled={disabled || (!insieme.has(t.type) && alMassimo)}
                          onChange={() => onChange(alternaTipo(t.type, scelte))}
                        />
                        {etichettaTipo(t)}
                      </label>
                      {t.generico && <small className="aiuto">{TESTO_GENERICO}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <small>Ogni zona restituisce al massimo 20 risultati in totale: con molte categorie l’elenco può risultare incompleto.</small>
    </div>
  );
}
