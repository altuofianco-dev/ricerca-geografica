import type { ReactNode } from 'react';

// Icone SVG inline (nessuna libreria): stesso tratto per tutte, colore ereditato dal testo.
function Icona({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icona"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconaNuova = () => (
  <Icona>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
  </Icona>
);

export const IconaElenco = () => (
  <Icona>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </Icona>
);

export const IconaDashboard = () => (
  <Icona>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </Icona>
);

export const IconaUtenti = () => (
  <Icona>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .7 3.5 2.6 3.5 5.6" />
  </Icona>
);

export const IconaCategorie = () => (
  <Icona>
    <path d="M3.5 4.5h7v7h-7zM13.5 4.5h7v7h-7zM3.5 14.5h7v5h-7zM13.5 14.5h7v5h-7z" />
  </Icona>
);

export const IconaEsci = () => (
  <Icona>
    <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 8l-4 4 4 4M6 12h10" />
  </Icona>
);
