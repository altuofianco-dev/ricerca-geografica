export const Caricamento = ({ testo = 'Caricamento…' }: { testo?: string }) => (
  <p className="caricamento" role="status">{testo}</p>
);

export const Errore = ({ testo }: { testo: string }) => (
  <p className="errore" role="alert">{testo}</p>
);
