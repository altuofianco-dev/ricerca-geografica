-- S6e: coordinate dei risultati (salvate solo con SALVA_DATI_ESTESI = "true").
ALTER TABLE search_results ADD COLUMN lat REAL;
ALTER TABLE search_results ADD COLUMN lng REAL;
